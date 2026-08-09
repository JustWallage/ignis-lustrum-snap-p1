import { Hono } from "hono";
import type { AppEnv } from "../env";
import { findAvatarByKey } from "../lib/avatar";
import { getDb } from "../lib/db";
import { readImage, spriteObjectKey } from "../lib/images";

export const spriteRoutes = new Hono<AppEnv>();

export const SPRITE_PATH = "/api/sprites";

export function spriteUrl(key: string): string {
  return `${SPRITE_PATH}/${key}`;
}

spriteRoutes.get("/:key", async (c) => {
  const key = c.req.param("key");
  const sprite = await findAvatarByKey(getDb(c.env), key);
  if (sprite === null) {
    return c.json({ error: "Not found" }, 404);
  }
  const bytes = await readImage(c.env, spriteObjectKey(c.env, key));
  if (bytes === null) {
    return c.json({ error: "Not found" }, 404);
  }
  return new Response(bytes, {
    headers: {
      "Content-Type": sprite.contentType,
      // The key IS the version, so no `?v=`: these are the only bytes this URL
      // will ever serve.
      "Cache-Control": "private, max-age=31536000, immutable",
      ETag: `"sprite-${key}"`,
    },
  });
});
