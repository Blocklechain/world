import { Matrix, Vector3 } from "@babylonjs/core/Maths/math";
import type { Scene } from "@babylonjs/core/scene";

import { NPCS, mapHeightAt } from "@world/content";
import { CharacterLibrary, PlayerAvatar } from "./players";

/** Townsfolk: static avatars with floating name labels. */
export class NpcRenderer {
  private avatars = new Map<string, PlayerAvatar>();
  private labels = new Map<string, HTMLDivElement>();
  private container: HTMLDivElement;

  constructor(
    private scene: Scene,
    lib: CharacterLibrary,
  ) {
    this.container = document.createElement("div");
    this.container.className = "npc-labels";
    document.getElementById("hud")!.appendChild(this.container);
    for (const npc of NPCS) {
      const av = new PlayerAvatar(scene, lib, npc.look, `npc:${npc.id}`);
      av.root.position.set(npc.x, mapHeightAt(npc.x, npc.z), npc.z);
      av.root.rotation.y = npc.yaw;
      this.avatars.set(npc.id, av);
      const el = document.createElement("div");
      el.className = "npc-label";
      el.textContent = npc.name;
      this.container.appendChild(el);
      this.labels.set(npc.id, el);
    }
  }

  nearest(x: number, z: number): string | null {
    let best: string | null = null;
    let bestD = 2.4;
    for (const npc of NPCS) {
      const d = Math.hypot(npc.x - x, npc.z - z);
      if (d < bestD) {
        best = npc.id;
        bestD = d;
      }
    }
    return best;
  }

  npcPos(id: string): { x: number; z: number } | null {
    const npc = NPCS.find((n) => n.id === id);
    return npc ? { x: npc.x, z: npc.z } : null;
  }

  update(px: number, pz: number) {
    const engine = this.scene.getEngine();
    const w = engine.getRenderWidth();
    const h = engine.getRenderHeight();
    const cam = this.scene.activeCamera;
    if (!cam) return;
    for (const npc of NPCS) {
      const el = this.labels.get(npc.id)!;
      const d = Math.hypot(npc.x - px, npc.z - pz);
      if (d > 36) {
        el.style.display = "none";
        continue;
      }
      const head = new Vector3(npc.x, mapHeightAt(npc.x, npc.z) + 2.05, npc.z);
      const proj = Vector3.Project(head, Matrix.Identity(), this.scene.getTransformMatrix(), cam.viewport.toGlobal(w, h));
      if (proj.z > 1 || proj.z < 0) {
        el.style.display = "none";
        continue;
      }
      el.style.display = "block";
      el.style.left = `${(proj.x / w) * 100}%`;
      el.style.top = `${(proj.y / h) * 100}%`;
    }
  }
}
