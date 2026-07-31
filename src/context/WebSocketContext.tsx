import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  type ReactNode,
} from "react";
import {
  presenceMoveSchema,
  presenceSaySchema,
  PRESENCE_PING_MS,
  type PresenceMove,
} from "@shared/presence";
import {
  REVALIDATE_EVENT_TYPES,
  wsEventSchema,
  type WsEvent,
  type WsEventType,
} from "@shared/ws-events";
import { useAuth } from "@/context/AuthContext";

type Handler = (event: WsEvent) => void;

export type Standing = Omit<PresenceMove, "type">;

interface WebSocketContextValue {
  subscribe: (type: WsEventType, handler: Handler) => () => void;
  announce: (standing: Standing) => void;
  say: (text: string) => void;
}

const WebSocketContext = createContext<WebSocketContextValue | null>(null);

const RECONNECT_DELAY_MS = 3000;

export function WebSocketProvider({ children }: { children: ReactNode }) {
  // Identity is fixed at UPGRADE time, so an identity that changes means a new
  // socket: signing in through the SELECT menu reloads nothing, and without this the
  // friend who just signed in would stay an invisible spectator.
  const { user, loading } = useAuth();
  const identity = user?.id ?? null;
  const handlersRef = useRef(new Map<WsEventType, Set<Handler>>());
  const socketRef = useRef<WebSocket | null>(null);
  const standingRef = useRef<Standing | null>(null);

  const post = useCallback((standing: Standing) => {
    const socket = socketRef.current;
    if (socket?.readyState !== WebSocket.OPEN) return;
    socket.send(
      JSON.stringify(
        presenceMoveSchema.parse({ type: "presence", ...standing }),
      ),
    );
  }, []);

  useEffect(() => {
    if (loading) return;
    if (identity === null) standingRef.current = null;
    let disposed = false;
    let reconnectTimer: number | undefined;

    const connect = () => {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const socket = new WebSocket(
        `${protocol}//${window.location.host}/api/ws`,
      );
      socketRef.current = socket;
      socket.onopen = () => {
        const standing = standingRef.current;
        if (standing !== null) post(standing);
      };
      socket.onmessage = (event) => {
        if (typeof event.data !== "string") {
          return;
        }
        let raw: unknown;
        try {
          raw = JSON.parse(event.data);
        } catch {
          return;
        }
        const parsed = wsEventSchema.safeParse(raw);
        if (!parsed.success) {
          return;
        }
        handlersRef.current.get(parsed.data.type)?.forEach((handler) => {
          handler(parsed.data);
        });
      };
      socket.onclose = () => {
        if (!disposed) {
          reconnectTimer = window.setTimeout(connect, RECONNECT_DELAY_MS);
        }
      };
    };

    connect();
    // Standing still sends nothing, so the repeat is what proves we are still here: a
    // tab that dies without a close frame would otherwise leave a ghost.
    const keepalive = window.setInterval(() => {
      const standing = standingRef.current;
      if (standing !== null) post(standing);
    }, PRESENCE_PING_MS);

    return () => {
      disposed = true;
      window.clearTimeout(reconnectTimer);
      window.clearInterval(keepalive);
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [post, loading, identity]);

  const subscribe = useCallback((type: WsEventType, handler: Handler) => {
    const handlers = handlersRef.current.get(type) ?? new Set<Handler>();
    handlers.add(handler);
    handlersRef.current.set(type, handlers);
    return () => {
      handlers.delete(handler);
    };
  }, []);

  const announce = useCallback(
    (standing: Standing) => {
      standingRef.current = standing;
      post(standing);
    },
    [post],
  );

  // Parsed on the way OUT too, so a caller cannot talk the socket into sending
  // something the DO would throw away. An unsendable message is dropped, not thrown.
  const say = useCallback((text: string) => {
    const socket = socketRef.current;
    if (socket?.readyState !== WebSocket.OPEN) return;
    const frame = presenceSaySchema.safeParse({ type: "say", text });
    if (!frame.success) return;
    socket.send(JSON.stringify(frame.data));
  }, []);

  return (
    <WebSocketContext.Provider value={{ subscribe, announce, say }}>
      {children}
    </WebSocketContext.Provider>
  );
}

function useWebSocket(): WebSocketContextValue {
  const value = useContext(WebSocketContext);
  if (value === null) {
    throw new Error("useWebSocket must be used inside WebSocketProvider");
  }
  return value;
}

export function useRealtimeEvents(onEvent: () => void): void {
  const { subscribe } = useWebSocket();
  useEffect(() => {
    // Derived from the schema, so a new content event needs no change here and a
    // forgotten entry cannot fail silently.
    const unsubscribers = REVALIDATE_EVENT_TYPES.map((type) =>
      subscribe(type, onEvent),
    );
    return () => {
      unsubscribers.forEach((unsubscribe) => {
        unsubscribe();
      });
    };
  }, [subscribe, onEvent]);
}

export function useRealtimeEvent(type: WsEventType, handler: Handler): void {
  const { subscribe } = useWebSocket();
  useEffect(() => subscribe(type, handler), [subscribe, type, handler]);
}

export function useAnnouncePresence(): (standing: Standing) => void {
  return useWebSocket().announce;
}

export function useSaySomething(): (text: string) => void {
  return useWebSocket().say;
}
