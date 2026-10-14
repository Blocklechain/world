import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { createRequire } from "node:module";

// vendored wasm-pack nodejs build (CJS)
const require = createRequire(import.meta.url);
const wasm = require("@world/blockle-wasm-node") as {
  verify(publicHex: string, msg: string, sigHex: string): boolean;
  address_from_pubkey(publicHex: string): string;
};

const CHALLENGE_TTL_MS = 5 * 60_000;
const SESSION_TTL_MS = 7 * 24 * 3_600_000;

// stateless HMAC tokens: logins survive server restarts
const TOKEN_KEY = createHash("sha256")
  .update("world-session:" + (process.env.WORLD_KEYSTORE_SECRET ?? "dev-only-keystore-secret"))
  .digest();

const challenges = new Map<string, { nonce: string; exp: number }>();

function sweep() {
  const now = Date.now();
  for (const [k, v] of challenges) if (v.exp < now) challenges.delete(k);
}
setInterval(sweep, 60_000).unref();

export function loginMessage(nonce: string): string {
  return `WORLD sign-in\nnonce: ${nonce}`;
}

export function makeChallenge(address: string): { nonce: string; message: string } {
  const nonce = randomBytes(16).toString("hex");
  challenges.set(address, { nonce, exp: Date.now() + CHALLENGE_TTL_MS });
  return { nonce, message: loginMessage(nonce) };
}

/** Verify a signed challenge; returns a session token or null. */
export function verifyChallenge(address: string, publicKey: string, signature: string): string | null {
  const ch = challenges.get(address);
  if (!ch || ch.exp < Date.now()) return null;
  challenges.delete(address); // single use
  let derived: string;
  try {
    derived = wasm.address_from_pubkey(publicKey);
  } catch {
    return null;
  }
  if (derived !== address) return null;
  if (!wasm.verify(publicKey, loginMessage(ch.nonce), signature)) return null;
  return createSession(address);
}

export function createSession(address: string): string {
  const exp = Date.now() + SESSION_TTL_MS;
  const body = `${address}.${exp}`;
  const mac = createHmac("sha256", TOKEN_KEY).update(body).digest("base64url");
  return Buffer.from(body).toString("base64url") + "." + mac;
}

export function sessionAddress(token: unknown): string | null {
  if (typeof token !== "string") return null;
  const dot = token.lastIndexOf(".");
  if (dot < 0) return null;
  let body: string;
  try {
    body = Buffer.from(token.slice(0, dot), "base64url").toString("utf8");
  } catch {
    return null;
  }
  const mac = createHmac("sha256", TOKEN_KEY).update(body).digest("base64url");
  const given = token.slice(dot + 1);
  if (mac.length !== given.length || !timingSafeEqual(Buffer.from(mac), Buffer.from(given))) return null;
  const sep = body.lastIndexOf(".");
  const address = body.slice(0, sep);
  const exp = Number(body.slice(sep + 1));
  if (!Number.isFinite(exp) || exp < Date.now()) return null;
  return address;
}

const HEX = /^[0-9a-f]+$/;
export function looksLikeAddress(v: unknown): v is string {
  return typeof v === "string" && v.startsWith("block1") && v.length > 20 && v.length < 128;
}
export function looksLikeHex(v: unknown, maxLen: number): v is string {
  return typeof v === "string" && v.length <= maxLen && HEX.test(v);
}
