import { eq, inArray } from "drizzle-orm";
import {
  photoScores,
  photos,
  prizeAwards,
  users,
  votes,
} from "../../db/schema";
import type { DayResult } from "../../shared/api";
import { scoreDay, type DayEntry } from "../../shared/scoring";
import type { Db } from "./db";
import { toDayResult } from "./serialize";

export async function resultsForDays(
  db: Db,
  days: readonly number[],
): Promise<Map<number, DayResult[]>> {
  const byDay = new Map<number, DayResult[]>(days.map((day) => [day, []]));
  if (days.length === 0) return byDay;
  const wanted = [...days];

  const rows = await db
    .select({
      day: photos.day,
      photoId: photos.id,
      uploaderId: users.id,
      uploaderName: users.name,
      createdAt: photos.createdAt,
      // Left-joined: the AI pass writes a row even when Gemini fails, so a missing one
      // means the evaluation never landed — and the snap must still reach `scoreDay`,
      // which is the only place that decides what an absence is worth.
      aiScore: photoScores.aiScore,
      aiStatus: photoScores.aiStatus,
      critique: photoScores.critique,
      bonusDetected: photoScores.bonusDetected,
    })
    .from(photos)
    .innerJoin(users, eq(users.id, photos.userId))
    .leftJoin(photoScores, eq(photoScores.photoId, photos.id))
    .where(inArray(photos.day, wanted));

  // One read answers both questions the peer half asks: what each snap was ranked, and
  // who cast a ballot at all (the ×0.5 penalty). Voters are grouped per day and
  // ranks are not, because a photo id belongs to exactly one day already.
  const ballots = await db
    .select({
      day: votes.day,
      photoId: votes.photoId,
      rank: votes.rank,
      voterId: votes.voterId,
    })
    .from(votes)
    .where(inArray(votes.day, wanted));

  const ranksReceived = new Map<number, number[]>();
  const votedOn = new Map<number, Set<number>>();
  for (const ballot of ballots) {
    const received = ranksReceived.get(ballot.photoId) ?? [];
    received.push(ballot.rank);
    ranksReceived.set(ballot.photoId, received);
    const voters = votedOn.get(ballot.day) ?? new Set<number>();
    voters.add(ballot.voterId);
    votedOn.set(ballot.day, voters);
  }

  const rowsByDay = new Map<number, (typeof rows)[number][]>();
  for (const row of rows) {
    const forDay = rowsByDay.get(row.day) ?? [];
    forDay.push(row);
    rowsByDay.set(row.day, forDay);
  }

  for (const [day, dayRows] of rowsByDay) {
    const voted = votedOn.get(day) ?? new Set<number>();
    const entries: DayEntry[] = dayRows.map((row) => ({
      photoId: row.photoId,
      ranksReceived: ranksReceived.get(row.photoId) ?? [],
      aiScore: row.aiScore ?? 0,
      aiStatus: row.aiStatus,
      bonusDetected: row.bonusDetected ?? false,
      uploaderVoted: voted.has(row.uploaderId),
      createdAt: row.createdAt.getTime(),
    }));
    const byId = new Map(dayRows.map((row) => [row.photoId, row]));
    byDay.set(
      day,
      // Every scored id came out of `dayRows`, so the lookup cannot miss;
      // `flatMap` is how that is said without an `as` cast or a `!`.
      scoreDay(entries).flatMap((scored) => {
        const row = byId.get(scored.photoId);
        return row === undefined ? [] : [toDayResult(row, scored)];
      }),
    );
  }

  return byDay;
}

export async function awardsForDays(
  db: Db,
  days: readonly number[],
): Promise<Map<number, string>> {
  if (days.length === 0) return new Map();
  const rows = await db
    .select({ day: prizeAwards.day, prizeLabel: prizeAwards.prizeLabel })
    .from(prizeAwards)
    .where(inArray(prizeAwards.day, [...days]));
  // Unique on `day`, so a day has at most one award and a Map loses nothing.
  return new Map(rows.map((row) => [row.day, row.prizeLabel]));
}
