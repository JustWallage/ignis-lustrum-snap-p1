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

const CAPTION_MAX = 80;

const evaluationSchema = z.object({
  score: z.int().min(1).max(AI_SCORE_MAX),
  critique: z.string().trim().min(1).max(1000),
  caption: z.string().trim().min(1).max(CAPTION_MAX),
  bonusDetected: z.boolean(),
  bonusReason: z.string().trim().max(500),
});
export type Evaluation = z.infer<typeof evaluationSchema>;

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    score: { type: "integer", minimum: 1, maximum: AI_SCORE_MAX },
    critique: { type: "string" },
    caption: { type: "string" },
    bonusDetected: { type: "boolean" },
    bonusReason: { type: "string" },
  },
  required: ["score", "critique", "caption", "bonusDetected", "bonusReason"],
  propertyOrdering: [
    "score",
    "critique",
    "caption",
    "bonusDetected",
    "bonusReason",
  ],
};

/** What goes IN: base64, because that is the shape of an inline-data part. */
export interface GeminiImage {
  data: string;
  contentType: string;
}

/** What comes OUT: bytes, because that is the shape R2 stores. The decode lives here
 * rather than in `lib/bytes.ts` so nothing outside this module has a base64 reader to
 * reach for — an image is bytes everywhere else in the worker. */
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

function instructions(jury: Jury): string {
  return [
    `You are ${jury.name}, judging one entry in a friends-group photo contest.`,
    `Today's theme is: ${jury.theme}.`,
    `Write in this voice: ${jury.critiquePersona}`,
    "Score the photo from 1 to 10 on how well it answers the theme.",
    `Bonus check — answer this about the photo: ${jury.bonusPrompt}`,
    "Set bonusDetected from that answer and put what you saw in bonusReason (one short sentence, or an empty string if you saw nothing).",
    "The critique is at most two sentences, in character, about the photograph and never about the person who took it.",
    // Different jobs and different lengths on purpose: without this the model
    // happily ships the first sentence of the critique twice.
    `The caption is a TITLE for the photograph, not a second critique: a gallery label of at most ${String(CAPTION_MAX)} characters, in the same voice, naming what the picture is rather than judging it. Do not reuse any wording from the critique.`,
  ].join("\n");
}

async function generateContent(
  apiKey: string,
  model: string,
  prompt: string,
  image: GeminiImage,
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
      contents: [
        {
          role: "user",
          parts: [
            { text: prompt },
            { inlineData: { mimeType: image.contentType, data: image.data } },
          ],
        },
      ],
      generationConfig,
    }),
  });
  if (!res.ok) {
    throw new Error(`Gemini answered ${res.status}`);
  }
  const body = geminiResponseSchema.parse(await res.json());
  return body.candidates[0]?.content.parts ?? [];
}

export async function requestEvaluation(
  apiKey: string,
  jury: Jury,
  image: GeminiImage,
): Promise<Evaluation> {
  const parts = await generateContent(
    apiKey,
    GEMINI_MODEL,
    instructions(jury),
    image,
    { responseMimeType: "application/json", responseSchema: RESPONSE_SCHEMA },
  );
  const text = parts.map((part) => part.text ?? "").join("");
  return evaluationSchema.parse(JSON.parse(text));
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
    AVATAR_INSTRUCTIONS,
    photo,
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
