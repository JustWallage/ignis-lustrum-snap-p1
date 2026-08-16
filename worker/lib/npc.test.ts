import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { NPC_NAME } from "../../shared/npc";
import { seedUsersSchema } from "../routes/auth";
import { systemPrompt } from "./npc";

/** The credential blob the town's names come out of, read here ONLY so "and none of
 * the passwords" is an assertion about the same source the roster has. */
const seeded = seedUsersSchema.parse(
  JSON.parse(z.string().parse(env.USERS_JSON)),
);

const NAMES = seeded.map((entry) => entry.name);

describe("the neighbour's prompt", () => {
  it("names every friend in town", () => {
    const prompt = systemPrompt(NAMES);
    expect(NAMES.length).toBeGreaterThan(1);
    for (const name of NAMES) {
      expect(prompt, name).toContain(name);
    }
    expect(prompt).toMatch(/friends in town/i);
  });

  it("carries no password from the blob those names came out of", () => {
    const prompt = systemPrompt(NAMES);
    for (const { password } of seeded) {
      expect(prompt, password).not.toContain(password);
    }
  });

  it("keeps his medals out of the opening he leads with", () => {
    const prompt = systemPrompt(NAMES);
    expect(prompt).toMatch(/iglympics/i);
    expect(prompt).toMatch(/never as your opening/i);
    expect(prompt).toMatch(/do not steer the conversation onto any of that/i);
  });

  it("points him at what the player said, with a theory about it", () => {
    const prompt = systemPrompt(NAMES);
    expect(prompt).toMatch(/take what the player has just said/i);
    expect(prompt).toMatch(/rather than changing the subject/i);
    expect(prompt).toMatch(/conspiracy theorist/i);
  });

  it("tells him to wait until the player brings somebody up", () => {
    const prompt = systemPrompt(NAMES);
    expect(prompt).toMatch(/only when the player brings that person up/i);
    expect(prompt).toMatch(/never list them/i);
    expect(prompt).toMatch(/never invent a friend/i);
  });

  it("leaves him exactly as he was when the roster is empty", () => {
    const bare = systemPrompt([]);
    expect(bare).toContain(NPC_NAME);
    expect(bare).not.toMatch(/friends in town/i);
    expect(bare).not.toMatch(/brings that person up/i);
    for (const name of NAMES) {
      expect(bare, name).not.toContain(name);
    }
    const peopled = systemPrompt(NAMES).split("\n");
    expect(peopled).toEqual(expect.arrayContaining(bare.split("\n")));
    expect(peopled).toHaveLength(bare.split("\n").length + 2);
  });
});
