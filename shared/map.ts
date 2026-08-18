// Legend: T tree · W water · R roof · S side wall · H front wall · D door
//         A archive shelf · Y trophy plinth · J jukebox (all solid)
//         . grass · t tall grass · P path · F flowers · s shore sand
//         f floor (all walkable)
//
// `R`/`S`/`H` are different art on purpose: only the front face carries windows.

import { z } from "zod";

export interface Point {
  x: number;
  y: number;
}

export const directionSchema = z.enum(["up", "down", "left", "right"]);

export type Direction = z.infer<typeof directionSchema>;

export const MAP_ROWS = [
  "RRRRRTTTTT",
  "SYfAS.t.JT",
  "SfffS.t..T",
  "HHDHH....T",
  "T...PP...T",
  "T...PPsWWT",
  "T...PPsWWT",
  "T.FF.....T",
  "TTTTTTTTTT",
] as const;

export const MAP_W = 10;
export const MAP_H = MAP_ROWS.length;

export const SPAWN: Point = { x: 4, y: 4 };

export const JURY: Point = { x: 7, y: 4 };

export const VOTING: Point = { x: 1, y: 6 };

export const ARTIST: Point = { x: 8, y: 7 };

export const NEIGHBOUR: Point = { x: 5, y: 7 };

export const SHELF: Point = { x: 3, y: 1 };

export const TROPHY: Point = { x: 1, y: 1 };

export const JUKEBOX: Point = { x: 8, y: 1 };

/** NPCs only. The cabinet is terrain, because a person is somebody you bump into and a
 * jukebox is furniture: its own solid glyph in `MAP_ROWS` rather than grass made
 * unwalkable. */
const OCCUPIED: readonly Point[] = [JURY, VOTING, ARTIST, NEIGHBOUR];

const DOOR: Point = { x: 2, y: 3 };

/** Listed from BOTH sides so the transit cannot become one-way. Stepping in from
 * either lands on the other — two tiles in one move. */
const DOOR_TRANSIT: readonly (readonly [Point, Point])[] = [
  [
    { x: 2, y: 4 },
    { x: 2, y: 2 },
  ],
  [
    { x: 2, y: 2 },
    { x: 2, y: 4 },
  ],
];

const WALKABLE_TILES = [".", "t", "P", "F", "s", "f"] as const;

/** A union because the footstep table in `src/lib/sound.ts` is keyed by it: a tile
 * cannot become walkable without somebody deciding what it sounds like. */
export type WalkableTile = (typeof WALKABLE_TILES)[number];

const WALKABLE = new Set<string>(WALKABLE_TILES);

export function tileAt(x: number, y: number): string {
  if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) return "T";
  return MAP_ROWS[y]?.charAt(x) ?? "T";
}

export function isWalkableTile(tile: string): tile is WalkableTile {
  return WALKABLE.has(tile);
}

export function isWalkable(x: number, y: number): boolean {
  if (OCCUPIED.some((p) => p.x === x && p.y === y)) return false;
  return isWalkableTile(tileAt(x, y));
}

function doorTransit(pos: Point, next: Point): Point | undefined {
  if (next.x !== DOOR.x || next.y !== DOOR.y) return undefined;
  return DOOR_TRANSIT.find(
    ([from]) => from.x === pos.x && from.y === pos.y,
  )?.[1];
}

export function stepsThroughDoor(pos: Point, next: Point): boolean {
  return doorTransit(pos, next) !== undefined;
}

export function stepTarget(pos: Point, next: Point): Point | null {
  const through = doorTransit(pos, next);
  if (through !== undefined) return through;
  if (next.x === DOOR.x && next.y === DOOR.y) return null;
  return isWalkable(next.x, next.y) ? next : null;
}
