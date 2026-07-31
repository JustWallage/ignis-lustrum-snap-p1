import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { avatarCapsSchema } from "../../shared/api";
import { DEFAULT_AVATAR_CAPS } from "./avatar-caps";

const rowSchema = z.object({ key: z.string(), value: z.int() });

async function seeded(): Promise<Record<string, number>> {
  const { results } = await env.DB.prepare(
    "SELECT key, value FROM settings ORDER BY key",
  ).all();
  return Object.fromEntries(
    results.map((row) => {
      const parsed = rowSchema.parse(row);
      return [parsed.key, parsed.value];
    }),
  );
}

describe("the stored avatar caps", () => {
  // Migration 0012 spells these two numbers in SQL because a migration cannot import
  // TypeScript, and nothing else would notice the copies drifting: a fresh database
  // would open on one pair of caps and `readAvatarCaps`' fallback answer another.
  it("opens every database on the defaults the code falls back to", async () => {
    expect(await seeded()).toEqual({
      avatar_daily_limit: DEFAULT_AVATAR_CAPS.limit,
      avatar_town_daily_limit: DEFAULT_AVATAR_CAPS.townLimit,
    });
  });

  it("is a pair the wire accepts", () => {
    expect(avatarCapsSchema.parse(DEFAULT_AVATAR_CAPS)).toEqual(
      DEFAULT_AVATAR_CAPS,
    );
  });
});
