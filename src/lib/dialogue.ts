export type DialoguePages = readonly string[];

export interface DialogueState {
  page: number;
  revealed: number;
  choice: number;
}

export const DIALOGUE_START: DialogueState = {
  page: 0,
  revealed: 0,
  choice: 0,
};

function pageText(pages: DialoguePages, state: DialogueState): string {
  return pages[state.page] ?? "";
}

export function visibleText(
  pages: DialoguePages,
  state: DialogueState,
): string {
  return pageText(pages, state).slice(0, state.revealed);
}

export function isPageRevealed(
  pages: DialoguePages,
  state: DialogueState,
): boolean {
  return state.revealed >= pageText(pages, state).length;
}

function isLastPage(pages: DialoguePages, state: DialogueState): boolean {
  return state.page >= pages.length - 1;
}

export function revealMore(
  pages: DialoguePages,
  state: DialogueState,
): DialogueState {
  return isPageRevealed(pages, state)
    ? state
    : { ...state, revealed: state.revealed + 1 };
}

export function hasMorePages(
  pages: DialoguePages,
  state: DialogueState,
): boolean {
  return isPageRevealed(pages, state) && !isLastPage(pages, state);
}

export function showsChoices(
  pages: DialoguePages,
  state: DialogueState,
  choiceCount: number,
): boolean {
  return (
    choiceCount > 0 && isLastPage(pages, state) && isPageRevealed(pages, state)
  );
}

export type DialogueAdvance =
  | { kind: "state"; state: DialogueState }
  | { kind: "picked"; choice: number }
  | { kind: "close" };

export function advance(
  pages: DialoguePages,
  state: DialogueState,
  choiceCount: number,
): DialogueAdvance {
  if (!isPageRevealed(pages, state)) {
    return {
      kind: "state",
      state: { ...state, revealed: pageText(pages, state).length },
    };
  }
  if (!isLastPage(pages, state)) {
    return {
      kind: "state",
      state: { page: state.page + 1, revealed: 0, choice: state.choice },
    };
  }
  return choiceCount > 0
    ? { kind: "picked", choice: state.choice }
    : { kind: "close" };
}

export function moveChoice(
  state: DialogueState,
  delta: number,
  choiceCount: number,
): DialogueState {
  if (choiceCount <= 0) return state;
  const wrapped = (state.choice + delta + choiceCount) % choiceCount;
  return { ...state, choice: wrapped };
}

export function selectChoice(
  state: DialogueState,
  choice: number,
  choiceCount: number,
): DialogueState {
  if (choice < 0 || choice >= choiceCount) return state;
  return { ...state, choice };
}
