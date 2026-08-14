export interface MenuContext {
  isAdmin: boolean;
  muted: boolean;
  signedIn: boolean;
  inEvent: boolean;
  isHost: boolean;
  wheelUnspun: boolean;
}

export type MenuItemId =
  | "install"
  | "sound"
  | "auth"
  | "admin-console"
  | "eventStart"
  | "eventSpin"
  | "eventAbort";

export interface MenuItem {
  id: MenuItemId;
  label: (ctx: MenuContext) => string;
  visible?: (ctx: MenuContext) => boolean;
}

export const MENU_ITEMS: readonly MenuItem[] = [
  { id: "install", label: () => "Install app" },
  { id: "sound", label: (ctx) => `Sound: ${ctx.muted ? "off" : "on"}` },
  // ONE slot, both directions: signing out and the proactive sign-in are the same
  // affordance from either side of a session, so this reads its own state back rather
  // than being two entries that take turns being hidden.
  { id: "auth", label: (ctx) => (ctx.signedIn ? "Sign out" : "Sign in") },
  // The ONE way to the console, and the only admin item left that is not the event's:
  // the other three are pressed by somebody standing in the room while it runs.
  {
    id: "admin-console",
    label: () => "Admin console",
    visible: (ctx) => ctx.isAdmin,
  },
  {
    id: "eventStart",
    label: () => "Start event",
    visible: (ctx) => ctx.isAdmin && !ctx.inEvent,
  },
  {
    id: "eventSpin",
    label: () => "Spin the wheel",
    visible: (ctx) => ctx.isHost && ctx.wheelUnspun,
  },
  {
    id: "eventAbort",
    label: () => "Abort event",
    visible: (ctx) => ctx.isAdmin && ctx.inEvent,
  },
];

export interface VisibleMenuItem {
  id: MenuItemId;
  label: string;
}

export function visibleItems(
  items: readonly MenuItem[],
  ctx: MenuContext,
): VisibleMenuItem[] {
  return items
    .filter((item) => item.visible?.(ctx) ?? true)
    .map((item) => ({ id: item.id, label: item.label(ctx) }));
}
