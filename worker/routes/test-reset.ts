import { Hono } from "hono";
import { z } from "zod";
import {
  avatarGenerations,
  avatarSprites,
  bowserDays,
  comments,
  likes,
  photoScores,
  photos,
  prizeAwards,
  prizes,
  retiredPhotos,
  users,
  votes,
} from "../../db/schema";
import { SEED_PRIZES } from "../../shared/prizes";
import type { AppEnv } from "../env";
import {
  DEFAULT_AVATAR_CAPS,
  writeAvatarCapsStatement,
} from "../lib/avatar-caps";
import { getDb } from "../lib/db";
import { setEventPhase } from "../lib/event";
import { setGameDayStatement } from "../lib/game-state";
import { sweepImages } from "../lib/images";
import { parseJsonBody } from "../lib/http";

export const testResetRoute = new Hono<AppEnv>();

const resetSchema = z
  .object({ day: z.int().positive().default(1) })
  .catch({ day: 1 });

testResetRoute.post("/", async (c) => {
  const db = getDb(c.env);
  const { day } = resetSchema.parse(await parseJsonBody(c.req.raw));
  const now = new Date();
  // ONE `db.batch`: this runs before every E2E test against a remote D1, and a dozen
  // round-trips loses the first tests of a run to a cold start. Statements still run in
  // written order, which is what the foreign keys below need.
  await db.batch([
    // Votes first: they point at the photos further down.
    db.delete(votes),
    db.delete(likes),
    db.delete(comments),
    // Before the photos: an evaluation hangs off a photo row by a foreign key.
    db.delete(photoScores),
    db.delete(photos),
    // Names an r2 key too, and no foreign key drags it out with the photo — so without
    // this the sweep below deletes the objects out from under rows the next test still
    // sees.
    db.delete(retiredPhotos),
    // Unique on `day`, so a leftover row makes the next test's landing roll its own
    // batch back and the day silently refuses to turn over.
    db.delete(prizeAwards),
    // A marked day stays marked forever, which across one shared database means every
    // test after the one that marked day 1 would open its event on a Bowser day.
    db.delete(bowserDays),
    db.delete(prizes),
    db.insert(prizes).values(
      SEED_PRIZES.map((label, index) => ({
        label,
        enabled: true,
        sortOrder: index,
        createdAt: now,
      })),
    ),
    db.delete(avatarGenerations),
    // The caps are STORED now, so a spec that closes the machine leaves it closed for
    // every test after it in this one shared database — and `e2e/admin.spec.ts` sorts
    // before `e2e/avatar.spec.ts`, whose unmocked POST asserts 503 and would get 429.
    writeAvatarCapsStatement(db, DEFAULT_AVATAR_CAPS),
    db.update(users).set({ avatarUpdatedAt: null, avatarKey: null }),
    db.delete(avatarSprites),
  ]);
  // The rows above are the only thing that knows a key, so the objects go with them or
  // the bucket fills with rubbish nothing can name again.
  await sweepImages(c.env);
  await setGameDayStatement(db, day);
  // The DO holds the live event AND caches the last state it was told about, so a
  // reset winds both back — with its pending alarm, or the event the last test left
  // running would run on underneath the next one.
  await setEventPhase(c.env, "submission");
  return c.json({ ok: true });
});
