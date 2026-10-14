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

import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";

import { WATER_LEVEL, activeMap, mapGroundWeights, mapHeightAt, mapSandAt } from "@world/content";

export const CHUNK = 64;
const VERTS = 49; // ~1.33m grid
const MIX_RES = 48;
const TILE = 8; // texture repeat (must divide CHUNK so tiling is seamless across chunks)

/** Streams terrain chunks around the player. Heights/splats come from the
 * shared deterministic world functions — no baked terrain data. */
export class TerrainManager {
  private chunks = new Map<string, Mesh>();
  private detail: Record<string, Texture> = {};
  private water: Mesh;
  radius = 3; // chunks kept loaded in each direction

  private waterTime = 0;
  private waterCenter = { x: NaN, z: NaN };

  constructor(private scene: Scene) {
    for (const name of ["grass", "dirt", "rock", "marsh", "sand"]) {
      const t = new Texture(`/assets/terrain/${name}.png`, scene);
      t.wrapU = t.wrapV = Texture.WRAP_ADDRESSMODE;
      // MixMaterial derives diffuse UVs from the (chunk-local) mix UV scaled
      // by the diffuse texture's own scale — CHUNK/TILE repeats per chunk
      t.uScale = CHUNK / TILE;
      t.vScale = CHUNK / TILE;
      this.detail[name] = t;
    }

    // the sea: a subdivided sheet that follows the player; CPU waves, vertex
    // colors tint by depth (turquoise shallows -> deep navy)
    this.water = MeshBuilder.CreateGround(
      "water",
      { width: CHUNK * 10, height: CHUNK * 10, subdivisions: 48, updatable: true },
      scene,
    );
    const wm = new StandardMaterial("water", scene);
    wm.diffuseColor = new Color3(1, 1, 1);
    wm.specularColor = new Color3(0.75, 0.8, 0.8);
    wm.specularPower = 180;
    wm.emissiveColor = new Color3(0.02, 0.05, 0.07);
    wm.alpha = 0.78;
    this.water.material = wm;
    this.water.hasVertexAlpha = true;
    this.water.position.y = WATER_LEVEL;
    this.water.isPickable = false;
    if (activeMap().kind === "cave") this.water.setEnabled(false);
    scene.onBeforeRenderObservable.add(() => this.animateWater());
  }

  private animateWater() {
    this.waterTime += this.scene.getEngine().getDeltaTime() / 1000;
    const t = this.waterTime;
    const pos = this.water.getVerticesData(VertexBuffer.PositionKind);
    if (!pos) return;
    const wx = this.water.position.x;
    const wz = this.water.position.z;
    for (let i = 0; i < pos.length; i += 3) {
      const x = pos[i]! + wx;
      const z = pos[i + 2]! + wz;
      pos[i + 1] =
        0.16 * Math.sin(x / 14 + t * 1.2) +
        0.11 * Math.sin(z / 9.5 + t * 1.8) +
        0.06 * Math.sin((x + z) / 25 - t * 0.8);
    }
    this.water.updateVerticesData(VertexBuffer.PositionKind, pos);
  }

  private retintWater() {
    const pos = this.water.getVerticesData(VertexBuffer.PositionKind);
    if (!pos) return;
    const colors = new Float32Array((pos.length / 3) * 4);
    const wx = this.water.position.x;
    const wz = this.water.position.z;
    const shallow = [0.35, 0.72, 0.72];
    const deep = [0.07, 0.2, 0.34];
    for (let i = 0, c = 0; i < pos.length; i += 3, c += 4) {
      const depth = Math.min(1, Math.max(0, (WATER_LEVEL - mapHeightAt(pos[i]! + wx, pos[i + 2]! + wz)) / 5));
      const k = Math.sqrt(depth);
      colors[c] = shallow[0]! + (deep[0]! - shallow[0]!) * k;
      colors[c + 1] = shallow[1]! + (deep[1]! - shallow[1]!) * k;
      colors[c + 2] = shallow[2]! + (deep[2]! - shallow[2]!) * k;
      colors[c + 3] = 0.55 + 0.45 * k; // clearer shallows
    }
    this.water.setVerticesData(VertexBuffer.ColorKind, colors, true);
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
    // snap the water sheet to a coarse grid so depth tints stay aligned
    const snapX = Math.round(px / CHUNK) * CHUNK;
    const snapZ = Math.round(pz / CHUNK) * CHUNK;
    if (snapX !== this.waterCenter.x || snapZ !== this.waterCenter.z) {
      this.waterCenter = { x: snapX, z: snapZ };
      this.water.position.x = snapX;
      this.water.position.z = snapZ;
      this.retintWater();
    }
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
        positions[k * 3 + 1] = mapHeightAt(x, z);
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
        const [g, d, r, m] = mapGroundWeights(x, z);
        const k = (j * MIX_RES + i) * 4;
        // crude curvature AO: hollows darken, crests brighten slightly
        const h0 = mapHeightAt(x, z);
        const concave =
          (mapHeightAt(x + 2.5, z) + mapHeightAt(x - 2.5, z) + mapHeightAt(x, z + 2.5) + mapHeightAt(x, z - 2.5)) / 4 -
          h0;
        const ao = Math.max(0.62, Math.min(1.0, 1 - concave * 0.55));
        mix[k] = Math.round(255 * ao); // layer-1 brightness
        mix[k + 1] = (d / Math.max(0.001, g + d)) * 255;
        mix[k + 2] = r * 255;
        mix[k + 3] = 255 - m * 255;
      }
    }
    const mixTex = RawTexture.CreateRGBATexture(mix, MIX_RES, MIX_RES, this.scene, false, false, Texture.BILINEAR_SAMPLINGMODE);

    // second cascade: sand over everything by beach/seabed weight
    const mix2 = new Uint8Array(MIX_RES * MIX_RES * 4);
    for (let j = 0; j < MIX_RES; j++) {
      for (let i = 0; i < MIX_RES; i++) {
        const x = x0 + (i / (MIX_RES - 1)) * CHUNK;
        const z = z0 + (j / (MIX_RES - 1)) * CHUNK;
        const k = (j * MIX_RES + i) * 4;
        mix2[k] = mapSandAt(x, z) * 255;
        mix2[k + 3] = 255; // keep layer-8 (1-a) silent
      }
    }
    const mixTex2 = RawTexture.CreateRGBATexture(mix2, MIX_RES, MIX_RES, this.scene, false, false, Texture.BILINEAR_SAMPLINGMODE);

    const mat = new MixMaterial(`terrainmat:${cx}:${cz}`, this.scene);
    mat.mixTexture1 = mixTex;
    mat.mixTexture2 = mixTex2;
    mat.diffuseTexture1 = this.detail.grass!;
    mat.diffuseTexture2 = this.detail.dirt!;
    mat.diffuseTexture3 = this.detail.rock!;
    mat.diffuseTexture4 = this.detail.marsh!;
    mat.diffuseTexture5 = this.detail.sand!;
    mat.diffuseTexture6 = this.detail.sand!;
    mat.diffuseTexture7 = this.detail.sand!;
    mat.diffuseTexture8 = this.detail.sand!;
    mat.specularColor = Color3.Black();
    mesh.material = mat;

    mesh.isPickable = true;
    mesh.receiveShadows = true;
    mesh.freezeWorldMatrix();
    return mesh;
  }
}
