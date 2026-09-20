import type { PrizeRow } from "../../db/schema";
import {
  avatarStateSchema,
  commentSchema,
  dayResultSchema,
  photoSchema,
  prizeSchema,
  publicPhotoSchema,
  standingSchema,
  voteCandidateSchema,
  type AvatarState,
  type Comment,
  type CommentSubject,
  type DayResult,
  type Photo,
  type Prize,
  type PublicPhoto,
  type Standing,
  type VoteCandidate,
} from "../../shared/api";
import type { Standing as LeaderboardRow } from "../../shared/leaderboard";
import type { DayScore } from "../../shared/scoring";

// Responses are zod-parsed so a drifting DB row can never silently produce an
// out-of-contract payload.

export interface PhotoAggregate {
  id: number;
  uploaderId: number;
  uploaderName: string;
  createdAt: Date;
  caption: string | null;
  likeCount: number;
  commentCount: number;
  likedByMe: number;
  aiScore: number | null;
  sharedPublicly: boolean;
  publicVeto: boolean;
}

/** The public page's gate, in the ONE place both payloads read it from: shared, not
 * vetoed, and the day out. `revealed` is passed rather than re-derived because the two
 * callers already know it — and it must stay the same day-is-out question the rest of
 * the masking asks, never a second answer to it. */
function publicState(
  row: { sharedPublicly: boolean; publicVeto: boolean },
  revealed: boolean,
) {
  return {
    shared: row.sharedPublicly,
    vetoed: row.publicVeto,
    onPublicPage: revealed && row.sharedPublicly && !row.publicVeto,
  };
}

/**
 * TWO decisions because they are two rules: `uploader` is your own snap or a revealed
 * day; `score` is a revealed day and nothing else — your own snap buys no early look,
 * and neither does being an admin.
 */
export interface PhotoView {
  uploader: boolean;
  score: boolean;
}

export function toPhoto(row: PhotoAggregate, view: PhotoView): Photo {
  return photoSchema.parse({
    id: row.id,
    uploader: view.uploader
      ? { id: row.uploaderId, name: row.uploaderName }
      : null,
    url: `/api/photos/${row.id}/image`,
    createdAt: row.createdAt.toISOString(),
    // NOT behind `view.uploader`: the caption is what the photographer chose to say
    // while nobody knows it is theirs, so hiding it until the reveal would be hiding
    // the one thing it exists to show.
    caption: row.caption,
    likeCount: row.likeCount,
    likedByMe: row.likedByMe > 0,
    commentCount: row.commentCount,
    aiScore: view.score ? row.aiScore : null,
    // `view.score` IS "the day is revealed" — this interface's own doc above says so —
    // and the gallery's gate asks that same question, so it reads the same flag.
    ...publicState(row, view.score),
  });
}

export function toVoteCandidate(row: {
  id: number;
  caption: string | null;
  mine: number;
}): VoteCandidate {
  return voteCandidateSchema.parse({
    id: row.id,
    url: `/api/photos/${row.id}/image`,
    caption: row.caption,
    isMine: row.mine !== 0,
  });
}

export interface DayResultRow {
  photoId: number;
  uploaderId: number;
  uploaderName: string;
  critique: string | null;
  aiScore: number | null;
  aiStatus: "ok" | "failed" | null;
  sharedPublicly: boolean;
  publicVeto: boolean;
}

export function toDayResult(row: DayResultRow, scored: DayScore): DayResult {
  return dayResultSchema.parse({
    photoId: row.photoId,
    uploader: { id: row.uploaderId, name: row.uploaderName },
    url: `/api/photos/${row.photoId}/image`,
    rank: scored.rank,
    total: scored.total,
    peerNorm: scored.peerNorm,
    aiNorm: scored.aiNorm,
    peerPoints: scored.peerPoints,
    peerPlace: scored.peerPlace,
    juryPlace: scored.juryPlace,
    ballot: scored.ballot,
    aiScore: row.aiScore,
    aiStatus: row.aiStatus,
    bonus: scored.bonus,
    critique: row.critique,
    noVotePenalty: scored.penalised,
    // A `DayResult` only ever describes a REVEALED day — an unrevealed one is a 403,
    // not an empty list — so the reveal half of the gate is already answered here.
    ...publicState(row, true),
  });
}

export interface PublicPhotoRow {
  id: number;
  day: number;
  theme: string;
  photographer: string;
  aiScore: number | null;
  aiStatus: "ok" | "failed" | null;
}

export function toPublicPhoto(row: PublicPhotoRow): PublicPhoto {
  return publicPhotoSchema.parse({
    id: row.id,
    url: `/api/public/photos/${row.id}/image`,
    day: row.day,
    theme: row.theme,
    photographer: row.photographer,
    // A `failed` verdict is the fallback 5 the machine leaves when it breaks. The town
    // reads that as the machine breaking, because the archive says so beside it; a
    // family member reading this page has no such line and would read it as a mark out
    // of ten the jury meant.
    score: row.aiStatus === "ok" ? row.aiScore : null,
  });
}

export function toStanding(row: LeaderboardRow): Standing {
  return standingSchema.parse({
    user: { id: row.id, name: row.name },
    total: row.total,
    wins: row.wins,
    entries: row.entries,
    rank: row.rank,
  });
}

export interface AvatarAggregate {
  updatedAt: Date | null;
  remaining: number;
  limit: number;
}

export function toAvatarState(row: AvatarAggregate): AvatarState {
  const updatedAt = row.updatedAt;
  return avatarStateSchema.parse({
    avatar:
      updatedAt === null
        ? null
        : {
            // Versioned with the generation, so a new sprite is a new URL rather
            // than a cache to bust.
            url: `/api/avatar/image?v=${String(updatedAt.getTime())}`,
            createdAt: updatedAt.toISOString(),
          },
    remaining: row.remaining,
    limit: row.limit,
  });
}

export interface CommentAggregate {
  id: number;
  subjectType: CommentSubject;
  subjectId: number;
  authorId: number;
  authorName: string;
  body: string;
  createdAt: Date;
}

export function toPrize(row: PrizeRow): Prize {
  return prizeSchema.parse(row);
}

export function toComment(row: CommentAggregate): Comment {
  return commentSchema.parse({
    id: row.id,
    subjectType: row.subjectType,
    subjectId: row.subjectId,
    author: { id: row.authorId, name: row.authorName },
    body: row.body,
    createdAt: row.createdAt.toISOString(),
  });
}
