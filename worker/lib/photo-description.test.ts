import {
  createExecutionContext,
  waitOnExecutionContext,
} from "cloudflare:test";
import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  dayPhotosSchema,
  photoDescriptionSchema,
  photoSchema,
} from "../../shared/api";
import { JURIES } from "../../shared/juries";
import { app } from "../index";
import {
  DESCRIBED,
  DESCRIBING,
  descriptionRowCount,
  geminiCallAsking,
  geminiReply,
  photoForm,
  resetWorld,
  signIn,
  storedDescription,
  stubGemini,
  uploadPhoto,
  uploadPhotoId,
  withGeminiKey,
  withoutGeminiKey,
} from "../test-helpers";
import { GEMINI_MODEL } from "./gemini";
import { NO_KEY } from "./photo-description";

beforeEach(resetWorld);

async function describeAgain(cookie: string, id: number, bindings: object) {
  return app.request(
    `/api/admin/photos/${String(id)}/describe`,
    { method: "POST", headers: { Cookie: cookie } },
    bindings,
  );
}

describe("the photograph's description", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("stores one exhaustive text an upload never waited for", async () => {
    stubGemini(() => geminiReply(JSON.stringify(DESCRIBED)));
    const cookie = await signIn();
    const id = await uploadPhotoId(cookie, { bindings: withGeminiKey() });

    const stored = await storedDescription(id);
    expect(stored?.status).toBe("ok");
    for (const [field, answer] of Object.entries(DESCRIBED)) {
      expect(stored?.description).toContain(`${field}: ${answer}`);
    }
  });

  it("asks the jury's own model with no jury, theme, persona or score in the prompt", async () => {
    const fetched = stubGemini(() => geminiReply(JSON.stringify(DESCRIBED)));
    const cookie = await signIn();
    await uploadPhotoId(cookie, { bindings: withGeminiKey() });

    const {
      url,
      init,
      prompt: asked,
    } = geminiCallAsking(fetched.mock.calls, DESCRIBING);
    expect(asked).not.toMatch(/jury|theme|persona|score|critique|caption/i);
    for (const jury of JURIES) {
      expect(asked).not.toContain(jury.name);
      expect(asked).not.toContain(jury.theme);
      expect(asked).not.toContain(jury.critiquePersona);
      expect(asked).not.toContain(jury.bonusPrompt);
    }
    for (const field of Object.keys(DESCRIBED)) {
      expect(asked).toContain(field);
    }

    expect(url).toContain(`/${GEMINI_MODEL}:generateContent`);
    expect(z.record(z.string(), z.string()).parse(init.headers)).toMatchObject({
      "x-goog-api-key": "test-key",
    });
  });

  it("answers the upload before the description resolves", async () => {
    let answer: () => void = () => undefined;
    const reading = new Promise<void>((resolve) => {
      answer = resolve;
    });
    // A Response body may be read ONCE and the verdict is asking through the same
    // stub, so the wait is shared and the reply built per call.
    stubGemini(async () => {
      await reading;
      return geminiReply(JSON.stringify(DESCRIBED));
    });

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
    expect(await storedDescription(id)).toBeNull();

    answer();
    await waitOnExecutionContext(ctx);
    expect((await storedDescription(id))?.status).toBe("ok");
  });

  const BROKEN: [string, object, () => Response][] = [
    [
      "a Gemini that answers 500",
      withGeminiKey(),
      () => new Response("upstream is down", { status: 500 }),
    ],
    [
      "a reply missing a field",
      withGeminiKey(),
      () => geminiReply(JSON.stringify({ subject: "A man in a raincoat." })),
    ],
    [
      "no GEMINI_API_KEY at all",
      withoutGeminiKey(),
      () => geminiReply(JSON.stringify(DESCRIBED)),
    ],
  ];

  it.each(BROKEN)(
    "stores a failed row on %s, never a 500 and never an absence",
    async (_case, bindings, reply) => {
      stubGemini(reply);
      const cookie = await signIn();
      const res = await uploadPhoto(cookie, { bindings });

      expect(res.status).toBe(201);
      const id = photoSchema.parse(await res.json()).id;
      const stored = await storedDescription(id);
      expect(stored?.status).toBe("failed");
      expect(stored?.description).not.toBe("");
    },
  );

  /** Each of these is a shape that used to reach the console as the same unreadable
   * Zod issue, which is the whole reason an operator could not tell a blocked
   * photograph from a spent quota. */
  const SAID: [string, () => Response, RegExp][] = [
    [
      "a refused prompt",
      () => Response.json({ promptFeedback: { blockReason: "SAFETY" } }),
      /blockReason SAFETY/,
    ],
    [
      "a stopped generation",
      () => Response.json({ candidates: [{ finishReason: "IMAGE_SAFETY" }] }),
      /finishReason IMAGE_SAFETY/,
    ],
    [
      "a spent quota",
      () =>
        Response.json(
          {
            error: { status: "RESOURCE_EXHAUSTED", message: "Quota exceeded" },
          },
          { status: 429 },
        ),
      /429.*Quota exceeded/,
    ],
    [
      "prose where JSON was asked for",
      () => geminiReply("I cannot help with that."),
      /unparseable JSON.*I cannot help with that/,
    ],
  ];

  it.each(SAID)(
    "stores what Gemini said on %s rather than the fact that it said something",
    async (_case, reply, expected) => {
      stubGemini(reply);
      const cookie = await signIn();
      const id = await uploadPhotoId(cookie, { bindings: withGeminiKey() });

      const stored = await storedDescription(id);
      expect(stored?.status).toBe("failed");
      expect(stored?.failure).toMatch(expected);
    },
  );

  it("names the missing key rather than blaming Gemini for a call nobody made", async () => {
    stubGemini(() => geminiReply(JSON.stringify(DESCRIBED)));
    const cookie = await signIn();
    const id = await uploadPhotoId(cookie, { bindings: withoutGeminiKey() });

    expect((await storedDescription(id))?.failure).toBe(NO_KEY);
  });

  it("clears the reason when a retry works", async () => {
    stubGemini(() => new Response("upstream is down", { status: 500 }));
    const cookie = await signIn();
    const id = await uploadPhotoId(cookie, { bindings: withGeminiKey() });
    expect((await storedDescription(id))?.failure).toMatch(/500/);

    stubGemini(() => geminiReply(JSON.stringify(DESCRIBED)));
    expect((await describeAgain(cookie, id, withGeminiKey())).status).toBe(200);
    expect((await storedDescription(id))?.failure).toBeNull();
  });

  it("replaces on a second describe rather than adding a second row", async () => {
    stubGemini(() => new Response("upstream is down", { status: 500 }));
    const cookie = await signIn();
    const id = await uploadPhotoId(cookie, { bindings: withGeminiKey() });
    expect((await storedDescription(id))?.status).toBe("failed");

    stubGemini(() => geminiReply(JSON.stringify(DESCRIBED)));
    for (const attempt of [1, 2]) {
      const retried = await describeAgain(cookie, id, withGeminiKey());
      expect(retried.status, `attempt ${String(attempt)}`).toBe(200);
      expect(photoDescriptionSchema.parse(await retried.json())).toEqual({
        photoId: id,
        status: "ok",
        failure: null,
      });
      expect(await descriptionRowCount()).toBe(1);
    }
    expect((await storedDescription(id))?.description).toContain(
      DESCRIBED.subject,
    );
  });

  it("serves the state to the console alone, and takes it away with the snap", async () => {
    stubGemini(() => geminiReply(JSON.stringify(DESCRIBED)));
    const cookie = await signIn();
    const id = await uploadPhotoId(cookie, { bindings: withGeminiKey() });

    const listed = await app.request(
      "/api/admin/days/1/photos",
      { headers: { Cookie: cookie } },
      env,
    );
    expect(listed.status).toBe(200);
    const day = dayPhotosSchema.parse(await listed.json());
    expect(day.descriptions).toEqual([
      { photoId: id, status: "ok", failure: null },
    ]);
    const mine = await app.request(
      `/api/photos/${String(id)}`,
      { headers: { Cookie: cookie } },
      env,
    );
    expect(await mine.text()).not.toContain("description");

    const retired = await app.request(
      `/api/admin/photos/${String(id)}/retire`,
      { method: "POST", headers: { Cookie: cookie } },
      env,
    );
    expect(retired.status).toBe(200);
    expect(await storedDescription(id)).toBeNull();
    expect(await descriptionRowCount()).toBe(0);
  });

  it("refuses a describe for a snap nobody uploaded", async () => {
    const cookie = await signIn();
    expect((await describeAgain(cookie, 4321, withGeminiKey())).status).toBe(
      404,
    );
  });
});
