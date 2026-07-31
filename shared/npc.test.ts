import { describe, expect, it } from "vitest";
import {
  capLine,
  capOptions,
  NPC_LINE_MAX,
  NPC_OPTION_MAX,
  NPC_OPTIONS_MAX,
  NPC_QUESTION_MAX,
  NPC_REACTION_MAX,
  NPC_SAID_MAX,
  NPC_TURNS_MAX,
  npcChatRequestSchema,
  npcChatResponseSchema,
  npcTurnSchema,
  recentTurns,
  type NpcTurn,
} from "./npc";

function turns(count: number): NpcTurn[] {
  return Array.from({ length: count }, (_, i) => ({
    role: i % 2 === 0 ? "player" : "npc",
    text: `line ${String(i)}`,
  }));
}

describe("a turn of conversation", () => {
  it("has exactly two roles, and neither of them is system", () => {
    expect(
      npcTurnSchema.safeParse({ role: "player", text: "hi" }).success,
    ).toBe(true);
    expect(npcTurnSchema.safeParse({ role: "npc", text: "hi" }).success).toBe(
      true,
    );
    for (const role of ["system", "user", "assistant", "developer"]) {
      expect(npcTurnSchema.safeParse({ role, text: "hi" }).success, role).toBe(
        false,
      );
    }
  });

  it("refuses an empty line and an enormous one", () => {
    expect(
      npcTurnSchema.safeParse({ role: "player", text: "  " }).success,
    ).toBe(false);
    expect(
      npcTurnSchema.safeParse({
        role: "player",
        text: "x".repeat(NPC_LINE_MAX + 1),
      }).success,
    ).toBe(false);
  });
});

describe("a chat request", () => {
  it("carries a message and whatever the browser remembers", () => {
    const parsed = npcChatRequestSchema.safeParse({
      message: "who won yesterday?",
      turns: turns(2),
    });
    expect(parsed.success).toBe(true);
  });

  it("refuses a request with no message at all", () => {
    expect(npcChatRequestSchema.safeParse({ turns: [] }).success).toBe(false);
    expect(
      npcChatRequestSchema.safeParse({ message: "", turns: [] }).success,
    ).toBe(false);
  });

  it("refuses a transcript nobody could have produced", () => {
    expect(
      npcChatRequestSchema.safeParse({ message: "hi", turns: turns(500) })
        .success,
    ).toBe(false);
  });

  it("caps the player's own line shorter than a transcript line", () => {
    expect(NPC_SAID_MAX).toBeLessThan(NPC_LINE_MAX);
    expect(
      npcChatRequestSchema.safeParse({
        message: "x".repeat(NPC_SAID_MAX),
        turns: [],
      }).success,
    ).toBe(true);
    expect(
      npcChatRequestSchema.safeParse({
        message: "x".repeat(NPC_SAID_MAX + 1),
        turns: [],
      }).success,
    ).toBe(false);
  });
});

describe("a turn of his", () => {
  const TURN = {
    reaction: "Oh, that one.",
    question: "Who took it?",
    options: ["No idea"],
    turns: [],
  };

  it("is a reaction, a question and one to three answers", () => {
    expect(npcChatResponseSchema.safeParse(TURN).success).toBe(true);
    expect(
      npcChatResponseSchema.safeParse({
        ...TURN,
        options: ["a", "b", "c"],
      }).success,
    ).toBe(true);
  });

  it("refuses a turn with nothing to press, and one with too much", () => {
    expect(
      npcChatResponseSchema.safeParse({ ...TURN, options: [] }).success,
    ).toBe(false);
    expect(
      npcChatResponseSchema.safeParse({
        ...TURN,
        options: Array.from({ length: NPC_OPTIONS_MAX + 1 }, () => "x"),
      }).success,
    ).toBe(false);
  });

  it("refuses a part that would not fit the screen it is going to", () => {
    for (const [field, max] of [
      ["reaction", NPC_REACTION_MAX],
      ["question", NPC_QUESTION_MAX],
    ] as const) {
      expect(
        npcChatResponseSchema.safeParse({
          ...TURN,
          [field]: "x".repeat(max + 1),
        }).success,
        field,
      ).toBe(false);
    }
    expect(
      npcChatResponseSchema.safeParse({
        ...TURN,
        options: ["x".repeat(NPC_OPTION_MAX + 1)],
      }).success,
    ).toBe(false);
  });
});

describe("capOptions", () => {
  it("flattens, cuts and drops what cannot be a button label", () => {
    expect(capOptions([" a  cat ", "", "   ", "a\ndog"])).toEqual([
      "a cat",
      "a dog",
    ]);
    expect(capOptions(["x".repeat(200)])[0]).toHaveLength(NPC_OPTION_MAX);
  });

  it("never hands back more answers than a turn may offer", () => {
    const many = capOptions(Array.from({ length: 20 }, (_, i) => `pick ${i}`));
    expect(many).toHaveLength(NPC_OPTIONS_MAX);
    expect(many[0]).toBe("pick 0");
  });

  it("hands back nothing when there was nothing usable", () => {
    expect(capOptions([])).toEqual([]);
    expect(capOptions(["", "  ", "\n"])).toEqual([]);
  });
});

describe("recentTurns", () => {
  it("keeps the tail, and only the tail", () => {
    const kept = recentTurns(turns(NPC_TURNS_MAX + 4));
    expect(kept).toHaveLength(NPC_TURNS_MAX);
    expect(kept[kept.length - 1]?.text).toBe(
      `line ${String(NPC_TURNS_MAX + 3)}`,
    );
    expect(kept[0]?.text).toBe("line 4");
  });

  it("leaves a short transcript alone", () => {
    expect(recentTurns(turns(3))).toHaveLength(3);
    expect(recentTurns([])).toEqual([]);
  });
});

describe("capLine", () => {
  it("cuts a reply to what a text box can hold", () => {
    expect(capLine("x".repeat(NPC_LINE_MAX + 50))).toHaveLength(NPC_LINE_MAX);
  });

  it("cuts to whatever cap the caller is enforcing", () => {
    expect(capLine("x".repeat(500), NPC_OPTION_MAX)).toHaveLength(
      NPC_OPTION_MAX,
    );
  });

  it("flattens the newlines and runs of space a model likes to write", () => {
    expect(capLine("  one\n\ntwo   three\t")).toBe("one two three");
  });
});
