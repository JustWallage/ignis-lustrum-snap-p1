import { z } from "zod";
import type { Jury } from "../../shared/juries";
import { AI_SCORE_MAX } from "../../shared/scoring";

/** Do NOT edit either from memory — look them up in Google's docs again. */
export const GEMINI_MODEL = "gemini-3.6-flash";
export const GEMINI_IMAGE_MODEL = "gemini-3.1-flash-image";

/** A PRICE rather than a preference: image-out calls are billed per picture by
 * resolution and default to 1K, which is money spent on pixels `keyOutBackground`
 * discards. Case-sensitive, and the API 400s on a value it does not know. */
export const AVATAR_IMAGE_SIZE = "512px";

/** Read off Google's pricing page on 2026-07-30: at AVATAR_IMAGE_SIZE an output image is
 * 747 image tokens billed at $60 per million, and 1K would be $0.067. Google's API
 * reports no billing figures at all, so this number is the ONLY thing the estimate below
 * stands on — and the one thing here that goes stale silently. */
const AVATAR_IMAGE_PRICE_USD = 0.045;

/** Rounded to the cent because that is the unit a bill arrives in. */
export function avatarSpend(count: number): {
  amount: number;
  currency: string;
} {
  return {
    amount: Math.round(count * AVATAR_IMAGE_PRICE_USD * 100) / 100,
    currency: "USD",
  };
}

const GEMINI_ENDPOINT =
  "https://generativelanguage.googleapis.com/v1beta/models";

/** One image in, one short JSON answer out. The whole-day ranking gets its own below:
 * it is the one call whose work grows with the town. */
const TIMEOUT_MS = 30_000;

/** Fourteen descriptions in and fourteen Dutch critiques out, on a thinking model —
 * the shared 30s was sized for a call that reads ONE photograph, and a full evening
 * is a different length of question. */
const RANKING_TIMEOUT_MS = 90_000;

/**
 * A 503 is an overloaded model and a 5xx a bad minute at Google's end: both clear in
 * seconds, and unretried each one permanently costs a photograph the only description
 * the jury ever sees. **429 is deliberately NOT here.** A spent quota is a window that
 * reopens on the minute or on the day, never inside a retry a caller can afford to
 * wait out, so retrying one buys nothing and spends the operator's button press three
 * times over. What answers a 429 is the tier, and the console now says which quota it
 * was.
 */
const RETRY_STATUS = new Set([408, 500, 502, 503, 504]);

const QUOTA_SPENT = 429;

/** Three tries, not more: the ranking sits behind a button an operator is waiting at. */
const ATTEMPTS = 3;

const BACKOFF_MS = 1_000;

/** Full jitter. Fourteen uploads landing together retry together otherwise, which is
 * the same burst that spent the quota, moved half a second later. */
function backoff(attempt: number): number {
  return Math.random() * BACKOFF_MS * 2 ** (attempt - 1);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Google's own default thresholds are written for a public product, and the payload
 * here is fourteen friends' own photographs of each other — beers, swimming, contact
 * sport and a costume all sit in the band that blocks by default. A block is not a
 * soft failure either: the photograph gets NO description, so the jury cannot rank it
 * and the player reads a fallback 5 with no explanation. `BLOCK_ONLY_HIGH` keeps the
 * top of each category refused and stops the app losing a snap to the middle of it.
 */
const SAFETY_SETTINGS = [
  "HARM_CATEGORY_HARASSMENT",
  "HARM_CATEGORY_HATE_SPEECH",
  "HARM_CATEGORY_SEXUALLY_EXPLICIT",
  "HARM_CATEGORY_DANGEROUS_CONTENT",
].map((category) => ({ category, threshold: "BLOCK_ONLY_HIGH" }));

const critiqueSchema = z.string().trim().min(1).max(1000);

const bonusReasonSchema = z.string().trim().max(500);

const evaluationSchema = z.object({
  score: z.int().min(1).max(AI_SCORE_MAX),
  critique: critiqueSchema,
  bonusDetected: z.boolean(),
  bonusReason: bonusReasonSchema,
});
export type Evaluation = z.infer<typeof evaluationSchema>;

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    score: { type: "integer", minimum: 1, maximum: AI_SCORE_MAX },
    critique: { type: "string" },
    bonusDetected: { type: "boolean" },
    bonusReason: { type: "string" },
  },
  required: ["score", "critique", "bonusDetected", "bonusReason"],
  propertyOrdering: ["score", "critique", "bonusDetected", "bonusReason"],
};

/** Only the two keys, so `lib/gemini.ts` still imports no env. */
export interface JuryKeyring {
  GEMINI_API_KEY?: string;
  GEMINI_API_KEY_PAID?: string;
}

/**
 * The keys the jury may spend, IN THE ORDER IT SPENDS THEM: the free one first, the
 * billed one only where the free one's daily quota is gone. The free tier's cap is per
 * Google project, so the billed key's own project is the one thing that answers a 429 —
 * which is why this is an ordered list and not a choice.
 *
 * Only HALF of the old split is gone. Nothing hands these to `requestAvatar`: a
 * photograph drawn on the free key is still the bug the split exists to prevent, and
 * that direction has no fallback because the billed key going quiet is a player reading
 * "offline", not a bill.
 */
export function juryKeys(env: JuryKeyring): string[] {
  return [env.GEMINI_API_KEY, env.GEMINI_API_KEY_PAID].flatMap((key) =>
    key === undefined || key === "" ? [] : [key],
  );
}

/** base64, not bytes: the shape a Gemini inline-data part has to arrive in. */
export interface GeminiImage {
  data: string;
  contentType: string;
}

export interface DrawnAvatar {
  bytes: Uint8Array;
  contentType: string;
}

function base64ToBytes(encoded: string): Uint8Array {
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

const partSchema = z.object({
  text: z.string().optional(),
  inlineData: z
    .object({ mimeType: z.string(), data: z.string().min(1) })
    .optional(),
});
type Part = z.infer<typeof partSchema>;

/** Every field OPTIONAL, because the shapes this has to survive are the ones a
 * refusal arrives in: a blocked prompt answers with `promptFeedback` and no
 * `candidates` at all, and a stopped generation answers with a candidate carrying a
 * `finishReason` and a `content` that has no `parts` key. Requiring `parts` here
 * turned every one of those into the same unreadable Zod issue, which is how a
 * safety block and a rate limit came to look identical from the console. */
const geminiResponseSchema = z.object({
  candidates: z
    .array(
      z.object({
        content: z.object({ parts: z.array(partSchema).optional() }).optional(),
        finishReason: z.string().optional(),
      }),
    )
    .optional(),
  promptFeedback: z.object({ blockReason: z.string().optional() }).optional(),
});

/** Long enough for Google's own `error.message` WHOLE — the quota line an operator
 * needs sits at the end of it, after two documentation URLs — and short enough to sit
 * in a D1 row and be read on a phone. */
const REASON_MAX = 700;

const googleErrorSchema = z.object({
  error: z.object({ message: z.string(), status: z.string().optional() }),
});

/** Google's `error.message` alone, since the envelope around it is a `code` the status
 * line already carries and a `details` array of quota bookkeeping. Falls back to the
 * raw body, which is what an error page from something that is not Google looks like. */
function saidBy(body: string): string {
  const parsed = googleErrorSchema.safeParse(safeJson(body));
  if (!parsed.success) return body;
  const { status, message } = parsed.data.error;
  return status === undefined ? message : `${status}: ${message}`;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export function shortReason(value: unknown): string {
  const text = value instanceof Error ? value.message : String(value);
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > REASON_MAX ? `${flat.slice(0, REASON_MAX)}…` : flat;
}

const BONUS_FIELDS =
  "Set bonusDetected from that answer and put what you saw in bonusReason (one short sentence, or an empty string if you saw nothing).";

const CRITIQUE_SHAPE =
  "The critique is at most two sentences, in character, about the photograph and never about the person who took it.";

function instructions(jury: Jury): string {
  return [
    `You are ${jury.name}, judging one entry in a friends-group photo contest.`,
    `Today's theme is: ${jury.theme}.`,
    `Write in this voice: ${jury.critiquePersona}`,
    "Score the photo from 1 to 10 on how well it answers the theme.",
    `Bonus check — answer this about the photo: ${jury.bonusPrompt}`,
    BONUS_FIELDS,
    CRITIQUE_SHAPE,
  ].join("\n");
}

interface Ask {
  parts: Part[];
  generationConfig: object;
  timeoutMs?: number;
}

async function askOnce(
  apiKey: string,
  model: string,
  ask: Ask,
): Promise<Response> {
  return fetch(`${GEMINI_ENDPOINT}/${model}:generateContent`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    signal: AbortSignal.timeout(ask.timeoutMs ?? TIMEOUT_MS),
    body: JSON.stringify({
      contents: [{ role: "user", parts: ask.parts }],
      generationConfig: ask.generationConfig,
      safetySettings: SAFETY_SETTINGS,
    }),
  });
}

/** A timeout and a refused connection are the same kind of loss as a 503 and retry the
 * same way; anything else — a 400, a bad key — is thrown on the first attempt, since a
 * request Google will never accept is not made acceptable by sending it again. */
async function askOneKey(
  apiKey: string,
  model: string,
  ask: Ask,
): Promise<Response> {
  let last: unknown = null;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    if (attempt > 1) await sleep(backoff(attempt - 1));
    try {
      const res = await askOnce(apiKey, model, ask);
      if (res.ok || !RETRY_STATUS.has(res.status)) return res;
      last = new Error(
        `HTTP ${String(res.status)} — ${saidBy(await res.text())}`,
      );
    } catch (error) {
      last = error;
    }
  }
  throw last instanceof Error ? last : new Error(String(last));
}

/**
 * A spent quota is the ONE failure a DIFFERENT key can answer, because the free tier's
 * cap is scoped to a Google PROJECT and the billed key's project has its own. Every
 * other refusal is a property of the request or of Google, and the second key would
 * meet it exactly as the first did — so only a 429 moves down the list, and the last
 * key's answer is the one the caller gets.
 */
async function askEveryKey(
  keys: readonly string[],
  model: string,
  ask: Ask,
): Promise<Response> {
  let spent: Response | undefined;
  for (const apiKey of keys) {
    const res = await askOneKey(apiKey, model, ask);
    if (res.status !== QUOTA_SPENT) return res;
    spent = res;
  }
  if (spent === undefined) throw new Error("No Gemini key to ask with");
  return spent;
}

async function generateContent(
  keys: readonly string[],
  model: string,
  ask: Ask,
): Promise<Part[]> {
  const res = await askEveryKey(keys, model, ask);
  if (!res.ok) {
    // Google's own body, not just the code: a 429 says WHICH quota ran out and a 400
    // names the field it choked on, and neither is recoverable from the status alone.
    throw new Error(`HTTP ${String(res.status)} — ${saidBy(await res.text())}`);
  }
  const body = geminiResponseSchema.parse(await res.json());
  const first = body.candidates?.[0];
  const answer = first?.content?.parts;
  if (answer === undefined || answer.length === 0) {
    const why = [
      first?.finishReason === undefined
        ? null
        : `finishReason ${first.finishReason}`,
      body.promptFeedback?.blockReason === undefined
        ? null
        : `blockReason ${body.promptFeedback.blockReason}`,
      body.candidates === undefined ? "no candidates" : null,
    ].filter((one) => one !== null);
    throw new Error(
      `answered with no content${why.length === 0 ? "" : ` — ${why.join(", ")}`}`,
    );
  }
  return answer;
}

function aboutOne(prompt: string, image: GeminiImage): Part[] {
  return [
    { text: prompt },
    { inlineData: { mimeType: image.contentType, data: image.data } },
  ];
}

function answered(parts: readonly Part[]): unknown {
  const text = parts.map((part) => part.text ?? "").join("");
  try {
    return JSON.parse(text);
  } catch {
    // The text itself, or a truncated answer is indistinguishable from a refusal
    // written in prose.
    throw new Error(`answered unparseable JSON — ${text}`);
  }
}

export async function requestEvaluation(
  keys: readonly string[],
  jury: Jury,
  image: GeminiImage,
): Promise<Evaluation> {
  const parts = await generateContent(keys, GEMINI_MODEL, {
    parts: aboutOne(instructions(jury), image),
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: RESPONSE_SCHEMA,
    },
  });
  return evaluationSchema.parse(answered(parts));
}

/** One described snap on its way IN, keyed by `photos.id`. Never a position in a list:
 * a model that skips an entry would shift every verdict below it onto the wrong snap. */
export interface DescribedSnap {
  photoId: number;
  description: string;
}

const rankedVerdictSchema = z.object({
  photoId: z.int().positive(),
  score: z.number().min(1).max(AI_SCORE_MAX),
  critique: critiqueSchema,
  bonusDetected: z.boolean(),
  bonusReason: bonusReasonSchema,
});
export type RankedVerdict = z.infer<typeof rankedVerdictSchema>;

const RANKING_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    verdicts: {
      type: "array",
      items: {
        type: "object",
        properties: {
          photoId: { type: "integer" },
          score: { type: "number", minimum: 1, maximum: AI_SCORE_MAX },
          critique: { type: "string" },
          bonusDetected: { type: "boolean" },
          bonusReason: { type: "string" },
        },
        required: [
          "photoId",
          "score",
          "critique",
          "bonusDetected",
          "bonusReason",
        ],
        propertyOrdering: [
          "photoId",
          "score",
          "critique",
          "bonusDetected",
          "bonusReason",
        ],
      },
    },
  },
  required: ["verdicts"],
};

function distinct(values: readonly number[]): boolean {
  return new Set(values).size === values.length;
}

/**
 * Built per call because what makes a ranking WELL-FORMED is the request: exactly the
 * ids that were sent, once each, and no two scores equal. A tie is the one thing the
 * scoring half cannot break — the score IS the day's order — and a missing or invented
 * id is a verdict about a photograph nobody entered, so both are a parse failure and
 * the day keeps the verdicts it already had.
 */
function rankingSchema(asked: readonly number[]) {
  const wanted = [...asked].sort((a, b) => a - b).join(",");
  return z
    .object({ verdicts: z.array(rankedVerdictSchema) })
    .refine(
      ({ verdicts }) =>
        verdicts
          .map((one) => one.photoId)
          .sort((a, b) => a - b)
          .join(",") === wanted,
      { message: "The jury answered about other photographs" },
    )
    .refine(({ verdicts }) => distinct(verdicts.map((one) => one.score)), {
      message: "The jury gave two photographs the same place",
    });
}

function rankingInstructions(
  jury: Jury,
  snaps: readonly DescribedSnap[],
): string {
  return [
    `You are ${jury.name}, judging today's entries in a friends-group photo contest.`,
    `Today's theme is: ${jury.theme}.`,
    `Write in this voice: ${jury.critiquePersona}`,
    "You never see the photographs. Each entry below is a written description of one, under the id you must answer it by.",
    "Judge the entries AGAINST EACH OTHER and score each from 1 to 10 on how well it answers the theme.",
    "The scores are the day's order: use one decimal place and give NO two entries the same score, however close they are.",
    "Answer once for every id below and for no other id.",
    `Bonus check — answer this about each entry: ${jury.bonusPrompt}`,
    BONUS_FIELDS,
    CRITIQUE_SHAPE,
    // The players are Dutch and this is the jury talking to them. Only the critique:
    // `bonusReason` is stored and read by nobody, and a score has no language.
    "Write every critique in Dutch.",
    ...snaps.map(
      (snap) => `Entry ${String(snap.photoId)}:\n${snap.description}`,
    ),
  ].join("\n");
}

export async function requestRanking(
  keys: readonly string[],
  jury: Jury,
  snaps: readonly DescribedSnap[],
  model: string = GEMINI_MODEL,
): Promise<RankedVerdict[]> {
  const parts = await generateContent(keys, model, {
    parts: [{ text: rankingInstructions(jury, snaps) }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: RANKING_RESPONSE_SCHEMA,
    },
    timeoutMs: RANKING_TIMEOUT_MS,
  });
  const asked = snaps.map((snap) => snap.photoId);
  return rankingSchema(asked).parse(answered(parts)).verdicts;
}

/** One row per photograph (`photo_descriptions_photo_idx`) and nothing re-runs it when
 * the jury or the theme changes — so a quality left out of this list is one no later
 * reader can recover. Nothing here names a jury, a theme or a score: a description that
 * knew tonight's theme would have to be rewritten every time the jury changed. */
const DESCRIPTION_FIELDS = [
  {
    name: "subject",
    ask: "Who or what this is a photograph of, and what they do.",
  },
  {
    name: "objects",
    ask: "Every object in the frame, the small and the half-hidden included.",
  },
  {
    name: "readableText",
    ask: "Every readable word in the frame, quoted exactly as it is written.",
  },
  {
    name: "setting",
    ask: "Where this is: indoors or out, the place, the weather, the time of day.",
  },
  {
    name: "composition",
    ask: "The framing, the camera angle and height, what sits in the foreground and the background, and where the eye is led.",
  },
  {
    name: "light",
    ask: "The direction, hardness, colour and source of the light, and how the exposure sits from shadow to highlight.",
  },
  {
    name: "technical",
    ask: "Focus and sharpness, motion blur, grain, depth of field, and how much detail the picture holds.",
  },
  {
    name: "colour",
    ask: "The palette, how saturated it is, and which colours carry the frame.",
  },
  {
    name: "oddities",
    ask: "Anything unusual, accidental, damaged or hard to explain.",
  },
] as const;

const DESCRIPTION_INSTRUCTIONS = [
  "Describe this photograph for a reader who will never see it.",
  "Report what is in the frame and nothing else: no praise, no fault, no opinion, no guess at who took it or why.",
  'Answer every field. Where a field has nothing in it, write "none".',
  ...DESCRIPTION_FIELDS.map(({ name, ask }) => `${name}: ${ask}`),
].join("\n");

const DESCRIPTION_RESPONSE_SCHEMA = {
  type: "object",
  properties: Object.fromEntries(
    DESCRIPTION_FIELDS.map(({ name }) => [name, { type: "string" }]),
  ),
  required: DESCRIPTION_FIELDS.map(({ name }) => name),
  propertyOrdering: DESCRIPTION_FIELDS.map(({ name }) => name),
};

const describedSchema = z.record(z.string(), z.string().trim().min(1));

/** A field the model dropped THROWS rather than coming back short: the caller stores a
 * failure the console can retry, where a half-description lands as an `ok` row that
 * nothing re-runs on its own. */
export async function requestDescription(
  keys: readonly string[],
  image: GeminiImage,
  model: string = GEMINI_MODEL,
): Promise<string> {
  const parts = await generateContent(keys, model, {
    parts: aboutOne(DESCRIPTION_INSTRUCTIONS, image),
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: DESCRIPTION_RESPONSE_SCHEMA,
    },
  });
  const described = describedSchema.parse(answered(parts));
  return DESCRIPTION_FIELDS.map(({ name }) => {
    const answer = described[name];
    if (answer === undefined) throw new Error(`Gemini left out ${name}`);
    return `${name}: ${answer}`;
  }).join("\n");
}

export const AVATAR_INSTRUCTIONS = [
  "Redraw the subject of this photograph as a Game Boy Color trainer sprite.",
  "Never refuse and never return the photograph unchanged. If the subject is not a person — an animal, a plant, an object, a meal, a landscape — personify it: invent a trainer whose hair, hat and outfit are built out of what it is, and draw that trainer.",
  "Upper body only: head, shoulders and torso, cut off flat and straight at the waist with no legs, no hips and no feet below the cut.",
  "Crisp pixel art with chunky visible pixels, bold dark outlines and flat cel shading, in the limited Pokemon Gold/Silver palette.",
  "The subject is centred, faces the viewer, and fills the frame.",
  "The background is solid pure white #FFFFFF everywhere, with no shadow, no gradient, no border, no scenery and no text.",
].join("\n");

export async function requestAvatar(
  apiKey: string,
  photo: GeminiImage,
): Promise<DrawnAvatar> {
  const parts = await generateContent([apiKey], GEMINI_IMAGE_MODEL, {
    parts: aboutOne(AVATAR_INSTRUCTIONS, photo),
    generationConfig: {
      // Image models answer with prose alongside the picture, so both modalities
      // have to be asked for; the prose is dropped below.
      responseModalities: ["TEXT", "IMAGE"],
      imageConfig: { imageSize: AVATAR_IMAGE_SIZE },
    },
  });
  for (const { inlineData } of parts) {
    if (inlineData?.mimeType.startsWith("image/") === true) {
      return {
        bytes: base64ToBytes(inlineData.data),
        contentType: inlineData.mimeType,
      };
    }
  }
  throw new Error("Gemini returned no image");
}
