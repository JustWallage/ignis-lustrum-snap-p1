import { describe, expect, it } from "vitest";
import {
  advance,
  DIALOGUE_START,
  hasMorePages,
  isPageRevealed,
  moveChoice,
  revealMore,
  selectChoice,
  showsChoices,
  visibleText,
  type DialogueState,
} from "./dialogue";

const PAGES = ["ab", "cd", "ef"];

function typeOut(pages: readonly string[], state: DialogueState) {
  let current = state;
  while (!isPageRevealed(pages, current)) current = revealMore(pages, current);
  return current;
}

function pressUntilTerminal(pages: readonly string[], choiceCount: number) {
  let state = DIALOGUE_START;
  for (let guard = 0; guard < 50; guard += 1) {
    const step = advance(pages, state, choiceCount);
    if (step.kind !== "state") return { state, step };
    state = step.state;
  }
  throw new Error("advance never reached a terminal step");
}

describe("the typewriter", () => {
  it("reveals one character per tick and then stops", () => {
    let state = DIALOGUE_START;
    expect(visibleText(PAGES, state)).toBe("");
    state = revealMore(PAGES, state);
    expect(visibleText(PAGES, state)).toBe("a");
    state = revealMore(PAGES, state);
    expect(visibleText(PAGES, state)).toBe("ab");
    expect(isPageRevealed(PAGES, state)).toBe(true);
    expect(revealMore(PAGES, state)).toBe(state);
  });

  it("treats an empty page as already revealed", () => {
    expect(isPageRevealed([""], DIALOGUE_START)).toBe(true);
  });
});

describe("pressing A", () => {
  it("skips to the end of the current page before turning it", () => {
    const step = advance(PAGES, DIALOGUE_START, 0);
    expect(step).toEqual({
      kind: "state",
      state: { page: 0, revealed: 2, choice: 0 },
    });
  });

  it("turns to the next page once the current one is typed out", () => {
    const typed = typeOut(PAGES, DIALOGUE_START);
    const step = advance(PAGES, typed, 0);
    expect(step).toEqual({
      kind: "state",
      state: { page: 1, revealed: 0, choice: 0 },
    });
  });

  it("walks the whole chain and then closes when there are no choices", () => {
    const { state, step } = pressUntilTerminal(PAGES, 0);
    expect(state.page).toBe(PAGES.length - 1);
    expect(step).toEqual({ kind: "close" });
  });

  it("commits the highlighted choice on the last page", () => {
    const { state, step } = pressUntilTerminal(PAGES, 2);
    expect(step).toEqual({ kind: "picked", choice: 0 });
    expect(advance(PAGES, moveChoice(state, 1, 2), 2)).toEqual({
      kind: "picked",
      choice: 1,
    });
  });

  it("never picks a choice before the last page has finished revealing", () => {
    expect(advance(PAGES, DIALOGUE_START, 2).kind).toBe("state");
    expect(advance(PAGES, { page: 2, revealed: 1, choice: 0 }, 2).kind).toBe(
      "state",
    );
  });
});

describe("the ▼ more indicator", () => {
  it("shows only between a finished page and the next one", () => {
    expect(hasMorePages(PAGES, DIALOGUE_START)).toBe(false);
    expect(hasMorePages(PAGES, typeOut(PAGES, DIALOGUE_START))).toBe(true);
    expect(
      hasMorePages(PAGES, typeOut(PAGES, { page: 2, revealed: 0, choice: 0 })),
    ).toBe(false);
  });
});

describe("the choice cursor", () => {
  const last: DialogueState = { page: 2, revealed: 2, choice: 0 };

  it("appears only on a fully revealed last page, and only if there are choices", () => {
    expect(showsChoices(PAGES, last, 2)).toBe(true);
    expect(showsChoices(PAGES, last, 0)).toBe(false);
    expect(showsChoices(PAGES, { ...last, revealed: 1 }, 2)).toBe(false);
    expect(showsChoices(PAGES, DIALOGUE_START, 2)).toBe(false);
  });

  it("wraps in both directions", () => {
    expect(moveChoice(last, 1, 2).choice).toBe(1);
    expect(moveChoice(last, -1, 2).choice).toBe(1);
    expect(moveChoice({ ...last, choice: 1 }, 1, 2).choice).toBe(0);
  });

  it("stays put when there is nothing to choose between", () => {
    expect(moveChoice(last, 1, 0)).toBe(last);
  });

  it("ignores a pointer selecting a choice that is not there", () => {
    expect(selectChoice(last, 1, 2).choice).toBe(1);
    expect(selectChoice(last, 2, 2)).toBe(last);
    expect(selectChoice(last, -1, 2)).toBe(last);
  });
});
