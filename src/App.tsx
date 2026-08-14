import { AdminConsole } from "@/admin/AdminConsole";
import { AuthProvider } from "@/context/AuthContext";
import { EventProvider } from "@/context/EventContext";
import { WebSocketProvider } from "@/context/WebSocketContext";
import { Overworld } from "@/game/Overworld";
import { ADMIN_PATH } from "@/lib/admin";

// A branch on the path rather than a router: one non-town path does not earn a
// dependency, and knip reads an unused one as a failure anyway. `not_found_handling:
// "single-page-application"` already serves index.html there.
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
