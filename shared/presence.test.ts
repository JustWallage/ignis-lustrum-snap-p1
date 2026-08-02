import { describe, expect, it } from "vitest";
import { MAP_H, MAP_W } from "./map";
import {
  isPresenceStale,
  isPresenceTooSoon,
  isSayTooSoon,
  isTalkOver,
  isTalkTooSoon,
  MESSAGE_MAX_CHARS,
  presenceFrameSchema,
  presenceMoveSchema,
  presencePlayerSchema,
  presenceSaySchema,
  PRESENCE_PING_MS,
  TALK_MAX_MS,
} from "./presence";

const STANDING = { type: "presence", x: 4, y: 4, facing: "down" };

describe("presenceMoveSchema", () => {
  it("takes a position and a facing, and nothing about identity", () => {
    expect(presenceMoveSchema.parse(STANDING)).toEqual(STANDING);
    expect(
      presenceMoveSchema.parse({ ...STANDING, name: "somebody-else", id: "1" }),
    ).toEqual(STANDING);
    expect(
      presenceMoveSchema.parse({
        ...STANDING,
        sprite: "/api/sprites/0123456789abcdef",
      }),
    ).toEqual(STANDING);
  });

  it("refuses a position that is not on the map", () => {
    for (const off of [
      { x: -1, y: 4 },
      { x: MAP_W, y: 4 },
      { x: 4, y: MAP_H },
      { x: 1.5, y: 4 },
    ]) {
      expect(
        presenceMoveSchema.safeParse({ ...STANDING, ...off }).success,
        `${off.x}/${off.y} should not be a place to stand`,
      ).toBe(false);
    }
  });

  it("refuses a facing that is not one of the four", () => {
    expect(
      presenceMoveSchema.safeParse({ ...STANDING, facing: "sideways" }).success,
    ).toBe(false);
  });
});

describe("presenceSaySchema", () => {
  const SAYING = { type: "say", text: "MEET ME BY THE POND" };

  it("takes text and nothing about identity", () => {
    expect(presenceSaySchema.parse(SAYING)).toEqual(SAYING);
    expect(
      presenceSaySchema.parse({ ...SAYING, name: "somebody-else", id: "1" }),
    ).toEqual(SAYING);
  });

  it("refuses a message nothing could paint", () => {
    for (const text of ["", "   ", "\n\t"]) {
      expect(
        presenceSaySchema.safeParse({ type: "say", text }).success,
        `"${text}" should not be something to say`,
      ).toBe(false);
    }
  });

  it("refuses a message longer than a bubble could ever hold", () => {
    expect(
      presenceSaySchema.safeParse({
        type: "say",
        text: "A".repeat(MESSAGE_MAX_CHARS),
      }).success,
    ).toBe(true);
    expect(
      presenceSaySchema.safeParse({
        type: "say",
        text: "A".repeat(MESSAGE_MAX_CHARS + 1),
      }).success,
    ).toBe(false);
  });
});

describe("presenceFrameSchema", () => {
  it("is the whole inbound surface, and only these two frames", () => {
    expect(presenceFrameSchema.parse(STANDING).type).toBe("presence");
    expect(presenceFrameSchema.parse({ type: "say", text: "HI" }).type).toBe(
      "say",
    );
    for (const frame of [
      { type: "presence_said", id: "sock-1", text: "HI" },
      { type: "shout", text: "HI" },
      { type: "presence" },
    ]) {
      expect(
        presenceFrameSchema.safeParse(frame).success,
        `${frame.type} is not something a client may send`,
      ).toBe(false);
    }
  });
});

describe("isSayTooSoon", () => {
  it("lets somebody who has never spoken speak", () => {
    expect(isSayTooSoon(null, 0)).toBe(false);
  });

  it("drops a message nothing but a script could have typed that fast", () => {
    expect(isSayTooSoon(0, 50)).toBe(true);
    expect(isSayTooSoon(0, 999)).toBe(true);
  });

  it("lets a second sentence through a second later", () => {
    expect(isSayTooSoon(0, 1_000)).toBe(false);
  });
});

describe("presencePlayerSchema", () => {
  const PLAYER = {
    id: "sock-1",
    name: "tester",
    x: 2,
    y: 5,
    facing: "left",
    sprite: null,
  };

  it("carries who somebody is, which the inbound frame does not", () => {
    expect(presencePlayerSchema.parse(PLAYER)).toEqual(PLAYER);
    expect(presencePlayerSchema.safeParse({ ...PLAYER, name: 7 }).success).toBe(
      false,
    );
  });

  it("requires the sprite field, whichever of its two answers it is", () => {
    const wearing = "/api/sprites/0123456789abcdef";
    expect(presencePlayerSchema.parse({ ...PLAYER, sprite: wearing })).toEqual({
      ...PLAYER,
      sprite: wearing,
    });
    const { sprite: _sprite, ...missing } = PLAYER;
    expect(presencePlayerSchema.safeParse(missing).success).toBe(false);
  });
});

describe("expiry", () => {
  it("keeps somebody who is still repeating themselves", () => {
    expect(isPresenceStale(0, 2 * PRESENCE_PING_MS)).toBe(false);
  });

  it("expires a tab that stopped saying anything", () => {
    expect(isPresenceStale(0, 4 * PRESENCE_PING_MS)).toBe(true);
  });

  it("counts from the last thing heard, not from the connection", () => {
    const seenAt = 10 * PRESENCE_PING_MS;
    expect(isPresenceStale(seenAt, seenAt + PRESENCE_PING_MS)).toBe(false);
  });
});

describe("isPresenceTooSoon", () => {
  it("lets a real step through", () => {
    expect(isPresenceTooSoon(0, 170)).toBe(false);
  });

  it("drops a frame nothing but a script could have sent", () => {
    expect(isPresenceTooSoon(0, 0)).toBe(true);
    expect(isPresenceTooSoon(0, 16)).toBe(true);
  });
});

describe("the talk frames", () => {
  it("takes no identity, because the socket already knows whose it is", () => {
    expect(presenceFrameSchema.parse({ type: "talk_start" })).toEqual({
      type: "talk_start",
    });
    expect(
      presenceFrameSchema.parse({
        type: "talk_end",
        name: "somebody-else",
        id: "1",
      }),
    ).toEqual({ type: "talk_end" });
  });
});

describe("the channel lock", () => {
  const HELD = { since: 0, heardAt: 0 };

  it("holds while the speaker is still being heard", () => {
    expect(isTalkOver({ since: 0, heardAt: 4_000 }, 4_500)).toBe(false);
  });

  it("frees itself when a speaker goes silent, with nothing set to notice", () => {
    expect(isTalkOver({ since: 0, heardAt: 1_000 }, 2_500)).toBe(true);
  });

  it("frees itself at the maximum length however hard somebody holds", () => {
    const forever = { since: 0, heardAt: TALK_MAX_MS };
    expect(isTalkOver(forever, TALK_MAX_MS - 1)).toBe(false);
    expect(isTalkOver(forever, TALK_MAX_MS)).toBe(true);
  });

  it("is over at the silence boundary and not one tick before it", () => {
    expect(isTalkOver(HELD, 1_499)).toBe(false);
    expect(isTalkOver(HELD, 1_500)).toBe(true);
  });

  it("refuses a second press until the interval is out, from both sides", () => {
    expect(isTalkTooSoon(1_000, 1_799)).toBe(true);
    expect(isTalkTooSoon(1_000, 1_800)).toBe(false);
  });

  it("lets a first press through, having nothing to be too soon after", () => {
    expect(isTalkTooSoon(null, 0)).toBe(false);
  });
});
