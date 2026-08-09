import { Hono } from "hono";
import type { AppEnv } from "../env";
import { storeAvatar } from "../lib/avatar";
import { pushSprite } from "../lib/broadcast";
import { getDb } from "../lib/db";
import { readImageFile } from "../lib/image-upload";
import { spriteUrl } from "./sprites";

// The state is otherwise UNREACHABLE: with no GEMINI_API_KEY_PAID `POST /api/avatar` always
// answers "offline", so a player WEARING a sprite — and the draw-time key-out and leg
// tint — could never be seen. Everything else stays real, and it spends no quota.
export const testAvatarRoute = new Hono<AppEnv>();

testAvatarRoute.post("/", async (c) => {
  const upload = readImageFile(await c.req.formData(), "sprite");
  if ("error" in upload) {
    return c.json({ error: upload.error }, 400);
  }
  const user = c.get("user");
  const key = await storeAvatar(c.env, getDb(c.env), user.id, {
    bytes: new Uint8Array(await upload.file.arrayBuffer()),
    contentType: upload.file.type,
  });
  await pushSprite(c.env, user.id, spriteUrl(key));
  return c.json({ ok: true });
});
