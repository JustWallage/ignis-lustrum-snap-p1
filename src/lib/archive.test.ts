import { describe, expect, it } from "vitest";
import type { ArchiveDay, DayResult } from "@shared/api";
import { ALL, dayInView, feedOf, fieldsOf, photographers } from "@/lib/archive";

function result(photoId: number, name: string, rank: number): DayResult {
  return {
    photoId,
    uploader: { id: photoId, name },
    url: `/api/photos/${String(photoId)}/image`,
    rank,
    total: 10,
    peerNorm: 5,
    aiNorm: 5,
    peerPoints: 3,
    peerPlace: 1,
    juryPlace: 1,
    ballot: [1, 0, 0],
    aiScore: 5,
    aiStatus: "ok",
    bonus: false,
    critique: null,
    noVotePenalty: false,
  };
}

const DAYS: ArchiveDay[] = [
  {
    day: 3,
    prize: null,
    results: [result(30, "rival", 1), result(31, "tester", 2)],
  },
  { day: 1, prize: "Golden spatula", results: [result(10, "tester", 1)] },
];

describe("photographers", () => {
  it("names everybody once, alphabetically", () => {
    expect(photographers(DAYS, ALL)).toEqual(["rival", "tester"]);
  });

  it("has nobody in an empty archive", () => {
    expect(photographers([], ALL)).toEqual([]);
  });

  it("carries a selected player the archive has nothing by", () => {
    expect(photographers(DAYS, "voter")).toEqual(["rival", "tester", "voter"]);
    expect(photographers([], "voter")).toEqual(["voter"]);
  });

  it("still names a selected photographer once", () => {
    expect(photographers(DAYS, "tester")).toEqual(["rival", "tester"]);
  });
});

describe("fieldsOf", () => {
  it("keeps a day's whole field, whoever the feed is filtered to", () => {
    expect(fieldsOf(DAYS, ALL).map((one) => one.day)).toEqual([3, 1]);
    const [only] = fieldsOf(DAYS, 3);
    expect(only?.results.map((one) => one.uploader.name)).toEqual([
      "rival",
      "tester",
    ]);
  });

  it("has nothing for a day the archive does not carry", () => {
    expect(fieldsOf(DAYS, 2)).toEqual([]);
    expect(fieldsOf([], ALL)).toEqual([]);
  });
});

describe("feedOf", () => {
  it("keeps the payload's order with both rails wide open", () => {
    const feed = feedOf(DAYS, { day: ALL, who: ALL });
    expect(feed.map((entry) => entry.result.photoId)).toEqual([30, 31, 10]);
  });

  it("narrows to one day", () => {
    const feed = feedOf(DAYS, { day: 1, who: ALL });
    expect(feed.map((entry) => entry.result.photoId)).toEqual([10]);
  });

  it("narrows to one photographer across the days", () => {
    const feed = feedOf(DAYS, { day: ALL, who: "tester" });
    expect(feed.map((entry) => entry.day)).toEqual([3, 1]);
  });

  it("intersects the two rails rather than choosing between them", () => {
    expect(feedOf(DAYS, { day: 3, who: "tester" })).toHaveLength(1);
    expect(feedOf(DAYS, { day: 1, who: "rival" })).toEqual([]);
  });

  it("carries the day's prize down onto every one of its entries", () => {
    const feed = feedOf(DAYS, { day: ALL, who: ALL });
    expect(feed.map((entry) => entry.prize)).toEqual([
      null,
      null,
      "Golden spatula",
    ]);
  });
});

describe("dayInView", () => {
  it("opens on the newest revealed day", () => {
    expect(dayInView(DAYS, null)).toBe(3);
  });

  it("honours a choice, including the all-days one", () => {
    expect(dayInView(DAYS, 1)).toBe(1);
    expect(dayInView(DAYS, ALL)).toBe(ALL);
  });

  it("falls back to all days when there is no history at all", () => {
    expect(dayInView([], null)).toBe(ALL);
  });
});
