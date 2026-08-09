import { describe as report, expect, it } from "vitest";
import { backfillImages, describe, objectsFor } from "./backfill.mjs";

const PHOTOS = [
  { id: 1, data: "aGVsbG8=", content_type: "image/png" },
  { id: 2, data: "d29ybGQ=", content_type: "image/jpeg" },
];

const USERS = [
  {
    avatar: "c3ByaXRl",
    avatar_content_type: "image/png",
    avatar_key: "abc123",
  },
  { avatar: null, avatar_content_type: null, avatar_key: null },
];

function fakeStore(overrides = {}) {
  const bucket = new Map();
  return {
    bucket,
    hasByteColumns: () => true,
    readPhotos: () => PHOTOS,
    readUsers: () => USERS,
    put: (object) => {
      bucket.set(object.key, object);
    },
    ...overrides,
  };
}

report("the image backfill", () => {
  it("copies every row that existed before, bytes and content type intact", async () => {
    const store = fakeStore();
    const result = await backfillImages(store);

    expect(result).toEqual({
      status: "copied",
      keys: ["snaps/1", "snaps/2", "sprites/abc123"],
    });
    expect([...store.bucket.keys()].sort()).toEqual([
      "snaps/1",
      "snaps/2",
      "sprites/abc123",
    ]);
    expect(store.bucket.get("snaps/2")).toEqual({
      key: "snaps/2",
      base64: "d29ybGQ=",
      contentType: "image/jpeg",
    });
    expect(store.bucket.get("sprites/abc123")?.base64).toBe("c3ByaXRl");
  });

  it("creates no second copy on a second run", async () => {
    const store = fakeStore();
    await backfillImages(store);
    const first = [...store.bucket.keys()].sort();

    await backfillImages(store);

    expect([...store.bucket.keys()].sort()).toEqual(first);
    expect(store.bucket.size).toBe(3);
  });

  it("says so, and writes nothing, once the columns are gone", async () => {
    const store = fakeStore({ hasByteColumns: () => false });
    const result = await backfillImages(store);

    expect(result).toEqual({ status: "already-migrated" });
    expect(store.bucket.size).toBe(0);
    expect(describe(result)).not.toBe(describe({ status: "copied", keys: [] }));
  });

  it("skips a player who never had a picture", () => {
    expect(objectsFor({ photos: [], users: USERS })).toHaveLength(1);
  });
});
