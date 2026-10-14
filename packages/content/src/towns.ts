/** Settlements: building placements and NPCs. The lore: survivors of fallen
 * Veyra cluster in Hearthmere and two outlying villages. */
import { SPAWN } from "./world.js";
import type { Appearance } from "./appearance.js";

export interface Building {
  kind: "house" | "house_stone" | "smithy";
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

export const TOWNS: TownDef[] = [
  {
    id: "hearthmere",
    name: "Hearthmere",
    x: H.x,
    z: H.z,
    buildings: [
      { kind: "house", x: H.x - 18, z: H.z - 14, yaw: 0.5, scale: 1 },
      { kind: "house", x: H.x - 24, z: H.z + 6, yaw: 1.8, scale: 1.1 },
      { kind: "house_stone", x: H.x - 8, z: H.z + 22, yaw: 3.3, scale: 1 },
      { kind: "house", x: H.x + 14, z: H.z + 18, yaw: 4.2, scale: 0.95 },
      { kind: "smithy", x: H.x + 22, z: H.z + 2, yaw: -1.6, scale: 1 },
      { kind: "house_stone", x: H.x + 18, z: H.z - 18, yaw: 2.4, scale: 1.05 },
      { kind: "house", x: H.x - 2, z: H.z - 24, yaw: 0.1, scale: 1 },
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
