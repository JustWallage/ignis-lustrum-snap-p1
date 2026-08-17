import { describe, expect, it } from "vitest";
import { JURIES } from "@shared/juries";
import { JURY_PORTRAITS } from "@/game/portraits";

describe("JURY_PORTRAITS", () => {
  it("has one for every jury", () => {
    const missing = JURIES.filter(
      (jury) => JURY_PORTRAITS[jury.name] === undefined,
    );
    expect(missing.map((jury) => jury.name)).toEqual([]);
  });

  it("has none for a jury that is not in the table", () => {
    const names = new Set(JURIES.map((jury) => jury.name));
    const stale = Object.keys(JURY_PORTRAITS).filter(
      (name) => !names.has(name),
    );
    expect(stale).toEqual([]);
  });

  it("gives each jury a picture of its own", () => {
    const files = Object.values(JURY_PORTRAITS);
    expect(new Set(files).size).toBe(files.length);
  });
});
