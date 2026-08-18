import { describe, expect, it } from "vitest";
import {
  ARTIST,
  isWalkable,
  isWalkableTile,
  JUKEBOX,
  JURY,
  MAP_H,
  MAP_ROWS,
  MAP_W,
  NEIGHBOUR,
  type Point,
  SHELF,
  SPAWN,
  stepsThroughDoor,
  stepTarget,
  tileAt,
  TROPHY,
  VOTING,
} from "./map";

const DOOR: Point = { x: 2, y: 3 };
const OUTSIDE_DOOR: Point = { x: 2, y: 4 };
const INSIDE_DOOR: Point = { x: 2, y: 2 };

const INTERIOR: Point[] = [
  { x: 1, y: 1 },
  { x: 2, y: 1 },
  { x: 3, y: 1 },
  { x: 1, y: 2 },
  { x: 2, y: 2 },
  { x: 3, y: 2 },
];

const FIXTURES: Point[] = [SHELF, TROPHY];

const PEOPLE: Point[] = [JURY, VOTING, ARTIST, NEIGHBOUR];

const SHORE: Point[] = [
  { x: 6, y: 5 },
  { x: 6, y: 6 },
];

const NEIGHBOURS: Point[] = [
  { x: 0, y: -1 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
  { x: 1, y: 0 },
];

function around(p: Point): Point[] {
  return NEIGHBOURS.map((d) => ({ x: p.x + d.x, y: p.y + d.y }));
}

function isInterior(p: Point): boolean {
  return INTERIOR.some((t) => t.x === p.x && t.y === p.y);
}

describe("the map", () => {
  it("fills the Game Boy screen exactly", () => {
    expect(MAP_ROWS).toHaveLength(MAP_H);
    for (const row of MAP_ROWS) {
      expect(row).toHaveLength(MAP_W);
    }
  });

  it("spawns the player on a walkable tile with room to move", () => {
    expect(isWalkable(SPAWN.x, SPAWN.y)).toBe(true);
    expect(isWalkable(SPAWN.x + 1, SPAWN.y)).toBe(true);
  });

  it("is fenced in by solid forest, inside the map and outside it", () => {
    expect(isWalkable(0, MAP_H - 1)).toBe(false);
    expect(isWalkable(MAP_W - 1, 4)).toBe(false);
    expect(isWalkable(-1, 5)).toBe(false);
    expect(isWalkable(4, MAP_H)).toBe(false);
    expect(tileAt(-1, 5)).toBe("T");
  });

  it("keeps the tiles people stand on solid", () => {
    for (const person of PEOPLE) {
      expect(isWalkable(person.x, person.y), `at ${person.x},${person.y}`).toBe(
        false,
      );
      expect(tileAt(person.x, person.y)).toBe(".");
    }
    expect(new Set(PEOPLE.map((p) => `${p.x},${p.y}`)).size).toBe(
      PEOPLE.length,
    );
    for (const fixture of FIXTURES) {
      expect(PEOPLE, `fixture ${fixture.x},${fixture.y}`).not.toContainEqual(
        fixture,
      );
    }
  });

  it("stands the avatar artist somewhere a player can walk up to", () => {
    expect(ARTIST).toEqual({ x: 8, y: 7 });
    expect(tileAt(ARTIST.x + 1, ARTIST.y)).toBe("T");
    const from = { x: ARTIST.x - 1, y: ARTIST.y };
    expect(isWalkable(from.x, from.y)).toBe(true);
    expect(stepTarget(from, ARTIST)).toBeNull();
    for (const neighbour of around(ARTIST)) {
      expect(
        stepTarget(neighbour, ARTIST),
        `from ${neighbour.x},${neighbour.y}`,
      ).toBeNull();
    }
    expect(FIXTURES).not.toContainEqual(ARTIST);
    expect(SHORE).not.toContainEqual(ARTIST);
    expect(ARTIST.y).not.toBe(SPAWN.y);
  });

  it("gives the tile the artist left back to the town", () => {
    expect(tileAt(7, 7)).toBe(".");
    expect(isWalkable(7, 7)).toBe(true);
    expect(stepTarget({ x: 6, y: 7 }, { x: 7, y: 7 })).toEqual({ x: 7, y: 7 });
  });

  it("stands the neighbour at the foot of the path", () => {
    expect(isWalkable(NEIGHBOUR.x, NEIGHBOUR.y)).toBe(false);
    for (const neighbour of around(NEIGHBOUR)) {
      expect(
        stepTarget(neighbour, NEIGHBOUR),
        `from ${neighbour.x},${neighbour.y}`,
      ).toBeNull();
    }
    expect(isWalkable(NEIGHBOUR.x, NEIGHBOUR.y - 1)).toBe(true);
    expect(tileAt(NEIGHBOUR.x, NEIGHBOUR.y - 1)).toBe("P");
  });

  it("stands the trophy indoors, in the room's other corner", () => {
    expect(TROPHY).toEqual({ x: 1, y: 1 });
    expect(isInterior(TROPHY)).toBe(true);
    expect(TROPHY).not.toEqual(SHELF);
    expect(SHELF.x - TROPHY.x).not.toBe(0);
    expect(tileAt(TROPHY.x, TROPHY.y)).toBe("Y");
    expect(isWalkableTile("Y")).toBe(false);
    expect(isWalkable(TROPHY.x, TROPHY.y)).toBe(false);
    for (const neighbour of around(TROPHY)) {
      expect(
        stepTarget(neighbour, TROPHY),
        `from ${neighbour.x},${neighbour.y}`,
      ).toBeNull();
    }
    for (const from of [
      { x: TROPHY.x + 1, y: TROPHY.y },
      { x: TROPHY.x, y: TROPHY.y + 1 },
    ]) {
      expect(isWalkable(from.x, from.y), `from ${from.x},${from.y}`).toBe(true);
      expect(isInterior(from), `from ${from.x},${from.y}`).toBe(true);
    }
    expect(PEOPLE).not.toContainEqual(TROPHY);
    const plinths = MAP_ROWS.join("")
      .split("")
      .filter((tile) => tile === "Y");
    expect(plinths).toHaveLength(1);
  });

  // NOT in FIXTURES: that list means the archive house's INDOOR fixtures, and the test
  // below it filters reachable tiles by `isInterior`, which an outdoor cabinet fails.
  it("stands the jukebox in the top-right corner, as terrain rather than a person", () => {
    expect(JUKEBOX).toEqual({ x: 8, y: 1 });
    expect(tileAt(JUKEBOX.x, JUKEBOX.y)).toBe("J");
    expect(isWalkableTile("J")).toBe(false);
    expect(isWalkable(JUKEBOX.x, JUKEBOX.y)).toBe(false);
    for (const neighbour of around(JUKEBOX)) {
      expect(
        stepTarget(neighbour, JUKEBOX),
        `from ${neighbour.x},${neighbour.y}`,
      ).toBeNull();
    }
    for (const from of [
      { x: JUKEBOX.x - 1, y: JUKEBOX.y },
      { x: JUKEBOX.x, y: JUKEBOX.y + 1 },
    ]) {
      expect(isWalkable(from.x, from.y), `from ${from.x},${from.y}`).toBe(true);
      expect(isInterior(from), `from ${from.x},${from.y}`).toBe(false);
    }
    expect(tileAt(JUKEBOX.x + 1, JUKEBOX.y)).toBe("T");
    expect(PEOPLE).not.toContainEqual(JUKEBOX);
    expect(FIXTURES).not.toContainEqual(JUKEBOX);
    const cabinets = MAP_ROWS.join("")
      .split("")
      .filter((tile) => tile === "J");
    expect(cabinets).toHaveLength(1);
  });

  it("stands the voting NPC off the path, on plain grass", () => {
    expect(VOTING).toEqual({ x: 1, y: 6 });
    expect(tileAt(VOTING.x, VOTING.y)).toBe(".");
    expect(isWalkable(VOTING.x, VOTING.y)).toBe(false);
    for (const neighbour of around(VOTING)) {
      expect(
        stepTarget(neighbour, VOTING),
        `from ${neighbour.x},${neighbour.y}`,
      ).toBeNull();
    }
    expect(FIXTURES).not.toContainEqual(VOTING);
    expect(SHORE).not.toContainEqual(VOTING);
    expect(VOTING.y).not.toBe(SPAWN.y);
  });

  it("gives back both tiles the two of them left", () => {
    for (const freed of [
      { x: 2, y: 5 },
      { x: 1, y: 4 },
    ]) {
      const where = `tile ${freed.x},${freed.y}`;
      expect(tileAt(freed.x, freed.y), where).toBe(".");
      expect(isWalkable(freed.x, freed.y), where).toBe(true);
      expect(stepTarget({ x: freed.x + 1, y: freed.y }, freed), where).toEqual(
        freed,
      );
    }
    for (const x of [1, 2, 3, 4]) {
      expect(isWalkable(x, SPAWN.y), `walkway at ${String(x)},4`).toBe(true);
    }
  });

  it("lays sand along the pond, and only there", () => {
    for (const tile of SHORE) {
      const where = `tile ${tile.x},${tile.y}`;
      expect(tileAt(tile.x, tile.y), where).toBe("s");
      expect(isWalkable(tile.x, tile.y), where).toBe(true);
      expect(tileAt(tile.x + 1, tile.y), where).toBe("W");
      expect(stepTarget({ x: tile.x - 1, y: tile.y }, tile), where).toEqual(
        tile,
      );
      expect(tile.y, where).not.toBe(SPAWN.y);
      expect(FIXTURES, where).not.toContainEqual(tile);
      expect(PEOPLE, where).not.toContainEqual(tile);
    }
    const sand = MAP_ROWS.join("")
      .split("")
      .filter((tile) => tile === "s");
    expect(sand).toHaveLength(SHORE.length);
  });

  it("agrees with itself about what is ground and what is scenery", () => {
    for (let y = 0; y < MAP_H; y += 1) {
      for (let x = 0; x < MAP_W; x += 1) {
        const tile = tileAt(x, y);
        if (isWalkable(x, y)) expect(isWalkableTile(tile)).toBe(true);
      }
    }
    expect(isWalkableTile("s")).toBe(true);
    expect(isWalkableTile("W")).toBe(false);
    expect(isWalkableTile("D")).toBe(false);
  });

  it("caps the house with a roof and walls it in on both sides", () => {
    for (let x = 0; x <= 4; x += 1) {
      expect(tileAt(x, 0), `roof at ${x},0`).toBe("R");
      expect(isWalkable(x, 0), `roof at ${x},0`).toBe(false);
    }
    for (const x of [0, 4]) {
      for (const y of [1, 2]) {
        expect(tileAt(x, y), `side wall at ${x},${y}`).toBe("S");
        expect(isWalkable(x, y), `side wall at ${x},${y}`).toBe(false);
      }
    }
    expect(MAP_ROWS[3].slice(0, 5)).toBe("HHDHH");
  });
});

describe("the archive house", () => {
  it("is a 3x2 room with a fixture in each of its top corners", () => {
    for (const tile of INTERIOR) {
      const fixture = FIXTURES.some((f) => f.x === tile.x && f.y === tile.y);
      expect(isWalkable(tile.x, tile.y), `tile ${tile.x},${tile.y}`).toBe(
        !fixture,
      );
      if (!fixture) {
        expect(tileAt(tile.x, tile.y), `tile ${tile.x},${tile.y}`).toBe("f");
      }
    }
    expect(INTERIOR.filter((t) => isWalkable(t.x, t.y))).toHaveLength(4);
  });

  it("puts both fixtures within reach of the tile the door lands you on", () => {
    const from = INSIDE_DOOR;
    expect(isWalkable(from.x, from.y)).toBe(true);
    for (const fixture of FIXTURES) {
      const stand = around(fixture).filter(
        (t) => isInterior(t) && isWalkable(t.x, t.y),
      );
      expect(stand.length, `${fixture.x},${fixture.y}`).toBeGreaterThan(0);
      const reachable = stand.some(
        (t) =>
          (t.x === from.x && t.y === from.y) ||
          around(from).some(
            (step) =>
              step.x === t.x &&
              step.y === t.y &&
              stepTarget(from, step)?.x === t.x &&
              stepTarget(from, step)?.y === t.y,
          ),
      );
      expect(reachable, `${fixture.x},${fixture.y}`).toBe(true);
    }
  });

  it("puts the shelf where the archive overlay says it is", () => {
    expect(tileAt(SHELF.x, SHELF.y)).toBe("A");
    expect(isWalkable(SHELF.x, SHELF.y)).toBe(false);
    for (const from of [
      { x: SHELF.x - 1, y: SHELF.y },
      { x: SHELF.x, y: SHELF.y + 1 },
    ]) {
      expect(isWalkable(from.x, from.y), `from ${from.x},${from.y}`).toBe(true);
      expect(stepTarget(from, SHELF), `from ${from.x},${from.y}`).toBeNull();
    }
    expect(PEOPLE).not.toContainEqual(SHELF);
  });

  it("cannot be entered except through the door", () => {
    const entries: string[] = [];
    for (let y = 0; y < MAP_H; y += 1) {
      for (let x = 0; x < MAP_W; x += 1) {
        if (isInterior({ x, y }) || !isWalkable(x, y)) continue;
        for (const neighbour of around({ x, y })) {
          const landed = stepTarget({ x, y }, neighbour);
          if (landed !== null && isInterior(landed)) {
            entries.push(`${x},${y} -> ${landed.x},${landed.y}`);
          }
        }
      }
    }
    expect(entries).toEqual(["2,4 -> 2,2"]);
  });

  it("cannot be left except through the door", () => {
    const exits: string[] = [];
    for (const tile of INTERIOR) {
      if (!isWalkable(tile.x, tile.y)) continue;
      for (const neighbour of around(tile)) {
        if (isInterior(neighbour)) continue;
        const landed = stepTarget(tile, neighbour);
        if (landed !== null) {
          exits.push(`${tile.x},${tile.y} -> ${landed.x},${landed.y}`);
        }
      }
    }
    expect(exits).toEqual(["2,2 -> 2,4"]);
  });
});

describe("the door", () => {
  it("is solid, so the player can never stand on it", () => {
    expect(tileAt(DOOR.x, DOOR.y)).toBe("D");
    expect(isWalkable(DOOR.x, DOOR.y)).toBe(false);
    for (const from of [OUTSIDE_DOOR, INSIDE_DOOR]) {
      expect(stepTarget(from, DOOR)).not.toEqual(DOOR);
    }
  });

  it("carries the player two tiles, symmetrically", () => {
    expect(stepTarget(OUTSIDE_DOOR, DOOR)).toEqual(INSIDE_DOOR);
    expect(stepTarget(INSIDE_DOOR, DOOR)).toEqual(OUTSIDE_DOOR);
  });

  it("says when a step goes through it, so the renderer can creak", () => {
    for (const from of [OUTSIDE_DOOR, INSIDE_DOOR]) {
      expect(stepsThroughDoor(from, DOOR), `from ${from.x},${from.y}`).toBe(
        true,
      );
    }
    expect(stepsThroughDoor({ x: 1, y: 3 }, DOOR)).toBe(false);
    expect(stepsThroughDoor(SPAWN, { x: SPAWN.x + 1, y: SPAWN.y })).toBe(false);
    expect(stepsThroughDoor(INSIDE_DOOR, { x: 1, y: 2 })).toBe(false);
  });

  it("is a plain bump from anywhere that is not head-on", () => {
    for (const from of [
      { x: 1, y: 3 },
      { x: 3, y: 3 },
      { x: 2, y: 5 },
    ]) {
      expect(stepTarget(from, DOOR), `from ${from.x},${from.y}`).toBeNull();
    }
  });
});

describe("stepTarget", () => {
  it("hands back the tile walked into when it is walkable", () => {
    const next = { x: SPAWN.x + 1, y: SPAWN.y };
    expect(stepTarget(SPAWN, next)).toEqual(next);
  });

  it("bumps on solid terrain and on the people standing on it", () => {
    expect(stepTarget({ x: 1, y: 7 }, { x: 0, y: 7 })).toBeNull();
    expect(stepTarget({ x: 6, y: 4 }, JURY)).toBeNull();
    expect(stepTarget({ x: 2, y: 6 }, VOTING)).toBeNull();
    expect(stepTarget({ x: 7, y: 7 }, ARTIST)).toBeNull();
    expect(stepTarget({ x: 4, y: 7 }, NEIGHBOUR)).toBeNull();
    expect(stepTarget({ x: 1, y: 2 }, TROPHY)).toBeNull();
  });

  it("leaves the voting NPC reachable to talk to", () => {
    expect(isWalkable(VOTING.x + 1, VOTING.y)).toBe(true);
  });
});
