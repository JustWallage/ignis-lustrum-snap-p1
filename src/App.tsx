import { AdminConsole } from "@/admin/AdminConsole";
import { AuthProvider } from "@/context/AuthContext";
import { EventProvider } from "@/context/EventContext";
import { PublicGallery } from "@/gallery/PublicGallery";
import { WebSocketProvider } from "@/context/WebSocketContext";
import { Overworld } from "@/game/Overworld";
import { ADMIN_PATH } from "@/lib/admin";
import { GALLERY_PATH } from "@/lib/gallery";

// `not_found_handling: "single-page-application"` is what serves index.html at this
// path on a hard load.
export function App() {
  // No `AuthProvider` at all, and that is the point rather than a saving: the gallery
  // has no signed-in state to read, so a page that never asks `/api/me` cannot start
  // showing more to somebody who happens to hold a cookie.
  if (window.location.pathname === GALLERY_PATH) {
    return <PublicGallery />;
  }
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
