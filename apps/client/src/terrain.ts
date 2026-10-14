import { Engine } from "@babylonjs/core/Engines/engine";
import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import type { Scene } from "@babylonjs/core/scene";
import { MixMaterial } from "@babylonjs/materials/mix";

import { WATER_LEVEL, groundWeights, heightAt } from "@world/content";

export const CHUNK = 64;
const VERTS = 33; // 2m grid
const MIX_RES = 32;
const TILE = 8; // texture repeat (must divide CHUNK so tiling is seamless across chunks)

/** Streams terrain chunks around the player. Heights/splats come from the
 * shared deterministic world functions — no baked terrain data. */
export class TerrainManager {
  private chunks = new Map<string, Mesh>();
  private detail: Record<string, Texture> = {};
  private water: Mesh;
  radius = 3; // chunks kept loaded in each direction

  constructor(private scene: Scene) {
    for (const name of ["grass", "dirt", "rock", "marsh"]) {
      const t = new Texture(`/assets/terrain/${name}.png`, scene);
      t.wrapU = t.wrapV = Texture.WRAP_ADDRESSMODE;
      // MixMaterial derives diffuse UVs from the (chunk-local) mix UV scaled
      // by the diffuse texture's own scale — CHUNK/TILE repeats per chunk
      t.uScale = CHUNK / TILE;
      t.vScale = CHUNK / TILE;
      this.detail[name] = t;
    }
    this.water = MeshBuilder.CreateGround("water", { width: CHUNK * 9, height: CHUNK * 9, subdivisions: 1 }, scene);
    const wm = new StandardMaterial("water", scene);
    wm.diffuseColor = new Color3(0.12, 0.25, 0.33);
    wm.specularColor = new Color3(0.3, 0.35, 0.35);
    wm.alpha = 0.82;
    this.water.material = wm;
    this.water.position.y = WATER_LEVEL;
  }

  update(px: number, pz: number) {
    const ccx = Math.floor(px / CHUNK);
    const ccz = Math.floor(pz / CHUNK);
    const want = new Set<string>();
    for (let dx = -this.radius; dx <= this.radius; dx++) {
      for (let dz = -this.radius; dz <= this.radius; dz++) {
        const cx = ccx + dx;
        const cz = ccz + dz;
        const key = `${cx}:${cz}`;
        want.add(key);
        if (!this.chunks.has(key)) this.chunks.set(key, this.buildChunk(cx, cz));
      }
    }
    for (const [key, mesh] of this.chunks) {
      if (!want.has(key)) {
        mesh.material?.dispose();
        mesh.dispose();
        this.chunks.delete(key);
      }
    }
    this.water.position.x = px;
    this.water.position.z = pz;
  }

  private buildChunk(cx: number, cz: number): Mesh {
    const x0 = cx * CHUNK;
    const z0 = cz * CHUNK;
    const step = CHUNK / (VERTS - 1);
    const positions = new Float32Array(VERTS * VERTS * 3);
    const uvs = new Float32Array(VERTS * VERTS * 2);
    const indices: number[] = [];
    for (let j = 0; j < VERTS; j++) {
      for (let i = 0; i < VERTS; i++) {
        const x = x0 + i * step;
        const z = z0 + j * step;
        const k = j * VERTS + i;
        positions[k * 3] = x;
        positions[k * 3 + 1] = heightAt(x, z);
        positions[k * 3 + 2] = z;
        // chunk-local 0..1 — the mix map spans it; diffuse tiling rides on top
        uvs[k * 2] = i / (VERTS - 1);
        uvs[k * 2 + 1] = j / (VERTS - 1);
      }
    }
    for (let j = 0; j < VERTS - 1; j++) {
      for (let i = 0; i < VERTS - 1; i++) {
        const a = j * VERTS + i;
        indices.push(a, a + 1, a + VERTS, a + 1, a + VERTS + 1, a + VERTS);
      }
    }
    const normals: number[] = [];
    VertexData.ComputeNormals(positions, indices, normals);

    const mesh = new Mesh(`terrain:${cx}:${cz}`, this.scene);
    const vd = new VertexData();
    vd.positions = positions;
    vd.indices = indices;
    vd.normals = normals;
    vd.uvs = uvs;
    vd.applyToMesh(mesh);

    // per-chunk splat map. MixMaterial cascades:
    //   out = mix(mix(mix(grass*R, dirt, G), rock, B), marsh, 1-A)
    const mix = new Uint8Array(MIX_RES * MIX_RES * 4);
    for (let j = 0; j < MIX_RES; j++) {
      for (let i = 0; i < MIX_RES; i++) {
        const x = x0 + (i / (MIX_RES - 1)) * CHUNK;
        const z = z0 + (j / (MIX_RES - 1)) * CHUNK;
        const [g, d, r, m] = groundWeights(x, z);
        const k = (j * MIX_RES + i) * 4;
        mix[k] = 255; // layer-1 brightness
        mix[k + 1] = (d / Math.max(0.001, g + d)) * 255;
        mix[k + 2] = r * 255;
        mix[k + 3] = 255 - m * 255;
      }
    }
    const mixTex = RawTexture.CreateRGBATexture(mix, MIX_RES, MIX_RES, this.scene, false, false, Texture.BILINEAR_SAMPLINGMODE);

    const mat = new MixMaterial(`terrainmat:${cx}:${cz}`, this.scene);
    mat.mixTexture1 = mixTex;
    mat.diffuseTexture1 = this.detail.grass!;
    mat.diffuseTexture2 = this.detail.dirt!;
    mat.diffuseTexture3 = this.detail.rock!;
    mat.diffuseTexture4 = this.detail.marsh!;
    mat.specularColor = Color3.Black();
    mesh.material = mat;

    mesh.isPickable = true;
    mesh.receiveShadows = true;
    mesh.freezeWorldMatrix();
    return mesh;
  }
}
