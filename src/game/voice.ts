import type { WsEvent } from "@shared/ws-events";

/**
 * Half a local fact and half a remote one, and that asymmetry is the transport's:
 * the DO spares a sender its own talk frames, so `mine` can only ever come from the
 * press — a round trip would light your own lamp at network delay.
 */
export interface Channel {
  mine: boolean;
  theirs: string | null;
}

export const CHANNEL_IDLE: Channel = { mine: false, theirs: null };

export type ChannelAction =
  | WsEvent
  | { type: "mine_start" }
  | { type: "mine_end" }
  /** Nothing will arrive to turn your own light off when the socket dies mid-press:
   * the `talk_end` you would have sent had nowhere to go. */
  | { type: "socket_lost" };

export function applyChannel(channel: Channel, action: ChannelAction): Channel {
  switch (action.type) {
    case "mine_start":
      return channel.mine ? channel : { ...channel, mine: true };
    case "mine_end":
      return channel.mine ? { ...channel, mine: false } : channel;
    case "socket_lost":
      return channel.mine || channel.theirs !== null ? CHANNEL_IDLE : channel;
    case "presence_talk_start":
      return { ...channel, theirs: action.name };
    case "presence_talk_end":
      return channel.theirs === null ? channel : { ...channel, theirs: null };
    default:
      return channel;
  }
}
