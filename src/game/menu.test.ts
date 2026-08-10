import { describe, expect, it } from "vitest";
import {
  MENU_ITEMS,
  visibleItems,
  type MenuContext,
  type MenuItem,
} from "@/game/menu";

const FRIEND: MenuContext = {
  isAdmin: false,
  muted: false,
  signedIn: false,
  failedEvaluations: 0,
  inEvent: false,
  isHost: false,
  wheelUnspun: false,
};
const ADMIN: MenuContext = { ...FRIEND, isAdmin: true };
const HOST_AT_THE_WHEEL: MenuContext = {
  ...ADMIN,
  inEvent: true,
  isHost: true,
  wheelUnspun: true,
};

describe("visibleItems", () => {
  it("ships install, the sound toggle and auth to an anonymous walker", () => {
    expect(visibleItems(MENU_ITEMS, FRIEND)).toEqual([
      { id: "install", label: "Install app" },
      { id: "sound", label: "Sound: on" },
      { id: "auth", label: "Sign in" },
    ]);
  });

  it("keeps the AI retry off a friend's menu and on an admin's", () => {
    expect(
      visibleItems(MENU_ITEMS, FRIEND).map((item) => item.id),
    ).not.toContain("retry-ai");
    const operator = visibleItems(MENU_ITEMS, {
      ...FRIEND,
      isAdmin: true,
      failedEvaluations: 3,
    });
    expect(operator).toContainEqual({ id: "retry-ai", label: "Retry AI: 3" });
  });

  it("still offers the retry when nothing has broken", () => {
    expect(
      visibleItems(MENU_ITEMS, { ...FRIEND, isAdmin: true }),
    ).toContainEqual({ id: "retry-ai", label: "Retry AI: 0" });
  });

  it("offers the prize manager to admins only, and the whole operator's set in registry order", () => {
    expect(
      visibleItems(MENU_ITEMS, FRIEND).map((item) => item.id),
    ).not.toContain("prizes");
    expect(visibleItems(MENU_ITEMS, ADMIN)).toEqual([
      { id: "install", label: "Install app" },
      { id: "sound", label: "Sound: on" },
      { id: "auth", label: "Sign in" },
      { id: "retry-ai", label: "Retry AI: 0" },
      { id: "avatar-counts", label: "Avatar counts" },
      { id: "prizes", label: "Prize manager" },
      { id: "jury-bench", label: "Jury bench" },
      { id: "eventStart", label: "Start event" },
    ]);
  });

  it("keeps the avatar counts away from the friends", () => {
    expect(
      visibleItems(MENU_ITEMS, FRIEND).map((item) => item.id),
    ).not.toContain("avatar-counts");
    expect(
      visibleItems(MENU_ITEMS, { ...FRIEND, signedIn: true }).map(
        (item) => item.id,
      ),
    ).not.toContain("avatar-counts");
    expect(visibleItems(MENU_ITEMS, ADMIN)).toContainEqual({
      id: "avatar-counts",
      label: "Avatar counts",
    });
  });

  it("keeps the operator's event buttons away from the friends", () => {
    const labels = visibleItems(MENU_ITEMS, { ...FRIEND, inEvent: true }).map(
      (item) => item.label,
    );
    expect(labels).not.toContain("Start event");
    expect(labels).not.toContain("Abort event");
  });

  it("offers an admin start when nothing runs, and abort once one does", () => {
    expect(visibleItems(MENU_ITEMS, ADMIN)).toContainEqual({
      id: "eventStart",
      label: "Start event",
    });
    expect(visibleItems(MENU_ITEMS, ADMIN)).not.toContainEqual({
      id: "eventAbort",
      label: "Abort event",
    });

    const running = visibleItems(MENU_ITEMS, { ...ADMIN, inEvent: true });
    expect(running).toContainEqual({ id: "eventAbort", label: "Abort event" });
    expect(running).not.toContainEqual({
      id: "eventStart",
      label: "Start event",
    });
  });

  it("offers the spin to the host of a live unspun wheel, in registry order", () => {
    expect(visibleItems(MENU_ITEMS, HOST_AT_THE_WHEEL)).toEqual([
      { id: "install", label: "Install app" },
      { id: "sound", label: "Sound: on" },
      { id: "auth", label: "Sign in" },
      { id: "retry-ai", label: "Retry AI: 0" },
      { id: "avatar-counts", label: "Avatar counts" },
      { id: "prizes", label: "Prize manager" },
      { id: "jury-bench", label: "Jury bench" },
      { id: "eventSpin", label: "Spin the wheel" },
      { id: "eventAbort", label: "Abort event" },
    ]);
  });

  it("keeps the spin off a second admin's menu, and off a spun wheel", () => {
    const ids = (ctx: MenuContext) =>
      visibleItems(MENU_ITEMS, ctx).map((item) => item.id);

    expect(ids({ ...HOST_AT_THE_WHEEL, isHost: false })).not.toContain(
      "eventSpin",
    );
    expect(ids({ ...HOST_AT_THE_WHEEL, wheelUnspun: false })).not.toContain(
      "eventSpin",
    );
    expect(ids(ADMIN)).not.toContain("eventSpin");
    expect(ids({ ...ADMIN, inEvent: true })).not.toContain("eventSpin");
  });

  it("no longer carries the avatar editor, session or no session", () => {
    const signedIn = visibleItems(MENU_ITEMS, { ...FRIEND, signedIn: true });
    expect(signedIn.map((item) => item.id)).toEqual([
      "install",
      "sound",
      "auth",
    ]);
    for (const ctx of [FRIEND, ADMIN, { ...FRIEND, signedIn: true }]) {
      expect(
        visibleItems(MENU_ITEMS, ctx).map((item) => item.label),
      ).not.toContain("Trainer sprite");
    }
  });

  it("reads the sound label back off the context", () => {
    const muted = visibleItems(MENU_ITEMS, { ...FRIEND, muted: true });
    expect(muted).toContainEqual({ id: "sound", label: "Sound: off" });
  });

  it("offers the same slot as Sign out once there is a session", () => {
    const signedIn = visibleItems(MENU_ITEMS, { ...FRIEND, signedIn: true });
    expect(signedIn).toContainEqual({ id: "auth", label: "Sign out" });
    expect(signedIn.filter((item) => item.id === "auth")).toHaveLength(1);
  });

  it("hides an admin-only item from everyone else", () => {
    const adminOnly: MenuItem = {
      id: "install",
      label: () => "Operator panel",
      visible: (ctx) => ctx.isAdmin,
    };

    expect(visibleItems([adminOnly], FRIEND)).toEqual([]);
    expect(visibleItems([adminOnly], { ...FRIEND, isAdmin: true })).toEqual([
      { id: "install", label: "Operator panel" },
    ]);
  });

  it("keeps an item with no predicate at all", () => {
    const always: MenuItem = { id: "sound", label: () => "Always" };
    expect(visibleItems([always], FRIEND)).toHaveLength(1);
  });
});
