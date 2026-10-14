import { SceneLoader } from "@babylonjs/core/Loading/sceneLoader";
import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import type { Scene } from "@babylonjs/core/scene";
import "@babylonjs/loaders/glTF/2.0";

import {
  NODE_SPECIES,
  PORTALS,
  TOWNS,
  WATER_LEVEL,
  SPAWN,
  activeMap,
  mapChunkNodes,
  mapChunkScenery,
  mapHeightAt,
  type SceneryItem,
  type WorldNode,
} from "@world/content";

const SCATTER_CHUNK = 64;

/** models whose thin instances cast sun shadows */
const SHADOW_CASTERS = new Set([
  "tree_alderwood", "tree_emberbirch", "tree_silverwillow", "tree_duskyew",
  "copper_rock", "iron_rock", "coal_rock", "mithril_rock", "adamant_rock", "rune_rock",
  "boulder", "ruin_pillar", "house", "house_stone", "smithy", "bank_booth", "cave_entrance", "stalagmite",
]);

const MODELS = [
  "tree_alderwood", "tree_emberbirch", "tree_silverwillow", "tree_duskyew", "tree_stump",
  "copper_rock", "iron_rock", "coal_rock", "mithril_rock", "adamant_rock", "rune_rock",
  "rock_rubble", "boulder", "reeds", "sunbloom_patch",
  "bank_booth", "hearth", "ruin_pillar", "barrow", "grass_tuft", "fishing_spot",
  "house", "house_stone", "smithy", "cave_entrance", "stalagmite", "glow_crystal", "rowboat",
];

const SPECIES_MODEL: Record<string, string> = {
  alderwood: "tree_alderwood",
  emberbirch: "tree_emberbirch",
  silverwillow: "tree_silverwillow",
  duskyew: "tree_duskyew",
  copper_rock: "copper_rock",
  iron_rock: "iron_rock",
  coal_rock: "coal_rock",
  mithril_rock: "mithril_rock",
  adamant_rock: "adamant_rock",
  rune_rock: "rune_rock",
  reeds: "reeds",
  sunbloom_patch: "sunbloom_patch",
  shore_spot: "fishing_spot",
  murk_spot: "fishing_spot",
  ember_spot: "fishing_spot",
};

/** Streams resource nodes + scenery as thin instances around the player. */
export class ScatterManager {
  private bases = new Map<string, Mesh>();
  private liveNodes = new Map<string, WorldNode[]>();
  private liveScenery = new Map<string, SceneryItem[]>();
  private dirty = true;
  private lastCenter = "";
  ready = false;
  radius = 4; // chunks

  constructor(
    private scene: Scene,
    private isDepleted: (nodeId: string) => boolean,
    private shadows?: ShadowGenerator,
  ) {}

  async load() {
    await Promise.all(
      MODELS.map(async (name) => {
        const res = await SceneLoader.ImportMeshAsync("", "/assets/nature/", `${name}.glb`, this.scene);
        const mesh = res.meshes.find((m) => m.getTotalVertices() > 0) as Mesh;
        mesh.setParent(null);
        mesh.bakeCurrentTransformIntoVertices();
        mesh.setEnabled(false);
        mesh.isPickable = false;
        for (const m of res.meshes) if (m !== mesh) m.dispose();
        if (this.shadows && SHADOW_CASTERS.has(name)) this.shadows.addShadowCaster(mesh, false);
        this.bases.set(name, mesh);
      }),
    );
    this.ready = true;
    this.dirty = true;
  }

  markDirty() {
    this.dirty = true;
  }

  update(px: number, pz: number) {
    if (!this.ready) return;
    const ccx = Math.floor(px / SCATTER_CHUNK);
    const ccz = Math.floor(pz / SCATTER_CHUNK);
    const centerKey = `${ccx}:${ccz}`;
    if (centerKey !== this.lastCenter) {
      this.lastCenter = centerKey;
      const want = new Set<string>();
      for (let dx = -this.radius; dx <= this.radius; dx++) {
        for (let dz = -this.radius; dz <= this.radius; dz++) {
          want.add(`${ccx + dx}:${ccz + dz}`);
        }
      }
      for (const key of want) {
        if (!this.liveNodes.has(key)) {
          const [cx, cz] = key.split(":").map(Number);
          this.liveNodes.set(key, mapChunkNodes(cx!, cz!));
          this.liveScenery.set(key, mapChunkScenery(cx!, cz!));
        }
      }
      for (const key of this.liveNodes.keys()) {
        if (!want.has(key)) {
          this.liveNodes.delete(key);
          this.liveScenery.delete(key);
        }
      }
      this.dirty = true;
    }
    if (this.dirty) this.rebuild();
  }

  private rebuild() {
    this.dirty = false;
    const buffers = new Map<string, number[]>();
    const push = (model: string, x: number, y: number, z: number, yaw: number, scale: number) => {
      let arr = buffers.get(model);
      if (!arr) {
        arr = [];
        buffers.set(model, arr);
      }
      const m = Matrix.Compose(
        new Vector3(scale, scale, scale),
        Quaternion.FromEulerAngles(0, yaw, 0),
        new Vector3(x, y, z),
      );
      arr.push(...m.toArray());
    };

    for (const nodes of this.liveNodes.values()) {
      for (const n of nodes) {
        const sp = NODE_SPECIES[n.species];
        if (!sp) continue;
        if (this.isDepleted(n.id)) {
          if (sp.kind === "tree") push("tree_stump", n.x, n.y, n.z, n.yaw, n.scale);
          else if (sp.kind === "rock") push("rock_rubble", n.x, n.y, n.z, n.yaw, n.scale);
          // reeds/flowers vanish while respawning
        } else {
          const model = SPECIES_MODEL[n.species];
          const y = sp.kind === "fishing" ? WATER_LEVEL + 0.05 : n.y;
          if (model) push(model, n.x, y, n.z, n.yaw, n.scale);
        }
      }
    }
    for (const items of this.liveScenery.values()) {
      for (const s of items) push(s.kind, s.x, s.y, s.z, s.yaw, s.scale);
    }
    // static fixtures per map
    if (activeMap().id === "overworld") {
      push("bank_booth", SPAWN.x + 10, 4.0, SPAWN.z - 6, Math.PI, 1);
      push("hearth", SPAWN.x, 4.0, SPAWN.z, 0, 1);
      for (const t of TOWNS) {
        for (const b of t.buildings) {
          push(b.kind, b.x, mapHeightAt(b.x, b.z) - 0.08, b.z, b.yaw, b.scale);
        }
      }
    }
    for (const portal of PORTALS) {
      if (portal.map === activeMap().id) {
        push("cave_entrance", portal.x, mapHeightAt(portal.x, portal.z) - 0.05, portal.z, 0, 1);
      }
    }

    for (const [model, base] of this.bases) {
      const arr = buffers.get(model);
      if (arr && arr.length) {
        base.setEnabled(true);
        base.thinInstanceSetBuffer("matrix", new Float32Array(arr), 16, false);
      } else {
        base.thinInstanceSetBuffer("matrix", new Float32Array(0), 16, false);
        base.setEnabled(false);
      }
    }
  }

  /** Nearest interactable node to a world point (for tap-to-gather). */
  nearestNode(x: number, z: number): WorldNode | null {
    let best: WorldNode | null = null;
    let bestD = Infinity;
    for (const nodes of this.liveNodes.values()) {
      for (const n of nodes) {
        const sp = NODE_SPECIES[n.species];
        if (!sp) continue;
        const d = Math.hypot(n.x - x, n.z - z);
        if (d < bestD && d < sp.radius * n.scale + 1.3) {
          best = n;
          bestD = d;
        }
      }
    }
    return best;
  }
}
