import { env } from "cloudflare:workers";
import { getTableColumns } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { avatarSprites, comments } from "../db/schema";

/**
 * The backfill in `0015_avatar_history.sql` is HAND-WRITTEN — drizzle-kit generates the
 * DDL and knows nothing about moving data into it — and nothing in `pnpm check` reads a
 * migration at all. So this holds that SQL and `db/schema.ts` together the way
 * `prizes.test.ts` holds the seeded wheel and `SEED_PRIZES`: rename a column here and
 * the statement that has to fill it fails in this file rather than on deploy, where
 * fourteen people would lose the avatar they are wearing out of their own history.
 *
 * The pool hands the migrations to the test as `TEST_MIGRATIONS`, so what runs below is
 * the same text that will run against production, not a copy of it.
 */
function migrationQueries(tag: string): string[] {
  const found = (env.TEST_MIGRATIONS ?? []).find(
    (migration) => migration.name === `${tag}.sql`,
  );
  if (found === undefined) {
    throw new Error(`no migration named ${tag} reached the test pool`);
  }
  return found.queries;
}

function statementMatching(tag: string, pattern: RegExp): string {
  const found = migrationQueries(tag).find((query) => pattern.test(query));
  if (found === undefined) {
    throw new Error(`${tag} has no statement matching ${String(pattern)}`);
  }
  return found;
}

const BACKFILL = statementMatching(
  "0015_avatar_history",
  /insert into `avatar_sprites`/i,
);

const legacyRowSchema = z.object({
  user_id: z.int(),
  key: z.string(),
  content_type: z.string(),
  created_at: z.int(),
});

/** Puts `users` back into its pre-0015 shape, runs the migration's own statement, and
 * leaves the schema as it found it. */
async function backfillFrom(
  rows: { name: string; key: string | null; contentType: string | null }[],
): Promise<unknown[]> {
  await env.DB.exec("ALTER TABLE users ADD COLUMN avatar_content_type text");
  try {
    await env.DB.prepare("DELETE FROM avatar_sprites").run();
    await env.DB.prepare(
      "UPDATE users SET avatar_key = null, avatar_updated_at = null",
    ).run();
    for (const row of rows) {
      await env.DB.prepare(
        "UPDATE users SET avatar_key = ?, avatar_content_type = ?, avatar_updated_at = ? WHERE name = ?",
      )
        .bind(
          row.key,
          row.contentType,
          row.key === null ? null : 1700,
          row.name,
        )
        .run();
    }
    await env.DB.prepare(BACKFILL).run();
    const listed = await env.DB.prepare(
      "SELECT user_id, key, content_type, created_at FROM avatar_sprites ORDER BY id",
    ).all();
    return listed.results;
  } finally {
    await env.DB.exec("ALTER TABLE users DROP COLUMN avatar_content_type");
  }
}

describe("the avatar history backfill", () => {
  it("fills every column the schema declares", () => {
    const columns = Object.values(getTableColumns(avatarSprites))
      .map((column) => column.name)
      // `id` autoincrements, so it is the one column the backfill must NOT name.
      .filter((name) => name !== "id");
    const named = /insert into `avatar_sprites` \(([^)]+)\)/i.exec(
      BACKFILL,
    )?.[1];
    expect(named).toBeDefined();
    expect(
      (named ?? "")
        .split(",")
        .map((column) => column.trim().replaceAll("`", "")),
    ).toEqual(columns);
  });

  it("gives each dressed player their worn sprite as their first row", async () => {
    await env.DB.prepare(
      "INSERT OR IGNORE INTO users (name, password_hash, salt, created_at) VALUES ('tester', 'x', 'y', 0)",
    ).run();
    const results = await backfillFrom([
      { name: "tester", key: "abc123abc123abc1", contentType: "image/png" },
    ]);

    expect(results).toHaveLength(1);
    const row = legacyRowSchema.parse(results[0]);
    expect(row.key).toBe("abc123abc123abc1");
    expect(row.content_type).toBe("image/png");
    // The drawing's own time, not the deploy's: the gallery orders on it.
    expect(row.created_at).toBe(1700);
  });

  it("writes no row for a player on the default sprite", async () => {
    await env.DB.prepare(
      "INSERT OR IGNORE INTO users (name, password_hash, salt, created_at) VALUES ('tester', 'x', 'y', 0)",
    ).run();
    expect(await backfillFrom([])).toEqual([]);
  });

  it("stamps every existing comment as a comment on a photo", () => {
    const statement = statementMatching(
      "0015_avatar_history",
      /update `comments`/i,
    );
    const { subjectType, subjectId } = getTableColumns(comments);
    expect(statement).toContain(`\`${subjectType.name}\` = 'photo'`);
    expect(statement).toContain(`\`${subjectId.name}\` = \`photo_id\``);
    // 'photo' has to be one the column will actually accept.
    expect(subjectType.enumValues).toContain("photo");
  });
});
