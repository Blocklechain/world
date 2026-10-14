import { SceneLoader } from "@babylonjs/core/Loading/sceneLoader";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math";
import type { InstancedMesh } from "@babylonjs/core/Meshes/instancedMesh";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Scene } from "@babylonjs/core/scene";
import type { Room } from "colyseus.js";

import { MONSTERS, WATER_LEVEL, heightAt } from "@world/content";

interface MonsterLike {
  species: string;
  x: number;
  z: number;
  heading: number;
  moving: boolean;
  hp: number;
  maxHp: number;
  dead: boolean;
}

const MODELS = [
  "vermin", "wolf", "goblin", "goblin_brute", "bandit", "skeleton", "acolyte", "spider", "troll",
];

interface MonsterView {
  root: TransformNode;
  body: InstancedMesh;
  bar: Mesh;
  barBg: Mesh;
  lungeT: number;
  bob: number;
}

/** Renders server monsters: interpolated movement, procedural bob/lunge,
 * unlit health bars, topple on death. Only monsters within range are live. */
export class MonsterRenderer {
  private bases = new Map<string, Mesh>();
  private views = new Map<string, MonsterView>();
  private barMat: StandardMaterial;
  private barBgMat: StandardMaterial;
  ready = false;
  range = 170;

  constructor(
    private scene: Scene,
    private room: Room,
  ) {
    this.barMat = new StandardMaterial("hp", scene);
    this.barMat.emissiveColor = new Color3(0.75, 0.15, 0.12);
    this.barMat.disableLighting = true;
    this.barBgMat = new StandardMaterial("hpbg", scene);
    this.barBgMat.emissiveColor = new Color3(0.1, 0.1, 0.1);
    this.barBgMat.disableLighting = true;
    void this.load();
  }

  private async load() {
    await Promise.all(
      MODELS.map(async (name) => {
        const res = await SceneLoader.ImportMeshAsync("", "/assets/creatures/", `${name}.glb`, this.scene);
        const mesh = res.meshes.find((m) => m.getTotalVertices() > 0) as Mesh;
        mesh.setParent(null);
        mesh.bakeCurrentTransformIntoVertices();
        mesh.setEnabled(false);
        mesh.isPickable = false;
        for (const m of res.meshes) if (m !== mesh) m.dispose();
        this.bases.set(name, mesh);
      }),
    );
    this.ready = true;
  }

  /** nearest living monster to a world point (tap-to-attack). */
  nearest(x: number, z: number): { id: string; name: string } | null {
    const monsters = (this.room.state as { monsters?: Map<string, MonsterLike> }).monsters;
    if (!monsters) return null;
    let best: string | null = null;
    let bestD = 2.2;
    monsters.forEach((m, id) => {
      if (m.dead) return;
      const d = Math.hypot(m.x - x, m.z - z);
      const r = m.species === "troll" ? 3 : 2.2;
      if (d < Math.min(bestD, r)) {
        best = id;
        bestD = d;
      }
    });
    if (!best) return null;
    const m = monsters.get(best)!;
    return { id: best, name: MONSTERS[m.species]?.name ?? m.species };
  }

  monsterAt(id: string): { x: number; z: number } | null {
    const monsters = (this.room.state as { monsters?: Map<string, MonsterLike> }).monsters;
    const m = monsters?.get(id);
    return m ? { x: m.x, z: m.z } : null;
  }

  lunge(id: string) {
    const v = this.views.get(id);
    if (v) v.lungeT = 1;
  }

  update(dtMs: number, px: number, pz: number) {
    if (!this.ready) return;
    const monsters = (this.room.state as { monsters?: Map<string, MonsterLike> }).monsters;
    if (!monsters) return;
    const seen = new Set<string>();
    const t = performance.now() / 1000;

    monsters.forEach((m, id) => {
      const inRange = Math.hypot(m.x - px, m.z - pz) < this.range;
      let v: MonsterView | undefined = this.views.get(id);
      if (!inRange || (m.dead && !v)) {
        return;
      }
      seen.add(id);
      if (v === undefined) {
        const base = this.bases.get(MONSTERS[m.species]?.model ?? m.species) ?? this.bases.get("goblin")!;
        const root = new TransformNode(`monster:${id}`, this.scene);
        const body = base.createInstance(`monster:${id}:body`);
        body.parent = root;
        body.isPickable = false;
        const barBg = MeshBuilder.CreatePlane(`hpbg:${id}`, { width: 1.0, height: 0.1 }, this.scene);
        barBg.material = this.barBgMat;
        barBg.billboardMode = 7;
        barBg.parent = root;
        const bar = MeshBuilder.CreatePlane(`hp:${id}`, { width: 0.96, height: 0.065 }, this.scene);
        bar.material = this.barMat;
        bar.billboardMode = 7;
        bar.parent = root;
        const h = m.species === "troll" ? 2.8 : m.species === "wolf" || m.species === "vermin" ? 1.1 : 2.0;
        barBg.position.y = h;
        bar.position.y = h;
        bar.position.z = -0.001;
        root.position.set(m.x, heightAt(m.x, m.z), m.z);
        v = { root, body, bar, barBg, lungeT: 0, bob: Math.random() * 7 };
        this.views.set(id, v);
      }

      const pos = v.root.position;
      const k = 1 - Math.exp(-dtMs / 90);
      pos.x += (m.x - pos.x) * k;
      pos.z += (m.z - pos.z) * k;
      const ground = heightAt(pos.x, pos.z);
      pos.y = Math.min(ground, WATER_LEVEL - 0.1 < ground ? ground : ground);
      pos.y = ground;
      v.root.rotation.y += (angleLerp(v.root.rotation.y, m.heading) - v.root.rotation.y) * k;

      if (m.dead) {
        // topple + sink
        v.body.rotation.x = Math.min(Math.PI / 2, v.body.rotation.x + dtMs / 350);
        v.bar.setEnabled(false);
        v.barBg.setEnabled(false);
        if (v.body.rotation.x >= Math.PI / 2) pos.y = ground - 0.4;
        return;
      }
      v.body.rotation.x = 0;
      v.bar.setEnabled(true);
      v.barBg.setEnabled(true);

      // procedural life: bob while moving, breathe at rest, lunge on attack
      const bob = m.moving ? Math.abs(Math.sin(t * 9 + v.bob)) * 0.08 : Math.sin(t * 2 + v.bob) * 0.02;
      v.body.position.y = bob;
      if (v.lungeT > 0) {
        v.lungeT = Math.max(0, v.lungeT - dtMs / 260);
        const l = Math.sin((1 - v.lungeT) * Math.PI) * 0.45;
        v.body.position.z = -l; // toward facing (-Z after yaw)
      } else {
        v.body.position.z = 0;
      }

      const frac = Math.max(0, m.hp / m.maxHp);
      v.bar.scaling.x = frac;
      this.barMat.emissiveColor = new Color3(0.75, 0.15, 0.12);
    });

    for (const [id, v] of this.views) {
      if (!seen.has(id)) {
        v.root.dispose(false, true);
        this.views.delete(id);
      }
    }
  }
}

function angleLerp(a: number, b: number): number {
  let d = b - a;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return a + d;
}
