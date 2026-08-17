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

const TIMEOUT_MS = 30_000;

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

const geminiResponseSchema = z.object({
  candidates: z
    .array(z.object({ content: z.object({ parts: z.array(partSchema) }) }))
    .min(1),
});

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

async function generateContent(
  apiKey: string,
  model: string,
  parts: Part[],
  generationConfig: object,
): Promise<Part[]> {
  const res = await fetch(`${GEMINI_ENDPOINT}/${model}:generateContent`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    body: JSON.stringify({
      contents: [{ role: "user", parts }],
      generationConfig,
    }),
  });
  if (!res.ok) {
    throw new Error(`Gemini answered ${res.status}`);
  }
  const body = geminiResponseSchema.parse(await res.json());
  return body.candidates[0]?.content.parts ?? [];
}

function aboutOne(prompt: string, image: GeminiImage): Part[] {
  return [
    { text: prompt },
    { inlineData: { mimeType: image.contentType, data: image.data } },
  ];
}

function answered(parts: readonly Part[]): unknown {
  return JSON.parse(parts.map((part) => part.text ?? "").join(""));
}

export async function requestEvaluation(
  apiKey: string,
  jury: Jury,
  image: GeminiImage,
): Promise<Evaluation> {
  const parts = await generateContent(
    apiKey,
    GEMINI_MODEL,
    aboutOne(instructions(jury), image),
    { responseMimeType: "application/json", responseSchema: RESPONSE_SCHEMA },
  );
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
  apiKey: string,
  jury: Jury,
  snaps: readonly DescribedSnap[],
): Promise<RankedVerdict[]> {
  const parts = await generateContent(
    apiKey,
    GEMINI_MODEL,
    [{ text: rankingInstructions(jury, snaps) }],
    {
      responseMimeType: "application/json",
      responseSchema: RANKING_RESPONSE_SCHEMA,
    },
  );
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
  apiKey: string,
  image: GeminiImage,
): Promise<string> {
  const parts = await generateContent(
    apiKey,
    GEMINI_MODEL,
    aboutOne(DESCRIPTION_INSTRUCTIONS, image),
    {
      responseMimeType: "application/json",
      responseSchema: DESCRIPTION_RESPONSE_SCHEMA,
    },
  );
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
  const parts = await generateContent(
    apiKey,
    GEMINI_IMAGE_MODEL,
    aboutOne(AVATAR_INSTRUCTIONS, photo),
    {
      // Image models answer with prose alongside the picture, so both modalities
      // have to be asked for; the prose is dropped below.
      responseModalities: ["TEXT", "IMAGE"],
      imageConfig: { imageSize: AVATAR_IMAGE_SIZE },
    },
  );
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
