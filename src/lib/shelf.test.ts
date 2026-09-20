import { describe, expect, it } from "vitest";
import { SHELF, shelfOrder } from "./shelf";

const LED = [
  "Haal Een Pilsje Voor Mij",
  "Colombia Mia",
  "Colombia",
  "Vorig Lustrum",
];

function named(id: string) {
  return { id, artist: null, title: id };
}

describe("shelfOrder", () => {
  it("keeps a filed record ahead of an unfiled one whichever side it is on", () => {
    expect(shelfOrder(named("Colombia"), named("Aaa"))).toBeLessThan(0);
    expect(shelfOrder(named("Aaa"), named("Colombia"))).toBeGreaterThan(0);
  });

  it("files the leads in the order they are listed, not alphabetically", () => {
    expect(
      shelfOrder(named("Haal Een Pilsje Voor Mij"), named("Colombia")),
    ).toBeLessThan(0);
  });

  it("falls back to the id for two records nobody filed", () => {
    expect(shelfOrder(named("Aaa"), named("Bbb"))).toBeLessThan(0);
    expect(shelfOrder(named("Bbb"), named("Aaa"))).toBeGreaterThan(0);
  });
});

describe("SHELF", () => {
  it("faces the lustrum records first, in the order they are filed", () => {
    expect(SHELF.slice(0, LED.length).map((record) => record.id)).toEqual(LED);
  });

  it("sorts everything behind them by id", () => {
    const rest = SHELF.slice(LED.length).map((record) => record.id);
    expect(rest).toEqual([...rest].sort((a, b) => a.localeCompare(b)));
    expect(rest.length).toBeGreaterThan(0);
  });
});
