/** Skill books: what each level unlocks, per skill — derived from content
 * tables plus curated entries for systems still landing. */
import { NODE_SPECIES } from "./gathering.js";
import { ITEMS } from "./items.js";
import { MONSTERS } from "./monsters.js";
import type { SkillId } from "./skills.js";

export interface Unlock {
  level: number;
  text: string;
}

const CURATED: Partial<Record<SkillId, Unlock[]>> = {
  attack: [
    { level: 1, text: "Melee combat — strike with blade or fist" },
    { level: 10, text: "Hit harder: damage grows with every level" },
    { level: 20, text: "Steel weapons (smith or trade for them)" },
    { level: 40, text: "Mithril weapons" },
    { level: 60, text: "Runic weapons" },
  ],
  defence: [
    { level: 1, text: "Each level adds to your health and dodge" },
    { level: 20, text: "Steel armor" },
    { level: 40, text: "Mithril armor" },
  ],
  archery: [
    { level: 1, text: "Ranged combat — attack from 9m away" },
    { level: 15, text: "Sharper aim: damage grows with level" },
  ],
  magic: [
    { level: 1, text: "Cast bolts of force from 8m away" },
    { level: 25, text: "Stronger bolts" },
  ],
  smithing: [
    { level: 1, text: "Smelt copper bars at a furnace (coming soon)" },
    { level: 15, text: "Iron bars" },
    { level: 30, text: "Steel bars" },
  ],
  crafting: [
    { level: 1, text: "Weave marsh reeds into cord" },
    { level: 10, text: "Press sunbloom dye" },
  ],
};

export function skillBook(skill: SkillId): Unlock[] {
  const out: Unlock[] = [...(CURATED[skill] ?? [])];
  for (const sp of Object.values(NODE_SPECIES)) {
    if (sp.skill !== skill) continue;
    const item = ITEMS[sp.item]?.name ?? sp.item;
    out.push({ level: sp.level, text: `${sp.name} — ${item} (${sp.xp} xp)` });
  }
  if (skill === "attack" || skill === "defence") {
    for (const m of Object.values(MONSTERS)) {
      if (m.level % 2 === 0) continue; // keep the list short
    }
  }
  return out.sort((a, b) => a.level - b.level);
}
