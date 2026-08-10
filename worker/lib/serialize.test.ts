import { describe, expect, it } from "vitest";
import {
  commentSchema,
  photoSchema,
  voteCandidateSchema,
} from "../../shared/api";
import {
  toComment,
  toPhoto,
  toVoteCandidate,
  type PhotoAggregate,
  type PhotoView,
} from "./serialize";

const CREATED_AT = new Date("2026-07-25T09:30:00.000Z");

function photoRow(overrides: Partial<PhotoAggregate> = {}): PhotoAggregate {
  return {
    id: 7,
    uploaderId: 3,
    uploaderName: "tester",
    createdAt: CREATED_AT,
    likeCount: 2,
    commentCount: 1,
    likedByMe: 0,
    aiScore: 8,
    ...overrides,
  };
}

const OUT: PhotoView = { uploader: true, score: true };

describe("toPhoto", () => {
  it("maps a row onto the photo contract, deriving the image URL", () => {
    const photo = toPhoto(photoRow(), OUT);

    expect(photo).toEqual(
      photoSchema.parse({
        id: 7,
        uploader: { id: 3, name: "tester" },
        url: "/api/photos/7/image",
        createdAt: CREATED_AT.toISOString(),
        likeCount: 2,
        likedByMe: false,
        commentCount: 1,
        aiScore: 8,
      }),
    );
  });

  it("masks the uploader out of the payload rather than hiding it later", () => {
    const masked = toPhoto(photoRow(), { uploader: false, score: true });

    expect(masked.uploader).toBeNull();
    expect(JSON.stringify(masked)).not.toContain("tester");
    expect(masked).toMatchObject({ id: 7, likeCount: 2 });
  });

  // The two maskings are two rules, and this is the pair that used to be one: a
  // photographer sees their own name back on an unrevealed day and must NOT see
  // what the jury made of the photograph.
  it("masks the rating on its own condition, not the uploader's", () => {
    const mine = toPhoto(photoRow(), { uploader: true, score: false });
    expect(mine.uploader).not.toBeNull();
    expect(mine.aiScore).toBeNull();
    expect(JSON.stringify(mine)).not.toContain("8");
  });

  // Zero is what `scoreDay` uses internally for "no evaluation at all"; on the
  // wire the absence is an absence, so nothing can render a 0/10.
  it("carries no rating for a snap the jury never reached", () => {
    expect(toPhoto(photoRow({ aiScore: null }), OUT).aiScore).toBeNull();
    expect(() => toPhoto(photoRow({ aiScore: 0 }), OUT)).toThrow();
  });

  it("turns the SQL 0/1 like flag into a boolean", () => {
    expect(toPhoto(photoRow({ likedByMe: 0 }), OUT).likedByMe).toBe(false);
    expect(toPhoto(photoRow({ likedByMe: 1 }), OUT).likedByMe).toBe(true);
  });

  it("rejects a malformed count instead of coercing it", () => {
    expect(() => toPhoto(photoRow({ likeCount: 1.5 }), OUT)).toThrow();
    expect(() =>
      toPhoto(photoRow({ commentCount: Number.NaN }), OUT),
    ).toThrow();
  });
});

describe("toVoteCandidate", () => {
  it("carries no uploader at all, by construction", () => {
    const candidate = toVoteCandidate({ id: 7, mine: 0 });

    expect(candidate).toEqual(
      voteCandidateSchema.parse({
        id: 7,
        url: "/api/photos/7/image",
        isMine: false,
      }),
    );
    expect(Object.keys(candidate).sort()).toEqual(["id", "isMine", "url"]);
  });

  it("turns the query's 0/1 into the flag the ballot reads", () => {
    expect(toVoteCandidate({ id: 7, mine: 1 }).isMine).toBe(true);
    expect(toVoteCandidate({ id: 8, mine: 0 }).isMine).toBe(false);
  });

  it("rejects a malformed id instead of coercing it", () => {
    expect(() => toVoteCandidate({ id: 1.5, mine: 0 })).toThrow();
  });
});

describe("toComment", () => {
  it("maps a row onto the comment contract", () => {
    const comment = toComment({
      id: 11,
      subjectType: "photo",
      subjectId: 7,
      authorId: 3,
      authorName: "tester",
      body: "nice one",
      createdAt: CREATED_AT,
    });

    expect(comment).toEqual(
      commentSchema.parse({
        id: 11,
        subjectType: "photo",
        subjectId: 7,
        author: { id: 3, name: "tester" },
        body: "nice one",
        createdAt: CREATED_AT.toISOString(),
      }),
    );
  });

  it("rejects a malformed id instead of coercing it", () => {
    expect(() =>
      toComment({
        id: 2.5,
        subjectType: "photo",
        subjectId: 7,
        authorId: 3,
        authorName: "tester",
        body: "nice one",
        createdAt: CREATED_AT,
      }),
    ).toThrow();
  });
});
