/** Monster species, combat math, and per-region spawn tables. */
import type { SkillId } from "./skills.js";

export type CombatStyle = "melee" | "archery" | "magic";

export interface MonsterSpecies {
  id: string;
  name: string;
  /** which creature model renders it */
  model: string;
  level: number;
  maxHp: number;
  /** damage range per attack */
  dmin: number;
  dmax: number;
  attackMs: number;
  /** attack & defence ratings for hit rolls */
  attack: number;
  defence: number;
  aggroRadius: number; // 0 = passive until attacked
  speed: number; // m/s
  xp: number; // combat xp per kill (split by style)
  drops: { item: string; chance: number }[];
  respawnMs: number;
}

export const MONSTERS: Record<string, MonsterSpecies> = Object.fromEntries(
  (
    [
      { id: "vermin", name: "Giant Vermin", model: "vermin", level: 2, maxHp: 8, dmin: 0, dmax: 1, attackMs: 2400, attack: 2, defence: 1, aggroRadius: 0, speed: 2.4, xp: 12, drops: [{ item: "marsh_reed", chance: 0.3 }], respawnMs: 12_000 },
      { id: "goblin_scout", name: "Goblin Scout", model: "goblin", level: 5, maxHp: 14, dmin: 0, dmax: 2, attackMs: 2400, attack: 5, defence: 4, aggroRadius: 6, speed: 2.8, xp: 24, drops: [{ item: "copper_ore", chance: 0.25 }, { item: "alder_log", chance: 0.2 }], respawnMs: 16_000 },
      { id: "wolf", name: "Grey Wolf", model: "wolf", level: 9, maxHp: 22, dmin: 1, dmax: 3, attackMs: 2000, attack: 9, defence: 7, aggroRadius: 8, speed: 3.6, xp: 40, drops: [{ item: "marsh_reed", chance: 0.2 }], respawnMs: 20_000 },
      { id: "goblin_brute", name: "Goblin Brute", model: "goblin_brute", level: 14, maxHp: 35, dmin: 1, dmax: 5, attackMs: 2800, attack: 14, defence: 12, aggroRadius: 7, speed: 2.6, xp: 68, drops: [{ item: "iron_ore", chance: 0.3 }, { item: "coal", chance: 0.15 }], respawnMs: 25_000 },
      { id: "bandit", name: "Roadside Bandit", model: "bandit", level: 18, maxHp: 44, dmin: 2, dmax: 6, attackMs: 2400, attack: 18, defence: 16, aggroRadius: 9, speed: 3.0, xp: 90, drops: [{ item: "ember_log", chance: 0.25 }, { item: "iron_ore", chance: 0.2 }], respawnMs: 30_000 },
      { id: "skeleton", name: "Barrow Skeleton", model: "skeleton", level: 24, maxHp: 58, dmin: 2, dmax: 8, attackMs: 2600, attack: 24, defence: 22, aggroRadius: 8, speed: 2.7, xp: 130, drops: [{ item: "coal", chance: 0.3 }, { item: "willow_log", chance: 0.15 }], respawnMs: 35_000 },
      { id: "cave_spider", name: "Gloam Spider", model: "spider", level: 30, maxHp: 70, dmin: 3, dmax: 9, attackMs: 2200, attack: 30, defence: 26, aggroRadius: 9, speed: 3.4, xp: 180, drops: [{ item: "mithril_ore", chance: 0.12 }], respawnMs: 40_000 },
      { id: "cave_bat", name: "Gloam Bat", model: "cave_bat", level: 20, maxHp: 30, dmin: 1, dmax: 4, attackMs: 1800, attack: 20, defence: 14, aggroRadius: 10, speed: 4.2, xp: 95, drops: [{ item: "coal", chance: 0.3 }], respawnMs: 25_000 },
      { id: "dark_acolyte", name: "Dark Acolyte", model: "acolyte", level: 38, maxHp: 85, dmin: 4, dmax: 11, attackMs: 3000, attack: 38, defence: 32, aggroRadius: 10, speed: 2.8, xp: 260, drops: [{ item: "runestone", chance: 0.1 }, { item: "yew_log", chance: 0.18 }], respawnMs: 50_000 },
      { id: "barrow_king", name: "The Barrow King", model: "barrow_king", level: 40, maxHp: 320, dmin: 5, dmax: 14, attackMs: 2800, attack: 42, defence: 36, aggroRadius: 12, speed: 2.9, xp: 900, drops: [{ item: "runic_bar", chance: 0.5 }, { item: "adamant_bar", chance: 0.8 }, { item: "mithril_bar", chance: 1.0 }], respawnMs: 300_000 },
      { id: "troll", name: "Moor Troll", model: "troll", level: 48, maxHp: 130, dmin: 6, dmax: 15, attackMs: 3400, attack: 48, defence: 44, aggroRadius: 9, speed: 2.4, xp: 450, drops: [{ item: "adamant_ore", chance: 0.25 }, { item: "mithril_ore", chance: 0.3 }], respawnMs: 90_000 },
    ] as MonsterSpecies[]
  ).map((m) => [m.id, m]),
);

/** monsters per 64m chunk by region */
export const REGION_MONSTERS: Record<string, Record<string, number>> = {
  greywater: { vermin: 0.6, wolf: 0.4 },
  barrowfields: { skeleton: 1.0, vermin: 0.5, bandit: 0.4 },
  mistmarsh: { vermin: 1.0, goblin_scout: 0.6 },
  thornfell: { goblin_scout: 0.9, wolf: 0.6, vermin: 0.5 },
  hearthmere: { vermin: 0.5, goblin_scout: 0.3 },
  gloamdeep: { goblin_brute: 0.8, cave_spider: 0.5, goblin_scout: 0.5 },
  emberwood: { wolf: 0.8, bandit: 0.6 },
  sunfall: { vermin: 0.7, goblin_scout: 0.4 },
  highcrag: { troll: 0.35, cave_spider: 0.6, goblin_brute: 0.5 },
  veyras_ruin: { dark_acolyte: 0.8, skeleton: 0.7 },
  worldspine_w: {},
  worldspine_e: {},
};

// ---- combat math (RS-flavored) ---------------------------------------------

export const PLAYER_BASE_HP = 30;
export const HP_PER_DEFENCE = 1.5;
export const GCD_MS = 1200;
export const PLAYER_ATTACK_MS = 2400;
export const MELEE_RANGE = 1.6;
export const ARCHERY_RANGE = 9;
export const MAGIC_RANGE = 8;

export function styleSkill(style: CombatStyle): SkillId {
  return style === "melee" ? "attack" : style === "archery" ? "archery" : "magic";
}

export function maxHpForDefence(defLevel: number): number {
  return Math.floor(PLAYER_BASE_HP + defLevel * HP_PER_DEFENCE);
}

export function hitChance(attack: number, defence: number): number {
  return Math.max(0.15, Math.min(0.9, 0.55 + (attack - defence) * 0.02));
}

export function playerDamage(styleLevel: number): { min: number; max: number } {
  return { min: 1, max: 2 + Math.floor(styleLevel * 0.28) };
}

export function rollDamage(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

export const STYLE_RANGE: Record<CombatStyle, number> = {
  melee: MELEE_RANGE,
  archery: ARCHERY_RANGE,
  magic: MAGIC_RANGE,
};
