import { and, asc, eq, inArray, ne, sql } from "drizzle-orm";
import { Hono } from "hono";
import { photos, votes } from "../../db/schema";
import {
  ballotSchema,
  voteCandidateListSchema,
  type Ballot,
} from "../../shared/api";
import type { AppEnv } from "../env";
import { broadcast } from "../lib/broadcast";
import { getDb, type Db } from "../lib/db";
import { readGameState } from "../lib/game-state";
import { parseJsonBody } from "../lib/http";
import { toVoteCandidate } from "../lib/serialize";

export const votesRoutes = new Hono<AppEnv>();

async function readBallot(
  db: Db,
  voterId: number,
  day: number,
): Promise<Ballot> {
  const rows = await db
    .select({ photoId: votes.photoId })
    .from(votes)
    .where(and(eq(votes.voterId, voterId), eq(votes.day, day)))
    .orderBy(asc(votes.rank));
  return ballotSchema.parse({ photoIds: rows.map((row) => row.photoId) });
}

votesRoutes.get("/candidates", async (c) => {
  const db = getDb(c.env);
  const { day } = await readGameState(db);
  const userId = c.get("user").id;
  const rows = await db
    .select({
      id: photos.id,
      mine: sql<number>`(${photos.userId} = ${userId})`,
    })
    .from(photos)
    .where(eq(photos.day, day))
    .orderBy(asc(photos.id));
  return c.json(
    voteCandidateListSchema.parse({ candidates: rows.map(toVoteCandidate) }),
  );
});

votesRoutes.get("/mine", async (c) => {
  const db = getDb(c.env);
  const { day } = await readGameState(db);
  return c.json(await readBallot(db, c.get("user").id, day));
});

votesRoutes.put("/", async (c) => {
  const user = c.get("user");
  const parsed = ballotSchema.safeParse(await parseJsonBody(c.req.raw));
  if (!parsed.success) {
    return c.json({ error: "Invalid ballot" }, 400);
  }
  const { photoIds } = parsed.data;

  const db = getDb(c.env);
  const state = await readGameState(db);
  if (state.phase !== "submission") {
    return c.json({ error: "Voting is closed" }, 409);
  }
  if (new Set(photoIds).size !== photoIds.length) {
    return c.json({ error: "Ranks must be three different photos" }, 400);
  }
  if (photoIds.length > 0) {
    // Deliberately NOT the candidates query above: that one includes the caller's
    // own snap so it can be looked at, and this one must exclude it so it cannot be
    // voted for. A shared "today's photos" helper is how self-voting comes back.
    const eligible = await db
      .select({ id: photos.id })
      .from(photos)
      .where(
        and(
          eq(photos.day, state.day),
          ne(photos.userId, user.id),
          inArray(photos.id, photoIds),
        ),
      );
    // One check covers all three refusals: another day, the caller's own, and an id
    // that does not exist are all simply not eligible.
    if (eligible.length !== photoIds.length) {
      return c.json({ error: "Vote for someone else's snap from today" }, 400);
    }
  }

  await db
    .delete(votes)
    .where(and(eq(votes.voterId, user.id), eq(votes.day, state.day)));
  if (photoIds.length > 0) {
    await db.insert(votes).values(
      photoIds.map((photoId, index) => ({
        voterId: user.id,
        photoId,
        day: state.day,
        rank: index + 1,
        createdAt: new Date(),
      })),
    );
  }
  await broadcast(c.env, { type: "votes_changed", day: state.day });
  return c.json(await readBallot(db, user.id, state.day));
});
