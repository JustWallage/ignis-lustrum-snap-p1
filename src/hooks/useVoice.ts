import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import type { WsEvent } from "@shared/ws-events";
import { useRealtimeEvent, useVoiceSocket } from "@/context/WebSocketContext";
import { applyChannel, CHANNEL_IDLE, type Channel } from "@/game/voice";
import { playCue, unlockAudio } from "@/lib/sound";
import { hearVoice, startCapture, type Capture } from "@/lib/voice";

export interface Voice {
  channel: Channel;
  refusal: "signed-out" | "no-microphone" | null;
  hold: () => void;
  release: () => void;
}

export function useVoice(signedIn: boolean): Voice {
  const socket = useVoiceSocket();
  const [channel, dispatch] = useReducer(applyChannel, CHANNEL_IDLE);
  const [refusal, setRefusal] = useState<Voice["refusal"]>(null);
  const captureRef = useRef<Capture | null>(null);
  // Refs, not state: `release` has to see the press it is ending even when the two land
  // in one React batch, and a denial must not ask the browser again on the next press.
  const holdingRef = useRef(false);
  const deniedRef = useRef(false);

  const stop = useCallback(() => {
    captureRef.current?.stop();
    captureRef.current = null;
  }, []);

  const release = useCallback(() => {
    if (!holdingRef.current) return;
    holdingRef.current = false;
    stop();
    socket.talk(false);
    dispatch({ type: "mine_end" });
    playCue("squelchClose");
  }, [socket, stop]);

  const hold = useCallback(() => {
    if (holdingRef.current) return;
    if (!signedIn) {
      setRefusal("signed-out");
      return;
    }
    if (deniedRef.current) {
      setRefusal("no-microphone");
      return;
    }
    // Refused HERE as well as at the DO, which would refuse it anyway: without this the
    // lamp lights and the microphone opens for a transmission that never leaves, and a
    // light that lies is worse than a bar that does nothing. Two people pressing in the
    // same instant still race — the local light is local by design — but pressing while
    // the green row is plainly lit is not a race.
    if (channel.theirs !== null) return;
    // The press is a guaranteed user gesture, and on a screen that loaded into a running
    // event it is the ONLY one: `shouldSkipSplash` means nobody pressed START there, so
    // there is no AudioContext at all. `unlockAudio` no-ops once one exists.
    unlockAudio();
    holdingRef.current = true;
    setRefusal(null);
    dispatch({ type: "mine_start" });
    playCue("squelchOpen");
    void startCapture(socket.sendVoice).then((capture) => {
      if (capture === null) {
        deniedRef.current = true;
        setRefusal("no-microphone");
        release();
        return;
      }
      if (!holdingRef.current) {
        capture.stop();
        return;
      }
      captureRef.current = capture;
      // Claimed only once there is something to send, so a permission dialog nobody
      // answers cannot hold the town's channel for as long as it stays open.
      socket.talk(true);
    });
  }, [channel.theirs, release, signedIn, socket]);

  // Signing in through the SELECT menu reloads nothing, so without this the line telling
  // a visitor what signing in buys would outlive their signing in.
  useEffect(() => {
    setRefusal(null);
  }, [signedIn]);

  useEffect(() => socket.onVoice(hearVoice), [socket]);

  useEffect(
    () =>
      socket.onLost(() => {
        holdingRef.current = false;
        stop();
        dispatch({ type: "socket_lost" });
      }),
    [socket, stop],
  );

  // A hidden tab ends the transmission LOCALLY rather than leaving the channel held
  // until the DO's silence timeout notices.
  useEffect(() => {
    const onHidden = () => {
      if (document.visibilityState === "hidden") release();
    };
    document.addEventListener("visibilitychange", onHidden);
    return () => {
      document.removeEventListener("visibilitychange", onHidden);
      stop();
    };
  }, [release, stop]);

  const onTalk = useCallback((event: WsEvent) => {
    dispatch(event);
    playCue(
      event.type === "presence_talk_start" ? "squelchOpen" : "squelchClose",
    );
  }, []);

  useRealtimeEvent("presence_talk_start", onTalk);
  useRealtimeEvent("presence_talk_end", onTalk);

  return { channel, refusal, hold, release };
}
