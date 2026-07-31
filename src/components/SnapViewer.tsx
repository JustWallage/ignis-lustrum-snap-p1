import { useCallback, useEffect, type ReactNode } from "react";
import { GbWindow } from "@/components/GbWindow";
import { PhotoComments } from "@/components/PhotoComments";
import { KEY_DIRS } from "@/game/keys";
import { pageOf, stepId, type ViewerSnap } from "@/lib/viewer";

/** Left half back, right half on — the way a phone pages photographs. The names must
 * not contain the ‹ › buttons' "Previous snap"/"Next snap": `getByRole`'s name option
 * matches a SUBSTRING, and `voting.spec.ts` and `archive.spec.ts` resolve those names
 * page-wide, so a zone called "Next snap zone" is a strict-mode violation in every one
 * of them. */
const ZONES = [
  { side: "back", label: "Tap back", delta: -1, edge: "left-0" },
  { side: "on", label: "Tap forward", delta: 1, edge: "right-0" },
] as const;

/** A key that reaches the shell is the D-pad; a key aimed at a field is typing. The
 * viewer holds the arrows AND a comment box, and `KEY_DIRS` reads `a`/`d` as walking, so
 * without this a comment cannot contain the letter A. */
function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement
  );
}

/**
 * ONE photograph, as big as the window allows, for the ballot and for the archive. The
 * shell owns the paging — ‹ › buttons, ←/→ keys and the two tap zones all go through
 * the same step, so a change to how paging works cannot land on one surface only.
 */
export function SnapViewer({
  list,
  openId,
  onOpen,
  onClose,
  header,
  note,
  controls,
  trailing,
  footer,
}: {
  list: readonly ViewerSnap[];
  openId: number;
  onOpen: (id: number) => void;
  onClose: () => void;
  header?: ReactNode;
  note?: ReactNode;
  controls?: ReactNode;
  trailing?: ReactNode;
  footer?: ReactNode;
}) {
  const { at, current } = pageOf(list, openId);

  const step = useCallback(
    (delta: number) => {
      onOpen(stepId(list, openId, delta));
    },
    [list, onOpen, openId],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTyping(event.target)) return;
      const dir = KEY_DIRS[event.key];
      if (dir !== "left" && dir !== "right") return;
      event.preventDefault();
      step(dir === "left" ? -1 : 1);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [step]);

  if (current === undefined) return null;

  return (
    <GbWindow title={`Snap ${at + 1} of ${list.length}`} wide onClose={onClose}>
      <div className="flex min-h-0 flex-1 flex-col gap-2">
        {header}
        {/* The zones cover the photograph and nothing else, so a rank button, the
            heart and the comment field keep the taps they were reaching for. */}
        <div className="relative flex min-h-0 flex-1">
          <img
            src={current.url}
            alt={`Snap ${at + 1}`}
            data-testid="viewer-photo"
            className="min-h-0 w-full flex-1 border-2 border-[#071821] bg-[#071821] object-contain"
          />
          {ZONES.map((zone) => (
            <button
              key={zone.side}
              type="button"
              className={`absolute inset-y-0 w-1/2 ${zone.edge}`}
              aria-label={zone.label}
              data-testid={`viewer-tap-${zone.side}`}
              onClick={() => {
                step(zone.delta);
              }}
            />
          ))}
        </div>
        {note}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="gb-btn px-2"
            aria-label="Previous snap"
            onClick={() => {
              step(-1);
            }}
          >
            ‹
          </button>
          {controls}
          <button
            type="button"
            className="gb-btn px-2"
            aria-label="Next snap"
            onClick={() => {
              step(1);
            }}
          >
            ›
          </button>
          {trailing}
        </div>
        <div className="max-h-56 shrink-0 overflow-y-auto">
          {/* Keyed by the photograph, or a half-typed comment follows the reader onto the
              next one and is sent against a snap they were not looking at. */}
          <PhotoComments key={current.id} photoId={current.id} />
        </div>
        {footer}
      </div>
    </GbWindow>
  );
}
