import type { GameState } from "../../shared/state";
import { wsEventSchema, type WsEvent } from "../../shared/ws-events";
import type { Bindings } from "../env";

/** Best-effort: a mutation must never fail because talking to the DO did. */
async function post(env: Bindings, path: string, body: string): Promise<void> {
  try {
    const stub = env.REALTIME_DO.get(env.REALTIME_DO.idFromName("global"));
    await stub.fetch(`https://do${path}`, { method: "POST", body });
  } catch {
    // Best-effort; nothing to do here.
  }
}

function stateEvent(state: GameState): WsEvent {
  return { type: "state_changed", state };
}

export async function broadcast(env: Bindings, event: WsEvent): Promise<void> {
  await post(env, "/broadcast", JSON.stringify(wsEventSchema.parse(event)));
}

export async function rememberGameState(
  env: Bindings,
  state: GameState,
): Promise<void> {
  await post(env, "/state", JSON.stringify(stateEvent(state)));
}

export async function pushSprite(
  env: Bindings,
  userId: number,
  sprite: string | null,
): Promise<void> {
  try {
    const stub = env.REALTIME_DO.get(env.REALTIME_DO.idFromName("global"));
    await stub.refreshSprite(userId, sprite);
  } catch {
    // Best-effort; nothing to do here.
  }
  // The presence frame above is not content news — `presence_*` is excluded from
  // `REVALIDATE_EVENT_TYPES`, and it skips the socket that generated — so without
  // this the archive's list of drawn avatars goes stale on every screen, the
  // generating player's included.
  await broadcast(env, { type: "avatar_changed" });
}

export async function pushGameState(
  env: Bindings,
  state: GameState,
): Promise<void> {
  await Promise.all([
    rememberGameState(env, state),
    broadcast(env, stateEvent(state)),
  ]);
}
