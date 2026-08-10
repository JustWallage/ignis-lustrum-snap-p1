export interface MenuContext {
  isAdmin: boolean;
  muted: boolean;
  signedIn: boolean;
  failedEvaluations: number;
  inEvent: boolean;
  isHost: boolean;
  wheelUnspun: boolean;
}

export type MenuItemId =
  | "install"
  | "sound"
  | "auth"
  | "retry-ai"
  | "avatar-counts"
  | "prizes"
  | "jury-bench"
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
  {
    id: "retry-ai",
    label: (ctx) => `Retry AI: ${ctx.failedEvaluations}`,
    visible: (ctx) => ctx.isAdmin,
  },
  {
    id: "avatar-counts",
    label: () => "Avatar counts",
    visible: (ctx) => ctx.isAdmin,
  },
  {
    id: "prizes",
    label: () => "Prize manager",
    visible: (ctx) => ctx.isAdmin,
  },
  {
    id: "jury-bench",
    label: () => "Jury bench",
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
    // The HOST, not any admin: `hostUserId` is frozen at the START that opened the
    // event, so the second admin is refused a 403 by the route and would be reading a
    // menu item that cannot work.
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
