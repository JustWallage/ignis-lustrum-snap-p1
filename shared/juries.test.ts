import { describe, expect, it } from "vitest";
import { JURIES, juryForDay, jurySchema } from "./juries";

describe("JURIES", () => {
  it("is a fortnight long", () => {
    expect(JURIES).toHaveLength(14);
  });

  it("has a schema-valid entry with dialogue for every day", () => {
    for (const jury of JURIES) {
      const parsed = jurySchema.parse(jury);
      expect(parsed.dialogue.length, parsed.name).toBeGreaterThan(0);
      for (const page of parsed.dialogue) {
        expect(page.trim(), parsed.name).not.toBe("");
      }
    }
  });

  it("gives every jury a distinct name and theme", () => {
    const names = JURIES.map((jury) => jury.name);
    const themes = JURIES.map((jury) => jury.theme);
    expect(new Set(names).size).toBe(names.length);
    expect(new Set(themes).size).toBe(themes.length);
  });

  it("gives every jury a distinct look", () => {
    const looks = JURIES.map(
      ({ sprite }) => `${sprite.hat}/${sprite.hair}/${sprite.outfit}`,
    );
    expect(new Set(looks).size).toBe(looks.length);
  });
});

describe("juryForDay", () => {
  it("walks the schedule in order", () => {
    expect(juryForDay(1)).toBe(JURIES[0]);
    expect(juryForDay(2)).toBe(JURIES[1]);
    expect(juryForDay(14)).toBe(JURIES[13]);
  });

  it("wraps instead of freezing after day 14", () => {
    expect(juryForDay(15)).toBe(JURIES[0]);
    expect(juryForDay(16)).toBe(JURIES[1]);
    expect(juryForDay(28)).toBe(JURIES[13]);
    expect(juryForDay(29)).toBe(JURIES[0]);
  });

  it("still names a jury for a day outside the contest", () => {
    expect(juryForDay(0)).toBe(JURIES[13]);
    expect(juryForDay(-1)).toBe(JURIES[12]);
    expect(juryForDay(1.7)).toBe(JURIES[0]);
  });
});
