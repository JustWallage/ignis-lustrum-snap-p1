import { asc, isNotNull } from "drizzle-orm";
import { Hono } from "hono";
import { users } from "../../db/schema";
import { townAvatarsSchema } from "../../shared/api";
import type { AppEnv } from "../env";
import { getDb } from "../lib/db";
import { spriteUrl } from "./sprites";

// NOT in `spriteRoutes`: that router answers "which bytes?" and refuses "whose
// sprite?", and this pairs a name with a key. No new leak — the presence roster
// already pairs the two for whoever is walking.
export const townAvatarRoutes = new Hono<AppEnv>();

townAvatarRoutes.get("/", async (c) => {
  const rows = await getDb(c.env)
    .select({ id: users.id, name: users.name, key: users.avatarKey })
    .from(users)
    .where(isNotNull(users.avatarKey))
    .orderBy(asc(users.name));
  return c.json(
    townAvatarsSchema.parse({
      avatars: rows.flatMap((row) =>
        row.key === null
          ? []
          : [{ user: { id: row.id, name: row.name }, url: spriteUrl(row.key) }],
      ),
    }),
  );
});
