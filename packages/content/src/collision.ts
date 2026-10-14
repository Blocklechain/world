/** Prop collision: trees, rocks, buildings and scenery block movement.
 * Shared circle obstacles derived from the deterministic scatter, so the
 * client prediction and the server agree exactly. */
import { NODE_SPECIES } from "./gathering.js";
import { SCATTER_CHUNK, chunkNodes, chunkScenery } from "./nodes.js";
import { TOWNS } from "./towns.js";
import { SPAWN, heightAt } from "./world.js";

export const PLAYER_RADIUS = 0.35;

interface Circle {
  x: number;
  z: number;
  r: number;
}

const KIND_RADIUS: Record<string, number> = {
  tree: 0.5,
  rock: 1.05,
};

const SCENERY_RADIUS: Record<string, number> = {
  boulder: 0.85,
  ruin_pillar: 0.5,
  barrow: 1.7,
};

const BUILDING_RADIUS: Record<string, number> = {
  house: 2.9,
  house_stone: 3.2,
  smithy: 3.3,
};

const chunkCache = new Map<string, Circle[]>();

/** Static town circles (buildings + fixtures), precomputed once. */
const townCircles: Circle[] = (() => {
  const out: Circle[] = [];
  for (const t of TOWNS) {
    for (const b of t.buildings) {
      out.push({ x: b.x, z: b.z, r: (BUILDING_RADIUS[b.kind] ?? 3) * b.scale });
    }
  }
  out.push({ x: SPAWN.x + 10, z: SPAWN.z - 6, r: 1.6 }); // bank booth
  out.push({ x: SPAWN.x, z: SPAWN.z, r: 1.5 }); // hearth
  return out;
})();

function chunkCircles(cx: number, cz: number): Circle[] {
  const key = `${cx}:${cz}`;
  let c = chunkCache.get(key);
  if (c) return c;
  c = [];
  for (const n of chunkNodes(cx, cz)) {
    const kind = NODE_SPECIES[n.species]?.kind;
    const r = kind ? KIND_RADIUS[kind] : undefined;
    if (r) c.push({ x: n.x, z: n.z, r: r * n.scale });
  }
  for (const s of chunkScenery(cx, cz)) {
    const r = SCENERY_RADIUS[s.kind];
    if (r) c.push({ x: s.x, z: s.z, r: r * s.scale });
  }
  if (chunkCache.size > 600) chunkCache.clear(); // crude LRU
  chunkCache.set(key, c);
  return c;
}

function obstaclesNear(x: number, z: number): Circle[] {
  const cx = Math.floor(x / SCATTER_CHUNK);
  const cz = Math.floor(z / SCATTER_CHUNK);
  const out: Circle[] = [];
  for (let dx = -1; dx <= 1; dx++) {
    for (let dz = -1; dz <= 1; dz++) {
      out.push(...chunkCircles(cx + dx, cz + dz));
    }
  }
  for (const t of townCircles) {
    if (Math.abs(t.x - x) < 90 && Math.abs(t.z - z) < 90) out.push(t);
  }
  return out;
}

/** Slide a proposed position out of any obstacle circles (max two passes). */
export function resolveMove(nx: number, nz: number): { x: number; z: number } {
  let x = nx;
  let z = nz;
  for (let pass = 0; pass < 2; pass++) {
    let pushed = false;
    for (const o of obstaclesNear(x, z)) {
      const dx = x - o.x;
      const dz = z - o.z;
      const d = Math.hypot(dx, dz);
      const min = o.r + PLAYER_RADIUS;
      if (d < min) {
        const k = d < 0.001 ? 1 : min / d;
        x = d < 0.001 ? o.x + min : o.x + dx * k;
        z = d < 0.001 ? o.z : o.z + dz * k;
        pushed = true;
      }
    }
    if (!pushed) break;
  }
  return { x, z };
}

/** True when a point stands inside (or touching) an obstacle. */
export function isObstructed(x: number, z: number): boolean {
  for (const o of obstaclesNear(x, z)) {
    if (Math.hypot(x - o.x, z - o.z) < o.r + PLAYER_RADIUS) return true;
  }
  return false;
}

/** Terrain feel: climbing slows you, gentle downhill barely helps. */
export function slopeSpeedMult(x: number, z: number, dirX: number, dirZ: number): number {
  const ahead = heightAt(x + dirX * 1.5, z + dirZ * 1.5) - heightAt(x, z);
  return Math.max(0.6, Math.min(1.08, 1 - ahead * 0.22));
}
