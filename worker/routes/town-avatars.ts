import { Hono } from "hono";
import { townAvatarsSchema } from "../../shared/api";
import type { AppEnv } from "../env";
import { townSprites } from "../lib/avatar";
import { getDb } from "../lib/db";
import { spriteUrl } from "./sprites";

// NOT in `spriteRoutes`: that router answers "which bytes?" and refuses "whose
// sprite?", and this pairs a name with every key that name has ever drawn. Wider than
// the presence roster, which pairs a name only with what somebody is wearing — a
// widening the ticket took deliberately, and it goes one way only.
export const townAvatarRoutes = new Hono<AppEnv>();

townAvatarRoutes.get("/", async (c) => {
  const rows = await townSprites(getDb(c.env));
  const players = new Map<
    number,
    { user: { id: number; name: string }; sprites: unknown[] }
  >();
  for (const row of rows) {
    // The query already orders by name then newest-first, so first sight of a player
    // fixes their place in the list and each group keeps that order.
    const group = players.get(row.userId) ?? {
      user: { id: row.userId, name: row.userName },
      sprites: [],
    };
    // A player who has never been drawn arrives on ONE row with no key: they stand in
    // the crowd on an empty group rather than not standing at all.
    if (row.id !== null && row.key !== null) {
      group.sprites.push({
        id: row.id,
        url: spriteUrl(row.key),
        worn: row.worn,
      });
    }
    players.set(row.userId, group);
  }
  return c.json(townAvatarsSchema.parse({ players: [...players.values()] }));
});
