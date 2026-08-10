import { Hono } from "hono";
import { wearAvatarSchema } from "../../shared/api";
import type { AppEnv } from "../env";
import {
  clearAvatar,
  findAvatar,
  generateAvatar,
  quotaFor,
  wearSprite,
} from "../lib/avatar";
import { pushSprite } from "../lib/broadcast";
import { bytesToBase64 } from "../lib/bytes";
import { getDb, type Db } from "../lib/db";
import { readGameState } from "../lib/game-state";
import { parseJsonBody } from "../lib/http";
import { readImage, spriteObjectKey } from "../lib/images";
import { readImageFile } from "../lib/image-upload";
import { toAvatarState } from "../lib/serialize";
import { spriteUrl } from "./sprites";

export const avatarRoutes = new Hono<AppEnv>();

async function stateFor(db: Db, userId: number, day: number) {
  const [avatar, quota] = await Promise.all([
    findAvatar(db, userId),
    quotaFor(db, userId, day),
  ]);
  return toAvatarState({ updatedAt: avatar?.updatedAt ?? null, ...quota });
}

avatarRoutes.get("/", async (c) => {
  const db = getDb(c.env);
  const { day } = await readGameState(db);
  return c.json(await stateFor(db, c.get("user").id, day));
});

// `?v=` is the generation's timestamp, which the state's URL carries so a fresh
// sprite is never served out of the last one's immutable cache entry.
avatarRoutes.get("/image", async (c) => {
  const avatar = await findAvatar(getDb(c.env), c.get("user").id);
  if (avatar === null) {
    return c.json({ error: "Not found" }, 404);
  }
  const bytes = await readImage(c.env, spriteObjectKey(c.env, avatar.key));
  if (bytes === null) {
    return c.json({ error: "Not found" }, 404);
  }
  return new Response(bytes, {
    headers: {
      "Content-Type": avatar.contentType,
      "Cache-Control": "private, max-age=31536000, immutable",
      ETag: `"avatar-${String(avatar.updatedAt.getTime())}"`,
    },
  });
});

avatarRoutes.post("/", async (c) => {
  const user = c.get("user");
  const upload = readImageFile(await c.req.formData(), "photo");
  if ("error" in upload) {
    return c.json({ error: upload.error }, 400);
  }
  const db = getDb(c.env);
  const { day } = await readGameState(db);
  const attempt = await generateAvatar(c.env, db, user, day, {
    data: bytesToBase64(new Uint8Array(await upload.file.arrayBuffer())),
    contentType: upload.file.type,
  });
  if (!attempt.ok) {
    return c.json({ error: attempt.error }, attempt.status);
  }
  await pushSprite(c.env, user.id, spriteUrl(attempt.key));
  return c.json(await stateFor(db, user.id, day), 201);
});

avatarRoutes.post("/worn", async (c) => {
  const user = c.get("user");
  const parsed = wearAvatarSchema.safeParse(await parseJsonBody(c.req.raw));
  if (!parsed.success) {
    return c.json({ error: "Invalid request body" }, 400);
  }
  const db = getDb(c.env);
  const key = await wearSprite(db, user.id, parsed.data.id);
  if (key === null) {
    return c.json({ error: "Not found" }, 404);
  }
  await pushSprite(c.env, user.id, spriteUrl(key));
  const { day } = await readGameState(db);
  return c.json(await stateFor(db, user.id, day));
});

avatarRoutes.delete("/", async (c) => {
  const user = c.get("user");
  const db = getDb(c.env);
  const { day } = await readGameState(db);
  await clearAvatar(db, user.id);
  await pushSprite(c.env, user.id, null);
  return c.json(await stateFor(db, user.id, day));
});
