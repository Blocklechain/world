/** Crafting stations and recipes: smelt at the furnace, forge at the anvil,
 * cook at the hearth. Numbers are config, not gospel. */
import { SPAWN } from "./world.js";
import type { SkillId } from "./skills.js";

export type StationKind = "furnace" | "anvil" | "cookfire";

export interface Station {
  id: string;
  kind: StationKind;
  name: string;
  x: number;
  z: number;
  radius: number;
}

export const STATIONS: Station[] = [
  { id: "hearth_fire", kind: "cookfire", name: "The Hearth", x: SPAWN.x, z: SPAWN.z, radius: 3.4 },
  { id: "smithy_furnace", kind: "furnace", name: "Smithy furnace", x: SPAWN.x + 23.5, z: SPAWN.z + 3.5, radius: 4.2 },
  { id: "smithy_anvil", kind: "anvil", name: "Smithy anvil", x: SPAWN.x + 20.5, z: SPAWN.z - 1, radius: 4.2 },
];

export interface Recipe {
  id: string;
  station: StationKind;
  skill: SkillId;
  level: number;
  xp: number;
  inputs: Record<string, number>;
  output: string;
  verb: string;
}

export const RECIPES: Record<string, Recipe> = Object.fromEntries(
  (
    [
      // smelting
      { id: "smelt_copper", station: "furnace", skill: "smithing", level: 1, xp: 12, inputs: { copper_ore: 1 }, output: "copper_bar", verb: "Smelt" },
      { id: "smelt_iron", station: "furnace", skill: "smithing", level: 15, xp: 25, inputs: { iron_ore: 1, coal: 1 }, output: "iron_bar", verb: "Smelt" },
      { id: "smelt_steel", station: "furnace", skill: "smithing", level: 30, xp: 45, inputs: { iron_ore: 1, coal: 2 }, output: "steel_bar", verb: "Smelt" },
      { id: "smelt_mithril", station: "furnace", skill: "smithing", level: 40, xp: 60, inputs: { mithril_ore: 1, coal: 2 }, output: "mithril_bar", verb: "Smelt" },
      { id: "smelt_adamant", station: "furnace", skill: "smithing", level: 55, xp: 75, inputs: { adamant_ore: 1, coal: 3 }, output: "adamant_bar", verb: "Smelt" },
      { id: "smelt_runic", station: "furnace", skill: "smithing", level: 60, xp: 100, inputs: { runestone: 1, coal: 4 }, output: "runic_bar", verb: "Smelt" },
      // forging
      { id: "forge_copper_sword", station: "anvil", skill: "smithing", level: 1, xp: 25, inputs: { copper_bar: 2 }, output: "copper_sword", verb: "Forge" },
      { id: "forge_iron_sword", station: "anvil", skill: "smithing", level: 16, xp: 50, inputs: { iron_bar: 2 }, output: "iron_sword", verb: "Forge" },
      { id: "forge_steel_sword", station: "anvil", skill: "smithing", level: 31, xp: 90, inputs: { steel_bar: 2 }, output: "steel_sword", verb: "Forge" },
      { id: "forge_mithril_sword", station: "anvil", skill: "smithing", level: 41, xp: 130, inputs: { mithril_bar: 2 }, output: "mithril_sword", verb: "Forge" },
      { id: "forge_adamant_sword", station: "anvil", skill: "smithing", level: 56, xp: 170, inputs: { adamant_bar: 2 }, output: "adamant_sword", verb: "Forge" },
      { id: "forge_runic_sword", station: "anvil", skill: "smithing", level: 60, xp: 240, inputs: { runic_bar: 2 }, output: "runic_sword", verb: "Forge" },
      // armor (anvil)
      ...["copper", "iron", "steel", "mithril", "adamant", "runic"].flatMap((t, i) => {
        const lv = [1, 16, 31, 41, 56, 60][i]!;
        const bar = `${t}_bar`;
        return [
          { id: `forge_${t}_helm`, station: "anvil", skill: "smithing", level: lv + 2, xp: 20 + i * 28, inputs: { [bar]: 1 }, output: `${t}_helm`, verb: "Forge" },
          { id: `forge_${t}_platelegs`, station: "anvil", skill: "smithing", level: lv + 4, xp: 38 + i * 45, inputs: { [bar]: 2 }, output: `${t}_platelegs`, verb: "Forge" },
          { id: `forge_${t}_platebody`, station: "anvil", skill: "smithing", level: lv + 6, xp: 60 + i * 65, inputs: { [bar]: 3 }, output: `${t}_platebody`, verb: "Forge" },
        ];
      }),
      // cooking (rides the crafting skill in v1)
      { id: "cook_darter", station: "cookfire", skill: "crafting", level: 1, xp: 18, inputs: { silver_darter: 1 }, output: "cooked_darter", verb: "Roast" },
      { id: "cook_mudwhisker", station: "cookfire", skill: "crafting", level: 14, xp: 35, inputs: { mudwhisker: 1 }, output: "cooked_mudwhisker", verb: "Roast" },
      { id: "cook_emberfin", station: "cookfire", skill: "crafting", level: 32, xp: 70, inputs: { emberfin: 1 }, output: "cooked_emberfin", verb: "Roast" },
    ] as Recipe[]
  ).map((r) => [r.id, r]),
);

/** Weapon damage bonus by tier (added to max hit for melee). */
export function weaponBonus(tier: number): number {
  return tier * 2.5;
}

/** Armor rating from equipped head/body/legs tiers — raises effective defence. */
export function armorRating(tiers: number[]): number {
  return tiers.reduce((a, t) => a + t * 2, 0);
}
