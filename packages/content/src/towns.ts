/** Settlements: building placements and NPCs. The lore: survivors of fallen
 * Veyra cluster in Hearthmere and two outlying villages. */
import { SPAWN } from "./world.js";
import type { Appearance } from "./appearance.js";

export interface Building {
  kind: "house" | "house_stone" | "smithy" | "market_stall" | "well" | "wall_segment" | "gate_tower" | "lamp_post";
  x: number;
  z: number;
  yaw: number;
  scale: number;
}

export interface TownDef {
  id: string;
  name: string;
  x: number;
  z: number;
  buildings: Building[];
}

const H = SPAWN; // Hearthmere square

export interface Road {
  points: { x: number; z: number }[];
  width: number;
}

/** Road network: ribbons flattened into the terrain and painted as dirt. */
export const ROADS: Road[] = [
  // Hearthmere south gate -> Alderford
  { width: 4.5, points: [
    { x: H.x, z: H.z - 46 }, { x: H.x - 40, z: H.z - 20 }, { x: 460, z: 760 }, { x: 360, z: 800 }, { x: 330, z: 820 },
  ] },
  // Hearthmere -> Brightshear (north)
  { width: 4.5, points: [
    { x: H.x, z: H.z + 30 }, { x: H.x + 20, z: 1000 }, { x: 800, z: 1200 }, { x: 820, z: 1370 },
  ] },
  // Hearthmere east -> Gloamdeep cave road
  { width: 4.0, points: [
    { x: H.x + 28, z: H.z }, { x: 1000, z: 820 }, { x: 1180, z: 980 }, { x: 1225, z: 1012 },
  ] },
];

/** Distance from (x,z) to the nearest road centerline, and that road's width. */
export function roadInfluence(x: number, z: number): { dist: number; width: number } {
  let best = Infinity;
  let w = 0;
  for (const road of ROADS) {
    for (let i = 0; i < road.points.length - 1; i++) {
      const a = road.points[i]!;
      const b = road.points[i + 1]!;
      const d = _segDist(x, z, a.x, a.z, b.x, b.z);
      if (d < best) {
        best = d;
        w = road.width;
      }
    }
  }
  return { dist: best, width: w };
}

function _segDist(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax;
  const dz = bz - az;
  const len2 = dx * dx + dz * dz || 1;
  let t = ((px - ax) * dx + (pz - az) * dz) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), pz - (az + t * dz));
}

export const TOWNS: TownDef[] = [
  {
    id: "hearthmere",
    name: "Hearthmere",
    x: H.x,
    z: H.z,
    buildings: [
      // central plaza: well + market stalls + lamps
      { kind: "well", x: H.x, z: H.z + 6, yaw: 0, scale: 1 },
      { kind: "market_stall", x: H.x - 7, z: H.z + 4, yaw: 1.2, scale: 1 },
      { kind: "market_stall", x: H.x + 7, z: H.z + 5, yaw: -1.3, scale: 1 },
      { kind: "lamp_post", x: H.x - 4, z: H.z - 3, yaw: 0, scale: 1 },
      { kind: "lamp_post", x: H.x + 5, z: H.z - 3, yaw: 0, scale: 1 },
      { kind: "lamp_post", x: H.x - 5, z: H.z + 14, yaw: 0, scale: 1 },
      { kind: "lamp_post", x: H.x + 6, z: H.z + 14, yaw: 0, scale: 1 },
      // houses in a loose ring facing the plaza
      { kind: "house", x: H.x - 22, z: H.z - 16, yaw: 0.6, scale: 1 },
      { kind: "house", x: H.x - 28, z: H.z + 4, yaw: 1.7, scale: 1.1 },
      { kind: "house_stone", x: H.x - 20, z: H.z + 24, yaw: 2.4, scale: 1 },
      { kind: "house", x: H.x + 6, z: H.z + 28, yaw: 3.5, scale: 0.95 },
      { kind: "house", x: H.x + 20, z: H.z + 20, yaw: -2.4, scale: 1.05 },
      { kind: "smithy", x: H.x + 24, z: H.z + 2, yaw: -1.6, scale: 1 },
      { kind: "house_stone", x: H.x + 22, z: H.z - 18, yaw: 2.4, scale: 1.05 },
      { kind: "house", x: H.x + 2, z: H.z - 28, yaw: 0.1, scale: 1 },
      { kind: "house", x: H.x - 14, z: H.z - 28, yaw: 0.3, scale: 0.95 },
      // south gate on the road into town
      { kind: "gate_tower", x: H.x, z: H.z - 42, yaw: 0, scale: 1 },
      { kind: "wall_segment", x: H.x - 7, z: H.z - 42, yaw: 0, scale: 1 },
      { kind: "wall_segment", x: H.x + 7, z: H.z - 42, yaw: 0, scale: 1 },
      { kind: "wall_segment", x: H.x - 13.5, z: H.z - 42, yaw: 0, scale: 1 },
      { kind: "wall_segment", x: H.x + 13.5, z: H.z - 42, yaw: 0, scale: 1 },
    ],
  },
  {
    id: "alderford",
    name: "Alderford",
    x: 330,
    z: 820,
    buildings: [
      { kind: "house", x: 322, z: 812, yaw: 0.4, scale: 0.95 },
      { kind: "house", x: 342, z: 824, yaw: 2.1, scale: 1 },
      { kind: "house_stone", x: 328, z: 836, yaw: 3.6, scale: 0.9 },
    ],
  },
  {
    id: "brightshear",
    name: "Brightshear",
    x: 820,
    z: 1370,
    buildings: [
      { kind: "house", x: 812, z: 1362, yaw: 1.1, scale: 1 },
      { kind: "house", x: 832, z: 1376, yaw: 2.8, scale: 1.05 },
      { kind: "house", x: 816, z: 1386, yaw: 4.9, scale: 0.9 },
    ],
  },
];

export interface NpcDef {
  id: string;
  name: string;
  role: string;
  x: number;
  z: number;
  yaw: number;
  look: Appearance;
  lines: string[];
  /** quest this NPC gives/completes */
  quest?: string;
  /** opens the bank when talked to */
  banker?: boolean;
}

export const NPCS: NpcDef[] = [
  {
    id: "maera", name: "Maera", role: "Keeper of the Hearth",
    x: H.x - 3, z: H.z + 3, yaw: 2.4,
    look: { race: "human", sex: "f", hair: "long", hairColor: "grey", beard: "none" },
    lines: [
      "The hearth has burned since before the kingdom fell. While it burns, Hearthmere stands.",
      "Firewood is always needed, wanderer.",
    ],
    quest: "hearth_wood",
  },
  {
    id: "brammel", name: "Brammel", role: "Smith",
    x: H.x + 20, z: H.z + 4, yaw: -1.8,
    look: { race: "dwarf", sex: "m", hair: "short", hairColor: "red", beard: "full" },
    lines: [
      "A forge without ore is just a cold room.",
      "Veyran steel was famous once. It will be again.",
    ],
    quest: "copper_for_smith",
  },
  {
    id: "tilda", name: "Tilda", role: "Banker",
    x: H.x + 10, z: H.z - 8, yaw: 3.1,
    look: { race: "human", sex: "f", hair: "pony", hairColor: "black", beard: "none" },
    lines: ["Your goods are safe with the Bank of Hearthmere. Safer than your pockets."],
    banker: true,
  },
  {
    id: "garrick", name: "Garrick", role: "Watch Captain",
    x: H.x - 12, z: H.z - 10, yaw: 1.1,
    look: { race: "human", sex: "m", hair: "short", hairColor: "brown", beard: "short" },
    lines: [
      "Vermin in the fields, goblins in the woods. The watch can't be everywhere.",
      "Stay on the paths after dark.",
    ],
    quest: "vermin_trouble",
  },
  {
    id: "elowen", name: "Elowen", role: "Herbalist",
    x: 332, z: 822, yaw: 0.2,
    look: { race: "elf", sex: "f", hair: "long", hairColor: "blonde", beard: "none" },
    lines: ["The marsh reeds twist into the strongest cord — if you know the weave."],
    quest: "reeds_for_rope",
  },
  {
    id: "perrin", name: "Perrin", role: "Fisher",
    x: 818, z: 1378, yaw: 4.0,
    look: { race: "human", sex: "m", hair: "bald", hairColor: "brown", beard: "short" },
    lines: ["The shallows ripple where the darters run. Bring a patient heart."],
    quest: "taste_of_silver",
  },
];

export interface QuestDef {
  id: string;
  name: string;
  npc: string;
  intro: string;
  objective: { kind: "gather" | "kill"; target: string; count: number };
  done: string;
  reward: { skill: string; xp: number };
}

export const QUESTS: Record<string, QuestDef> = Object.fromEntries(
  (
    [
      {
        id: "hearth_wood", name: "Keep the Hearth Burning", npc: "maera",
        intro: "Bring me 5 alderwood logs and the hearth will warm you in turn.",
        objective: { kind: "gather", target: "alder_log", count: 5 },
        done: "The flames leap higher. You have the hearth's blessing.",
        reward: { skill: "woodcutting", xp: 150 },
      },
      {
        id: "copper_for_smith", name: "Copper for the Forge", npc: "brammel",
        intro: "Five lumps of copper ore, and I'll show you what a real forge sounds like.",
        objective: { kind: "gather", target: "copper_ore", count: 5 },
        done: "Good honest ore. The forge sings again!",
        reward: { skill: "mining", xp: 150 },
      },
      {
        id: "vermin_trouble", name: "Vermin Trouble", npc: "garrick",
        intro: "The fields crawl with giant vermin. Cull three of them for the watch.",
        objective: { kind: "kill", target: "vermin", count: 3 },
        done: "Three fewer tails in the grain stores. The watch thanks you.",
        reward: { skill: "attack", xp: 200 },
      },
      {
        id: "reeds_for_rope", name: "Reeds for Rope", npc: "elowen",
        intro: "Gather 8 marsh reeds from the wetlands and I'll teach you the weave.",
        objective: { kind: "gather", target: "marsh_reed", count: 8 },
        done: "See how they bind? Strong as iron, light as air.",
        reward: { skill: "crafting", xp: 180 },
      },
      {
        id: "taste_of_silver", name: "A Taste of Silver", npc: "perrin",
        intro: "Three silver darters from the shallows. Mind the current.",
        objective: { kind: "gather", target: "silver_darter", count: 3 },
        done: "Fresh as dawn! You've the makings of a fisher.",
        reward: { skill: "fishing", xp: 180 },
      },
    ] as QuestDef[]
  ).map((q) => [q.id, q]),
);
