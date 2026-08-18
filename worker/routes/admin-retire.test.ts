import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import {
  apiErrorSchema,
  dayPhotosSchema,
  dayResultsSchema,
  retirementSchema,
  voteCandidateListSchema,
} from "../../shared/api";
import { app } from "../index";
import {
  currentDay,
  eventAction,
  getJson,
  openSocket,
  photoRowCount,
  putVotes,
  readEvent,
  resetWorld,
  rowsForDay,
  setDay,
  signIn,
  uploadPhoto,
  uploadPhotoId,
} from "../test-helpers";

beforeEach(resetWorld);

async function post(path: string, cookie: string): Promise<Response> {
  return app.request(
    path,
    { method: "POST", headers: { Cookie: cookie } },
    env,
  );
}

async function retireSnap(cookie: string, id: number): Promise<Response> {
  return post(`/api/admin/photos/${String(id)}/retire`, cookie);
}

async function snapKeyOf(id: number): Promise<string> {
  const row = await env.DB.prepare("SELECT r2_key FROM photos WHERE id = ?")
    .bind(id)
    .first();
  return z.object({ r2_key: z.string() }).parse(row).r2_key;
}

const retiredRowSchema = z.object({
  photo_id: z.int(),
  day: z.int(),
  r2_key: z.string(),
  content_type: z.string(),
  uploader: z.string(),
  retirer: z.string(),
});

async function retiredRow(photoId: number) {
  const row = await env.DB.prepare(
    "SELECT photo_id, day, r2_key, content_type," +
      " who.name AS uploader, by.name AS retirer" +
      " FROM retired_photos" +
      " JOIN users AS who ON who.id = retired_photos.user_id" +
      " JOIN users AS by ON by.id = retired_photos.retired_by" +
      " WHERE photo_id = ?",
  )
    .bind(photoId)
    .first();
  return row === null ? null : retiredRowSchema.parse(row);
}

async function countOf(table: string, photoId: number): Promise<number> {
  const column = table === "comments" ? "subject_id" : "photo_id";
  const where = table === "comments" ? " AND subject_type = 'photo'" : "";
  const row = await env.DB.prepare(
    `SELECT count(*) AS n FROM ${table} WHERE ${column} = ?${where}`,
  )
    .bind(photoId)
    .first();
  return z.object({ n: z.int() }).parse(row).n;
}

async function comment(cookie: string, id: number): Promise<void> {
  const res = await app.request(
    `/api/photos/${String(id)}/comments`,
    {
      method: "POST",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ body: "Lovely light on that bin." }),
    },
    env,
  );
  expect(res.status).toBe(201);
}

describe("POST /api/admin/photos/:id/retire", () => {
  it("takes the row and its dependants, and leaves the picture in the bucket", async () => {
    const admin = await signIn();
    const friend = await signIn("rival");
    const mine = await uploadPhotoId(admin);
    const theirs = await uploadPhotoId(friend);
    expect((await putVotes(friend, [mine])).status).toBe(200);
    expect(
      (await post(`/api/photos/${String(mine)}/like`, friend)).status,
    ).toBe(200);
    await comment(friend, mine);
    const key = await snapKeyOf(mine);

    const res = await retireSnap(admin, mine);
    expect(res.status).toBe(200);
    expect(retirementSchema.parse(await res.json())).toEqual({
      day: 1,
      retired: 1,
    });

    expect(await countOf("votes", mine)).toBe(0);
    expect(await countOf("likes", mine)).toBe(0);
    expect(await countOf("comments", mine)).toBe(0);
    expect(await countOf("photo_scores", mine)).toBe(0);
    expect(await photoRowCount()).toBe(1);

    expect(await retiredRow(mine)).toEqual({
      photo_id: mine,
      day: 1,
      r2_key: key,
      content_type: "image/png",
      uploader: "tester",
      retirer: "tester",
    });
    // The bytes are the whole point: row goes, object stays.
    expect(await env.IMAGES.get(key)).not.toBeNull();
    expect(theirs).toBeGreaterThan(0);
  });

  it("frees the day's slot, so the player hands in another one", async () => {
    const admin = await signIn();
    const first = await uploadPhotoId(admin);
    // `photos_user_day_idx` is what makes this a 409 rather than a second row.
    expect((await uploadPhoto(admin)).status).toBe(409);

    expect((await retireSnap(admin, first)).status).toBe(200);
    const again = await uploadPhoto(admin);
    expect(again.status).toBe(201);
    expect(await rowsForDay(1)).toBe(1);
  });

  it("takes it off the ballot and out of the day's results", async () => {
    const admin = await signIn();
    const friend = await signIn("rival");
    const mine = await uploadPhotoId(admin);
    const theirs = await uploadPhotoId(friend);
    expect((await putVotes(admin, [theirs])).status).toBe(200);
    expect((await putVotes(friend, [mine])).status).toBe(200);

    expect((await retireSnap(admin, mine)).status).toBe(200);

    const ballot = voteCandidateListSchema.parse(
      await getJson("/api/votes/candidates", friend),
    );
    expect(ballot.candidates.map((one) => one.id)).toEqual([theirs]);

    await setDay(2);
    const results = dayResultsSchema.parse(
      await getJson("/api/days/1/results", admin),
    );
    expect(results.results.map((one) => one.photoId)).toEqual([theirs]);
  });

  it("refuses while an event is live, and the snap survives", async () => {
    const admin = await signIn();
    const mine = await uploadPhotoId(admin);
    expect((await eventAction(admin, "start")).status).toBe(200);
    const before = await readEvent();

    const refused = await retireSnap(admin, mine);
    expect(refused.status).toBe(409);
    expect(apiErrorSchema.parse(await refused.json()).error).toMatch(/event/i);
    expect(await photoRowCount()).toBe(1);
    expect(await retiredRow(mine)).toBeNull();
    expect(await readEvent()).toEqual(before);
  });

  // `/api/test/reset` sweeps the bucket BY PREFIX, so a `retired_photos` row left behind
  // names an object the sweep has already deleted — and the next test sees it.
  it("is emptied by the reset, along with the objects it names", async () => {
    const admin = await signIn();
    const mine = await uploadPhotoId(admin);
    const key = await snapKeyOf(mine);
    expect((await retireSnap(admin, mine)).status).toBe(200);
    expect(await retiredRow(mine)).not.toBeNull();

    await resetWorld();

    expect(await retiredRow(mine)).toBeNull();
    expect(await env.IMAGES.get(key)).toBeNull();
  });

  it("404s a snap naming nothing, and is admin-only", async () => {
    const admin = await signIn();
    const friend = await signIn("rival");
    const mine = await uploadPhotoId(admin);

    expect((await retireSnap(admin, 9999)).status).toBe(404);
    expect((await retireSnap(admin, 0)).status).toBe(404);
    expect((await retireSnap(friend, mine)).status).toBe(403);
    expect((await retireSnap("", mine)).status).toBe(401);
    expect(await photoRowCount()).toBe(1);
  });
});

describe("POST /api/admin/days/:day/retire", () => {
  it("empties the day, and every open screen reads the count as nought", async () => {
    const admin = await signIn();
    const friend = await signIn("rival");
    const mine = await uploadPhotoId(admin);
    const theirs = await uploadPhotoId(friend);
    expect(await rowsForDay(1)).toBe(2);
    const socket = await openSocket(admin);

    const res = await post("/api/admin/days/1/retire", admin);
    expect(res.status).toBe(200);
    expect(retirementSchema.parse(await res.json())).toEqual({
      day: 1,
      retired: 2,
    });
    expect(await rowsForDay(1)).toBe(0);
    // The clock has NOT moved: emptying a day is not the same as leaving it.
    expect(await currentDay()).toBe(1);

    // `photo_deleted` revalidates the feeds; only `state_changed` carries the count.
    expect(await socket.next()).toEqual({ type: "photo_deleted", id: mine });
    expect(await socket.next()).toEqual({ type: "photo_deleted", id: theirs });
    expect(await socket.next()).toEqual({
      type: "state_changed",
      state: { day: 1, phase: "submission", submissionCount: 0 },
    });
  });

  it("counts nothing on a day nobody handed in to", async () => {
    const admin = await signIn();
    const res = await post("/api/admin/days/4/retire", admin);
    expect(res.status).toBe(200);
    expect(retirementSchema.parse(await res.json()).retired).toBe(0);
  });

  it("is admin-only, and 404s something that is not a day", async () => {
    const friend = await signIn("rival");
    expect((await post("/api/admin/days/1/retire", friend)).status).toBe(403);
    expect((await post("/api/admin/days/1/retire", "")).status).toBe(401);
    expect(
      (await post("/api/admin/days/nope/retire", await signIn())).status,
    ).toBe(404);
  });
});

describe("GET /api/admin/days/:day/photos", () => {
  it("hands over the picture and the id, and masks the rest until the day is out", async () => {
    const admin = await signIn();
    const friend = await signIn("rival");
    const mine = await uploadPhotoId(admin);
    const theirs = await uploadPhotoId(friend);

    const unrevealed = dayPhotosSchema.parse(
      await getJson("/api/admin/days/1/photos", admin),
    );
    expect(unrevealed.day).toBe(1);
    expect(unrevealed.photos.map((one) => one.id)).toEqual([mine, theirs]);
    expect(unrevealed.photos.map((one) => one.url)).toEqual([
      `/api/photos/${String(mine)}/image`,
      `/api/photos/${String(theirs)}/image`,
    ]);
    // No new exception to `toPhoto`: an admin's own snap carries their own name, the
    // other carries none, and no verdict is out on either.
    expect(unrevealed.photos.map((one) => one.uploader?.name ?? null)).toEqual([
      "tester",
      null,
    ]);
    expect(unrevealed.photos.every((one) => one.aiScore === null)).toBe(true);

    await setDay(2);
    const revealed = dayPhotosSchema.parse(
      await getJson("/api/admin/days/1/photos", admin),
    );
    expect(revealed.photos.map((one) => one.uploader?.name ?? null)).toEqual([
      "tester",
      "rival",
    ]);
  });

  it("answers an empty day with an empty list, and is admin-only", async () => {
    const admin = await signIn();
    const empty = dayPhotosSchema.parse(
      await getJson("/api/admin/days/6/photos", admin),
    );
    expect(empty).toEqual({
      day: 6,
      photos: [],
      descriptions: [],
      verdicts: [],
      ranking: { generated: false, ranAt: null, failed: false },
    });

    const friend = await signIn("rival");
    const refused = await app.request(
      "/api/admin/days/1/photos",
      { headers: { Cookie: friend } },
      env,
    );
    expect(refused.status).toBe(403);
    expect(
      (await app.request("/api/admin/days/1/photos", {}, env)).status,
    ).toBe(401);
  });
});
