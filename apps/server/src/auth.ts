import { randomBytes } from "node:crypto";
import { createRequire } from "node:module";

// vendored wasm-pack nodejs build (CJS)
const require = createRequire(import.meta.url);
const wasm = require("@world/blockle-wasm-node") as {
  verify(publicHex: string, msg: string, sigHex: string): boolean;
  address_from_pubkey(publicHex: string): string;
};

const CHALLENGE_TTL_MS = 5 * 60_000;
const SESSION_TTL_MS = 24 * 3_600_000;

const challenges = new Map<string, { nonce: string; exp: number }>();
const sessions = new Map<string, { address: string; exp: number }>();

function sweep() {
  const now = Date.now();
  for (const [k, v] of challenges) if (v.exp < now) challenges.delete(k);
  for (const [k, v] of sessions) if (v.exp < now) sessions.delete(k);
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
  const token = randomBytes(32).toString("hex");
  sessions.set(token, { address, exp: Date.now() + SESSION_TTL_MS });
  return token;
}

export function sessionAddress(token: unknown): string | null {
  if (typeof token !== "string") return null;
  const s = sessions.get(token);
  if (!s || s.exp < Date.now()) return null;
  return s.address;
}

const HEX = /^[0-9a-f]+$/;
export function looksLikeAddress(v: unknown): v is string {
  return typeof v === "string" && v.startsWith("block1") && v.length > 20 && v.length < 128;
}
export function looksLikeHex(v: unknown, maxLen: number): v is string {
  return typeof v === "string" && v.length <= maxLen && HEX.test(v);
}
