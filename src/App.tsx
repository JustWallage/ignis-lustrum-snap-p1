import { AuthProvider } from "@/context/AuthContext";
import { EventProvider } from "@/context/EventContext";
import { WebSocketProvider } from "@/context/WebSocketContext";
import { Overworld } from "@/game/Overworld";

export function App() {
  return (
    <AuthProvider>
      <WebSocketProvider>
        <EventProvider>
          <Overworld />
        </EventProvider>
      </WebSocketProvider>
    </AuthProvider>
  );
}
