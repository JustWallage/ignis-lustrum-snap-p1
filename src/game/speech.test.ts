import { describe, expect, it } from "vitest";
import { hasGlyph } from "@/game/font";
import {
  sayable,
  speechFor,
  speechLines,
  speechOf,
  SPEECH_LINES_MAX,
  SPEECH_LINE_MAX,
  SPEECH_MS,
} from "@/game/speech";

describe("sayable", () => {
  it("shouts, because the font has no lowercase", () => {
    expect(sayable("hello there")).toBe("HELLO THERE");
  });

  it("keeps the punctuation a sentence actually needs", () => {
    expect(sayable("where are you?")).toBe("WHERE ARE YOU?");
    expect(sayable("it's 5:30 - don't wait.")).toBe("IT'S 5:30 - DON'T WAIT.");
  });

  it("folds the accents off a letter rather than losing the letter", () => {
    expect(sayable("café")).toBe("CAFE");
    expect(sayable("Ångström")).toBe("ANGSTROM");
  });

  it("turns everything the font cannot draw into exactly one mark", () => {
    expect(sayable("🎉")).toBe("?");
    expect(sayable("👨‍👩‍👦")).toBe("?");
    expect(sayable("100% #1")).toBe("100? ?1");
  });

  it("collapses the whitespace a wrap would otherwise be decided by", () => {
    expect(sayable("  hi   there \n you ")).toBe("HI THERE YOU");
    expect(sayable("   ")).toBe("");
  });

  it("only ever produces characters the font has a glyph for", () => {
    const drawn = sayable("Hé! ça va — 100%? 🎉");
    for (const char of drawn) {
      expect(hasGlyph(char) || char === " ", `no glyph for "${char}"`).toBe(
        true,
      );
    }
  });
});

describe("speechLines", () => {
  it("leaves something short on one line", () => {
    expect(speechLines("hi there")).toEqual(["HI THERE"]);
  });

  it("says nothing at all when there was nothing sayable", () => {
    expect(speechLines("   ")).toEqual([]);
  });

  it("wraps on words rather than mid-word", () => {
    const lines = speechLines("meet me by the pond");
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.join(" ")).toBe("MEET ME BY THE POND");
    for (const line of lines) {
      expect(line.length).toBeLessThanOrEqual(SPEECH_LINE_MAX);
    }
  });

  it("splits a word too long to fit on any line", () => {
    const lines = speechLines("AAAAAAAAAAAAAAAAAAAA");
    expect(lines).toEqual(["AAAAAAAAAAAAAA", "AAAAAA"]);
  });

  it("cuts what will not fit, and says that it cut it", () => {
    const lines = speechLines(
      "one two three four five six seven eight nine ten",
    );
    expect(lines).toHaveLength(SPEECH_LINES_MAX);
    expect(lines[SPEECH_LINES_MAX - 1]).toMatch(/\.\.\.$/);
    for (const line of lines) {
      expect(line.length).toBeLessThanOrEqual(SPEECH_LINE_MAX);
    }
  });

  it("never runs past three lines, whatever it is given", () => {
    for (const text of ["A B C D E F G H I J K L M N O P", "Z".repeat(80)]) {
      expect(speechLines(text).length).toBeLessThanOrEqual(SPEECH_LINES_MAX);
    }
  });
});

describe("speechFor", () => {
  it("floats for a few seconds and then is gone", () => {
    const speech = speechOf("hello", 1000);
    expect(speechFor(speech, 1000)).toEqual(["HELLO"]);
    expect(speechFor(speech, 1000 + SPEECH_MS - 1)).toEqual(["HELLO"]);
    expect(speechFor(speech, 1000 + SPEECH_MS)).toBeNull();
  });

  it("is nothing for somebody who has not spoken", () => {
    expect(speechFor(null, 0)).toBeNull();
  });

  it("is nothing for a message with nothing sayable in it", () => {
    expect(speechFor(speechOf("🙂", 0), 0)).toEqual(["?"]);
    expect(speechFor(speechOf("   ", 0), 0)).toBeNull();
  });
});
