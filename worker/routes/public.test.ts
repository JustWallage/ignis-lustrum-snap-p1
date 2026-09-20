import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import {
  apiErrorSchema,
  publicGallerySchema,
  type PublicPhoto,
} from "../../shared/api";
import { juryForDay } from "../../shared/juries";
import { app } from "../index";
import {
  postRank,
  rankedScore,
  resetWorld,
  setDay,
  setPhase,
  signIn,
  stubGeminiDay,
  uploadPhotoId,
  withGeminiKey,
  withoutGeminiKey,
} from "../test-helpers";

beforeEach(resetWorld);

const GALLERY = "/api/public/gallery";

/** ANONYMOUS on purpose, every time: the point of this router is that it answers
 * without a cookie, and a test that sent one would pass through the auth middleware
 * being tested around it. */
async function gallery(): Promise<PublicPhoto[]> {
  const res = await app.request(GALLERY, {}, env);
  expect(res.status).toBe(200);
  return publicGallerySchema.parse(await res.json()).photos;
}

async function share(
  cookie: string,
  id: number,
  shared: boolean,
): Promise<Response> {
  return app.request(
    `/api/photos/${String(id)}/public`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ shared }),
    },
    env,
  );
}

async function veto(
  cookie: string,
  id: number,
  vetoed: boolean,
): Promise<Response> {
  return app.request(
    `/api/admin/photos/${String(id)}/veto`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ vetoed }),
    },
    env,
  );
}

async function image(id: number): Promise<Response> {
  return app.request(`/api/public/photos/${String(id)}/image`, {}, env);
}

describe("the public gallery", () => {
  it("shows nothing by default, and a shared revealed snap once asked", async () => {
    const cookie = await signIn();
    const id = await uploadPhotoId(cookie);
    expect((await postRank(cookie, 1, withoutGeminiKey())).status).toBe(200);
    expect((await setPhase(cookie, "reveal")).status).toBe(200);

    // Default is PRIVATE, which is the whole safety of the feature: a day being
    // revealed publishes nothing on its own.
    expect(await gallery()).toEqual([]);
    expect((await image(id)).status).toBe(404);

    expect((await share(cookie, id, true)).status).toBe(200);
    expect(await gallery()).toEqual([
      {
        id,
        url: `/api/public/photos/${String(id)}/image`,
        day: 1,
        theme: juryForDay(1).theme,
        photographer: "tester",
        // The fallback 5 is the machine breaking, not the jury judging, and this page
        // has no line beside it saying so.
        score: null,
      },
    ]);
    expect((await image(id)).status).toBe(200);
  });

  // The ballot's whole game: if a shared snap showed before its day was out, a friend
  // could read the gallery instead of guessing.
  it("keeps a shared snap off the page until its day is revealed", async () => {
    const cookie = await signIn();
    const id = await uploadPhotoId(cookie);
    expect((await share(cookie, id, true)).status).toBe(200);

    expect(await gallery()).toEqual([]);
    expect((await image(id)).status).toBe(404);

    expect((await setPhase(cookie, "reveal")).status).toBe(200);
    expect((await gallery()).map((photo) => photo.id)).toEqual([id]);
  });

  it("carries the jury's real rating, and the photographer's name", async () => {
    stubGeminiDay();
    const cookie = await signIn();
    const id = await uploadPhotoId(cookie, { bindings: withGeminiKey() });
    expect((await postRank(cookie, 1)).status).toBe(200);
    expect((await share(cookie, id, true)).status).toBe(200);
    expect((await setPhase(cookie, "reveal")).status).toBe(200);

    expect((await gallery())[0]).toMatchObject({
      photographer: "tester",
      score: rankedScore(0),
    });
  });

  it("carries no caption, no description and no comment", async () => {
    const cookie = await signIn();
    const id = await uploadPhotoId(cookie);
    expect(
      (
        await app.request(
          `/api/photos/${String(id)}/caption`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json", Cookie: cookie },
            body: JSON.stringify({ caption: "SECRET-CAPTION" }),
          },
          env,
        )
      ).status,
    ).toBe(200);
    expect((await share(cookie, id, true)).status).toBe(200);
    expect((await setPhase(cookie, "reveal")).status).toBe(200);

    const body = await (await app.request(GALLERY, {}, env)).text();
    expect(body).not.toContain("SECRET-CAPTION");
    expect(body).not.toContain("caption");
    expect(body).not.toContain("description");
  });

  it("takes a vetoed snap off the page and puts it back when the veto lifts", async () => {
    const theirs = await signIn("voter");
    const id = await uploadPhotoId(theirs);
    expect((await share(theirs, id, true)).status).toBe(200);
    expect((await setPhase(theirs, "reveal")).status).toBe(200);
    expect((await gallery()).map((photo) => photo.id)).toEqual([id]);

    const admin = await signIn();
    expect((await veto(admin, id, true)).status).toBe(200);
    expect(await gallery()).toEqual([]);
    expect((await image(id)).status).toBe(404);

    // The photographer's own choice survived the veto rather than being rewritten by
    // it, so lifting it restores the page without asking them again.
    expect((await veto(admin, id, false)).status).toBe(200);
    expect((await gallery()).map((photo) => photo.id)).toEqual([id]);
  });

  it("is the photographer's to share, and the admin's — and nobody else's", async () => {
    const theirs = await signIn("voter");
    const id = await uploadPhotoId(theirs);
    const stranger = await signIn("rival");
    expect((await share(stranger, id, true)).status).toBe(403);

    const admin = await signIn();
    expect((await share(admin, id, true)).status).toBe(200);
    expect((await share(theirs, id, false)).status).toBe(200);

    expect((await setPhase(theirs, "reveal")).status).toBe(200);
    expect(await gallery()).toEqual([]);
  });

  it("lets nobody but an admin veto", async () => {
    const cookie = await signIn("voter");
    const id = await uploadPhotoId(cookie);
    const res = await veto(cookie, id, true);
    expect(res.status).toBe(403);
    expect(apiErrorSchema.parse(await res.json()).error).toBe("Forbidden");
  });

  it("orders newest day first and groups nothing itself", async () => {
    const cookie = await signIn();
    const first = await uploadPhotoId(cookie);
    expect((await share(cookie, first, true)).status).toBe(200);
    await setDay(2);
    const second = await uploadPhotoId(cookie);
    expect((await share(cookie, second, true)).status).toBe(200);
    await setDay(3);

    expect((await gallery()).map((photo) => photo.day)).toEqual([2, 1]);
    expect((await gallery()).map((photo) => photo.theme)).toEqual([
      juryForDay(2).theme,
      juryForDay(1).theme,
    ]);
  });
});
