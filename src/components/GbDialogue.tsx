import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GbPending } from "@/components/GbPending";
import { GbTextbox } from "@/components/GbTextbox";
import { isCancelKey, isConfirmKey, KEY_DIRS } from "@/game/keys";
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
} from "@/lib/dialogue";
import { playCue } from "@/lib/sound";

const REVEAL_MS = 26;

const BLIP_EVERY = 2;

const NO_PAGES: readonly string[] = [];
const NO_CHOICES: readonly DialogueChoice[] = [];

interface DialogueChoice {
  label: string;
  onPick: () => void;
}

export interface DialogueChain {
  /** A chain rebuilt with the SAME id leaves the reader where they are; a new id starts
   * over. That is what lets one chain hand over to another under an open box — a cursor
   * left on the third item would point past the end of a two-choice question. */
  id: string;
  pages: readonly string[];
  choices: readonly DialogueChoice[];
  busy?: boolean;
}

export interface DialogueView {
  text: string;
  more: boolean;
  busy: boolean;
  choices: readonly DialogueChoice[];
  selected: number;
  pressA: () => void;
  pressB: () => void;
  move: (delta: number) => void;
  pick: (index: number) => void;
  select: (index: number) => void;
}

export function useDialogueChain(
  chain: DialogueChain | null,
  onClose: () => void,
): DialogueView | null {
  const [state, setState] = useState(DIALOGUE_START);
  const [wasOpen, setWasOpen] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  // A second A press can arrive before React has committed the first one's render,
  // and a handler reading state from its closure would swallow it — which is exactly
  // what impatient tapping does.
  const stateRef = useRef(state);

  const open = chain !== null;
  const pages = useMemo(() => chain?.pages ?? NO_PAGES, [chain]);
  const choices = useMemo(() => chain?.choices ?? NO_CHOICES, [chain]);

  const apply = useCallback((next: DialogueState) => {
    stateRef.current = next;
    setState(next);
  }, []);

  // On OPEN or a different id, never on object identity: a menu label that reads its
  // own state back would otherwise throw the reader to page one.
  const id = chain?.id ?? null;
  if (open !== wasOpen || id !== openId) {
    setWasOpen(open);
    setOpenId(id);
    if (open) apply(DIALOGUE_START);
  }

  const pressA = useCallback(() => {
    playCue("confirm");
    const step = advance(pages, stateRef.current, choices.length);
    if (step.kind === "state") apply(step.state);
    else if (step.kind === "close") onClose();
    else choices[step.choice]?.onPick();
  }, [apply, choices, onClose, pages]);

  const move = useCallback(
    (delta: number) => {
      apply(moveChoice(stateRef.current, delta, choices.length));
    },
    [apply, choices.length],
  );

  const pick = useCallback(
    (index: number) => {
      if (!showsChoices(pages, stateRef.current, choices.length)) return;
      choices[index]?.onPick();
    },
    [choices, pages],
  );

  const select = useCallback(
    (index: number) => {
      apply(selectChoice(stateRef.current, index, choices.length));
    },
    [apply, choices.length],
  );

  useEffect(() => {
    if (!open || isPageRevealed(pages, state)) return;
    const timer = setTimeout(() => {
      const next = revealMore(pages, stateRef.current);
      apply(next);
      if (next.revealed % BLIP_EVERY === 0) playCue("blip");
    }, REVEAL_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [apply, open, pages, state]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (isCancelKey(event.key)) {
        event.preventDefault();
        onClose();
        return;
      }
      if (isConfirmKey(event.key)) {
        event.preventDefault();
        pressA();
        return;
      }
      const dir = KEY_DIRS[event.key];
      if (dir === "up" || dir === "down") {
        event.preventDefault();
        move(dir === "up" ? -1 : 1);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [move, onClose, open, pressA]);

  if (chain === null) return null;
  return {
    text: visibleText(pages, state),
    more: hasMorePages(pages, state),
    busy: chain.busy ?? false,
    choices: showsChoices(pages, state, choices.length) ? choices : NO_CHOICES,
    selected: state.choice,
    pressA,
    pressB: onClose,
    move,
    pick,
    select,
  };
}

export function GbDialogue({ view }: { view: DialogueView }) {
  return (
    <GbTextbox more={view.more}>
      <p data-testid="dialogue-text">
        {view.text}
        {view.busy && <GbPending label="Working" />}
      </p>
      {view.choices.length > 0 && (
        <ul className="gb-choices" data-testid="dialogue-choices">
          {view.choices.map((choice, index) => (
            <li key={choice.label}>
              <button
                type="button"
                className="gb-choice"
                data-selected={index === view.selected}
                onPointerEnter={() => {
                  view.select(index);
                }}
                onClick={() => {
                  view.pick(index);
                }}
              >
                <span aria-hidden="true">
                  {index === view.selected ? "▶" : " "}
                </span>
                {choice.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </GbTextbox>
  );
}
