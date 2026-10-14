import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import type { Scene } from "@babylonjs/core/scene";
import type { Room } from "colyseus.js";

import { RUN_SPEED } from "@world/shared";

interface PlayerLike {
  x: number;
  z: number;
  heading: number;
  moving: boolean;
  name: string;
}

/**
 * Renders every player in room state. The local player is predicted (moves
 * immediately toward its tap target at server speed); remotes are smoothed
 * toward the latest server state. Capsules until the rigged body ships.
 */
export class PlayerRenderer {
  private meshes = new Map<string, Mesh>();
  private localTarget: { x: number; z: number } | null = null;

  constructor(
    private scene: Scene,
    private room: Room,
    private selfId: string,
  ) {}

  setLocalTarget(x: number, z: number) {
    this.localTarget = { x, z };
  }

  getSelfPosition(): { x: number; z: number } | null {
    const m = this.meshes.get(this.selfId);
    return m ? { x: m.position.x, z: m.position.z } : null;
  }

  update(dtMs: number) {
    const players = (this.room.state as { players?: Map<string, PlayerLike> }).players;
    if (!players) return;
    const seen = new Set<string>();

    players.forEach((p: PlayerLike, id: string) => {
      seen.add(id);
      let mesh = this.meshes.get(id);
      if (!mesh) {
        mesh = this.createCapsule(id === this.selfId);
        mesh.position.set(p.x, 0.9, p.z);
        this.meshes.set(id, mesh);
      }

      if (id === this.selfId && this.localTarget) {
        // client-side prediction: walk toward our own target at server speed
        const step = (RUN_SPEED * dtMs) / 1000;
        const dx = this.localTarget.x - mesh.position.x;
        const dz = this.localTarget.z - mesh.position.z;
        const dist = Math.hypot(dx, dz);
        if (dist > 0.01) {
          const s = Math.min(step, dist);
          mesh.position.x += (dx / dist) * s;
          mesh.position.z += (dz / dist) * s;
          mesh.rotation.y = Math.atan2(dx, dz);
        }
        // reconcile: if server disagrees by a lot, snap toward it
        const err = Math.hypot(p.x - mesh.position.x, p.z - mesh.position.z);
        if (err > 1.5) {
          mesh.position.x += (p.x - mesh.position.x) * 0.2;
          mesh.position.z += (p.z - mesh.position.z) * 0.2;
        }
      } else {
        // remote: exponential smoothing toward server state (~100ms lag feel)
        const k = 1 - Math.exp(-dtMs / 80);
        mesh.position.x += (p.x - mesh.position.x) * k;
        mesh.position.z += (p.z - mesh.position.z) * k;
        if (p.moving) mesh.rotation.y = p.heading;
      }
    });

    for (const [id, mesh] of this.meshes) {
      if (!seen.has(id)) {
        mesh.dispose();
        this.meshes.delete(id);
      }
    }
  }

  private createCapsule(isSelf: boolean): Mesh {
    const mesh = MeshBuilder.CreateCapsule("player", { height: 1.8, radius: 0.35, tessellation: 8 }, this.scene);
    const mat = new StandardMaterial("pmat", this.scene);
    mat.diffuseColor = isSelf ? new Color3(0.85, 0.72, 0.35) : new Color3(0.45, 0.55, 0.75);
    mat.specularColor = Color3.Black();
    mesh.material = mat;
    return mesh;
  }
}
