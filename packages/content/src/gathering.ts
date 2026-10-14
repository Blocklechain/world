import type { SkillId } from "./skills.js";

export interface NodeSpecies {
  id: string;
  name: string;
  kind: "tree" | "rock" | "reed" | "flower";
  skill: SkillId;
  level: number;
  xp: number;
  item: string;
  /** chance the node depletes per successful gather */
  depleteChance: number;
  respawnMs: number;
  /** interaction radius (m) */
  radius: number;
}

export const NODE_SPECIES: Record<string, NodeSpecies> = Object.fromEntries(
  (
    [
      { id: "alderwood", name: "Alderwood tree", kind: "tree", skill: "woodcutting", level: 1, xp: 25, item: "alder_log", depleteChance: 1, respawnMs: 6_000, radius: 1.6 },
      { id: "emberbirch", name: "Emberbirch", kind: "tree", skill: "woodcutting", level: 15, xp: 38, item: "ember_log", depleteChance: 0.13, respawnMs: 14_000, radius: 1.6 },
      { id: "silverwillow", name: "Silverwillow", kind: "tree", skill: "woodcutting", level: 30, xp: 68, item: "willow_log", depleteChance: 0.13, respawnMs: 25_000, radius: 1.7 },
      { id: "duskyew", name: "Duskyew", kind: "tree", skill: "woodcutting", level: 45, xp: 175, item: "yew_log", depleteChance: 0.1, respawnMs: 55_000, radius: 1.8 },
      { id: "copper_rock", name: "Copper vein", kind: "rock", skill: "mining", level: 1, xp: 18, item: "copper_ore", depleteChance: 1, respawnMs: 4_500, radius: 1.5 },
      { id: "iron_rock", name: "Iron vein", kind: "rock", skill: "mining", level: 15, xp: 35, item: "iron_ore", depleteChance: 1, respawnMs: 9_000, radius: 1.5 },
      { id: "coal_rock", name: "Blackstone seam", kind: "rock", skill: "mining", level: 20, xp: 50, item: "coal", depleteChance: 1, respawnMs: 14_000, radius: 1.5 },
      { id: "mithril_rock", name: "Mithril vein", kind: "rock", skill: "mining", level: 40, xp: 80, item: "mithril_ore", depleteChance: 1, respawnMs: 35_000, radius: 1.5 },
      { id: "adamant_rock", name: "Adamant vein", kind: "rock", skill: "mining", level: 55, xp: 95, item: "adamant_ore", depleteChance: 1, respawnMs: 70_000, radius: 1.5 },
      { id: "rune_rock", name: "Runestone spire", kind: "rock", skill: "mining", level: 60, xp: 125, item: "runestone", depleteChance: 1, respawnMs: 120_000, radius: 1.6 },
      { id: "reeds", name: "Marsh reeds", kind: "reed", skill: "crafting", level: 1, xp: 15, item: "marsh_reed", depleteChance: 1, respawnMs: 8_000, radius: 1.4 },
      { id: "sunbloom_patch", name: "Sunbloom patch", kind: "flower", skill: "crafting", level: 10, xp: 22, item: "sunbloom", depleteChance: 1, respawnMs: 12_000, radius: 1.4 },
    ] as NodeSpecies[]
  ).map((s) => [s.id, s]),
);

export const GATHER_TICK_MS = 1_800;

/** Success chance per gather tick. */
export function gatherChance(level: number, req: number): number {
  return Math.max(0.3, Math.min(0.95, 0.4 + (level - req) * 0.022));
}

/** Per-region scatter tables: speciesId -> nodes per 64m chunk (expected). */
export const REGION_SCATTER: Record<string, Record<string, number>> = {
  greywater: { alderwood: 3.5, reeds: 3.0 },
  barrowfields: { alderwood: 2.0, copper_rock: 1.0, iron_rock: 0.7 },
  mistmarsh: { reeds: 6.5, silverwillow: 1.8, alderwood: 1.2 },
  thornfell: { alderwood: 10.0, emberbirch: 2.6, sunbloom_patch: 0.5 },
  hearthmere: { alderwood: 1.4, copper_rock: 1.2, sunbloom_patch: 0.3 },
  gloamdeep: { copper_rock: 2.4, iron_rock: 2.2, coal_rock: 1.4, alderwood: 0.7 },
  emberwood: { emberbirch: 7.0, silverwillow: 2.8, duskyew: 0.9, sunbloom_patch: 0.4 },
  sunfall: { sunbloom_patch: 4.5, alderwood: 3.0, emberbirch: 1.2 },
  highcrag: { mithril_rock: 1.6, adamant_rock: 0.9, rune_rock: 0.35, coal_rock: 1.2, iron_rock: 1.0 },
  veyras_ruin: { duskyew: 1.0, rune_rock: 0.25, silverwillow: 0.8 },
  worldspine_w: {},
  worldspine_e: {},
};
