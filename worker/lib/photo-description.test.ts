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
  geminiCallsAsking,
  JURY_KEY,
  keyOf,
  PAID_KEY,
  geminiReply,
  photoForm,
  resetWorld,
  signIn,
  storedDescription,
  stubGemini,
  uploadPhoto,
  uploadPhotoId,
  withGeminiKey,
  withJuryKeyOnly,
  withoutGeminiKey,
} from "../test-helpers";
import { GEMINI_MODEL } from "./gemini";
import { NO_KEY } from "./photo-description";

beforeEach(resetWorld);

/** The body prod actually answered a spent free tier with, trimmed to its shape. */
function quotaSpent(): Response {
  return Response.json(
    {
      error: {
        status: "RESOURCE_EXHAUSTED",
        message: "Quota exceeded for quota metric",
      },
    },
    { status: 429 },
  );
}

const safetySentSchema = z.object({
  safetySettings: z.array(
    z.object({ category: z.string(), threshold: z.string() }),
  ),
});

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
      /RESOURCE_EXHAUSTED: Quota exceeded/,
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

  it("rides out the overload that used to cost a day its description", async () => {
    let asked = 0;
    const fetched = stubGemini(() => {
      asked++;
      return asked === 1
        ? new Response("model is overloaded", { status: 503 })
        : geminiReply(JSON.stringify(DESCRIBED));
    });
    const cookie = await signIn();
    const id = await uploadPhotoId(cookie, { bindings: withGeminiKey() });

    const stored = await storedDescription(id);
    expect(stored?.status).toBe("ok");
    expect(stored?.failure).toBeNull();
    expect(geminiCallsAsking(fetched.mock.calls, DESCRIBING)).toHaveLength(2);
  });

  it("moves to the billed key when the free one's quota is gone, and not before", async () => {
    const fetched = stubGemini((_url, init) =>
      keyOf(init) === JURY_KEY
        ? quotaSpent()
        : geminiReply(JSON.stringify(DESCRIBED)),
    );
    const cookie = await signIn();
    const id = await uploadPhotoId(cookie, { bindings: withGeminiKey() });

    const stored = await storedDescription(id);
    expect(stored?.status).toBe("ok");
    expect(stored?.failure).toBeNull();
    // The free key FIRST and exactly once, then the billed one: an order, not a choice.
    expect(
      geminiCallsAsking(fetched.mock.calls, DESCRIBING).map(({ init }) =>
        keyOf(init),
      ),
    ).toEqual([JURY_KEY, PAID_KEY]);
  });

  it("keeps the billed key out of every refusal a second key cannot answer", async () => {
    for (const [why, reply] of [
      ["a 400", () => new Response("{}", { status: 400 })],
      ["a 503 on every attempt", () => new Response("busy", { status: 503 })],
    ] as const) {
      const fetched = stubGemini(reply);
      const cookie = await signIn();
      const id = await uploadPhotoId(cookie, { bindings: withGeminiKey() });

      expect((await storedDescription(id))?.status, why).toBe("failed");
      const spent = new Set(
        geminiCallsAsking(fetched.mock.calls, DESCRIBING).map(({ init }) =>
          keyOf(init),
        ),
      );
      expect([...spent], why).toEqual([JURY_KEY]);
      vi.unstubAllGlobals();
      await resetWorld();
    }
  });

  it("reports the spent quota when BOTH keys are out", async () => {
    const fetched = stubGemini(quotaSpent);
    const cookie = await signIn();
    const id = await uploadPhotoId(cookie, { bindings: withGeminiKey() });

    expect((await storedDescription(id))?.failure).toBe(
      "HTTP 429 — RESOURCE_EXHAUSTED: Quota exceeded for quota metric",
    );
    expect(
      geminiCallsAsking(fetched.mock.calls, DESCRIBING).map(({ init }) =>
        keyOf(init),
      ),
    ).toEqual([JURY_KEY, PAID_KEY]);
  });

  it("does not spend a button press three times on a quota that reopens on the day", async () => {
    const fetched = stubGemini(quotaSpent);
    const cookie = await signIn();
    const id = await uploadPhotoId(cookie, { bindings: withJuryKeyOnly() });

    // Google's `error.message` and not the envelope around it: the quota line is the
    // whole reason an operator reads this row at all.
    expect((await storedDescription(id))?.failure).toBe(
      "HTTP 429 — RESOURCE_EXHAUSTED: Quota exceeded for quota metric",
    );
    expect(geminiCallsAsking(fetched.mock.calls, DESCRIBING)).toHaveLength(1);
  });

  it("gives up on a refusal it cannot change by asking twice", async () => {
    const fetched = stubGemini(
      () =>
        new Response(
          JSON.stringify({ error: { message: "API key not valid" } }),
          {
            status: 400,
          },
        ),
    );
    const cookie = await signIn();
    const id = await uploadPhotoId(cookie, { bindings: withGeminiKey() });

    expect((await storedDescription(id))?.failure).toMatch(
      /400.*API key not valid/,
    );
    expect(geminiCallsAsking(fetched.mock.calls, DESCRIBING)).toHaveLength(1);
  });

  it("asks with the thresholds this app judges photographs at", async () => {
    const fetched = stubGemini(() => geminiReply(JSON.stringify(DESCRIBED)));
    const cookie = await signIn();
    await uploadPhotoId(cookie, { bindings: withGeminiKey() });

    const { init } = geminiCallAsking(fetched.mock.calls, DESCRIBING);
    const sent = safetySentSchema.parse(
      JSON.parse(z.string().parse(init.body)),
    );
    expect(sent.safetySettings.map((one) => one.category)).toEqual([
      "HARM_CATEGORY_HARASSMENT",
      "HARM_CATEGORY_HATE_SPEECH",
      "HARM_CATEGORY_SEXUALLY_EXPLICIT",
      "HARM_CATEGORY_DANGEROUS_CONTENT",
    ]);
    for (const one of sent.safetySettings) {
      expect(one.threshold).toBe("BLOCK_ONLY_HIGH");
    }
  });

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
