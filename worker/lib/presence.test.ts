import { describe, expect, it } from "vitest";
import { PRESENCE_PING_MS } from "../../shared/presence";
import {
  isPresent,
  playerOf,
  presenceName,
  presenceSprite,
  presenceUpgrade,
  presenceUserId,
  readSocketState,
  roster,
  writeSocketState,
  type Attached,
  type SocketState,
} from "./presence";

function socket(state?: SocketState): Attached {
  let attachment: unknown = undefined;
  const fake: Attached = {
    serializeAttachment(value: unknown) {
      attachment = value;
    },
    deserializeAttachment() {
      return attachment;
    },
  };
  if (state !== undefined) writeSocketState(fake, state);
  return fake;
}

const UID = 42;

const SPRITE = "/api/sprites/0123456789abcdef";

function standing(
  id: string,
  name: string | null,
  seenAt = 0,
  userId: number | null = name === null ? null : UID,
  sprite: string | null = null,
): SocketState {
  return {
    id,
    name,
    userId,
    sprite,
    at: { x: 3, y: 4, facing: "down" },
    seenAt,
    saidAt: null,
  };
}

describe("presenceUpgrade", () => {
  it("carries the name the auth layer resolved", () => {
    const request = presenceUpgrade({ id: 1, name: "tester" }, null);
    expect(request.headers.get("Upgrade")).toBe("websocket");
    expect(presenceName(new URL(request.url))).toBe("tester");
  });

  it("carries no name at all for an anonymous visitor", () => {
    expect(presenceName(new URL(presenceUpgrade(null, null).url))).toBeNull();
  });

  it("carries the user id as well, for asking whether somebody is still there", () => {
    const request = presenceUpgrade({ id: 7, name: "tester" }, null);
    expect(presenceUserId(new URL(request.url))).toBe(7);
  });

  it("carries no id for a spectator, and refuses a junk one", () => {
    expect(presenceUserId(new URL(presenceUpgrade(null, null).url))).toBeNull();
    expect(presenceUserId(new URL("https://x.invalid/ws?uid=nope"))).toBeNull();
    expect(presenceUserId(new URL("https://x.invalid/ws?uid=1.5"))).toBeNull();
  });

  it("carries the sprite the worker resolved for that user", () => {
    const request = presenceUpgrade({ id: 7, name: "tester" }, SPRITE);
    expect(presenceSprite(new URL(request.url))).toBe(SPRITE);
  });

  it("carries no sprite for somebody on the built-in art", () => {
    const request = presenceUpgrade({ id: 7, name: "tester" }, null);
    expect(presenceSprite(new URL(request.url))).toBeNull();
  });

  it("carries no sprite for a spectator, whatever it is handed", () => {
    expect(
      presenceSprite(new URL(presenceUpgrade(null, SPRITE).url)),
    ).toBeNull();
  });

  it("is built from scratch, so nothing a client sent can reach the DO", () => {
    const url = new URL(presenceUpgrade({ id: 2, name: "rival" }, SPRITE).url);
    expect([...url.searchParams.keys()].sort()).toEqual([
      "name",
      "sprite",
      "uid",
    ]);
    expect(url.pathname).toBe("/ws");
  });

  it("survives a name that is not URL-safe", () => {
    const name = "señor & co?x=1";
    expect(
      presenceName(new URL(presenceUpgrade({ id: 3, name }, null).url)),
    ).toBe(name);
  });
});

describe("the socket attachment", () => {
  it("round-trips what the DO knows about a socket", () => {
    const state = standing("sock-1", "tester", 1234);
    expect(readSocketState(socket(state))).toEqual(state);
  });

  it("reads a socket that is not one of ours as unknown, not as a crash", () => {
    expect(readSocketState(socket())).toBeNull();
    const bogus = socket();
    bogus.serializeAttachment({ id: "sock-1", name: "tester" });
    expect(readSocketState(bogus)).toBeNull();
  });

  it("reads a socket attached before messages existed as one that has not spoken", () => {
    // A deploy does not hang up on the sockets it inherits, so all three default —
    // an inherited socket is nobody in particular rather than one the DO stops
    // recognising.
    const old = socket();
    old.serializeAttachment({
      id: "sock-1",
      name: "tester",
      at: { x: 3, y: 4, facing: "down" },
      seenAt: 0,
    });
    expect(readSocketState(old)?.saidAt).toBeNull();
    expect(readSocketState(old)?.userId).toBeNull();
    expect(readSocketState(old)?.sprite).toBeNull();
  });
});

describe("isPresent", () => {
  it("is true while a socket for that user is still reporting in", () => {
    const sockets = [socket(standing("sock-1", "tester", 0, 7))];
    expect(isPresent(sockets, 7, 0)).toBe(true);
    expect(isPresent(sockets, 7, PRESENCE_PING_MS)).toBe(true);
  });

  it("is false once they have gone quiet for the roster's own window", () => {
    const sockets = [socket(standing("sock-1", "tester", 0, 7))];
    expect(isPresent(sockets, 7, 3 * PRESENCE_PING_MS)).toBe(false);
  });

  it("is false for a user with no socket at all, and for somebody else's", () => {
    expect(isPresent([], 7, 0)).toBe(false);
    expect(isPresent([socket(standing("sock-1", "rival", 0, 8))], 7, 0)).toBe(
      false,
    );
    expect(isPresent([socket(standing("sock-2", null))], 7, 0)).toBe(false);
    expect(isPresent([socket()], 7, 0)).toBe(false);
  });

  it("is true if ANY of that user's sockets is still reporting in", () => {
    const sockets = [
      socket(standing("sock-1", "tester", 0, 7)),
      socket(standing("sock-2", "tester", 3 * PRESENCE_PING_MS, 7)),
    ];
    expect(isPresent(sockets, 7, 3 * PRESENCE_PING_MS)).toBe(true);
  });

  it("does not require them to be standing anywhere", () => {
    const watching = socket();
    watching.serializeAttachment({
      id: "sock-1",
      name: "tester",
      userId: 7,
      at: null,
      seenAt: 0,
      saidAt: null,
    });
    expect(isPresent([watching], 7, 0)).toBe(true);
  });
});

describe("playerOf", () => {
  it("shows a signed-in socket that has said where it is", () => {
    expect(playerOf(standing("sock-1", "tester"), 0)).toEqual({
      id: "sock-1",
      name: "tester",
      sprite: null,
      x: 3,
      y: 4,
      facing: "down",
    });
  });

  it("shows what they are wearing, and never who they are", () => {
    const player = playerOf(standing("sock-1", "tester", 0, UID, SPRITE), 0);
    expect(player?.sprite).toBe(SPRITE);
    expect(player).not.toHaveProperty("userId");
  });

  it("shows nothing for a spectator, however much they announce", () => {
    expect(playerOf(standing("sock-2", null), 0)).toBeNull();
  });

  it("shows nothing until a socket has said where it is", () => {
    const state: SocketState = {
      id: "sock-3",
      name: "rival",
      userId: UID,
      sprite: null,
      at: null,
      seenAt: 0,
      saidAt: null,
    };
    expect(playerOf(state, 0)).toBeNull();
  });
});

describe("roster", () => {
  it("is rebuilt from the attachments, which is what hibernation keeps", () => {
    const players = roster(
      [
        socket(standing("sock-1", "tester")),
        socket(standing("sock-2", "rival")),
        socket(standing("sock-3", null)),
        socket(),
      ],
      0,
    );
    expect(players.map((player) => player.name)).toEqual(["tester", "rival"]);
  });

  it("carries each person's sprite, so a screen can draw them as themselves", () => {
    const players = roster(
      [
        socket(standing("sock-1", "tester", 0, UID, SPRITE)),
        socket(standing("sock-2", "rival", 0, 43)),
      ],
      0,
    );
    expect(players.map((player) => player.sprite)).toEqual([SPRITE, null]);
  });

  it("leaves out a ghost, so a newcomer never sees one", () => {
    const players = roster(
      [
        socket(standing("sock-1", "tester", 4 * PRESENCE_PING_MS)),
        socket(standing("sock-2", "rival", 0)),
      ],
      4 * PRESENCE_PING_MS,
    );
    expect(players.map((player) => player.name)).toEqual(["tester"]);
  });
});
