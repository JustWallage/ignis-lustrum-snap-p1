import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import {
  commentListSchema,
  commentSchema,
  townAvatarsSchema,
} from "../../shared/api";
import { app } from "../index";
import {
  PHOTO_BYTES,
  resetWorld,
  signIn,
  uploadPhotoId,
} from "../test-helpers";

beforeEach(resetWorld);

async function drawnSpriteId(cookie: string, name: string): Promise<number> {
  const form = new FormData();
  form.append(
    "sprite",
    new File([PHOTO_BYTES], "sprite.png", { type: "image/png" }),
  );
  const drawn = await app.request(
    "/api/test/avatar",
    { method: "POST", body: form, headers: { Cookie: cookie } },
    { ...env, ENVIRONMENT: "local" },
  );
  expect(drawn.status).toBe(200);
  const listed = await app.request(
    "/api/avatars",
    { headers: { Cookie: cookie } },
    env,
  );
  expect(listed.status).toBe(200);
  const { players } = townAvatarsSchema.parse(await listed.json());
  const id = players.find((player) => player.user.name === name)?.sprites[0]
    ?.id;
  if (id === undefined) throw new Error("the sprite was not kept");
  return id;
}

async function say(
  cookie: string,
  path: string,
  body: string,
): Promise<Response> {
  return app.request(
    path,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ body }),
    },
    env,
  );
}

async function threadAt(cookie: string, path: string) {
  const res = await app.request(path, { headers: { Cookie: cookie } }, env);
  expect(res.status).toBe(200);
  return commentListSchema.parse(await res.json()).comments;
}

describe("comments", () => {
  it("adds and lists a comment", async () => {
    const cookie = await signIn();
    const id = await uploadPhotoId(cookie);
    const created = await app.request(
      `/api/photos/${id}/comments`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookie },
        body: JSON.stringify({ body: "nice one" }),
      },
      env,
    );
    expect(created.status).toBe(201);
    const list = await app.request(
      `/api/photos/${id}/comments`,
      { headers: { Cookie: cookie } },
      env,
    );
    const { comments } = commentListSchema.parse(await list.json());
    expect(comments).toHaveLength(1);
    expect(comments[0]).toMatchObject({
      body: "nice one",
      author: { name: "tester" },
    });
  });

  it("names the commenter and never the photographer", async () => {
    const uploader = await signIn("tester");
    const id = await uploadPhotoId(uploader);
    const commenter = await signIn("rival");
    const created = await app.request(
      `/api/photos/${id}/comments`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: commenter },
        body: JSON.stringify({ body: "the light is doing the work" }),
      },
      env,
    );
    expect(created.status).toBe(201);

    const list = await app.request(
      `/api/photos/${id}/comments`,
      { headers: { Cookie: commenter } },
      env,
    );
    // Read as TEXT: a parse would strip the field before the assertion could see it.
    const raw = await list.text();
    expect(raw).not.toContain("tester");
    expect(raw).not.toContain("uploader");
    const { comments } = commentListSchema.parse(JSON.parse(raw));
    expect(comments[0]?.author.name).toBe("rival");
  });
});

describe("comments on a drawn sprite", () => {
  it("round-trips a thread of its own, apart from the snap of the same id", async () => {
    const cookie = await signIn();
    const photoId = await uploadPhotoId(cookie);
    const spriteId = await drawnSpriteId(cookie, "tester");

    expect(
      (await say(cookie, `/api/avatars/${spriteId}/comments`, "good hat"))
        .status,
    ).toBe(201);
    expect(
      (await say(cookie, `/api/photos/${photoId}/comments`, "good light"))
        .status,
    ).toBe(201);

    const onSprite = await threadAt(
      cookie,
      `/api/avatars/${spriteId}/comments`,
    );
    expect(onSprite.map((one) => one.body)).toEqual(["good hat"]);
    const said = onSprite[0];
    expect(said).toMatchObject({
      subjectType: "avatar",
      subjectId: spriteId,
      author: { name: "tester" },
    });
    expect(
      (await threadAt(cookie, `/api/photos/${photoId}/comments`)).map(
        (one) => one.body,
      ),
    ).toEqual(["good light"]);

    // The sprite's id read as the OTHER subject — the collision two unrelated counters
    // make inevitable, and a subject-blind thread serves one list to both routes the
    // moment it happens. Neither verb checks that a subject exists, so this holds
    // whether or not there is a photo with that id.
    expect(await threadAt(cookie, `/api/photos/${spriteId}/comments`)).toEqual(
      [],
    );
    const crossed = await app.request(
      `/api/photos/${spriteId}/comments/${String(said?.id ?? 0)}`,
      { method: "DELETE", headers: { Cookie: cookie } },
      env,
    );
    expect(crossed.status).toBe(404);
    expect(
      await threadAt(cookie, `/api/avatars/${spriteId}/comments`),
    ).toHaveLength(1);
  });

  it("404s a sprite id nobody drew, and stores nothing for it", async () => {
    const cookie = await signIn();
    expect(
      (await say(cookie, "/api/avatars/99999/comments", "hello?")).status,
    ).toBe(404);
    expect(await threadAt(cookie, "/api/avatars/99999/comments")).toEqual([]);
  });

  it("lets a stranger post but not delete, and an admin delete anything", async () => {
    const owner = await signIn("tester");
    const spriteId = await drawnSpriteId(owner, "tester");
    const stranger = await signIn("rival");

    const posted = await say(
      stranger,
      `/api/avatars/${spriteId}/comments`,
      "nice trainer",
    );
    expect(posted.status).toBe(201);
    const comment = commentSchema.parse(await posted.json());

    const path = `/api/avatars/${spriteId}/comments/${String(comment.id)}`;
    // `tester` is the pool's admin, so the sprite's owner is asked as a FRIEND here:
    // owning the face buys no power over what is said about it.
    const asFriend = await app.request(
      path,
      { method: "DELETE", headers: { Cookie: owner } },
      { ...env, ADMIN_NAMES: "someone-else" },
    );
    expect(asFriend.status).toBe(403);

    const asAdmin = await app.request(
      path,
      { method: "DELETE", headers: { Cookie: owner } },
      env,
    );
    expect(asAdmin.status).toBe(200);
    expect(await threadAt(owner, `/api/avatars/${spriteId}/comments`)).toEqual(
      [],
    );
  });

  it("is behind the cookie in both directions", async () => {
    const cookie = await signIn();
    const spriteId = await drawnSpriteId(cookie, "tester");
    const path = `/api/avatars/${spriteId}/comments`;
    expect((await app.request(path, {}, env)).status).toBe(401);
    const posted = await app.request(
      path,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: "sneaking in" }),
      },
      env,
    );
    expect(posted.status).toBe(401);
  });
});
