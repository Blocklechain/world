/** Deterministic resource-node and scenery scatter. Client and server derive
 * identical node lists per 64m chunk from the world seed. */
import { NODE_SPECIES, REGION_SCATTER } from "./gathering.js";
import { NODE_SPECIES as _SP } from "./gathering.js";
import {
  SPAWN,
  moveStateAt,
  TOWN_RADIUS,
  WORLD_H,
  WORLD_SEED,
  WORLD_W,
  heightAt,
  isLand,
  regionAt,
} from "./world.js";

export const SCATTER_CHUNK = 64;
export const CHUNKS_X = WORLD_W / SCATTER_CHUNK;
export const CHUNKS_Z = WORLD_H / SCATTER_CHUNK;

export interface WorldNode {
  id: string;
  species: string;
  x: number;
  z: number;
  y: number;
  /** uniform scale + yaw jitter for visual variety */
  scale: number;
  yaw: number;
}

function rng(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** All resource nodes in one chunk (cx, cz are chunk coords). */
export function chunkNodes(cx: number, cz: number): WorldNode[] {
  const r = rng(WORLD_SEED ^ (cx * 73856093) ^ (cz * 19349663));
  const x0 = cx * SCATTER_CHUNK;
  const z0 = cz * SCATTER_CHUNK;
  const region = regionAt(x0 + SCATTER_CHUNK / 2, z0 + SCATTER_CHUNK / 2);
  const table = REGION_SCATTER[region.id] ?? {};
  const out: WorldNode[] = [];
  let i = 0;
  for (const [species, density] of Object.entries(table)) {
    // poisson-ish: expected `density` nodes, max density*2 attempts
    const n = Math.floor(density) + (r() < density % 1 ? 1 : 0);
    for (let k = 0; k < n; k++) {
      const x = x0 + r() * SCATTER_CHUNK;
      const z = z0 + r() * SCATTER_CHUNK;
      i++;
      const wantsWater = NODE_SPECIES[species]?.kind === "fishing";
      if (wantsWater ? moveStateAt(x, z) !== "swim" : !isLand(x, z)) continue;
      const d = Math.hypot(x - SPAWN.x, z - SPAWN.z);
      if (d < TOWN_RADIUS * 0.55) continue; // keep the town square clear
      const sp = NODE_SPECIES[species];
      if (!sp) continue;
      out.push({
        id: `${cx}:${cz}:${i}`,
        species,
        x,
        z,
        y: heightAt(x, z),
        scale: 0.85 + r() * 0.4,
        yaw: r() * Math.PI * 2,
      });
    }
  }
  return out;
}

/** Full world node index (server-side; ~10-20k entries). */
export function allNodes(): Map<string, WorldNode> {
  const map = new Map<string, WorldNode>();
  for (let cx = 0; cx < CHUNKS_X; cx++) {
    for (let cz = 0; cz < CHUNKS_Z; cz++) {
      for (const n of chunkNodes(cx, cz)) map.set(n.id, n);
    }
  }
  return map;
}

// ---- scenery (non-interactable props) --------------------------------------

export interface SceneryItem {
  kind: "ruin_pillar" | "barrow" | "boulder" | "grass_tuft";
  x: number;
  z: number;
  y: number;
  scale: number;
  yaw: number;
}

export function chunkScenery(cx: number, cz: number): SceneryItem[] {
  const r = rng((WORLD_SEED + 999) ^ (cx * 83492791) ^ (cz * 29765723));
  const x0 = cx * SCATTER_CHUNK;
  const z0 = cz * SCATTER_CHUNK;
  const region = regionAt(x0 + 32, z0 + 32);
  const out: SceneryItem[] = [];
  const add = (kind: SceneryItem["kind"], density: number, smin: number, smax: number) => {
    const n = Math.floor(density) + (r() < density % 1 ? 1 : 0);
    for (let k = 0; k < n; k++) {
      const x = x0 + r() * SCATTER_CHUNK;
      const z = z0 + r() * SCATTER_CHUNK;
      if (!isLand(x, z)) continue;
      if (Math.hypot(x - SPAWN.x, z - SPAWN.z) < TOWN_RADIUS) continue;
      out.push({ kind, x, z, y: heightAt(x, z), scale: smin + r() * (smax - smin), yaw: r() * Math.PI * 2 });
    }
  };
  // decorative grass where grass dominates the ground
  const grassiness = region.ground[0];
  if (grassiness > 0.3) add("grass_tuft", grassiness * 22, 0.7, 1.4);
  if (region.id === "veyras_ruin") add("ruin_pillar", 2.2, 0.8, 1.5);
  if (region.id === "barrowfields") add("barrow", 1.2, 1.0, 1.8);
  if (region.id === "highcrag" || region.id === "gloamdeep") add("boulder", 1.5, 0.6, 1.6);
  return out;
}
