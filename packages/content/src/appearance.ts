/** Character appearance: playable races, body types, hair and beards. */

export const RACES = ["human", "elf", "dwarf"] as const;
export const SEXES = ["m", "f"] as const;
export const HAIR_STYLES = ["bald", "short", "long", "pony"] as const;
export const HAIR_COLORS = ["black", "brown", "blonde", "red", "grey"] as const;
export const BEARDS = ["none", "short", "full"] as const;

export interface Appearance {
  race: (typeof RACES)[number];
  sex: (typeof SEXES)[number];
  hair: (typeof HAIR_STYLES)[number];
  hairColor: (typeof HAIR_COLORS)[number];
  beard: (typeof BEARDS)[number];
}

export const DEFAULT_APPEARANCE: Appearance = {
  race: "human",
  sex: "m",
  hair: "short",
  hairColor: "brown",
  beard: "none",
};

export function validAppearance(a: unknown): a is Appearance {
  if (!a || typeof a !== "object") return false;
  const o = a as Record<string, unknown>;
  return (
    RACES.includes(o.race as never) &&
    SEXES.includes(o.sex as never) &&
    HAIR_STYLES.includes(o.hair as never) &&
    HAIR_COLORS.includes(o.hairColor as never) &&
    BEARDS.includes(o.beard as never)
  );
}

/** Wire encoding carried in PlayerState so everyone renders everyone. */
export function encodeLook(a: Appearance): string {
  return [a.race, a.sex, a.hair, a.hairColor, a.beard].join(":");
}

export function decodeLook(s: string): Appearance {
  const [race, sex, hair, hairColor, beard] = s.split(":");
  const a = { race, sex, hair, hairColor, beard } as Appearance;
  return validAppearance(a) ? a : DEFAULT_APPEARANCE;
}

/** A deterministic fun look for guests, from any string id. */
export function randomLook(seed: string): Appearance {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  const pick = <T>(arr: readonly T[], n: number): T => arr[Math.abs(h >> n) % arr.length]!;
  const sex = pick(SEXES, 3);
  return {
    race: pick(RACES, 0),
    sex,
    hair: pick(HAIR_STYLES, 7),
    hairColor: pick(HAIR_COLORS, 11),
    beard: sex === "m" ? pick(BEARDS, 17) : "none",
  };
}
