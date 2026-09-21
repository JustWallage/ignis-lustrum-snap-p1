import { capOptions, NPC_NAMES, type NpcKind } from "@shared/npc";

const PAGE_MAX = 90;

const PAGES_MAX = 3;

const ELLIPSIS = "…";

export interface ChatCopy {
  /** Always LAST of the answers: the free-text path is demoted, not deleted. */
  sayMyOwn: string;
  goodbye: string;
}

/** The two rows the shell adds to whatever the model wrote, in the language the
 * character speaks — the guide answers in Dutch, so his buttons cannot be English. */
export const CHAT_COPY: Record<NpcKind, ChatCopy> = {
  neighbour: { sayMyOwn: "Say something else", goodbye: "Goodbye" },
  guide: { sayMyOwn: "Vraag iets anders", goodbye: "Tot ziens" },
};

export function speakerOf(who: NpcKind): string {
  return `${NPC_NAMES[who].toUpperCase()}:`;
}

/**
 * After the last space inside the budget, so words stay whole. A stretch with no
 * space in it has nowhere to break and is cut at the budget instead.
 */
function breakAt(text: string): number {
  const space = text.lastIndexOf(" ", PAGE_MAX);
  return space <= 0 ? PAGE_MAX : space;
}

export function chatPages(line: string): readonly string[] {
  const pages: string[] = [];
  let rest = line.trim();
  while (rest.length > PAGE_MAX && pages.length < PAGES_MAX - 1) {
    const at = breakAt(rest);
    pages.push(rest.slice(0, at).trimEnd());
    rest = rest.slice(at).trimStart();
  }
  pages.push(
    rest.length > PAGE_MAX
      ? rest.slice(0, PAGE_MAX - ELLIPSIS.length).trimEnd() + ELLIPSIS
      : rest,
  );
  return pages;
}

export interface ChatTurn {
  pages: readonly string[];
  options: readonly string[];
}

export function chatTurn(
  who: NpcKind,
  reaction: string,
  question: string,
  options: readonly string[],
): ChatTurn {
  return {
    pages: [
      ...chatPages(`${speakerOf(who)} ${reaction}`),
      ...chatPages(question),
    ],
    options: [...capOptions(options), CHAT_COPY[who].sayMyOwn],
  };
}
