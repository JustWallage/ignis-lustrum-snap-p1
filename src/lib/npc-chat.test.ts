import { NPC_OPTION_MAX } from "@shared/npc";
import { describe, expect, it } from "vitest";
import { chatPages, chatTurn, SAY_MY_OWN } from "./npc-chat";

const PAGE_MAX = chatPages("x".repeat(500))[0]?.length ?? 0;

describe("chatPages", () => {
  it("leaves a short reply as one page", () => {
    const pages = chatPages("Who took that one, then?");
    expect(pages).toEqual(["Who took that one, then?"]);
  });

  it("breaks a long reply between words", () => {
    const pages = chatPages(`${"word ".repeat(40)}end`);
    expect(pages.length).toBeGreaterThan(1);
    for (const page of pages) {
      expect(page.length).toBeLessThanOrEqual(PAGE_MAX);
      expect(page).toBe(page.trim());
      expect(page.startsWith("word")).toBe(true);
    }
  });

  it("splits a reply with no whitespace in it at all", () => {
    // A pasted URL, or a model that answered in one enormous run of characters.
    // There is nowhere to break, so it is cut at the budget rather than allowed
    // to overflow the box.
    const pages = chatPages("x".repeat(1000));
    for (const page of pages) {
      expect(page.length).toBeLessThanOrEqual(PAGE_MAX);
    }
    expect(pages.length).toBeGreaterThan(1);
    expect(pages[pages.length - 1]?.endsWith("…")).toBe(true);
  });

  it("caps how many pages one reply may run to", () => {
    const long = chatPages(`${"word ".repeat(500)}end`);
    const enormous = chatPages("y".repeat(100_000));
    expect(long.length).toBe(enormous.length);
    expect(long.length).toBeLessThanOrEqual(3);
    expect(long[long.length - 1]?.endsWith("…")).toBe(true);
  });

  it("always answers with at least one page", () => {
    expect(chatPages("")).toHaveLength(1);
  });
});

describe("chatTurn", () => {
  const SAYS = "CHRIS:";

  it("renders a turn into pages that fit and choices that can be pressed", () => {
    const turn = chatTurn(SAYS, "Oh, that one.", "Who took it, then?", [
      "No idea",
      "Rival did",
    ]);
    expect(turn.pages).toEqual(["CHRIS: Oh, that one.", "Who took it, then?"]);
    expect(turn.options).toEqual(["No idea", "Rival did", SAY_MY_OWN]);
  });

  it("puts the type-your-own entry last, always", () => {
    for (const options of [[], ["one"], ["one", "two", "three"]]) {
      const turn = chatTurn(SAYS, "Hm.", "Well?", options);
      expect(turn.options[turn.options.length - 1]).toBe(SAY_MY_OWN);
      expect(turn.options.filter((o) => o === SAY_MY_OWN)).toHaveLength(1);
      expect(turn.options.length).toBe(options.length + 1);
    }
  });

  it("never renders a blank pickable row, or more than three of them", () => {
    const turn = chatTurn(SAYS, "Hm.", "Well?", [
      "  ",
      "",
      "fine",
      "also fine",
      "one too many",
      "and another",
    ]);
    expect(turn.options).toEqual([
      "fine",
      "also fine",
      "one too many",
      SAY_MY_OWN,
    ]);
  });

  it("cannot overflow a text box however long the model wrote", () => {
    const turn = chatTurn(SAYS, "waffle ".repeat(60), "waffle ".repeat(60), [
      "x".repeat(200),
    ]);
    for (const page of turn.pages) {
      expect(page.length).toBeLessThanOrEqual(PAGE_MAX);
    }
    for (const option of turn.options) {
      expect(option.length).toBeLessThanOrEqual(NPC_OPTION_MAX);
      expect(option).not.toBe("");
    }
  });
});
