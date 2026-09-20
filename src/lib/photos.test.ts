import { describe, expect, it } from "vitest";
import type { PhotoVerdict } from "@shared/api";
import { unjudgedWarning } from "./photos";

function verdict(photoId: number, aiStatus: "ok" | "failed"): PhotoVerdict {
  return { photoId, aiStatus };
}

describe("unjudgedWarning", () => {
  it("says nothing when the jury stands behind every snap", () => {
    expect(unjudgedWarning(2, [verdict(1, "ok"), verdict(2, "ok")])).toBeNull();
    expect(unjudgedWarning(0, [])).toBeNull();
  });

  it("counts a missing verdict", () => {
    expect(unjudgedWarning(3, [verdict(1, "ok")])).toContain("2 of today's 3");
  });

  // The fallback 5 is a row, and `scoreDay` still gives it the field's middle place —
  // so a host reading "every snap is scored" off it would be reading a lie.
  it("counts a fallback verdict as unjudged, row or no row", () => {
    const warning = unjudgedWarning(3, [
      verdict(1, "ok"),
      verdict(2, "failed"),
    ]);
    expect(warning).toContain("2 of today's 3");
  });

  it("puts one snap in the singular", () => {
    expect(unjudgedWarning(2, [verdict(1, "ok")])).toContain("snap has");
    expect(unjudgedWarning(2, [])).toContain("snaps have");
  });
});
