import { z } from "zod";

// PBKDF2 password hashing + HS256 JWT sessions, Web Crypto only. `scripts/seed.mjs`
// hashes with the SAME parameters, so offline-seeded rows verify at runtime.

const PBKDF2_ITERATIONS = 100000;
const encoder = new TextEncoder();

export async function hashPassword(
  password: string,
  salt?: string,
): Promise<{ hash: string; salt: string }> {
  const saltBytes = salt
    ? hexToBytes(salt)
    : crypto.getRandomValues(new Uint8Array(16));

  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: saltBytes,
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    keyMaterial,
    256,
  );

  return {
    hash: bytesToHex(new Uint8Array(derivedBits)),
    salt: bytesToHex(saltBytes),
  };
}

export async function verifyPassword(
  password: string,
  storedHash: string,
  storedSalt: string,
): Promise<boolean> {
  const { hash } = await hashPassword(password, storedSalt);
  return timingSafeEqual(hash, storedHash);
}

// Constant-time, so response timing does not leak how many leading characters of
// the hash matched.
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

// Renewed while still valid (`needsRenewal`) so nobody is logged out mid-event. NO
// server-side revocation: rotating JWT_SECRET is the only way to invalidate anything.
export const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;
const SESSION_RENEW_WHEN_REMAINING_SECONDS = 7 * 24 * 60 * 60;

export interface JwtPayload {
  userId: number;
  name: string;
}

export interface Session extends JwtPayload {
  exp: number;
}

export function needsRenewal(session: Session): boolean {
  return (
    session.exp - Math.floor(Date.now() / 1000) <
    SESSION_RENEW_WHEN_REMAINING_SECONDS
  );
}

const jwtBodySchema = z.object({
  userId: z.number(),
  name: z.string(),
  exp: z.number(),
});

export async function createJWT(
  payload: JwtPayload,
  secret: string,
): Promise<string> {
  if (!secret) throw new Error("JWT_SECRET is not configured");

  const header = { alg: "HS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const body = { ...payload, iat: now, exp: now + SESSION_TTL_SECONDS };

  const headerB64 = base64url(JSON.stringify(header));
  const bodyB64 = base64url(JSON.stringify(body));
  const signingInput = `${headerB64}.${bodyB64}`;

  const key = await importHmacKey(secret, "sign");
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(signingInput),
  );

  return `${signingInput}.${base64urlBytes(new Uint8Array(signature))}`;
}

export async function verifyJWT(
  token: string,
  secret: string,
): Promise<Session | null> {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const [headerB64, bodyB64, sigB64] = parts;
    if (
      headerB64 === undefined ||
      bodyB64 === undefined ||
      sigB64 === undefined
    )
      return null;

    const signingInput = `${headerB64}.${bodyB64}`;
    const key = await importHmacKey(secret, "verify");
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      base64urlToBytes(sigB64),
      encoder.encode(signingInput),
    );
    if (!valid) return null;

    const parsed = jwtBodySchema.safeParse(
      JSON.parse(new TextDecoder().decode(base64urlToBytes(bodyB64))),
    );
    if (!parsed.success) return null;
    if (parsed.data.exp < Math.floor(Date.now() / 1000)) return null;

    return {
      userId: parsed.data.userId,
      name: parsed.data.name,
      exp: parsed.data.exp,
    };
  } catch {
    return null;
  }
}

export function isAdmin(name: string, adminNames: string): boolean {
  return adminNames
    .split(",")
    .map((n) => n.trim())
    .filter((n) => n !== "")
    .includes(name);
}

function importHmacKey(
  secret: string,
  usage: "sign" | "verify",
): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    [usage],
  );
}

function base64url(input: string): string {
  return base64urlBytes(encoder.encode(input));
}

function base64urlBytes(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function base64urlToBytes(input: string): Uint8Array {
  const binary = atob(input.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  let hex = "";
  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, "0");
  }
  return hex;
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}
