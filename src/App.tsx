import { AdminConsole } from "@/admin/AdminConsole";
import { AuthProvider } from "@/context/AuthContext";
import { EventProvider } from "@/context/EventContext";
import { WebSocketProvider } from "@/context/WebSocketContext";
import { Overworld } from "@/game/Overworld";
import { ADMIN_PATH } from "@/lib/admin";

// `not_found_handling: "single-page-application"` is what serves index.html at this
// path on a hard load.
export function App() {
  if (window.location.pathname === ADMIN_PATH) {
    return (
      <AuthProvider>
        <AdminConsole />
      </AuthProvider>
    );
  }
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
