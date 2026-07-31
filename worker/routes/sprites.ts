import { Hono } from "hono";
import type { AppEnv } from "../env";
import { findAvatarByKey } from "../lib/avatar";
import { base64ToBytes } from "../lib/bytes";
import { getDb } from "../lib/db";

export const spriteRoutes = new Hono<AppEnv>();

export const SPRITE_PATH = "/api/sprites";

export function spriteUrl(key: string): string {
  return `${SPRITE_PATH}/${key}`;
}

spriteRoutes.get("/:key", async (c) => {
  const sprite = await findAvatarByKey(getDb(c.env), c.req.param("key"));
  if (sprite === null) {
    return c.json({ error: "Not found" }, 404);
  }
  return new Response(base64ToBytes(sprite.data), {
    headers: {
      "Content-Type": sprite.contentType,
      // The key IS the version, so no `?v=`: these are the only bytes this URL
      // will ever serve.
      "Cache-Control": "private, max-age=31536000, immutable",
      ETag: `"sprite-${c.req.param("key")}"`,
    },
  });
});
