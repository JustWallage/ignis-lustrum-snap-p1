import { useCallback, useEffect, useRef, useState } from "react";
import { NPC_NAME, npcChatResponseSchema, type NpcTurn } from "@shared/npc";
import { apiFetch } from "@/lib/api";
import { chatTurn, type ChatTurn } from "@/lib/npc-chat";

const SAYS = `${NPC_NAME.toUpperCase()}:`;

const GREETING: ChatTurn = chatTurn(
  SAYS,
  "There you are. I have been watching the whole street go past with cameras.",
  "So what have you been pointing yours at?",
  ["Nothing good yet", "Today's theme", "Everyone else's snaps"],
);

const THINKING: readonly string[] = [`${SAYS} Hm. Let me think about that…`];

const UNREACHABLE: ChatTurn = chatTurn(
  SAYS,
  "…did the wind take that?",
  "Try me again?",
  ["Say it again"],
);

export interface NpcChat {
  id: string;
  pages: readonly string[];
  options: readonly string[];
  pending: boolean;
  send: (text: string) => void;
}

export function useNpcChat(chatting: boolean): NpcChat {
  const [turns, setTurns] = useState<readonly NpcTurn[]>([]);
  const [turn, setTurn] = useState<ChatTurn>(GREETING);
  const [pending, setPending] = useState(false);
  const [said, setSaid] = useState(0);
  // A reply landing after the player walked off is dropped: the transcript is gone.
  const chattingRef = useRef(chatting);
  chattingRef.current = chatting;

  useEffect(() => {
    if (chatting) return;
    setTurns([]);
    setTurn(GREETING);
    setPending(false);
    setSaid(0);
  }, [chatting]);

  const send = useCallback(
    (text: string) => {
      setPending(true);
      setSaid((count) => count + 1);
      void apiFetch("/api/npc/chat", npcChatResponseSchema, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, turns }),
      })
        .then((answer) => {
          if (!chattingRef.current) return;
          setTurns(answer.turns);
          setTurn(
            chatTurn(SAYS, answer.reaction, answer.question, answer.options),
          );
        })
        .catch(() => {
          if (!chattingRef.current) return;
          setTurn(UNREACHABLE);
        })
        .finally(() => {
          if (chattingRef.current) setPending(false);
        });
    },
    [turns],
  );

  return {
    // Carries the turn AND whether one is in flight, because the answers are replaced
    // with the pages: a cursor left on the fourth of three would point past the end.
    id: `chat:${String(said)}:${pending ? "wait" : "said"}`,
    pages: pending ? THINKING : turn.pages,
    options: turn.options,
    pending,
    send,
  };
}
