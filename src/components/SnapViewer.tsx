import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import { GbWindow } from "@/components/GbWindow";
import { CommentThread } from "@/components/CommentThread";
import { KEY_DIRS } from "@/game/keys";
import { pageOf, stepId, type ViewerSnap } from "@/lib/viewer";
import { FIT, panBy, toggleAt, zoomAbout, type Zoom } from "@/lib/zoom";

/** Left half back, right half on — the way a phone pages photographs. The names must
 * not contain the ‹ › buttons' "Previous snap"/"Next snap": `getByRole`'s name option
 * matches a SUBSTRING, and `voting.spec.ts` and `archive.spec.ts` resolve those names
 * page-wide, so a zone called "Next snap zone" is a strict-mode violation in every one
 * of them. */
const ZONES = [
  {
    side: "back",
    label: "Tap back",
    delta: -1,
    edge: "left-0 justify-start",
    glyph: "‹",
  },
  {
    side: "on",
    label: "Tap forward",
    delta: 1,
    edge: "right-0 justify-end",
    glyph: "›",
  },
] as const;

/** How long a tap waits to see whether it is the first half of a double-tap. The zones
 * and the picture's own zoom share one surface, so the page cannot turn on the way to a
 * zoom: a tap that arrives before the page has turned cancels it and zooms instead. The
 * ‹ › buttons and the arrow keys are not taps and step at once. */
const DOUBLE_TAP_MS = 250;

/** Past this a finger is dragging the picture, not tapping it, and the click that
 * follows pages nothing. */
const DRAG_SLOP = 8;

interface Finger {
  x: number;
  y: number;
  fromX: number;
  fromY: number;
}

interface Pinch {
  zoom: Zoom;
  gap: number;
  mid: { x: number; y: number };
}

function gapBetween(a: Finger, b: Finger): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function focalIn(box: DOMRect, x: number, y: number): { x: number; y: number } {
  return {
    x: x - (box.left + box.width / 2),
    y: y - (box.top + box.height / 2),
  };
}

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
  const [zoom, setZoom] = useState<Zoom>(FIT);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const fingers = useRef(new Map<number, Finger>());
  const pinch = useRef<Pinch | null>(null);
  const dragged = useRef(false);
  const pending = useRef<number | null>(null);

  const step = useCallback(
    (delta: number) => {
      onOpen(stepId(list, openId, delta));
    },
    [list, onOpen, openId],
  );

  useEffect(() => {
    setZoom(FIT);
  }, [openId]);

  useEffect(() => {
    return () => {
      if (pending.current !== null) window.clearTimeout(pending.current);
    };
  }, []);

  const boxOfFrame = (): DOMRect | null =>
    frameRef.current?.getBoundingClientRect() ?? null;

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const active = fingers.current;
    if (active.size === 0) dragged.current = false;
    active.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
      fromX: event.clientX,
      fromY: event.clientY,
    });
    const [a, b] = [...active.values()];
    const box = boxOfFrame();
    if (a === undefined || b === undefined || box === null) return;
    dragged.current = true;
    pinch.current = {
      zoom,
      gap: gapBetween(a, b),
      mid: focalIn(box, (a.x + b.x) / 2, (a.y + b.y) / 2),
    };
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const active = fingers.current;
    const was = active.get(event.pointerId);
    const box = boxOfFrame();
    if (was === undefined || box === null) return;
    const finger = {
      x: event.clientX,
      y: event.clientY,
      fromX: was.fromX,
      fromY: was.fromY,
    };
    active.set(event.pointerId, finger);
    if (
      Math.hypot(finger.x - finger.fromX, finger.y - finger.fromY) > DRAG_SLOP
    )
      dragged.current = true;
    const frame = { width: box.width, height: box.height };
    const [a, b] = [...active.values()];
    const started = pinch.current;
    if (a !== undefined && b !== undefined && started !== null) {
      const mid = focalIn(box, (a.x + b.x) / 2, (a.y + b.y) / 2);
      const pinched = zoomAbout(
        started.zoom,
        (started.zoom.scale * gapBetween(a, b)) / started.gap,
        started.mid,
        frame,
      );
      setZoom(
        panBy(pinched, mid.x - started.mid.x, mid.y - started.mid.y, frame),
      );
      return;
    }
    if (zoom.scale <= 1) return;
    setZoom((held) => panBy(held, finger.x - was.x, finger.y - was.y, frame));
  };

  const onPointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    fingers.current.delete(event.pointerId);
    if (fingers.current.size < 2) pinch.current = null;
  };

  const tap = (delta: number, event: ReactMouseEvent<HTMLButtonElement>) => {
    if (dragged.current) return;
    if (pending.current === null) {
      pending.current = window.setTimeout(() => {
        pending.current = null;
        step(delta);
      }, DOUBLE_TAP_MS);
      return;
    }
    window.clearTimeout(pending.current);
    pending.current = null;
    const box = boxOfFrame();
    if (box === null) return;
    setZoom((held) =>
      toggleAt(held, focalIn(box, event.clientX, event.clientY), {
        width: box.width,
        height: box.height,
      }),
    );
  };

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
    <GbWindow
      title={`Snap ${at + 1} of ${list.length}`}
      shape="wide"
      onClose={onClose}
    >
      <div className="flex min-h-0 flex-1 flex-col gap-2">
        {header}
        {/* The zones cover the photograph and nothing else, so a rank button, the
            heart and the comment field keep the taps they were reaching for. */}
        <div
          ref={frameRef}
          className="gb-viewer-frame relative flex min-h-0 flex-1"
          data-testid="viewer-frame"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerEnd}
          onPointerCancel={onPointerEnd}
          onPointerLeave={onPointerEnd}
        >
          <img
            src={current.url}
            alt={`Snap ${at + 1}`}
            data-testid="viewer-photo"
            className="min-h-0 w-full flex-1 border-2 border-[#071821] bg-[#071821] object-contain"
            style={{
              transform: `translate(${String(zoom.x)}px, ${String(zoom.y)}px) scale(${String(zoom.scale)})`,
            }}
          />
          {ZONES.map((zone) => (
            <button
              key={zone.side}
              type="button"
              className={`absolute inset-y-0 flex w-1/2 items-center px-1 ${zone.edge}`}
              aria-label={zone.label}
              data-testid={`viewer-tap-${zone.side}`}
              onClick={(event) => {
                tap(zone.delta, event);
              }}
            >
              <span
                aria-hidden="true"
                data-testid={`viewer-arrow-${zone.side}`}
                className="gb-viewer-arrow"
              >
                {zone.glyph}
              </span>
            </button>
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
        <div
          className="max-h-56 shrink-0 overflow-y-auto"
          data-testid="viewer-comments"
        >
          {/* Keyed by the photograph, or a half-typed comment follows the reader onto the
              next one and is sent against a snap they were not looking at. */}
          <CommentThread key={current.id} subject="photo" id={current.id} />
        </div>
        {footer}
      </div>
    </GbWindow>
  );
}
