import { describe, expect, it } from "vitest";
import { busyProps, placeholderFor } from "@/lib/pending";

describe("busyProps", () => {
  it("makes a busy control unclickable and says so", () => {
    // The whole point of one decision instead of two: a control that showed it
    // was working and stayed clickable is what posted a comment twice.
    expect(busyProps(true)).toEqual({ disabled: true, "aria-busy": true });
  });

  it("leaves an idle control alone", () => {
    expect(busyProps(false)).toEqual({ disabled: false, "aria-busy": false });
  });

  it("keeps busy and merely-disabled apart", () => {
    expect(busyProps(false, true)).toEqual({
      disabled: true,
      "aria-busy": false,
    });
  });

  it("takes either reason as reason enough to refuse the press", () => {
    expect(busyProps(true, true)).toEqual({
      disabled: true,
      "aria-busy": true,
    });
  });
});

describe("placeholderFor", () => {
  it("shows what the server refused with", () => {
    expect(placeholderFor("Nope", false)).toEqual({
      kind: "error",
      text: "Nope",
    });
  });

  it("prefers a refusal to a wait", () => {
    // A refetch is in flight far more often than it looks; an error that landed
    // during one is still the most useful thing on the screen.
    expect(placeholderFor("Nope", true)).toEqual({
      kind: "error",
      text: "Nope",
    });
  });

  it("waits when there is nothing yet and something is coming", () => {
    expect(placeholderFor(null, true)).toEqual({ kind: "pending" });
  });

  it("is empty when the answer was genuinely nothing", () => {
    expect(placeholderFor(null, false)).toEqual({ kind: "empty" });
  });
});
