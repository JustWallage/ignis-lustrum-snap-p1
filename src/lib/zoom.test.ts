import { describe, expect, it } from "vitest";
import { FIT, panBy, toggleAt, zoomAbout } from "./zoom";

const FRAME = { width: 200, height: 100 };

const CENTRE = { x: 0, y: 0 };

describe("zoomAbout", () => {
  it("holds the pinched detail under the fingers", () => {
    const zoomed = zoomAbout(FIT, 2, { x: 30, y: -10 }, FRAME);
    expect(zoomed).toEqual({ scale: 2, x: -30, y: 10 });
  });

  it("carries on from where the last pinch left off", () => {
    const once = zoomAbout(FIT, 2, { x: 20, y: 0 }, FRAME);
    const twice = zoomAbout(once, 4, { x: 20, y: 0 }, FRAME);
    expect(twice.scale).toBe(4);
    expect(twice.x).toBe(-60);
  });

  it("stops at the ceiling", () => {
    expect(zoomAbout(FIT, 99, CENTRE, FRAME).scale).toBe(4);
  });

  it("answers fit exactly at and below one, so a pinch out cannot leave it askew", () => {
    const zoomed = zoomAbout(FIT, 3, { x: 40, y: 20 }, FRAME);
    expect(zoomed.x).not.toBe(0);
    expect(zoomAbout(zoomed, 1, { x: 40, y: 20 }, FRAME)).toEqual(FIT);
    expect(zoomAbout(zoomed, 0.2, { x: 40, y: 20 }, FRAME)).toEqual(FIT);
  });

  it("keeps the picture over the frame it is zoomed in", () => {
    const zoomed = zoomAbout(FIT, 2, { x: 500, y: 500 }, FRAME);
    expect(zoomed).toEqual({ scale: 2, x: -100, y: -50 });
  });
});

describe("panBy", () => {
  it("drags a zoomed picture and stops at its own edges", () => {
    const zoomed = zoomAbout(FIT, 2, CENTRE, FRAME);
    expect(panBy(zoomed, 20, -10, FRAME)).toEqual({ scale: 2, x: 20, y: -10 });
    expect(panBy(zoomed, 400, 400, FRAME)).toEqual({ scale: 2, x: 100, y: 50 });
  });

  it("cannot drag a picture that is at fit", () => {
    expect(panBy(FIT, 40, 40, FRAME)).toEqual(FIT);
  });
});

describe("toggleAt", () => {
  it("opens on the detail that was tapped", () => {
    expect(toggleAt(FIT, { x: 10, y: 5 }, FRAME)).toEqual({
      scale: 2,
      x: -10,
      y: -5,
    });
  });

  it("returns to fit from anywhere it was left", () => {
    const dragged = panBy(zoomAbout(FIT, 3, CENTRE, FRAME), 50, 20, FRAME);
    expect(toggleAt(dragged, { x: 10, y: 5 }, FRAME)).toEqual(FIT);
  });
});
