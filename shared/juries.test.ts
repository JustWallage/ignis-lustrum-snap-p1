import { describe, expect, it } from "vitest";
import { JURIES, juryDecorSchema, juryForDay, jurySchema } from "./juries";

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

  it("opens on the jury's name and names the theme on the next line", () => {
    for (const jury of JURIES) {
      expect(jury.dialogue, jury.name).toHaveLength(3);
      expect(jury.dialogue[0], jury.name).toContain(jury.name.toUpperCase());
      expect(jury.dialogue[1], jury.name).toContain(jury.theme.toUpperCase());
    }
  });

  it("gives every jury a town of its own to dress", () => {
    const dressings = JURIES.map((jury) => jury.decor);
    expect(new Set(dressings).size).toBe(dressings.length);
    expect([...dressings].sort()).toEqual([...juryDecorSchema.options].sort());
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
