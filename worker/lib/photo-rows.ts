import { and, asc, eq, sql, type SQL } from "drizzle-orm";
import {
  comments,
  likes,
  photoScores,
  photos,
  users,
  votes,
} from "../../db/schema";
import type { Db } from "./db";
import { deletePhotoScore } from "./photo-score";

export function purgePhoto(db: Db, id: number) {
  return [
    deletePhotoScore(db, id),
    db.delete(votes).where(eq(votes.photoId, id)),
    db.delete(likes).where(eq(likes.photoId, id)),
    db
      .delete(comments)
      .where(
        and(eq(comments.subjectType, "photo"), eq(comments.subjectId, id)),
      ),
    db.delete(photos).where(eq(photos.id, id)),
  ] as const;
}

/** Not a "today's photos" helper — the ballot's self-exclusion is `PUT /api/votes`'s
 * alone and stays out of here. */
export function photoAggregates(db: Db, viewerId: number, where: SQL) {
  return db
    .select({
      id: photos.id,
      uploaderId: users.id,
      uploaderName: users.name,
      day: photos.day,
      createdAt: photos.createdAt,
      likeCount: sql<number>`count(distinct ${likes.id})`,
      commentCount: sql<number>`count(distinct ${comments.id})`,
      likedByMe: sql<number>`coalesce(max(case when ${likes.userId} = ${viewerId} then 1 else 0 end), 0)`,
      // Left-joined: no row means the pass never landed — an absence, not a nought.
      aiScore: photoScores.aiScore,
    })
    .from(photos)
    .innerJoin(users, eq(users.id, photos.userId))
    .leftJoin(likes, eq(likes.photoId, photos.id))
    .leftJoin(
      comments,
      and(eq(comments.subjectType, "photo"), eq(comments.subjectId, photos.id)),
    )
    .leftJoin(photoScores, eq(photoScores.photoId, photos.id))
    .where(where)
    .groupBy(photos.id)
    .orderBy(asc(photos.id));
}
