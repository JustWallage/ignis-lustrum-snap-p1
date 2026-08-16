/**
 * The photograph's own zoom, as pure geometry. The picture is drawn
 * `translate(x, y) scale(scale)` about the frame's CENTRE, so every offset here is
 * measured from that centre in CSS pixels, and `FIT` is the picture as the layout
 * placed it.
 */

export interface Zoom {
  scale: number;
  x: number;
  y: number;
}

interface Frame {
  width: number;
  height: number;
}

interface Focal {
  x: number;
  y: number;
}

export const FIT: Zoom = { scale: 1, x: 0, y: 0 };

const MAX_SCALE = 4;

const TAP_SCALE = 2;

function clamp(value: number, limit: number): number {
  return Math.min(Math.max(value, -limit), limit);
}

/** Clamped against the FRAME, not the letterboxed picture inside it: `object-contain`
 * leaves bars whose size only the decoded image knows, and a bar dragged into view is a
 * smaller lie than a picture dragged off the screen. */
function held(zoom: Zoom, frame: Frame): Zoom {
  const room = (zoom.scale - 1) / 2;
  return {
    scale: zoom.scale,
    x: clamp(zoom.x, room * frame.width),
    y: clamp(zoom.y, room * frame.height),
  };
}

/** Scales about a focal point, so the pinched or tapped detail stays under the finger.
 * Anything at or below fit answers FIT rather than going through `held`: under 1 the
 * limit `held` computes is NEGATIVE and `clamp` pins the offset TO that limit, so a
 * pinch out past fit would shrink the picture and shove it off centre at once. */
export function zoomAbout(
  zoom: Zoom,
  scale: number,
  focal: Focal,
  frame: Frame,
): Zoom {
  const next = Math.min(scale, MAX_SCALE);
  if (next <= 1) return FIT;
  const ratio = next / zoom.scale;
  return held(
    {
      scale: next,
      x: focal.x - (focal.x - zoom.x) * ratio,
      y: focal.y - (focal.y - zoom.y) * ratio,
    },
    frame,
  );
}

export function panBy(zoom: Zoom, dx: number, dy: number, frame: Frame): Zoom {
  if (zoom.scale <= 1) return FIT;
  return held({ scale: zoom.scale, x: zoom.x + dx, y: zoom.y + dy }, frame);
}

export function toggleAt(zoom: Zoom, focal: Focal, frame: Frame): Zoom {
  if (zoom.scale > 1) return FIT;
  return zoomAbout(zoom, TAP_SCALE, focal, frame);
}
