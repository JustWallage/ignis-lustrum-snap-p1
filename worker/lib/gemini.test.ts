import { describe, expect, it } from "vitest";
import { JURY_MODELS, juryModelSchema, juryRunSchema } from "../../shared/api";
import { GEMINI_IMAGE_MODEL, GEMINI_MODEL } from "./gemini";

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
});
