import { describe, expect, it } from "vitest";
import { JURY_MODELS, juryModelSchema, juryRunSchema } from "../../shared/api";
import { GEMINI_IMAGE_MODEL, GEMINI_MODEL, juryKeys } from "./gemini";

describe("the jury's models", () => {
  // The default is what every caller with no operator behind it spends, so an
  // allowlist that did not contain it would refuse the app's own choice.
  it("offers the default the app already runs on", () => {
    expect(JURY_MODELS).toContain(GEMINI_MODEL);
    expect(juryModelSchema.safeParse(GEMINI_MODEL).success).toBe(true);
  });

  // An image-out model answers with a picture, and both jury calls parse JSON.
  it("offers no image model and nothing it was not given", () => {
    expect(JURY_MODELS).not.toContain(GEMINI_IMAGE_MODEL);
    expect(juryModelSchema.safeParse("gemini-3.1-flash-image").success).toBe(
      false,
    );
    expect(juryModelSchema.safeParse("../../etc/passwd").success).toBe(false);
  });
});

describe("juryRunSchema", () => {
  // `parseJsonBody` answers null for a POST with no body, which is what every caller
  // but the console's dropdown sends — rejecting it would 400 the whole suite.
  it("reads a bodyless run as no override at all", () => {
    expect(juryRunSchema.parse(null)).toEqual({});
    expect(juryRunSchema.parse(undefined)).toEqual({});
    expect(juryRunSchema.parse({})).toEqual({});
  });

  it("takes a model off the allowlist and refuses one off it", () => {
    expect(juryRunSchema.parse({ model: GEMINI_MODEL })).toEqual({
      model: GEMINI_MODEL,
    });
    expect(juryRunSchema.safeParse({ model: "gemini-9-ultra" }).success).toBe(
      false,
    );
  });

  it("takes the two keys it knows and refuses a third", () => {
    expect(juryRunSchema.parse({ spend: "billed" })).toEqual({
      spend: "billed",
    });
    expect(juryRunSchema.parse({ spend: "default" })).toEqual({
      spend: "default",
    });
    expect(juryRunSchema.safeParse({ spend: "free" }).success).toBe(false);
  });
});

describe("juryKeys", () => {
  const both = { GEMINI_API_KEY: "free", GEMINI_API_KEY_PAID: "billed" };

  it("spends the free key first and the billed one behind it", () => {
    expect(juryKeys(both)).toEqual(["free", "billed"]);
    expect(juryKeys(both, "default")).toEqual(["free", "billed"]);
  });

  // A list of ONE: `askEveryKey` walks it in order, so a billed run carrying the free
  // key behind it would fall BACK to the very key the operator paid to skip.
  it("hands a billed run the billed key and nothing to fall back to", () => {
    expect(juryKeys(both, "billed")).toEqual(["billed"]);
  });

  it("drops a key that is unset or empty rather than asking with it", () => {
    expect(juryKeys({ GEMINI_API_KEY: "free" })).toEqual(["free"]);
    expect(juryKeys({ GEMINI_API_KEY: "free" }, "billed")).toEqual([]);
    expect(juryKeys({ GEMINI_API_KEY: "", GEMINI_API_KEY_PAID: "" })).toEqual(
      [],
    );
  });
});
