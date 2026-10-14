/** Email/password accounts with a custodial BLOCK wallet per account.
 *
 * Passwords: scrypt (node crypto). Wallet secrets: AES-256-GCM at rest under
 * WORLD_KEYSTORE_SECRET. JSON persistence for the greybox phase; Postgres
 * lands with the custody ledger.
 */
import { validAppearance, type Appearance } from "@world/content";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const wasm = require("@world/blockle-wasm-node") as {
  keygen(): string;
};

export interface Account {
  email: string;
  name: string;
  passSalt: string;
  passHash: string;
  address: string;
  publicKey: string;
  /** AES-256-GCM over the secret-key hex: iv.ct.tag (base64) */
  secretEnc: string;
  createdAt: number;
  appearance?: Appearance;
}

const FILE = process.env.WORLD_DATA_DIR
  ? join(process.env.WORLD_DATA_DIR, "..", "accounts.json")
  : join(process.cwd(), "data", "accounts.json");

const KEYSTORE_SECRET = process.env.WORLD_KEYSTORE_SECRET ?? "dev-only-keystore-secret";
if (!process.env.WORLD_KEYSTORE_SECRET && process.env.NODE_ENV === "production") {
  console.warn("[accounts] WORLD_KEYSTORE_SECRET not set — using the dev default. Set it!");
}
const KEK = createHash("sha256").update(KEYSTORE_SECRET).digest();

const accounts = new Map<string, Account>();
try {
  const arr = JSON.parse(readFileSync(FILE, "utf8")) as Account[];
  for (const a of arr) accounts.set(a.email, a);
} catch {
  /* first boot */
}

function save() {
  mkdirSync(dirname(FILE), { recursive: true });
  writeFileSync(FILE, JSON.stringify([...accounts.values()]));
}

function hashPassword(password: string, salt: Buffer): Buffer {
  return scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 });
}

function encryptSecret(secretHex: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", KEK, iv);
  const ct = Buffer.concat([cipher.update(secretHex, "utf8"), cipher.final()]);
  return `${iv.toString("base64")}.${ct.toString("base64")}.${cipher.getAuthTag().toString("base64")}`;
}

export function decryptSecret(a: Account): string {
  const [iv, ct, tag] = a.secretEnc.split(".").map((s) => Buffer.from(s, "base64"));
  const d = createDecipheriv("aes-256-gcm", KEK, iv!);
  d.setAuthTag(tag!);
  return Buffer.concat([d.update(ct!), d.final()]).toString("utf8");
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function register(
  email: string,
  password: string,
  name: string,
): { ok: true; account: Account } | { ok: false; error: string } {
  email = email.trim().toLowerCase();
  if (!EMAIL_RE.test(email) || email.length > 254) return { ok: false, error: "That email doesn't look right." };
  if (password.length < 8) return { ok: false, error: "Password must be at least 8 characters." };
  if (accounts.has(email)) return { ok: false, error: "An account with that email already exists." };
  name = name.trim().slice(0, 20);
  if (name.length < 2) return { ok: false, error: "Pick a name (2–20 characters)." };

  const kp = JSON.parse(wasm.keygen()) as { address: string; publicKey: string; secretKey: string };
  const salt = randomBytes(16);
  const account: Account = {
    email,
    name,
    passSalt: salt.toString("base64"),
    passHash: hashPassword(password, salt).toString("base64"),
    address: kp.address,
    publicKey: kp.publicKey,
    secretEnc: encryptSecret(kp.secretKey),
    createdAt: Date.now(),
  };
  accounts.set(email, account);
  save();
  return { ok: true, account };
}

export function login(email: string, password: string): Account | null {
  const a = accounts.get(email.trim().toLowerCase());
  if (!a) return null;
  const hash = hashPassword(password, Buffer.from(a.passSalt, "base64"));
  const stored = Buffer.from(a.passHash, "base64");
  if (hash.length !== stored.length || !timingSafeEqual(hash, stored)) return null;
  return a;
}

export function setAppearance(address: string, appearance: unknown): boolean {
  if (!validAppearance(appearance)) return false;
  const a = accountByAddress(address);
  if (!a) return false;
  a.appearance = appearance;
  save();
  return true;
}

export function accountByAddress(address: string): Account | null {
  for (const a of accounts.values()) if (a.address === address) return a;
  return null;
}
