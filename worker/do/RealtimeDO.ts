import { DurableObject } from "cloudflare:workers";
import { prizeAwards } from "../../db/schema";
import type { PrizeSet } from "../../shared/api";
import {
  countdownEvent,
  eventStateSchema,
  firstPodiumRank,
  HOST_IDLE_MS,
  idleEvent,
  isAwaitingHost,
  isBeastOn,
  nextDeadline,
  nextPodiumStage,
  podiumAdvanceEvent,
  podiumEvent,
  revealEvent,
  spunEvent,
  wheelEvent,
  type EventDraft,
  type EventState,
} from "../../shared/events";
import {
  isPresenceTooSoon,
  isSayTooSoon,
  isTalkOver,
  isTalkTooSoon,
  presenceFrameSchema,
  TALK_FRAME_MAX_BYTES,
  type PresenceMove,
  type PresencePlayer,
} from "../../shared/presence";
import { MIN_ENABLED_PRIZES } from "../../shared/prizes";
import type { GamePhase } from "../../shared/state";
import { wsEventSchema, type WsEvent } from "../../shared/ws-events";
import type { Bindings } from "../env";
import { getDb } from "../lib/db";
import { resultsForDays } from "../lib/day-results";
import type { EventOutcome } from "../lib/event";
import {
  advanceDayStatement,
  readGameState,
  setGamePhase,
} from "../lib/game-state";
import { enabledPrizeLabels, prizeSetForDay, riggedLabel } from "../lib/wheel";
import {
  isPresent,
  playerOf,
  presenceName,
  presenceSprite,
  presenceUserId,
  readSocketState,
  roster,
  writeSocketState,
  type SocketState,
} from "../lib/presence";

const STATE_KEY = "state_changed";

const EVENT_KEY = "event_state";

function frame(event: WsEvent): string {
  return JSON.stringify(wsEventSchema.parse(event));
}

function parseJson(message: string): unknown {
  try {
    return JSON.parse(message);
  } catch {
    return null;
  }
}

function refuse(status: 403 | 409, error: string): EventOutcome {
  return { ok: false, status, error };
}

function landingIndex(count: number): number {
  const [value] = crypto.getRandomValues(new Uint32Array(1));
  return (value ?? 0) % count;
}

function tooFewPrizes(set: PrizeSet, count: number): string {
  const which = set === "bowser" ? "Bowser wheel" : "wheel";
  return `The ${which} needs at least ${String(MIN_ENABLED_PRIZES)} enabled prizes; ${String(count)} is not a wheel. Turn more on in the prize manager.`;
}

/**
 * ONE instance (`idFromName("global")`), and the ONLY writer of `game_state.phase`.
 *
 * Uses the WebSocket HIBERNATION API, so per-socket presence lives in the socket's
 * ATTACHMENT: a field on this class would be a roster that quietly emptied itself.
 */
export class RealtimeDO extends DurableObject<Bindings> {
  private transitions: Promise<unknown> = Promise.resolve();

  private alone<T>(body: () => Promise<T>): Promise<T> {
    const next = this.transitions.then(body, body);
    this.transitions = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }

  override async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade") === "websocket") {
      const pair = new WebSocketPair();
      const socket = pair[1];
      this.ctx.acceptWebSocket(socket);
      const now = Date.now();
      const upgrade = new URL(request.url);
      writeSocketState(socket, {
        id: crypto.randomUUID(),
        name: presenceName(upgrade),
        userId: presenceUserId(upgrade),
        sprite: presenceSprite(upgrade),
        at: null,
        seenAt: now,
        saidAt: null,
        talking: null,
        talkedAt: null,
      });
      const snapshot = await this.ctx.storage.get<string>(STATE_KEY);
      if (snapshot !== undefined) {
        this.send(socket, snapshot);
      }
      // Sent WHATEVER it says, normal play included (#98): withholding it unless
      // an event was running left a client that dropped its socket across the last
      // transition of an evening stuck inside a wheel the world had left.
      const event = eventStateSchema.safeParse(
        await this.ctx.storage.get(EVENT_KEY),
      );
      if (event.success) {
        this.send(socket, frame({ type: "event_changed", state: event.data }));
      }
      this.expireGhosts(now);
      // BEFORE the roster, the way `event_changed` is: `openSocket` in
      // `worker/test-helpers.ts` reads the greeting until the roster on the documented
      // promise that the roster is last, and a frame after it desynchronises every DO
      // test. A late join therefore lands INSIDE the transmission rather than hearing
      // bytes from nobody.
      const held = this.talkingNow(now);
      if (held !== null && presenceName(upgrade) !== null) {
        this.send(socket, held);
      }
      this.send(
        socket,
        frame({ type: "presence_here", players: this.roster(now) }),
      );
      return new Response(null, { status: 101, webSocket: pair[0] });
    }

    const url = new URL(request.url);
    if (url.pathname === "/broadcast" && request.method === "POST") {
      this.fanout(await request.text());
      return new Response("OK");
    }
    // Store-only on purpose: /broadcast is what wakes the sockets. Keeping the two
    // apart lets the worker warm a cold DO without re-notifying everyone.
    if (url.pathname === "/state" && request.method === "POST") {
      await this.ctx.storage.put(STATE_KEY, await request.text());
      return new Response("OK");
    }

    return new Response("Not found", { status: 404 });
  }

  async readEvent(): Promise<EventState> {
    const stored = eventStateSchema.safeParse(
      await this.ctx.storage.get(EVENT_KEY),
    );
    if (stored.success) return stored.data;
    const { day, phase } = await readGameState(getDb(this.env));
    return eventStateSchema.parse({ ...idleEvent(), phase, day });
  }

  async startEvent(hostUserId: number): Promise<EventOutcome> {
    return this.alone(async () => {
      const current = await this.readEvent();
      if (current.phase !== "submission") {
        return refuse(409, "An event is already running");
      }
      // Refused HERE, on the set the DAY will use, because three phases later
      // `wheelDraft` runs on an alarm with nobody left to answer and falls silently
      // back to normal play.
      const db = getDb(this.env);
      const set = await prizeSetForDay(db, current.day);
      const segments = await enabledPrizeLabels(db, set);
      if (segments.length < MIN_ENABLED_PRIZES) {
        return refuse(409, tooFewPrizes(set, segments.length));
      }
      return {
        ok: true,
        event: await this.publish(countdownEvent(Date.now(), hostUserId)),
      };
    });
  }

  async abortEvent(): Promise<EventOutcome> {
    return this.alone(async () => {
      const current = await this.readEvent();
      if (current.phase === "submission") {
        return refuse(409, "No event is running");
      }
      return { ok: true, event: await this.publish(idleEvent()) };
    });
  }

  /** ONE rule for a rigged prize that was retired, deleted, reordered, renamed after
   * the draft, or left in the set a flipped Bowser mark no longer uses: if it is not
   * among tonight's segments it is not an instruction, and the day rolls. */
  private async landing(event: EventState): Promise<number> {
    const rigged = await riggedLabel(getDb(this.env), event.day);
    const found = rigged === null ? -1 : event.segments.indexOf(rigged);
    return found === -1 ? landingIndex(event.segments.length) : found;
  }

  async spinWheel(userId: number): Promise<EventOutcome> {
    return this.alone(async () => {
      const event = await this.readEvent();
      if (event.phase !== "wheel") {
        return refuse(409, "The wheel is not up");
      }
      if (isBeastOn(event, Date.now())) {
        return refuse(409, "The beast has not finished with the winner");
      }
      if (event.winnerUserId !== userId && event.hostUserId !== userId) {
        return refuse(
          403,
          "Only the day's winner or tonight's host spins the wheel",
        );
      }
      if (event.prizeIndex !== null) {
        return refuse(409, "The wheel has already been spun");
      }
      const index = await this.landing(event);
      return {
        ok: true,
        event: await this.publish(spunEvent(event, Date.now(), index)),
      };
    });
  }

  async advancePodium(userId: number): Promise<EventOutcome> {
    return this.alone(async () => {
      const event = await this.readEvent();
      if (event.phase !== "reveal") {
        return refuse(409, "No reveal is running");
      }
      if (event.hostUserId !== userId) {
        return refuse(403, "Only tonight's host moves the podium on");
      }
      if (event.podiumRank === null) {
        return refuse(409, "The podium is not up yet");
      }
      if (event.podiumNextAt !== null) {
        return refuse(409, "The next one is already on its way");
      }
      return {
        ok: true,
        event: await this.publish(podiumAdvanceEvent(event, Date.now())),
      };
    });
  }

  private hostStillThere(event: EventState, now: number): boolean {
    const host = event.hostUserId;
    if (host === null || !isAwaitingHost(event)) return false;
    return isPresent(this.ctx.getWebSockets(), host, now);
  }

  /**
   * Guards on the DEADLINE as well as the phase, because the reveal's stages all share
   * the `reveal` phase and a duplicate firing would skip a page. An early delivery
   * re-arms rather than dropping the transition.
   */
  override async alarm(): Promise<void> {
    await this.alone(async () => {
      const event = await this.readEvent();
      const deadline = nextDeadline(event);
      if (deadline === null) return;
      const now = Date.now();
      if (deadline > now) {
        await this.ctx.storage.setAlarm(deadline);
        return;
      }
      if (this.hostStillThere(event, now)) {
        await this.ctx.storage.setAlarm(now + HOST_IDLE_MS);
        return;
      }
      if (event.phase === "countdown") {
        await this.publish(await this.revealDraft(event));
        return;
      }
      if (event.phase === "reveal") {
        await this.publish(await this.revealStep(event));
        return;
      }
      if (event.phase === "wheel") {
        await this.land(event);
      }
    });
  }

  /** The same `resultsForDays` the endpoint and the archive serve, so the wheel cannot
   * spin for somebody the scoreboard disagrees with. */
  private async revealDraft(event: EventState): Promise<EventDraft> {
    const { day } = event;
    const ranked =
      (await resultsForDays(getDb(this.env), [day])).get(day) ?? [];
    const winner = ranked[0];
    return revealEvent(
      Date.now(),
      {
        photoIds: [...ranked].reverse().map((result) => result.photoId),
        winnerPhotoId: winner?.photoId ?? null,
        winnerUserId: winner?.uploader.id ?? null,
      },
      event.hostUserId,
    );
  }

  private async revealStep(event: EventState): Promise<EventDraft> {
    const now = Date.now();
    const stage = event.podiumRank;
    if (stage === null) {
      const first = firstPodiumRank(event.revealPhotoIds.length);
      return first === null
        ? this.wheelDraft(event)
        : podiumEvent(event, first, now);
    }
    const next = nextPodiumStage(stage);
    return next === null
      ? this.wheelDraft(event)
      : podiumEvent(event, next, now);
  }

  private async wheelDraft(event: EventState): Promise<EventDraft> {
    if (event.winnerUserId === null) return idleEvent();
    const db = getDb(this.env);
    const set = await prizeSetForDay(db, event.day);
    const segments = await enabledPrizeLabels(db, set);
    if (segments.length < MIN_ENABLED_PRIZES) return idleEvent();
    return wheelEvent(event, segments, Date.now(), set === "bowser");
  }

  private async land(event: EventState): Promise<void> {
    const index = event.prizeIndex;
    const winner = event.winnerUserId;
    const label = index === null ? undefined : event.segments[index];
    if (winner !== null && label !== undefined) {
      const db = getDb(this.env);
      await db.batch([
        db.insert(prizeAwards).values({
          day: event.day,
          userId: winner,
          prizeLabel: label,
          createdAt: new Date(),
        }),
        advanceDayStatement(db, event.day),
      ]);
    }
    await this.publish(idleEvent());
  }

  async setEventPhase(phase: GamePhase): Promise<EventState> {
    return this.alone(() => this.publish({ ...idleEvent(), phase }));
  }

  /**
   * The ONE write path. The day is READ rather than chosen, which is what makes
   * "aborting does not increment the day" a property of the code. The alarm comes from
   * `nextDeadline`, the same function the screens read, and a phase with no deadline
   * CLEARS it rather than leaving a stale one to fire into the next event.
   */
  private async publish(draft: EventDraft): Promise<EventState> {
    const db = getDb(this.env);
    await setGamePhase(db, draft.phase);
    const state = await readGameState(db);
    const event = eventStateSchema.parse({ ...draft, day: state.day });
    const eventFrame = frame({ type: "event_changed", state: event });
    const stateFrame = frame({ type: "state_changed", state });
    await this.ctx.storage.put(EVENT_KEY, event);
    await this.ctx.storage.put(STATE_KEY, stateFrame);
    const deadline = nextDeadline(event);
    if (deadline === null) await this.ctx.storage.deleteAlarm();
    else await this.ctx.storage.setAlarm(deadline);
    this.fanout(eventFrame);
    this.fanout(stateFrame);
    return event;
  }

  override webSocketMessage(socket: WebSocket, message: string | ArrayBuffer) {
    const now = Date.now();
    const state = readSocketState(socket);
    if (state?.name == null) return;
    if (typeof message !== "string") {
      this.chunk(socket, message, now);
      return;
    }
    const parsed = presenceFrameSchema.safeParse(parseJson(message));
    if (!parsed.success) return;
    if (parsed.data.type === "say") this.said(socket, state, parsed.data, now);
    else if (parsed.data.type === "talk_start") this.talkStart(socket, now);
    else if (parsed.data.type === "talk_end") this.talkEnd(socket, now);
    else this.moved(socket, state, parsed.data, now);
    this.expireGhosts(now);
    this.expireTalk(now);
  }

  /**
   * Samples ride as BINARY frames alongside the JSON, so there is no header saying whose
   * they are — half-duplex is what makes that safe, and the channel lock is what makes
   * it half-duplex. A chunk from a socket holding nothing is dropped rather than taken
   * as an implicit press.
   */
  private chunk(socket: WebSocket, bytes: ArrayBuffer, now: number): void {
    if (bytes.byteLength === 0) return;
    if (bytes.byteLength > TALK_FRAME_MAX_BYTES) return;
    const state = readSocketState(socket);
    if (state?.talking == null) return;
    if (isTalkOver(state.talking, now)) {
      this.endTalk(socket, state, now);
      return;
    }
    writeSocketState(socket, {
      ...state,
      talking: { ...state.talking, heardAt: now },
    });
    this.fanoutHeard(bytes, socket);
  }

  private talkStart(socket: WebSocket, now: number): void {
    // Expired FIRST, so a speaker whose tab died mid-sentence is not still holding the
    // town's channel against the next person to press.
    if (this.expireTalk(now) !== null) return;
    const state = readSocketState(socket);
    if (state?.name == null) return;
    if (isTalkTooSoon(state.talkedAt, now)) return;
    writeSocketState(socket, {
      ...state,
      talking: { since: now, heardAt: now },
    });
    this.fanoutHeard(
      frame({
        type: "presence_talk_start",
        id: state.id,
        name: state.name,
      }),
      socket,
    );
  }

  private talkEnd(socket: WebSocket, now: number): void {
    const state = readSocketState(socket);
    if (state?.talking == null) return;
    this.endTalk(socket, state, now);
  }

  private endTalk(socket: WebSocket, state: SocketState, now: number): void {
    writeSocketState(socket, { ...state, talking: null, talkedAt: now });
    this.fanoutHeard(
      frame({ type: "presence_talk_end", id: state.id }),
      socket,
    );
  }

  /** Frees the channel by SILENCE, the way `expireGhosts` does and for the same reason:
   * a DO has one alarm slot and the event's deadlines own it. */
  private expireTalk(now: number): WebSocket | null {
    let holder: WebSocket | null = null;
    for (const socket of this.ctx.getWebSockets()) {
      const state = readSocketState(socket);
      if (state?.talking == null) continue;
      if (isTalkOver(state.talking, now)) this.endTalk(socket, state, now);
      else holder ??= socket;
    }
    return holder;
  }

  private talkingNow(now: number): string | null {
    const holder = this.expireTalk(now);
    if (holder === null) return null;
    const state = readSocketState(holder);
    if (state?.name == null) return null;
    return frame({
      type: "presence_talk_start",
      id: state.id,
      name: state.name,
    });
  }

  private moved(
    socket: WebSocket,
    state: SocketState,
    move: PresenceMove,
    now: number,
  ): void {
    if (state.at !== null && isPresenceTooSoon(state.seenAt, now)) return;
    const next: SocketState = {
      ...state,
      at: { x: move.x, y: move.y, facing: move.facing },
      seenAt: now,
    };
    writeSocketState(socket, next);
    const player = playerOf(next, now);
    if (player !== null) {
      this.fanout(frame({ type: "presence_moved", player }), socket);
    }
  }

  private said(
    socket: WebSocket,
    state: SocketState,
    say: { text: string },
    now: number,
  ): void {
    if (playerOf(state, now) === null) return;
    if (isSayTooSoon(state.saidAt, now)) return;
    writeSocketState(socket, { ...state, saidAt: now });
    this.fanout(
      frame({ type: "presence_said", id: state.id, text: say.text }),
      socket,
    );
  }

  override webSocketClose(ws: WebSocket): void {
    this.depart(ws);
    try {
      ws.close();
    } catch {
      // Already closed.
    }
  }

  override webSocketError(ws: WebSocket): void {
    this.depart(ws);
  }

  private depart(socket: WebSocket): void {
    const state = readSocketState(socket);
    if (state === null) return;
    const now = Date.now();
    if (state.talking !== null) this.endTalk(socket, state, now);
    if (playerOf(state, now) === null) return;
    this.fanout(frame({ type: "presence_left", id: state.id }), socket);
  }

  private roster(now: number): PresencePlayer[] {
    return roster(this.ctx.getWebSockets(), now);
  }

  private expireGhosts(now: number): void {
    for (const socket of this.ctx.getWebSockets()) {
      const state = readSocketState(socket);
      if (state?.at == null) continue;
      if (playerOf(state, now) !== null) continue;
      writeSocketState(socket, { ...state, at: null });
      this.fanout(frame({ type: "presence_left", id: state.id }), socket);
    }
  }

  refreshSprite(userId: number, sprite: string | null): void {
    const now = Date.now();
    for (const socket of this.ctx.getWebSockets()) {
      const state = readSocketState(socket);
      if (state?.userId !== userId) continue;
      if (state.sprite === sprite) continue;
      const next: SocketState = { ...state, sprite };
      writeSocketState(socket, next);
      const player = playerOf(next, now);
      if (player !== null) {
        this.fanout(frame({ type: "presence_moved", player }), socket);
      }
    }
  }

  private fanout(message: string, except?: WebSocket): void {
    for (const socket of this.ctx.getWebSockets()) {
      if (socket === except) continue;
      this.send(socket, message);
    }
  }

  /** The ONE filtered fanout: everything else here reaches an anonymous visitor's socket
   * on purpose, because walking is public. Voice is not — without this filter the town's
   * channel would be open to anyone holding the URL. */
  private fanoutHeard(message: string | ArrayBuffer, except: WebSocket): void {
    for (const socket of this.ctx.getWebSockets()) {
      if (socket === except) continue;
      if (readSocketState(socket)?.name == null) continue;
      this.send(socket, message);
    }
  }

  private send(socket: WebSocket, message: string | ArrayBuffer): void {
    try {
      socket.send(message);
    } catch {
      // Dead socket — hibernation API drops it on close/error.
    }
  }
}
