import type { PrizeRow } from "../../db/schema";
import {
  avatarStateSchema,
  commentSchema,
  dayResultSchema,
  photoSchema,
  prizeSchema,
  standingSchema,
  voteCandidateSchema,
  type AvatarState,
  type Comment,
  type CommentSubject,
  type DayResult,
  type Photo,
  type Prize,
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
  likeCount: number;
  commentCount: number;
  likedByMe: number;
  aiScore: number | null;
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
    likeCount: row.likeCount,
    likedByMe: row.likedByMe > 0,
    commentCount: row.commentCount,
    aiScore: view.score ? row.aiScore : null,
  });
}

export function toVoteCandidate(row: {
  id: number;
  mine: number;
}): VoteCandidate {
  return voteCandidateSchema.parse({
    id: row.id,
    url: `/api/photos/${row.id}/image`,
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
    aiScore: row.aiScore,
    aiStatus: row.aiStatus,
    bonus: scored.bonus,
    critique: row.critique,
    noVotePenalty: scored.penalised,
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
