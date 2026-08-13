/**
 * The prize drum's geometry, as pure functions. The barrel is CLOSED — the prizes run
 * all the way around it — so a spin past a full turn wraps for free and no copy of the
 * list has to be rendered above or below where it started.
 */

/** The window the barrel turns in. Every other length is derived from it and written
 * into the DOM by `WheelScreen`, so the stylesheet holds no copy that can go stale. */
const WINDOW_CQW = 33;

/** Narrower than the window, so the barrel's whole silhouette is inside it — the top
 * and bottom edges rolling away are what say "drum" rather than "list". */
const RADIUS_CQW = WINDOW_CQW * 0.45;

const PERSPECTIVE_CQW = WINDOW_CQW * 2;

/** Faces around the barrel, at the SMALLEST legal wheel too: a drum of
 * `MIN_ENABLED_PRIZES` faces is a plank. The prizes repeat around it as many times as
 * it takes to get here. */
const MIN_FACES = 20;

/** How much of the window the NEAR face spans once the perspective has magnified it.
 * Under 1 on purpose, and not only for the look: Chromium clips a face that outgrows
 * the window ACROSS it, not at the window's edge, and every face behind the front one
 * loses a diagonal wedge off the same end. */
const FRONT_SPAN = 0.98;

const HORIZON_DEG = 90;

interface Drum {
  /** Whole copies of the prize list around the barrel. WHOLE is the load-bearing word:
   * it is what puts the same label back on the marker after a full turn, and what
   * keeps the face `offset` along carrying `segments[offset % count]`. */
  copies: number;
  stepDeg: number;
  windowCqw: number;
  perspectiveCqw: number;
  radiusCqw: number;
  /** A face's own height: faces are flat plates tangent to the barrel, so this is the
   * chord the step angle cuts. Any other value and the barrel gapes or overlaps. */
  faceCqw: number;
  /** What the face ON the marker measures on screen — `faceCqw` magnified, because it
   * is the part of the barrel nearest the eye. The marker frames THIS, never
   * `faceCqw`. */
  slotCqw: number;
  /** Each side of the barrel, in per cent of the window. The same magnification
   * applies across, so the barrel is BUILT narrow to end up `FRONT_SPAN` wide. */
  insetPct: number;
}

export function drumOf(count: number): Drum {
  const prizes = Math.max(1, count);
  const copies = Math.ceil(MIN_FACES / prizes);
  const stepDeg = 360 / (prizes * copies);
  const faceCqw = 2 * RADIUS_CQW * Math.tan((stepDeg * Math.PI) / 360);
  const near = PERSPECTIVE_CQW / (PERSPECTIVE_CQW - RADIUS_CQW);
  return {
    copies,
    stepDeg,
    windowCqw: WINDOW_CQW,
    perspectiveCqw: PERSPECTIVE_CQW,
    radiusCqw: RADIUS_CQW,
    faceCqw,
    slotCqw: faceCqw * near,
    insetPct: 50 * (1 - FRONT_SPAN / near),
  };
}

/** How far a face has rolled off the marker, in degrees: positive is still above it.
 * The barrel turns the NEGATIVE way, so a rising `offset` walks each face down the
 * near side and through the marker. */
function faceDeg(drum: Drum, face: number, offset: number): number {
  const turn = ((face - offset) * drum.stepDeg) % 360;
  if (turn > 180) return turn - 360;
  if (turn <= -180) return turn + 360;
  return turn;
}

/** Painting the far side would show the back of the barrel through its own front. A
 * face crosses this line all but edge-on — a sliver rather than nothing, because
 * perspective drops its near and far ends at different rates, and that sliver is what
 * `.gb-wheel::after` is opaque over. */
export function isFacing(drum: Drum, face: number, offset: number): boolean {
  return Math.abs(faceDeg(drum, face, offset)) < HORIZON_DEG;
}
