/**
 * The continuous overworld of Veyra — one seamless map, no loading screens.
 * 10 named regions on a 3x4 cell grid (two cells are the impassable
 * Worldspine). Deterministic: the client and the server compute identical
 * terrain heights and resource scatter from these pure functions.
 *
 * Units: meters. World spans x in [0, 1536), z in [0, 2048). +z is north.
 */

export const WORLD_SEED = 7341;
export const CELL = 512;
export const WORLD_W = 3 * CELL; // 1536
export const WORLD_H = 4 * CELL; // 2048
export const WATER_LEVEL = 1.2;
export const MAX_WALK_HEIGHT = 15;
export const SPAWN = { x: 768, z: 768 }; // Hearthmere square
export const TOWN_RADIUS = 56;

export interface RegionDef {
  id: string;
  name: string;
  /** grid cell (col 0..2 west->east, row 0..3 south->north) */
  cell: [number, number];
  /** terrain feel */
  lift: number;
  amp: number;
  /** ground splat weights [grass, dirt, rock, marsh] at flat ground */
  ground: [number, number, number, number];
  barrier?: boolean;
}

export const REGIONS: RegionDef[] = [
  { id: "greywater", name: "Greywater Lake", cell: [0, 0], lift: -1.5, amp: 0.7, ground: [0.55, 0.15, 0.05, 0.25] },
  { id: "barrowfields", name: "The Barrowfields", cell: [1, 0], lift: 0.5, amp: 0.8, ground: [0.35, 0.45, 0.1, 0.1] },
  { id: "mistmarsh", name: "Mistmarsh", cell: [2, 0], lift: -0.8, amp: 0.5, ground: [0.25, 0.1, 0.0, 0.65] },
  { id: "thornfell", name: "Thornfell Forest", cell: [0, 1], lift: 1.0, amp: 1.0, ground: [0.75, 0.2, 0.05, 0.0] },
  { id: "hearthmere", name: "Hearthmere", cell: [1, 1], lift: 1.5, amp: 0.6, ground: [0.7, 0.28, 0.02, 0.0] },
  { id: "gloamdeep", name: "Gloamdeep Rise", cell: [2, 1], lift: 2.5, amp: 1.6, ground: [0.25, 0.3, 0.45, 0.0] },
  { id: "emberwood", name: "Emberwood", cell: [0, 2], lift: 2.0, amp: 1.3, ground: [0.65, 0.3, 0.05, 0.0] },
  { id: "sunfall", name: "Sunfall Meadows", cell: [1, 2], lift: 1.2, amp: 0.7, ground: [0.9, 0.08, 0.02, 0.0] },
  { id: "highcrag", name: "Highcrag Moor", cell: [2, 2], lift: 4.5, amp: 2.4, ground: [0.15, 0.25, 0.6, 0.0] },
  { id: "veyras_ruin", name: "Veyra's Ruin", cell: [1, 3], lift: 3.0, amp: 1.1, ground: [0.3, 0.4, 0.3, 0.0] },
  { id: "worldspine_w", name: "The Worldspine", cell: [0, 3], lift: 14, amp: 3.5, ground: [0.0, 0.1, 0.9, 0.0], barrier: true },
  { id: "worldspine_e", name: "The Worldspine", cell: [2, 3], lift: 14, amp: 3.5, ground: [0.0, 0.1, 0.9, 0.0], barrier: true },
];

const CELL_REGION: RegionDef[][] = (() => {
  const g: RegionDef[][] = Array.from({ length: 3 }, () => []);
  for (const r of REGIONS) g[r.cell[0]]![r.cell[1]] = r;
  return g;
})();

export function regionAt(x: number, z: number): RegionDef {
  const c = Math.max(0, Math.min(2, Math.floor(x / CELL)));
  const r = Math.max(0, Math.min(3, Math.floor(z / CELL)));
  return CELL_REGION[c]![r]!;
}

// ---- deterministic noise ---------------------------------------------------

function hash2(ix: number, iz: number, seed: number): number {
  let h = (ix * 374761393 + iz * 668265263 + seed * 1274126177) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

export function valueNoise(x: number, z: number, scale: number, seed: number): number {
  const gx = x / scale;
  const gz = z / scale;
  const ix = Math.floor(gx);
  const iz = Math.floor(gz);
  const fx = smooth(gx - ix);
  const fz = smooth(gz - iz);
  const a = hash2(ix, iz, seed);
  const b = hash2(ix + 1, iz, seed);
  const c = hash2(ix, iz + 1, seed);
  const d = hash2(ix + 1, iz + 1, seed);
  return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
}

export function fbm(x: number, z: number, scale: number, octaves: number, seed: number): number {
  let v = 0;
  let amp = 1;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    v += amp * valueNoise(x, z, scale / 2 ** o, seed + o * 101);
    norm += amp;
    amp *= 0.5;
  }
  return v / norm;
}

/** Region params blended smoothly across cell borders (no seams). */
function blendedRegion(x: number, z: number): { lift: number; amp: number; ground: [number, number, number, number] } {
  // sample the 4 nearest cell centers, weight by smooth distance
  const cx = x / CELL - 0.5;
  const cz = z / CELL - 0.5;
  const c0 = Math.floor(cx);
  const r0 = Math.floor(cz);
  const fx = smooth(Math.min(1, Math.max(0, cx - c0)));
  const fz = smooth(Math.min(1, Math.max(0, cz - r0)));
  let lift = 0;
  let amp = 0;
  const ground: [number, number, number, number] = [0, 0, 0, 0];
  for (const [dc, dr, w] of [
    [0, 0, (1 - fx) * (1 - fz)],
    [1, 0, fx * (1 - fz)],
    [0, 1, (1 - fx) * fz],
    [1, 1, fx * fz],
  ] as const) {
    const col = Math.max(0, Math.min(2, c0 + dc));
    const row = Math.max(0, Math.min(3, r0 + dr));
    const reg = CELL_REGION[col]![row]!;
    lift += reg.lift * w;
    amp += reg.amp * w;
    for (let i = 0; i < 4; i++) ground[i] = (ground[i] ?? 0) + reg.ground[i]! * w;
  }
  return { lift, amp, ground };
}

export const OCEAN_FLOOR = -6;

/** 0 on the island interior, 1 in open ocean; noisy coastline. A p-6
 * superellipse keeps the ocean as a ring so every region keeps its interior. */
export function oceanMask(x: number, z: number): number {
  const nx = (x - WORLD_W / 2) / (WORLD_W * 0.52);
  const nz = (z - WORLD_H / 2) / (WORLD_H * 0.52);
  const d =
    Math.pow(nx ** 6 + nz ** 6, 1 / 6) + (fbm(x, z, 300, 3, WORLD_SEED + 31) - 0.5) * 0.17;
  return smooth(Math.min(1, Math.max(0, (d - 0.8) / 0.2)));
}

export function heightAt(x: number, z: number): number {
  const { lift, amp } = blendedRegion(x, z);
  let h = 2.6 + lift + amp * (fbm(x, z, 150, 4, WORLD_SEED) - 0.5) * 14;
  h += amp * (fbm(x, z, 31, 2, WORLD_SEED + 7) - 0.5) * 2.2;

  // Greywater: carve the lake
  const lx = x - 360;
  const lz = z - 430;
  const ld = Math.hypot(lx, lz * 0.8);
  if (ld < 140) h -= 6.5 * smooth(1 - ld / 140);

  // Hearthmere: flatten the town square
  const td = Math.hypot(x - SPAWN.x, z - SPAWN.z);
  if (td < TOWN_RADIUS) {
    const t = smooth(1 - td / TOWN_RADIUS);
    h = h * (1 - t) + 4.0 * t;
  }

  // the island of Veyra: everything sinks to the ocean floor at the coast
  const ocean = oceanMask(x, z);
  if (ocean > 0) {
    const floor = OCEAN_FLOOR + (fbm(x, z, 90, 2, WORLD_SEED + 53) - 0.5) * 2.5;
    h = h * (1 - ocean) + floor * ocean;
  }
  return h;
}

/** Splat weights [grass, dirt, rock, marsh] incl. slope/height effects. */
export function groundWeights(x: number, z: number, h?: number): [number, number, number, number] {
  const { ground } = blendedRegion(x, z);
  const hh = h ?? heightAt(x, z);
  const slope =
    Math.abs(heightAt(x + 3, z) - hh) + Math.abs(heightAt(x, z + 3) - hh);
  let [g, d, r, m] = ground;
  const rocky = Math.min(1, slope / 3.5);
  r = r + (1 - r) * rocky;
  g *= 1 - rocky * 0.9;
  m *= 1 - rocky;
  const sum = g + d + r + m || 1;
  return [g / sum, d / sum, r / sum, m / sum];
}

/** Beach/seabed sand coverage, 0..1 — rendered as its own splat layer. */
export function sandAt(x: number, z: number, h?: number): number {
  const hh = h ?? heightAt(x, z);
  const beach = smooth(Math.min(1, Math.max(0, (WATER_LEVEL + 1.2 - hh) / 2.0)));
  // sandier near the ocean than inland lakes/marsh pools
  const coastal = 0.45 + 0.55 * oceanMask(x, z);
  return Math.min(1, beach * coastal * 1.15);
}

export type MoveState = "walk" | "swim" | "blocked";
export const SWIM_MAX_DEPTH = 4.5;
export const SWIM_SPEED_MULT = 0.45;

export function moveStateAt(x: number, z: number): MoveState {
  if (x < 2 || z < 2 || x > WORLD_W - 2 || z > WORLD_H - 2) return "blocked";
  const h = heightAt(x, z);
  if (h > MAX_WALK_HEIGHT) return "blocked";
  if (h > WATER_LEVEL - 0.25) return "walk";
  if (h > WATER_LEVEL - SWIM_MAX_DEPTH) return "swim";
  return "blocked"; // open ocean — too deep without a ship
}

/** Land or swimmable water. */
export function isWalkable(x: number, z: number): boolean {
  return moveStateAt(x, z) !== "blocked";
}

/** Dry land only (resource scatter, buildings). */
export function isLand(x: number, z: number): boolean {
  return moveStateAt(x, z) === "walk";
}
