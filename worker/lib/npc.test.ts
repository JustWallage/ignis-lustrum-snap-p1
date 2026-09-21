import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { NPC_NAMES, type NpcKind } from "../../shared/npc";
import { seedUsersSchema } from "../routes/auth";
import { systemPrompt } from "./npc";

/** The credential blob the town's names come out of, read here ONLY so "and none of
 * the passwords" is an assertion about the same source the roster has. */
const seeded = seedUsersSchema.parse(
  JSON.parse(z.string().parse(env.USERS_JSON)),
);

const NAMES = seeded.map((entry) => entry.name);

const KINDS: readonly NpcKind[] = ["neighbour", "guide"];

const DAY = 3;

function promptFor(who: NpcKind, roster: readonly string[] = NAMES): string {
  return systemPrompt(who, { roster, day: DAY });
}

describe("every prompt", () => {
  it("names every friend in town", () => {
    expect(NAMES.length).toBeGreaterThan(1);
    for (const who of KINDS) {
      const prompt = promptFor(who);
      for (const name of NAMES) {
        expect(prompt, `${who}/${name}`).toContain(name);
      }
      expect(prompt, who).toMatch(/friends in town/i);
    }
  });

  it("carries no password from the blob those names came out of", () => {
    for (const who of KINDS) {
      const prompt = promptFor(who);
      for (const { password } of seeded) {
        expect(prompt, `${who}/${password}`).not.toContain(password);
      }
    }
  });

  it("drops the roster and nothing else when nobody can be read", () => {
    for (const who of KINDS) {
      const bare = promptFor(who, []);
      expect(bare, who).toContain(NPC_NAMES[who]);
      expect(bare, who).not.toMatch(/friends in town/i);
      expect(bare, who).not.toMatch(/brings that person up/i);
      for (const name of NAMES) {
        expect(bare, `${who}/${name}`).not.toContain(name);
      }
      const peopled = promptFor(who).split("\n");
      expect(peopled, who).toEqual(expect.arrayContaining(bare.split("\n")));
      expect(peopled, who).toHaveLength(bare.split("\n").length + 2);
    }
  });
});

describe("the neighbour's prompt", () => {
  it("keeps his medals out of the opening he leads with", () => {
    const prompt = promptFor("neighbour");
    expect(prompt).toMatch(/iglympics/i);
    expect(prompt).toMatch(/never as your opening/i);
    expect(prompt).toMatch(/do not steer the conversation onto any of that/i);
  });

  it("points him at what the player said, with a theory about it", () => {
    const prompt = promptFor("neighbour");
    expect(prompt).toMatch(/take what the player has just said/i);
    expect(prompt).toMatch(/rather than changing the subject/i);
    expect(prompt).toMatch(/conspiracy theorist/i);
  });

  it("tells him to wait until the player brings somebody up", () => {
    const prompt = promptFor("neighbour");
    expect(prompt).toMatch(/only when the player brings that person up/i);
    expect(prompt).toMatch(/never list them/i);
    expect(prompt).toMatch(/never invent a friend/i);
  });

  it("carries none of the trip: it is not his to answer for", () => {
    const prompt = promptFor("neighbour");
    expect(prompt).not.toMatch(/reisbriefing/i);
    expect(prompt).not.toMatch(/cartagena/i);
    expect(prompt).not.toMatch(/lustrumfiesta/i);
  });
});

describe("the guide's prompt", () => {
  it("tells him which day of the trip it is, and what is on it", () => {
    const prompt = promptFor("guide");
    expect(prompt).toContain(`VANDAAG is dag ${String(DAY)}`);
    expect(prompt).toMatch(/maandag 21-09-2026/);
    expect(prompt).toMatch(/Santo Domingo/);
  });

  it("moves that day with the town's clock", () => {
    const first = systemPrompt("guide", { roster: [], day: 1 });
    const last = systemPrompt("guide", { roster: [], day: 15 });
    expect(first).toContain("VANDAAG is dag 1");
    expect(first).toMatch(/KL8885/);
    expect(last).toContain("VANDAAG is dag 15");
    expect(last).toMatch(/KL8878/);
    // Both still carry the WHOLE itinerary: "and what about Friday" is the second
    // question every guide is asked.
    expect(first).toMatch(/KL8878/);
    expect(last).toMatch(/KL8885/);
  });

  it("says so rather than inventing a day past the last one", () => {
    const over = systemPrompt("guide", { roster: [], day: 99 });
    expect(over).toContain("Vandaag is dag 99");
    expect(over).toMatch(/zit er dus op/i);
    expect(over).not.toContain("VANDAAG is dag 99 van de reis");
  });

  it("carries the schedule, the logistics and the numbers behind them", () => {
    const prompt = promptFor("guide");
    for (const fact of [
      "Comuna 13",
      "AV8436",
      "La Guajira",
      "Tayrona",
      "Club de Pesca",
      "Check-Mig",
      "Katlyn",
      "+57 321 6328156",
      "Banco de Bogotá",
      "Los Patios Cartagena",
    ]) {
      expect(prompt, fact).toContain(fact);
    }
  });

  it("answers in Dutch and refuses to make a time up", () => {
    const prompt = promptFor("guide");
    expect(prompt).toMatch(/WRITE EVERY FIELD IN DUTCH/);
    expect(prompt).toMatch(/never invent a time/i);
    expect(prompt).toMatch(/from the briefing below and from nothing else/i);
    expect(prompt).toMatch(/whatsapp/i);
  });
});
