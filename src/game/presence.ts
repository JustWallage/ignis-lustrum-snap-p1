import {
  MAP_H,
  MAP_W,
  stepsThroughDoor,
  type Direction,
  type Point,
} from "@shared/map";
import type { WsEvent } from "@shared/ws-events";
import { speechOf, type Speech } from "@/game/speech";
import { strideTo, type Stride } from "@/game/stride";

interface RemotePlayer {
  id: string;
  name: string;
  x: number;
  y: number;
  facing: Direction;
  sprite: string | null;
  stride: Stride | null;
  speech: Speech | null;
}

export type Roster = ReadonlyMap<string, RemotePlayer>;

export function applyPresence(
  roster: Roster,
  event: WsEvent,
  now: number,
): Roster {
  switch (event.type) {
    case "presence_here": {
      // Sent once on accept, so nobody is mid-stride — and nothing said before you
      // arrived is replayed, because a message is stored nowhere.
      return new Map(
        event.players.map((player) => [
          player.id,
          { ...player, stride: null, speech: null },
        ]),
      );
    }
    case "presence_moved": {
      const { player } = event;
      const was = roster.get(player.id);
      const next = new Map(roster);
      next.set(player.id, {
        ...player,
        stride: was === undefined ? null : strideTo(was, player, now),
        speech: was?.speech ?? null,
      });
      return next;
    }
    case "presence_said": {
      // Only over a sprite already on screen: a message from somebody this client was
      // never told about has nowhere to float.
      const was = roster.get(event.id);
      if (was === undefined) return roster;
      const next = new Map(roster);
      next.set(event.id, { ...was, speech: speechOf(event.text, now) });
      return next;
    }
    case "presence_left": {
      if (!roster.has(event.id)) return roster;
      const next = new Map(roster);
      next.delete(event.id);
      return next;
    }
    default:
      return roster;
  }
}

export interface RemoteStep {
  from: Point;
  to: Point;
  door: boolean;
}

function stepInto(from: Point, to: Point): Point {
  return {
    x: from.x + Math.sign(to.x - from.x),
    y: from.y + Math.sign(to.y - from.y),
  };
}

/**
 * Null for most frames. Three kinds are deliberately SILENT: the roster frame (nobody
 * moved), a first sighting (no tile to have come from), and above all the keep-alive
 * repeat, which would give every idle friend a phantom footstep every 20s. Asked BEFORE
 * `applyPresence` moves the roster on, because the tile somebody came from is the only
 * thing that can answer it.
 */
export function remoteStep(roster: Roster, event: WsEvent): RemoteStep | null {
  if (event.type !== "presence_moved") return null;
  const { player } = event;
  const was = roster.get(player.id);
  if (was === undefined) return null;
  if (was.x === player.x && was.y === player.y) return null;
  const from = { x: was.x, y: was.y };
  const to = { x: player.x, y: player.y };
  return { from, to, door: stepsThroughDoor(from, stepInto(from, to)) };
}

const FAR_GAIN = 0.25;

const MAX_DISTANCE = Math.hypot(MAP_W - 1, MAP_H - 1);

/** Distance IS the volume, because fourteen friends walking at once is otherwise a wall
 * of noise. Clamped, so an off-map coordinate cannot invert the envelope. */
export function remoteGain(listener: Point, source: Point): number {
  const away = Math.min(
    Math.hypot(source.x - listener.x, source.y - listener.y) / MAX_DISTANCE,
    1,
  );
  return 1 - away * (1 - FAR_GAIN);
}

const LABEL_MAX = 6;

export function nameLabel(name: string): string {
  return name.slice(0, LABEL_MAX).toUpperCase();
}

export function lcdLabel(names: readonly string[]): string {
  if (names.length === 0) return "Overworld";
  return `Overworld — with ${names.join(", ")}`;
}
