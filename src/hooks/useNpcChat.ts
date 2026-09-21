import { useCallback, useEffect, useRef, useState } from "react";
import { npcChatResponseSchema, type NpcKind, type NpcTurn } from "@shared/npc";
import { apiFetch } from "@/lib/api";
import { chatTurn, speakerOf, type ChatTurn } from "@/lib/npc-chat";

const GREETINGS: Record<NpcKind, ChatTurn> = {
  neighbour: chatTurn(
    "neighbour",
    "There you are. I have been watching the whole street go past with cameras.",
    "So what have you been pointing yours at?",
    ["Nothing good yet", "Today's theme", "Everyone else's snaps"],
  ),
  guide: chatTurn(
    "guide",
    "Hola parceros! Nico hier, jullie reisleider. Het hele programma zit in mijn hoofd.",
    "Waar kan ik je mee helpen?",
    ["Wat doen we vandaag?", "En morgen dan?", "Wat moet ik meenemen?"],
  ),
};

const THINKING: Record<NpcKind, readonly string[]> = {
  neighbour: [`${speakerOf("neighbour")} Hm. Let me think about that…`],
  guide: [`${speakerOf("guide")} Momentje, ik kijk het even na…`],
};

const UNREACHABLE: Record<NpcKind, ChatTurn> = {
  neighbour: chatTurn(
    "neighbour",
    "…did the wind take that?",
    "Try me again?",
    ["Say it again"],
  ),
  guide: chatTurn("guide", "…daar viel het bereik weg.", "Nog een keer?", [
    "Nog een keer",
  ]),
};

export interface NpcChat {
  id: string;
  pages: readonly string[];
  options: readonly string[];
  pending: boolean;
  send: (text: string) => void;
}

/** `who` is null while nobody is being talked to, and changing it is what ends a
 * conversation: there is one transcript and it belongs to whoever is in front of you. */
export function useNpcChat(who: NpcKind | null): NpcChat {
  const [turns, setTurns] = useState<readonly NpcTurn[]>([]);
  const [turn, setTurn] = useState<ChatTurn | null>(null);
  const [pending, setPending] = useState(false);
  const [said, setSaid] = useState(0);
  // A reply landing after the player walked off is dropped: the transcript is gone.
  const chattingRef = useRef(who);
  chattingRef.current = who;

  useEffect(() => {
    if (who !== null) return;
    setTurns([]);
    setTurn(null);
    setPending(false);
    setSaid(0);
  }, [who]);

  const send = useCallback(
    (text: string) => {
      if (who === null) return;
      setPending(true);
      setSaid((count) => count + 1);
      void apiFetch("/api/npc/chat", npcChatResponseSchema, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ who, message: text, turns }),
      })
        .then((answer) => {
          if (chattingRef.current !== who) return;
          setTurns(answer.turns);
          setTurn(
            chatTurn(who, answer.reaction, answer.question, answer.options),
          );
        })
        .catch(() => {
          if (chattingRef.current !== who) return;
          setTurn(UNREACHABLE[who]);
        })
        .finally(() => {
          if (chattingRef.current === who) setPending(false);
        });
    },
    [turns, who],
  );

  // Nothing is on screen while `who` is null, so the fallback only ever picks which
  // greeting nobody is reading.
  const kind = who ?? "neighbour";
  const shown = turn ?? GREETINGS[kind];
  return {
    // Carries the turn AND whether one is in flight, because the answers are replaced
    // with the pages: a cursor left on the fourth of three would point past the end.
    id: `chat:${String(said)}:${pending ? "wait" : "said"}`,
    pages: pending ? THINKING[kind] : shown.pages,
    options: shown.options,
    pending,
    send,
  };
}
