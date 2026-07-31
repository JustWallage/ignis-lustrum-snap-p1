import {
  createExecutionContext,
  waitOnExecutionContext,
} from "cloudflare:test";
import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { photoSchema } from "../../shared/api";
import { juryForDay } from "../../shared/juries";
import { app } from "../index";
import {
  geminiReply,
  geminiRequestSchema,
  PHOTO_BYTES,
  photoForm,
  resetWorld,
  scoreRowCount,
  signIn,
  storedScore,
  stubGemini,
  uploadPhoto,
  uploadPhotoId,
  VERDICT,
  withGeminiKey,
  withoutGeminiKey,
} from "../test-helpers";
import { bytesToBase64 } from "./bytes";
import { GEMINI_MODEL } from "./gemini";

beforeEach(resetWorld);

describe("the AI jury", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("stores an ok verdict from a well-formed reply", async () => {
    const fetched = stubGemini(() => geminiReply(JSON.stringify(VERDICT)));
    const cookie = await signIn();
    const id = await uploadPhotoId(cookie, { bindings: withGeminiKey() });

    expect(await storedScore(id)).toEqual({
      ai_score: 9,
      critique: VERDICT.critique,
      caption: VERDICT.caption,
      bonus_detected: 1,
      bonus_reason: VERDICT.bonusReason,
      ai_status: "ok",
    });
    expect(fetched).toHaveBeenCalledTimes(1);
  });

  it("asks for the caption as a title, and not as a second critique", async () => {
    const fetched = stubGemini(() => geminiReply(JSON.stringify(VERDICT)));
    const cookie = await signIn();
    await uploadPhotoId(cookie, { bindings: withGeminiKey() });

    const call = fetched.mock.calls[0];
    if (call === undefined) throw new Error("Gemini was never called");
    const body = geminiRequestSchema.parse(
      JSON.parse(z.string().parse(call[1].body)),
    );
    const prompt = (body.contents[0]?.parts ?? [])
      .map((part) => part.text ?? "")
      .join("");
    expect(prompt).toMatch(/caption is a TITLE/);
    expect(prompt).toMatch(/not reuse any wording from the critique/i);
  });

  it("asks the one model id, in the day's jury's voice, about the day's photo", async () => {
    const fetched = stubGemini(() => geminiReply(JSON.stringify(VERDICT)));
    const cookie = await signIn();
    await uploadPhotoId(cookie, { bindings: withGeminiKey() });

    const call = fetched.mock.calls[0];
    if (call === undefined) throw new Error("Gemini was never called");
    const [url, init] = call;
    expect(url).toContain(`/${GEMINI_MODEL}:generateContent`);
    expect(z.record(z.string(), z.string()).parse(init.headers)).toMatchObject({
      "x-goog-api-key": "test-key",
    });

    const body = geminiRequestSchema.parse(
      JSON.parse(z.string().parse(init.body)),
    );
    expect(body.generationConfig.responseMimeType).toBe("application/json");

    const parts = body.contents[0]?.parts ?? [];
    const prompt = parts.map((part) => part.text ?? "").join("");
    const jury = juryForDay(1);
    expect(prompt).toContain(jury.theme);
    expect(prompt).toContain(jury.critiquePersona);
    expect(prompt).toContain(jury.bonusPrompt);
    expect(parts.map((part) => part.inlineData)).toContainEqual({
      mimeType: "image/png",
      data: bytesToBase64(PHOTO_BYTES),
    });
  });

  const BROKEN: [string, () => Promise<Response> | Response][] = [
    ["a 500", () => new Response("upstream is down", { status: 500 })],
    [
      "a timeout",
      // Exactly what the request's AbortSignal.timeout rejects with once it
      // fires; sitting through the real 30 seconds would prove nothing more.
      () =>
        Promise.reject(
          new DOMException("The operation timed out.", "TimeoutError"),
        ),
    ],
    ["malformed JSON", () => geminiReply("{ score: nine, critique")],
    [
      "a reply that is not the envelope we expect",
      () => Response.json({ promptFeedback: { blockReason: "SAFETY" } }),
    ],
  ];

  it.each(BROKEN)("falls back to a failed row on %s", async (_case, reply) => {
    stubGemini(reply);
    const cookie = await signIn();
    const res = await uploadPhoto(cookie, { bindings: withGeminiKey() });

    expect(res.status).toBe(201);
    const id = photoSchema.parse(await res.json()).id;
    const score = await storedScore(id);
    expect(score).toMatchObject({
      ai_score: 5,
      bonus_detected: 0,
      ai_status: "failed",
      caption: null,
    });
    expect(score?.critique).toMatch(/broke it/i);
  });

  it("treats a missing GEMINI_API_KEY as a failed call, not a crash", async () => {
    const fetched = stubGemini(() => geminiReply(JSON.stringify(VERDICT)));
    const cookie = await signIn();
    const res = await uploadPhoto(cookie, { bindings: withoutGeminiKey() });

    expect(res.status).toBe(201);
    const id = photoSchema.parse(await res.json()).id;
    expect(await storedScore(id)).toMatchObject({
      ai_score: 5,
      ai_status: "failed",
      caption: null,
    });
    expect(fetched).not.toHaveBeenCalled();
  });

  it("takes the caption back off a retry that broke", async () => {
    // The verdict is written as ONE upsert, so a retry replaces all of it. A snap
    // that had a caption and then failed a re-evaluation must not keep the old
    // jury's line hanging off a row that now says the machine choked.
    stubGemini(() => geminiReply(JSON.stringify(VERDICT)));
    const cookie = await signIn();
    const id = await uploadPhotoId(cookie, { bindings: withGeminiKey() });
    expect((await storedScore(id))?.caption).toBe(VERDICT.caption);

    stubGemini(() => new Response("upstream is down", { status: 500 }));
    const retried = await app.request(
      `/api/admin/photos/${id}/evaluate`,
      { method: "POST", headers: { Cookie: cookie } },
      withGeminiKey(),
    );
    expect(retried.status).toBe(200);
    expect(await storedScore(id)).toMatchObject({
      ai_status: "failed",
      caption: null,
    });
  });

  it("answers the upload before the model does", async () => {
    let answer: (res: Response) => void = () => undefined;
    const thinking = new Promise<Response>((resolve) => {
      answer = resolve;
    });
    stubGemini(() => thinking);

    const cookie = await signIn();
    const ctx = createExecutionContext();
    const res = await app.request(
      "/api/photos",
      { method: "POST", body: photoForm({}), headers: { Cookie: cookie } },
      withGeminiKey(),
      ctx,
    );
    expect(res.status).toBe(201);
    const id = photoSchema.parse(await res.json()).id;
    expect(await storedScore(id)).toBeNull();

    answer(geminiReply(JSON.stringify(VERDICT)));
    await waitOnExecutionContext(ctx);
    expect(await storedScore(id)).toMatchObject({ ai_status: "ok" });
  });

  it("drops a verdict with the snap it belongs to", async () => {
    stubGemini(() => geminiReply(JSON.stringify(VERDICT)));
    const cookie = await signIn();
    const bindings = withGeminiKey();

    const first = await uploadPhotoId(cookie, { bindings });
    const replaced = await uploadPhoto(cookie, { replace: true, bindings });
    expect(replaced.status).toBe(201);
    const second = photoSchema.parse(await replaced.json()).id;

    expect(await storedScore(first)).toBeNull();
    expect(await storedScore(second)).toMatchObject({ ai_status: "ok" });
    expect(await scoreRowCount()).toBe(1);

    const deleted = await app.request(
      `/api/photos/${second}`,
      { method: "DELETE", headers: { Cookie: cookie } },
      env,
    );
    expect(deleted.status).toBe(200);
    expect(await scoreRowCount()).toBe(0);
  });

  it("serves the verdict to nobody yet", async () => {
    stubGemini(() => geminiReply(JSON.stringify(VERDICT)));
    const cookie = await signIn();
    const id = await uploadPhotoId(cookie, { bindings: withGeminiKey() });

    const responses = await Promise.all([
      app.request(`/api/photos/${id}`, { headers: { Cookie: cookie } }, env),
      app.request("/api/photos/mine", { headers: { Cookie: cookie } }, env),
      app.request("/api/state", {}, env),
    ]);
    for (const res of responses) {
      expect(res.status).toBe(200);
      const body = await res.text();
      expect(body).not.toContain(VERDICT.critique);
      expect(body).not.toContain("critique");
      expect(body).not.toContain("score");
    }
  });
});
