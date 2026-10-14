import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3, Matrix, Vector3 } from "@babylonjs/core/Maths/math";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import type { Scene } from "@babylonjs/core/scene";

interface Projectile {
  mesh: Mesh;
  from: Vector3;
  to: Vector3;
  t: number;
  ms: number;
}

interface Splat {
  el: HTMLDivElement;
  world: Vector3;
  born: number;
}

const SPLAT_MS = 1000;

/** Damage splats (DOM, projected) + arrow/bolt projectiles. */
export class FxManager {
  private projectiles: Projectile[] = [];
  private splats: Splat[] = [];
  private container: HTMLDivElement;
  private arrowMat: StandardMaterial;
  private boltMat: StandardMaterial;

  constructor(private scene: Scene) {
    this.container = document.createElement("div");
    this.container.className = "splats";
    document.getElementById("hud")!.appendChild(this.container);
    this.arrowMat = new StandardMaterial("arrow", scene);
    this.arrowMat.emissiveColor = new Color3(0.55, 0.42, 0.25);
    this.arrowMat.disableLighting = true;
    this.boltMat = new StandardMaterial("bolt", scene);
    this.boltMat.emissiveColor = new Color3(0.6, 0.35, 1.0);
    this.boltMat.disableLighting = true;
  }

  shoot(from: { x: number; z: number }, to: { x: number; z: number }, style: "archery" | "magic") {
    const mesh =
      style === "archery"
        ? MeshBuilder.CreateBox("arrow", { width: 0.05, height: 0.05, depth: 0.7 }, this.scene)
        : MeshBuilder.CreateSphere("bolt", { diameter: 0.26, segments: 4 }, this.scene);
    mesh.material = style === "archery" ? this.arrowMat : this.boltMat;
    mesh.isPickable = false;
    const fromV = new Vector3(from.x, groundY(from.x, from.z) + 1.3, from.z);
    const toV = new Vector3(to.x, groundY(to.x, to.z) + 1.0, to.z);
    mesh.position.copyFrom(fromV);
    mesh.lookAt(toV);
    this.projectiles.push({ mesh, from: fromV, to: toV, t: 0, ms: style === "archery" ? 240 : 330 });
  }

  splat(x: number, z: number, yOff: number, text: string, kind: "hit" | "miss" | "hurt") {
    const el = document.createElement("div");
    el.className = `splat ${kind}`;
    el.textContent = text;
    this.container.appendChild(el);
    this.splats.push({ el, world: new Vector3(x, groundY(x, z) + yOff, z), born: performance.now() });
  }

  update(dtMs: number) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i]!;
      p.t += dtMs / p.ms;
      if (p.t >= 1) {
        p.mesh.dispose();
        this.projectiles.splice(i, 1);
        continue;
      }
      Vector3.LerpToRef(p.from, p.to, p.t, p.mesh.position);
      p.mesh.position.y += Math.sin(p.t * Math.PI) * 0.6; // arc
    }

    const now = performance.now();
    const engine = this.scene.getEngine();
    const w = engine.getRenderWidth();
    const h = engine.getRenderHeight();
    const cam = this.scene.activeCamera;
    if (!cam) return;
    for (let i = this.splats.length - 1; i >= 0; i--) {
      const s = this.splats[i]!;
      const age = now - s.born;
      if (age > SPLAT_MS) {
        s.el.remove();
        this.splats.splice(i, 1);
        continue;
      }
      const proj = Vector3.Project(
        s.world,
        Matrix.Identity(),
        this.scene.getTransformMatrix(),
        cam.viewport.toGlobal(w, h),
      );
      const cssX = (proj.x / w) * 100;
      const cssY = (proj.y / h) * 100;
      s.el.style.left = `${cssX}%`;
      s.el.style.top = `calc(${cssY}% - ${age * 0.03}px)`;
      s.el.style.opacity = String(1 - age / SPLAT_MS);
    }
  }
}

import { mapHeightAt } from "@world/content";
function groundY(x: number, z: number): number {
  return mapHeightAt(x, z);
}
