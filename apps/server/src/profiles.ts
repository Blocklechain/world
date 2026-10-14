/** Player profiles: skills, inventory, bank. JSON-on-disk persistence for the
 * greybox phase; moves to Postgres with the custody ledger in M1/M3. */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { INVENTORY_SLOTS, freshSkills, type SkillXp } from "@world/content";

export interface Profile {
  address: string;
  name: string;
  skills: SkillXp;
  /** 28 slots, itemId or null */
  inv: (string | null)[];
  /** bank stacks: itemId -> count */
  bank: Record<string, number>;
  /** questId -> progress */
  quests: Record<string, { n: number; state: "active" | "done" | "claimed" }>;
  equipment: { weapon: string | null };
  pos?: { x: number; z: number };
}

const DATA_DIR = process.env.WORLD_DATA_DIR ?? join(process.cwd(), "data", "players");
mkdirSync(DATA_DIR, { recursive: true });

const cache = new Map<string, Profile>();
const dirty = new Set<string>();

function fileFor(address: string): string {
  return join(DATA_DIR, address.replace(/[^a-z0-9_:-]/gi, "_") + ".json");
}

export function loadProfile(address: string, name: string): Profile {
  let p = cache.get(address);
  if (p) return p;
  try {
    p = JSON.parse(readFileSync(fileFor(address), "utf8")) as Profile;
    // forward-compat: fill missing fields
    p.skills = { ...freshSkills(), ...p.skills };
    p.inv = Array.from({ length: INVENTORY_SLOTS }, (_, i) => p!.inv?.[i] ?? null);
    p.bank ??= {};
    p.quests ??= {};
    p.equipment ??= { weapon: null };
  } catch {
    p = {
      address,
      name,
      skills: freshSkills(),
      inv: Array(INVENTORY_SLOTS).fill(null),
      bank: {},
      quests: {},
      equipment: { weapon: null },
    };
  }
  cache.set(address, p);
  return p;
}

export function touchProfile(address: string): void {
  dirty.add(address);
}

function flush(): void {
  for (const addr of dirty) {
    const p = cache.get(addr);
    if (!p) continue;
    if (addr.startsWith("guest:")) continue; // guests are session-only
    try {
      writeFileSync(fileFor(addr), JSON.stringify(p));
    } catch (err) {
      console.error("[profiles] save failed", addr, err);
    }
  }
  dirty.clear();
}
setInterval(flush, 2_500).unref();
process.on("exit", flush);

export function freeSlot(p: Profile): number {
  return p.inv.findIndex((s) => s === null);
}
