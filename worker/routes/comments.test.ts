import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { commentListSchema } from "../../shared/api";
import { app } from "../index";
import { resetWorld, signIn, uploadPhotoId } from "../test-helpers";

beforeEach(resetWorld);

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
