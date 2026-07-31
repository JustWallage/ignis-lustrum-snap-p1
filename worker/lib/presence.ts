import { z } from "zod";
import { directionSchema } from "../../shared/map";
import {
  isPresenceStale,
  presencePlayerSchema,
  type PresencePlayer,
} from "../../shared/presence";
import type { SessionUser } from "../env";

/** Built FROM SCRATCH rather than forwarded: the client's own request never reaches
 * the DO, so `?name=someone-else` decorates a request thrown away here. No user is a
 * spectator — they see everyone and are shown to nobody. */
export function presenceUpgrade(
  user: SessionUser | null,
  sprite: string | null,
): Request {
  const url = new URL("https://realtime.invalid/ws");
  if (user !== null) {
    url.searchParams.set("name", user.name);
    url.searchParams.set("uid", String(user.id));
    if (sprite !== null) url.searchParams.set("sprite", sprite);
  }
  return new Request(url, { headers: { Upgrade: "websocket" } });
}

export function presenceName(url: URL): string | null {
  return url.searchParams.get("name");
}

export function presenceSprite(url: URL): string | null {
  return url.searchParams.get("sprite");
}

/** Parsed rather than coerced: `Number(null)` is 0, and a spectator reading back as
 * user zero makes a live event wait for nobody. */
export function presenceUserId(url: URL): number | null {
  const parsed = z.coerce
    .number()
    .int()
    .positive()
    .safeParse(url.searchParams.get("uid") ?? undefined);
  return parsed.success ? parsed.data : null;
}

const socketStateSchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  /** NEVER on the roster: only asked about in the other direction, by something that
   * already knows an id (`isPresent`). */
  userId: z.int().nullable().default(null),
  sprite: z.string().nullable().default(null),
  at: z
    .object({
      x: presencePlayerSchema.shape.x,
      y: presencePlayerSchema.shape.y,
      facing: directionSchema,
    })
    .nullable(),
  seenAt: z.number(),
  /** Kept apart from `seenAt` so speaking does not swallow the step after it.
   * Defaulted, so an attachment written before the field reads back as one of ours. */
  saidAt: z.number().nullable().default(null),
});

export type SocketState = z.infer<typeof socketStateSchema>;

export type Attached = Pick<
  WebSocket,
  "serializeAttachment" | "deserializeAttachment"
>;

export function writeSocketState(socket: Attached, state: SocketState): void {
  socket.serializeAttachment(state);
}

export function readSocketState(socket: Attached): SocketState | null {
  const parsed = socketStateSchema.safeParse(socket.deserializeAttachment());
  return parsed.success ? parsed.data : null;
}

export function playerOf(
  state: SocketState,
  now: number,
): PresencePlayer | null {
  if (state.name === null || state.at === null) return null;
  if (isPresenceStale(state.seenAt, now)) return null;
  return {
    id: state.id,
    name: state.name,
    sprite: state.sprite,
    ...state.at,
  };
}

/** Whether a USER has a screen reporting in — NOT "is a socket open": a laptop lid
 * leaves a socket the runtime believes in. Deliberately not about `at` either, because
 * somebody watching an event is not walking. */
export function isPresent(
  sockets: readonly Attached[],
  userId: number,
  now: number,
): boolean {
  for (const socket of sockets) {
    const state = readSocketState(socket);
    if (state?.userId !== userId) continue;
    if (!isPresenceStale(state.seenAt, now)) return true;
  }
  return false;
}

export function roster(
  sockets: readonly Attached[],
  now: number,
): PresencePlayer[] {
  const players: PresencePlayer[] = [];
  for (const socket of sockets) {
    const state = readSocketState(socket);
    if (state === null) continue;
    const player = playerOf(state, now);
    if (player !== null) players.push(player);
  }
  return players;
}
