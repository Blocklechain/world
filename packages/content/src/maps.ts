/** Multiple maps: the seamless overworld plus instanced interiors (caves,
 * dungeons). Each map provides the same deterministic interface. The server
 * holds one map per room; the client switches its active map on travel
 * (interiors are the one place a loading transition is allowed). */
import { NODE_SPECIES } from "./gathering.js";
import { MONSTERS } from "./monsters.js";
import { SCATTER_CHUNK, chunkNodes, chunkScenery, type SceneryItem, type WorldNode } from "./nodes.js";
import { chunkMonsterSpawns, type MonsterSpawn } from "./spawns.js";
import {
  SPAWN,
  WORLD_H,
  WORLD_W,
  fbm,
  groundWeights,
  heightAt,
  isLand,
  isWalkable,
  moveStateAt,
  sandAt,
  type MoveState,
} from "./world.js";

export interface GameMap {
  id: string;
  name: string;
  kind: "surface" | "cave";
  width: number;
  height: number;
  spawn: { x: number; z: number };
  heightAt(x: number, z: number): number;
  moveStateAt(x: number, z: number): MoveState;
  isWalkable(x: number, z: number): boolean;
  isLand(x: number, z: number): boolean;
  groundWeights(x: number, z: number, h?: number): [number, number, number, number];
  sandAt(x: number, z: number, h?: number): number;
  chunkNodes(cx: number, cz: number): WorldNode[];
  chunkScenery(cx: number, cz: number): SceneryItem[];
  monsterSpawns(): Map<string, MonsterSpawn>;
}

// ---- overworld --------------------------------------------------------------

import { allMonsterSpawns } from "./spawns.js";

export const OVERWORLD: GameMap = {
  id: "overworld",
  name: "Veyra",
  kind: "surface",
  width: WORLD_W,
  height: WORLD_H,
  spawn: SPAWN,
  heightAt,
  moveStateAt,
  isWalkable,
  isLand,
  groundWeights,
  sandAt,
  chunkNodes,
  chunkScenery,
  monsterSpawns: allMonsterSpawns,
};

// ---- Gloamdeep Cavern -------------------------------------------------------

const CAVE_SEED = 90210;
const CAVE_SIZE = 192;
const CAVE_SPAWN = { x: 96, z: 24 };

function caveOpen(x: number, z: number): boolean {
  if (x < 4 || z < 4 || x > CAVE_SIZE - 4 || z > CAVE_SIZE - 4) return false;
  // organic tunnels: noise threshold, with a guaranteed open entrance hall
  // and a main vein running north so the cave always connects
  const hall = Math.hypot(x - CAVE_SPAWN.x, z - CAVE_SPAWN.z) < 11;
  const vein = Math.abs(x - 96 - Math.sin(z / 23) * 26) < 7;
  const n = fbm(x, z, 26, 3, CAVE_SEED);
  return hall || vein || n > 0.55;
}

function caveFloor(x: number, z: number): number {
  return 2.4 + (fbm(x, z, 14, 2, CAVE_SEED + 5) - 0.5) * 0.8;
}

const caveNodeCache = new Map<string, WorldNode[]>();
const CAVE_ORES: [string, number][] = [
  ["iron_rock", 2.2],
  ["coal_rock", 2.0],
  ["mithril_rock", 1.4],
  ["adamant_rock", 0.7],
  ["rune_rock", 0.3],
];

function caveRng(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function caveChunkNodes(cx: number, cz: number): WorldNode[] {
  const key = `${cx}:${cz}`;
  let out = caveNodeCache.get(key);
  if (out) return out;
  out = [];
  if (cx >= 0 && cz >= 0 && cx * SCATTER_CHUNK < CAVE_SIZE && cz * SCATTER_CHUNK < CAVE_SIZE) {
    const r = caveRng(CAVE_SEED ^ (cx * 7919) ^ (cz * 104729));
    let i = 0;
    for (const [species, density] of CAVE_ORES) {
      const n = Math.floor(density) + (r() < density % 1 ? 1 : 0);
      for (let k = 0; k < n; k++) {
        const x = cx * SCATTER_CHUNK + r() * SCATTER_CHUNK;
        const z = cz * SCATTER_CHUNK + r() * SCATTER_CHUNK;
        i++;
        if (!caveOpen(x, z)) continue;
        if (Math.hypot(x - CAVE_SPAWN.x, z - CAVE_SPAWN.z) < 9) continue;
        if (!NODE_SPECIES[species]) continue;
        out.push({ id: `c${cx}:${cz}:${i}`, species, x, z, y: caveFloor(x, z), scale: 0.9 + r() * 0.3, yaw: r() * 6.28 });
      }
    }
  }
  caveNodeCache.set(key, out);
  return out;
}

function caveChunkScenery(cx: number, cz: number): SceneryItem[] {
  const out: SceneryItem[] = [];
  if (cx < 0 || cz < 0 || cx * SCATTER_CHUNK >= CAVE_SIZE || cz * SCATTER_CHUNK >= CAVE_SIZE) return out;
  const r = caveRng((CAVE_SEED + 7) ^ (cx * 7919) ^ (cz * 104729));
  for (let k = 0; k < 7; k++) {
    const x = cx * SCATTER_CHUNK + r() * SCATTER_CHUNK;
    const z = cz * SCATTER_CHUNK + r() * SCATTER_CHUNK;
    if (!caveOpen(x, z)) continue;
    const kind = r() < 0.6 ? "stalagmite" : r() < 0.85 ? "boulder" : "glow_crystal";
    out.push({ kind: kind as SceneryItem["kind"], x, z, y: caveFloor(x, z), scale: 0.7 + r() * 0.9, yaw: r() * 6.28 });
  }
  return out;
}

function caveMonsterSpawns(): Map<string, MonsterSpawn> {
  const map = new Map<string, MonsterSpawn>();
  const r = caveRng(CAVE_SEED + 999);
  let i = 0;
  for (let n = 0; n < 46; n++) {
    const x = 8 + r() * (CAVE_SIZE - 16);
    const z = 8 + r() * (CAVE_SIZE - 16);
    if (!caveOpen(x, z)) continue;
    if (Math.hypot(x - CAVE_SPAWN.x, z - CAVE_SPAWN.z) < 16) continue;
    const species = r() < 0.6 ? "cave_spider" : r() < 0.85 ? "goblin_brute" : "cave_bat";
    if (!MONSTERS[species]) continue;
    i++;
    map.set(`cm${i}`, { id: `cm${i}`, species, x, z, y: caveFloor(x, z) });
  }
  return map;
}

export const GLOAMDEEP_CAVE: GameMap = {
  id: "gloamdeep_cave",
  name: "Gloamdeep Cavern",
  kind: "cave",
  width: CAVE_SIZE,
  height: CAVE_SIZE,
  spawn: CAVE_SPAWN,
  heightAt: (x, z) => (caveOpen(x, z) ? caveFloor(x, z) : caveFloor(x, z) + 7.5),
  moveStateAt: (x, z) => (caveOpen(x, z) ? "walk" : "blocked"),
  isWalkable: (x, z) => caveOpen(x, z),
  isLand: (x, z) => caveOpen(x, z),
  groundWeights: () => [0.05, 0.3, 0.65, 0],
  sandAt: () => 0,
  chunkNodes: caveChunkNodes,
  chunkScenery: caveChunkScenery,
  monsterSpawns: caveMonsterSpawns,
};

// ---- The Sunken Keep (Veyra's Ruin dungeon) ---------------------------------

const KEEP_SIZE = 140;
const KEEP_SPAWN = { x: 48, z: 14 };
// hand-carved halls: [x0, z0, x1, z1]
const KEEP_RECTS: [number, number, number, number][] = [
  [36, 6, 60, 26],    // entry hall
  [44, 26, 52, 58],   // long corridor
  [22, 34, 44, 50],   // west barracks
  [52, 38, 76, 54],   // east crypt
  [30, 58, 66, 78],   // great hall
  [44, 78, 52, 96],   // boss approach
  [28, 96, 68, 126],  // throne of the Barrow King
  [60, 60, 84, 70],   // east gallery
  [12, 60, 30, 70],   // west gallery
];

function keepOpen(x: number, z: number): boolean {
  for (const [x0, z0, x1, z1] of KEEP_RECTS) {
    if (x >= x0 && x <= x1 && z >= z0 && z <= z1) return true;
  }
  return false;
}

function keepFloor(x: number, z: number): number {
  return 2.5 + (fbm(x, z, 9, 2, 777) - 0.5) * 0.25;
}

const KEEP_NODES: WorldNode[] = [
  { id: "k1", species: "adamant_rock", x: 26, z: 38, y: 2.5, scale: 1, yaw: 1 },
  { id: "k2", species: "adamant_rock", x: 40, z: 47, y: 2.5, scale: 1.1, yaw: 2 },
  { id: "k3", species: "rune_rock", x: 72, z: 50, y: 2.5, scale: 1, yaw: 3 },
  { id: "k4", species: "rune_rock", x: 16, z: 66, y: 2.5, scale: 1.05, yaw: 4 },
  { id: "k5", species: "coal_rock", x: 80, z: 64, y: 2.5, scale: 1, yaw: 5 },
];

const KEEP_SCENERY: SceneryItem[] = [
  // pillar rows in the great hall and throne room
  ...[34, 46, 58].flatMap((x) => [62, 74].map((z) => ({ kind: "ruin_pillar" as const, x, z, y: 2.5, scale: 1.2, yaw: 0 }))),
  ...[36, 48, 60].flatMap((x) => [102, 114].map((z) => ({ kind: "ruin_pillar" as const, x, z, y: 2.5, scale: 1.4, yaw: 0 }))),
  { kind: "glow_crystal", x: 48, z: 92, y: 2.5, scale: 1.4, yaw: 0 },
  { kind: "glow_crystal", x: 24, z: 42, y: 2.5, scale: 1, yaw: 1 },
  { kind: "glow_crystal", x: 70, z: 46, y: 2.5, scale: 1, yaw: 2 },
  { kind: "barrow", x: 60, z: 44, y: 2.5, scale: 0.8, yaw: 1 },
  { kind: "barrow", x: 30, z: 120, y: 2.5, scale: 1.1, yaw: 2 },
];

function keepMonsterSpawns(): Map<string, MonsterSpawn> {
  const list: MonsterSpawn[] = [
    { id: "ks1", species: "skeleton", x: 40, z: 40, y: 2.5 },
    { id: "ks2", species: "skeleton", x: 30, z: 46, y: 2.5 },
    { id: "ks3", species: "skeleton", x: 60, z: 44, y: 2.5 },
    { id: "ks4", species: "skeleton", x: 70, z: 50, y: 2.5 },
    { id: "ks5", species: "dark_acolyte", x: 38, z: 66, y: 2.5 },
    { id: "ks6", species: "dark_acolyte", x: 58, z: 72, y: 2.5 },
    { id: "ks7", species: "skeleton", x: 48, z: 86, y: 2.5 },
    { id: "ks8", species: "dark_acolyte", x: 20, z: 64, y: 2.5 },
    { id: "ks9", species: "skeleton", x: 72, z: 65, y: 2.5 },
    { id: "kboss", species: "barrow_king", x: 48, z: 112, y: 2.5 },
  ];
  return new Map(list.map((m) => [m.id, m]));
}

export const SUNKEN_KEEP: GameMap = {
  id: "sunken_keep",
  name: "The Sunken Keep",
  kind: "cave",
  width: KEEP_SIZE,
  height: KEEP_SIZE,
  spawn: KEEP_SPAWN,
  heightAt: (x, z) => (keepOpen(x, z) ? keepFloor(x, z) : keepFloor(x, z) + 8),
  moveStateAt: (x, z) => (keepOpen(x, z) ? "walk" : "blocked"),
  isWalkable: keepOpen,
  isLand: keepOpen,
  groundWeights: () => [0.0, 0.25, 0.75, 0],
  sandAt: () => 0,
  chunkNodes: (cx, cz) =>
    KEEP_NODES.filter(
      (n) => Math.floor(n.x / SCATTER_CHUNK) === cx && Math.floor(n.z / SCATTER_CHUNK) === cz,
    ),
  chunkScenery: (cx, cz) =>
    KEEP_SCENERY.filter(
      (n) => Math.floor(n.x / SCATTER_CHUNK) === cx && Math.floor(n.z / SCATTER_CHUNK) === cz,
    ),
  monsterSpawns: keepMonsterSpawns,
};

export const MAPS: Record<string, GameMap> = {
  overworld: OVERWORLD,
  gloamdeep_cave: GLOAMDEEP_CAVE,
  sunken_keep: SUNKEN_KEEP,
};

/** Portals between maps. Interacting within radius travels. */
export interface Portal {
  id: string;
  map: string;
  x: number;
  z: number;
  toMap: string;
  label: string;
}

export const PORTALS: Portal[] = [
  { id: "cave_in", map: "overworld", x: 1225, z: 1012, toMap: "gloamdeep_cave", label: "Gloamdeep Cavern" },
  { id: "cave_out", map: "gloamdeep_cave", x: CAVE_SPAWN.x, z: CAVE_SPAWN.z - 8, toMap: "overworld", label: "Daylight" },
  { id: "keep_in", map: "overworld", x: 770, z: 1704, toMap: "sunken_keep", label: "The Sunken Keep" },
  { id: "keep_out", map: "sunken_keep", x: KEEP_SPAWN.x, z: KEEP_SPAWN.z - 6, toMap: "overworld", label: "Daylight" },
];

// ---- client-side active map (the server uses GameMap objects directly) ------

let active: GameMap = OVERWORLD;

export function setActiveMap(id: string) {
  active = MAPS[id] ?? OVERWORLD;
}

export function activeMap(): GameMap {
  return active;
}

// convenience delegators for the client (always the active map)
export const mapHeightAt = (x: number, z: number) => active.heightAt(x, z);
export const mapMoveStateAt = (x: number, z: number) => active.moveStateAt(x, z);
export const mapIsWalkable = (x: number, z: number) => active.isWalkable(x, z);
export const mapChunkNodes = (cx: number, cz: number) => active.chunkNodes(cx, cz);
export const mapChunkScenery = (cx: number, cz: number) => active.chunkScenery(cx, cz);
export const mapGroundWeights = (x: number, z: number, h?: number) => active.groundWeights(x, z, h);
export const mapSandAt = (x: number, z: number, h?: number) => active.sandAt(x, z, h);
