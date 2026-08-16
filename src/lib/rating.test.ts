import { describe, expect, it } from "vitest";
import { AI_SCORE_MAX, HALF_WEIGHT } from "@shared/scoring";
import { curvedText, isFallbackRating, ratingText } from "./rating";

describe("ratingText", () => {
  it("prints the jury's rating out of the scale it was given", () => {
    expect(ratingText(7)).toBe(`7/${String(AI_SCORE_MAX)}`);
    expect(ratingText(AI_SCORE_MAX)).toBe(
      `${String(AI_SCORE_MAX)}/${String(AI_SCORE_MAX)}`,
    );
  });

  // The bug the label caused: the day's best AI half is exactly HALF_WEIGHT, so
  // "AI 50" was on the winner's card every single day. A rating is never that number,
  // whatever the other half is measuring.
  it("is a rating, never the curved half", () => {
    expect(ratingText(AI_SCORE_MAX)).not.toContain(String(HALF_WEIGHT));
  });

  it("says a snap was not scored rather than scoring it nought", () => {
    expect(ratingText(null)).toBe("NOT SCORED");
    expect(ratingText(null)).not.toContain("0");
  });
});

describe("curvedText", () => {
  it("names the curved half as curved, and rounds it for the LCD", () => {
    expect(curvedText(HALF_WEIGHT)).toBe(`CURVED ${String(HALF_WEIGHT)}`);
    expect(curvedText(41.6)).toBe("CURVED 42");
    expect(curvedText(0)).toBe("CURVED 0");
  });
});

describe("isFallbackRating", () => {
  it("is only the row a broken evaluation wrote", () => {
    expect(isFallbackRating("failed")).toBe(true);
    expect(isFallbackRating("ok")).toBe(false);
    expect(isFallbackRating(null)).toBe(false);
  });
});
