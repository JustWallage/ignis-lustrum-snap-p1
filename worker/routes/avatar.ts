import { Hono } from "hono";
import type { AppEnv } from "../env";
import {
  clearAvatar,
  findAvatar,
  generateAvatar,
  quotaFor,
} from "../lib/avatar";
import { pushSprite } from "../lib/broadcast";
import { base64ToBytes, bytesToBase64 } from "../lib/bytes";
import { getDb } from "../lib/db";
import { readGameState } from "../lib/game-state";
import { readImageFile } from "../lib/image-upload";
import { toAvatarState } from "../lib/serialize";
import { spriteUrl } from "./sprites";

export const avatarRoutes = new Hono<AppEnv>();

avatarRoutes.get("/", async (c) => {
  const user = c.get("user");
  const db = getDb(c.env);
  const { day } = await readGameState(db);
  const [avatar, quota] = await Promise.all([
    findAvatar(db, user.id),
    quotaFor(db, user.id, day),
  ]);
  return c.json(
    toAvatarState({ updatedAt: avatar?.updatedAt ?? null, ...quota }),
  );
});

// `?v=` is the generation's timestamp, which the state's URL carries so a fresh
// sprite is never served out of the last one's immutable cache entry.
avatarRoutes.get("/image", async (c) => {
  const avatar = await findAvatar(getDb(c.env), c.get("user").id);
  if (avatar === null) {
    return c.json({ error: "Not found" }, 404);
  }
  return new Response(base64ToBytes(avatar.data), {
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
  const [avatar, quota] = await Promise.all([
    findAvatar(db, user.id),
    quotaFor(db, user.id, day),
  ]);
  return c.json(
    toAvatarState({ updatedAt: avatar?.updatedAt ?? null, ...quota }),
    201,
  );
});

avatarRoutes.delete("/", async (c) => {
  const user = c.get("user");
  const db = getDb(c.env);
  const { day } = await readGameState(db);
  await clearAvatar(db, user.id);
  await pushSprite(c.env, user.id, null);
  return c.json(
    toAvatarState({ updatedAt: null, ...(await quotaFor(db, user.id, day)) }),
  );
});
