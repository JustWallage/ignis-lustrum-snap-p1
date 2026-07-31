import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { setCookie } from "hono/cookie";
import { z } from "zod";
import { users } from "../../db/schema";
import { loginSchema } from "../../shared/api";
import type { AppEnv } from "../env";
import { createJWT, hashPassword, verifyPassword } from "../lib/auth";
import { getDb } from "../lib/db";
import { parseJsonBody } from "../lib/http";
import { setSessionCookie } from "../lib/session";

export const authRoutes = new Hono<AppEnv>();

authRoutes.post("/login", async (c) => {
  const parsed = loginSchema.safeParse(await parseJsonBody(c.req.raw));
  if (!parsed.success) {
    return c.json({ error: "Name and password required" }, 400);
  }
  const db = getDb(c.env);
  const rows = await db
    .select()
    .from(users)
    .where(eq(users.name, parsed.data.name))
    .limit(1);
  const user = rows[0];
  if (
    user === undefined ||
    !(await verifyPassword(parsed.data.password, user.passwordHash, user.salt))
  ) {
    return c.json({ error: "Invalid credentials" }, 401);
  }
  const token = await createJWT(
    { userId: user.id, name: user.name },
    c.env.JWT_SECRET,
  );
  setSessionCookie(c, token);
  return c.json({ user: { id: user.id, name: user.name } });
});

authRoutes.post("/logout", (c) => {
  setCookie(c, "token", "", {
    httpOnly: true,
    secure: new URL(c.req.url).protocol === "https:",
    sameSite: "Lax",
    path: "/",
    maxAge: 0,
  });
  return c.json({ ok: true });
});

export const seedUsersSchema = z.array(
  z.object({ name: z.string().min(1), password: z.string().min(1) }),
);

authRoutes.post("/seed", async (c) => {
  const parsed = seedUsersSchema.safeParse(safeJsonParse(c.env.USERS_JSON));
  if (!parsed.success || parsed.data.length === 0) {
    return c.json({ error: "USERS_JSON is missing or invalid" }, 500);
  }
  const db = getDb(c.env);
  for (const entry of parsed.data) {
    const { hash, salt } = await hashPassword(entry.password);
    await db
      .insert(users)
      .values({
        name: entry.name,
        passwordHash: hash,
        salt,
        createdAt: new Date(),
      })
      .onConflictDoUpdate({
        target: users.name,
        set: { passwordHash: hash, salt },
      });
  }
  return c.json({ ok: true, seeded: parsed.data.length });
});

function safeJsonParse(value: string | undefined): unknown {
  if (value === undefined) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
