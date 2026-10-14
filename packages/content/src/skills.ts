/** The eight skills of WORLD. XP by use; RuneScape-shaped exponential curve. */

export const SKILLS = [
  "attack",
  "defence",
  "archery",
  "magic",
  "mining",
  "woodcutting",
  "smithing",
  "crafting",
] as const;
export type SkillId = (typeof SKILLS)[number];

export const LEVEL_CAP = 60;

/** Cumulative XP required to reach `level` (level 1 = 0 XP). */
const XP_TABLE: number[] = (() => {
  const t = [0, 0]; // index by level, levels start at 1
  let points = 0;
  for (let lvl = 1; lvl < 99; lvl++) {
    points += Math.floor(lvl + 300 * Math.pow(2, lvl / 7));
    t.push(Math.floor(points / 4));
  }
  return t;
})();

export function xpForLevel(level: number): number {
  return XP_TABLE[Math.max(1, Math.min(level, XP_TABLE.length - 1))] ?? 0;
}

export function levelForXp(xp: number): number {
  let lvl = 1;
  while (lvl < LEVEL_CAP && xp >= xpForLevel(lvl + 1)) lvl++;
  return lvl;
}

export type SkillXp = Record<SkillId, number>;

export function freshSkills(): SkillXp {
  return Object.fromEntries(SKILLS.map((s) => [s, 0])) as SkillXp;
}
