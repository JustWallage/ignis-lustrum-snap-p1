import { z } from "zod";
import { AI_SCORE_MAX } from "./scoring";
import { gameStateSchema } from "./state";

export const loginSchema = z.object({
  name: z.string().trim().min(1).max(60),
  password: z.string().min(1).max(200),
});

const userSchema = z.object({
  id: z.int(),
  name: z.string(),
});
export type User = z.infer<typeof userSchema>;

export const meSchema = z.object({
  user: userSchema,
  isAdmin: z.boolean(),
});

const aiStatusSchema = z.enum(["ok", "failed"]);

/** Never zero: `DayEntry.aiScore` uses 0 for "no evaluation", and 0/10 would read
 * as a photograph the jury hated. On the wire, absence. */
const aiRatingSchema = z.int().positive().nullable();

export const photoSchema = z.object({
  id: z.int(),
  uploader: userSchema.nullable(),
  url: z.string(),
  createdAt: z.iso.datetime(),
  likeCount: z.int(),
  likedByMe: z.boolean(),
  commentCount: z.int(),
  aiScore: aiRatingSchema,
});
export type Photo = z.infer<typeof photoSchema>;

export const likeResultSchema = z.object({
  id: z.int(),
  likeCount: z.int(),
  likedByMe: z.boolean(),
});

export const mySubmissionSchema = z.object({
  day: z.int().positive(),
  photo: photoSchema.nullable(),
});
export type MySubmission = z.infer<typeof mySubmissionSchema>;

export const apiErrorSchema = z.object({ error: z.string() });

/** Deliberately NOT a `photoSchema`: no uploader field to leave null, so the browser
 * cannot leak an identity even if the UI asked it to. */
export const voteCandidateSchema = z.object({
  id: z.int(),
  url: z.string(),
  isMine: z.boolean(),
});
export type VoteCandidate = z.infer<typeof voteCandidateSchema>;

export const voteCandidateListSchema = z.object({
  candidates: z.array(voteCandidateSchema),
});

export const MAX_PICKS = 3;

export const ballotSchema = z.object({
  photoIds: z.array(z.int()).max(MAX_PICKS),
});
export type Ballot = z.infer<typeof ballotSchema>;

export const dayResultSchema = z.object({
  photoId: z.int(),
  uploader: userSchema,
  url: z.string(),
  rank: z.int().positive(),
  total: z.number(),
  peerNorm: z.number(),
  /** 0..HALF_WEIGHT, and the day's best always curves to exactly HALF_WEIGHT — so
   * printing it under a bare "AI" reads as a broken rating (#97). `aiScore` is the
   * rating. */
  aiNorm: z.number(),
  peerPoints: z.int().nonnegative(),
  aiScore: aiRatingSchema,
  aiStatus: aiStatusSchema.nullable(),
  bonus: z.boolean(),
  critique: z.string().nullable(),
  juryCaption: z.string().nullable(),
  noVotePenalty: z.boolean(),
});
export type DayResult = z.infer<typeof dayResultSchema>;

export const dayResultsSchema = z.object({
  day: z.int().positive(),
  results: z.array(dayResultSchema),
});

const archiveDaySchema = dayResultsSchema.extend({
  prize: z.string().nullable(),
});
export type ArchiveDay = z.infer<typeof archiveDaySchema>;

export const archiveSchema = z.object({ days: z.array(archiveDaySchema) });

export const standingSchema = z.object({
  user: userSchema,
  total: z.number(),
  wins: z.int().nonnegative(),
  entries: z.int().nonnegative(),
  rank: z.int().positive(),
});
export type Standing = z.infer<typeof standingSchema>;

export const leaderboardSchema = z.object({
  standings: z.array(standingSchema),
});

export const setDaySchema = z.object({ day: z.int().positive() });

/** `awardsDropped` is the only place that count is ever reported: no route lists
 * `prize_awards` per day, so the confirm cannot name it before the fact. */
export const clockSchema = gameStateSchema.extend({
  awardsDropped: z.int().nonnegative(),
});

export const retirementSchema = z.object({
  day: z.int().positive(),
  retired: z.int().nonnegative(),
});

/** `photoSchema` and nothing narrower: the masking is `toPhoto`'s two rules, and the
 * console adds no exception to them. */
export const dayPhotosSchema = z.object({
  day: z.int().positive(),
  photos: z.array(photoSchema),
});

const bucketObjectSchema = z.object({
  key: z.string(),
  size: z.int().nonnegative(),
});
export type BucketObject = z.infer<typeof bucketObjectSchema>;

/** A retired object is the one kind the console can render, because `retired_photos` is
 * the only thing left naming its content type. */
const retiredObjectSchema = bucketObjectSchema.extend({
  photoId: z.int(),
  day: z.int().positive(),
  uploader: userSchema,
  url: z.string(),
});

const bucketGroupSchema = z.object({
  count: z.int().nonnegative(),
  bytes: z.int().nonnegative(),
});

export const bucketSchema = z.object({
  /** Counted only: a live snap is served through `/api/photos/:id/image` and a sprite
   * through `/api/sprites/:key`, so listing their keys here would be a third way in. */
  live: bucketGroupSchema,
  retired: bucketGroupSchema.extend({ objects: z.array(retiredObjectSchema) }),
  orphaned: bucketGroupSchema.extend({ objects: z.array(bucketObjectSchema) }),
});

export const failedEvaluationsSchema = z.object({
  day: z.int().positive(),
  failed: z.int().nonnegative(),
});

export const evaluationRetrySchema = z.object({
  day: z.int().positive(),
  attempted: z.int().nonnegative(),
  ok: z.int().nonnegative(),
  failed: z.int().nonnegative(),
});
export type EvaluationRetry = z.infer<typeof evaluationRetrySchema>;

/** The bench's verdict, which belongs to no photo: nothing here is stored, so there
 * is no id and no day to carry. `jury` and `theme` are echoed from `JURIES` rather
 * than from what the bench was asked for. */
export const juryBenchSchema = z.object({
  jury: z.string(),
  theme: z.string(),
  score: z.int().min(1).max(AI_SCORE_MAX),
  caption: z.string(),
  critique: z.string(),
  bonusDetected: z.boolean(),
  bonusReason: z.string(),
});
export type JuryBenchVerdict = z.infer<typeof juryBenchSchema>;

export const prizeSchema = z.object({
  id: z.int(),
  label: z.string(),
  enabled: z.boolean(),
  sortOrder: z.int(),
});
export type Prize = z.infer<typeof prizeSchema>;

export const prizeListSchema = z.object({ prizes: z.array(prizeSchema) });

const prizeLabelSchema = z.string().trim().min(1).max(80);

export const prizeCreateSchema = z.object({ label: prizeLabelSchema });

export const prizeUpdateSchema = z
  .object({
    label: prizeLabelSchema.optional(),
    enabled: z.boolean().optional(),
    sortOrder: z.int().nonnegative().optional(),
  })
  .refine((patch) => Object.values(patch).some((v) => v !== undefined), {
    message: "Nothing to update",
  });

const avatarSchema = z.object({
  url: z.string(),
  createdAt: z.iso.datetime(),
});

/** Both caps are `nonnegative`, never `positive`: 0 is an admin closing the machine for
 * the day, and rejecting it here 500s `GET /api/avatar` for every player instead. */
export const avatarCapsSchema = z.object({
  limit: z.int().nonnegative(),
  townLimit: z.int().nonnegative(),
});
export type AvatarCaps = z.infer<typeof avatarCapsSchema>;

export const avatarStateSchema = z.object({
  avatar: avatarSchema.nullable(),
  remaining: z.int().min(0),
  limit: z.int().nonnegative(),
});
export type AvatarState = z.infer<typeof avatarStateSchema>;

/** The town's drawn avatars, as a name beside every sprite key that name has drawn.
 * Never the bytes and never `/api/avatar/image`, which serves only your own. */
export const townAvatarsSchema = z.object({
  players: z.array(
    z.object({
      user: userSchema,
      sprites: z.array(
        z.object({ id: z.int(), url: z.string(), worn: z.boolean() }),
      ),
    }),
  ),
});

export const wearAvatarSchema = z.object({ id: z.int() });

/** An amount the WORKER multiplied out, so the price per image never ships to a
 * browser. */
const spendSchema = z.object({
  amount: z.number().nonnegative(),
  currency: z.string(),
});

export const avatarCountsSchema = avatarCapsSchema.extend({
  day: z.int().positive(),
  dayTotal: z.int().nonnegative(),
  allTime: z.int().nonnegative(),
  estimate: spendSchema,
  players: z.array(z.object({ user: userSchema, used: z.int().min(0) })),
});

export const commentSubjectSchema = z.enum(["photo", "avatar"]);
export type CommentSubject = z.infer<typeof commentSubjectSchema>;

export const COMMENT_SUBJECT_PATH: Record<CommentSubject, string> = {
  photo: "/api/photos",
  avatar: "/api/avatars",
};

export function commentsPath(subject: CommentSubject, id: number): string {
  return `${COMMENT_SUBJECT_PATH[subject]}/${String(id)}/comments`;
}

export const commentSchema = z.object({
  id: z.int(),
  subjectType: commentSubjectSchema,
  subjectId: z.int(),
  author: userSchema,
  body: z.string(),
  createdAt: z.iso.datetime(),
});
export type Comment = z.infer<typeof commentSchema>;

export const commentListSchema = z.object({
  comments: z.array(commentSchema),
});

export const commentCreateSchema = z.object({
  body: z.string().trim().min(1).max(1000),
});
