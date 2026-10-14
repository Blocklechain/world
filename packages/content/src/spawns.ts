/** Deterministic monster spawn points, chunk-derived like resource nodes. */
import { MONSTERS, REGION_MONSTERS } from "./monsters.js";
import { SCATTER_CHUNK, CHUNKS_X, CHUNKS_Z } from "./nodes.js";
import { SPAWN, WORLD_SEED, heightAt, isLand, regionAt } from "./world.js";

export const SAFE_RADIUS = 90; // no monsters near the Hearthmere square

export interface MonsterSpawn {
  id: string;
  species: string;
  x: number;
  z: number;
  y: number;
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

export function chunkMonsterSpawns(cx: number, cz: number): MonsterSpawn[] {
  const r = rng((WORLD_SEED + 777) ^ (cx * 48611) ^ (cz * 96557));
  const x0 = cx * SCATTER_CHUNK;
  const z0 = cz * SCATTER_CHUNK;
  const region = regionAt(x0 + 32, z0 + 32);
  const table = REGION_MONSTERS[region.id] ?? {};
  const out: MonsterSpawn[] = [];
  let i = 0;
  for (const [species, density] of Object.entries(table)) {
    if (!MONSTERS[species]) continue;
    const n = Math.floor(density) + (r() < density % 1 ? 1 : 0);
    for (let k = 0; k < n; k++) {
      const x = x0 + r() * SCATTER_CHUNK;
      const z = z0 + r() * SCATTER_CHUNK;
      i++;
      if (!isLand(x, z)) continue;
      if (Math.hypot(x - SPAWN.x, z - SPAWN.z) < SAFE_RADIUS) continue;
      out.push({ id: `m${cx}:${cz}:${i}`, species, x, z, y: heightAt(x, z) });
    }
  }
  return out;
}

export function allMonsterSpawns(): Map<string, MonsterSpawn> {
  const map = new Map<string, MonsterSpawn>();
  for (let cx = 0; cx < CHUNKS_X; cx++) {
    for (let cz = 0; cz < CHUNKS_Z; cz++) {
      for (const s of chunkMonsterSpawns(cx, cz)) map.set(s.id, s);
    }
  }
  return map;
}
