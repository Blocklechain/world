/** Renders the overworld map to a PNG (used by the in-game world map UI).
 * Run: pnpm --filter @world/content exec tsx scripts/render-map.ts [out.png]
 */
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";

import { WATER_LEVEL, WORLD_H, WORLD_W, groundWeights, heightAt, oceanMask } from "../src/world.js";

const SCALE = 4; // meters per pixel
const W = WORLD_W / SCALE;
const H = WORLD_H / SCALE;

const GRASS = [96, 128, 66];
const DIRT = [122, 95, 62];
const ROCK = [125, 122, 116];
const MARSH = [84, 94, 58];
const SAND = [194, 178, 128];
const SNOW = [235, 238, 242];

function pixel(x: number, z: number): [number, number, number] {
  const h = heightAt(x, z);
  if (h < WATER_LEVEL - 0.2) {
    const depth = Math.min(1, (WATER_LEVEL - h) / 7);
    const shallow = [96, 160, 165];
    const deep = [18, 48, 84];
    return [0, 1, 2].map((i) => shallow[i]! + (deep[i]! - shallow[i]!) * Math.sqrt(depth)) as never;
  }
  const [g, d, r, m] = groundWeights(x, z, h);
  const sandW = Math.min(1, Math.max(0, (WATER_LEVEL + 1.2 - h) / 2.0)) * (0.45 + 0.55 * oceanMask(x, z));
  let col = [0, 1, 2].map((i) => GRASS[i]! * g + DIRT[i]! * d + ROCK[i]! * r + MARSH[i]! * m);
  col = col.map((c, i) => c * (1 - sandW) + SAND[i]! * sandW);
  if (h > 15) {
    const t = Math.min(1, (h - 15) / 7);
    col = col.map((c, i) => c * (1 - t) + SNOW[i]! * t);
  }
  // hillshade from the west
  const grad = heightAt(x - SCALE, z) - h;
  const shade = Math.max(0.72, Math.min(1.18, 1 + grad * 0.1));
  return col.map((c) => Math.max(0, Math.min(255, c * shade))) as never;
}

// minimal PNG writer (truecolor, no filter)
function writePng(path: string, w: number, h: number, rgb: Uint8Array) {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf: Uint8Array) => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff]! ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Uint8Array) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), Buffer.from(data)]);
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crc(body));
    return Buffer.concat([len, body, crcBuf]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // truecolor
  const raw = Buffer.alloc(h * (w * 3 + 1));
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    rgb.subarray(y * w * 3, (y + 1) * w * 3).forEach((v, i) => {
      raw[y * (w * 3 + 1) + 1 + i] = v;
    });
  }
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", new Uint8Array(0)),
  ]);
  writeFileSync(path, png);
}

const rgb = new Uint8Array(W * H * 3);
for (let py = 0; py < H; py++) {
  const z = WORLD_H - (py + 0.5) * SCALE; // north at the top
  for (let px = 0; px < W; px++) {
    const x = (px + 0.5) * SCALE;
    const [r, g, b] = pixel(x, z);
    const i = (py * W + px) * 3;
    rgb[i] = r;
    rgb[i + 1] = g;
    rgb[i + 2] = b;
  }
}
const out = process.argv[2] ?? "map.png";
writePng(out, W, H, rgb);
console.log(`wrote ${out} (${W}x${H})`);
