import type { AnimationGroup } from "@babylonjs/core/Animations/animationGroup";
import type { AssetContainer } from "@babylonjs/core/assetContainer";
import { SceneLoader } from "@babylonjs/core/Loading/sceneLoader";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Scene } from "@babylonjs/core/scene";
import "@babylonjs/loaders/glTF/2.0";
import type { Room } from "colyseus.js";

import { WATER_LEVEL, heightAt, isWalkable } from "@world/content";
import { RUN_SPEED } from "@world/shared";

interface PlayerLike {
  x: number;
  z: number;
  heading: number;
  moving: boolean;
  name: string;
  action: string;
}

/** Yaw offset between the GLB's authored forward and world heading 0. */
const HEADING_OFFSET = 0;

class PlayerAvatar {
  root: TransformNode;
  private clips = new Map<string, AnimationGroup>();
  private current: AnimationGroup | null = null;

  constructor(scene: Scene, container: AssetContainer, id: string) {
    this.root = new TransformNode(`player:${id}`, scene);
    const entries = container.instantiateModelsToScene((n) => `${id}:${n}`, false);
    for (const node of entries.rootNodes) node.parent = this.root;
    for (const group of entries.animationGroups) {
      const base = group.name.split(":").pop() ?? group.name;
      this.clips.set(base, group);
      group.stop();
    }
    this.play("idle");
  }

  play(name: string, speedRatio = 1) {
    const clip =
      this.clips.get(name) ??
      this.clips.get(name === "chop" || name === "mine" || name === "swim" ? "idle" : name);
    if (!clip || this.current === clip) {
      if (clip) clip.speedRatio = speedRatio;
      return;
    }
    this.current?.stop();
    clip.start(true, speedRatio);
    this.current = clip;
  }

  dispose() {
    this.clips.forEach((c) => c.dispose());
    this.root.dispose(false, true);
  }
}

/**
 * Renders every player in room state using the rigged base body. The local
 * player is predicted (moves toward its tap target at server speed); remotes
 * are smoothed toward the latest server state.
 */
export class PlayerRenderer {
  private avatars = new Map<string, PlayerAvatar>();
  private localTarget: { x: number; z: number } | null = null;
  private container: AssetContainer | null = null;

  constructor(
    private scene: Scene,
    private room: Room,
    private selfId: string,
    private onAvatar?: (root: TransformNode) => void,
  ) {
    void SceneLoader.LoadAssetContainerAsync("/assets/characters/", "base_body.glb", scene).then(
      (c) => (this.container = c),
    );
  }

  setLocalTarget(x: number, z: number) {
    this.localTarget = { x, z };
  }

  getSelfPosition(): { x: number; z: number } | null {
    const a = this.avatars.get(this.selfId);
    return a ? { x: a.root.position.x, z: a.root.position.z } : null;
  }

  update(dtMs: number) {
    if (!this.container) return;
    const players = (this.room.state as { players?: Map<string, PlayerLike> }).players;
    if (!players) return;
    const seen = new Set<string>();

    players.forEach((p: PlayerLike, id: string) => {
      seen.add(id);
      let av = this.avatars.get(id);
      if (!av) {
        av = new PlayerAvatar(this.scene, this.container!, id);
        av.root.position.set(p.x, 0, p.z);
        this.avatars.set(id, av);
        this.onAvatar?.(av.root);
      }
      const pos = av.root.position;
      let isMoving: boolean;
      const groundY = heightAt(pos.x, pos.z);
      // swimmers float chest-deep instead of walking the seabed
      pos.y = groundY < WATER_LEVEL - 0.25 ? Math.max(groundY, WATER_LEVEL - 1.15) : groundY;

      if (id === this.selfId && this.localTarget) {
        const step = (RUN_SPEED * dtMs) / 1000;
        const dx = this.localTarget.x - pos.x;
        const dz = this.localTarget.z - pos.z;
        const dist = Math.hypot(dx, dz);
        isMoving = dist > 0.05;
        if (isMoving) {
          const s = Math.min(step, dist);
          const nx = pos.x + (dx / dist) * s;
          const nz = pos.z + (dz / dist) * s;
          if (isWalkable(nx, nz)) {
            pos.x = nx;
            pos.z = nz;
            av.root.rotation.y = Math.atan2(dx, dz) + HEADING_OFFSET;
          } else {
            // mirror the server: stop at shores/cliffs instead of running in place
            this.localTarget = null;
            isMoving = false;
          }
        }
        const err = Math.hypot(p.x - pos.x, p.z - pos.z);
        if (err > 1.5) {
          pos.x += (p.x - pos.x) * 0.2;
          pos.z += (p.z - pos.z) * 0.2;
        }
      } else {
        const k = 1 - Math.exp(-dtMs / 80);
        const dx = p.x - pos.x;
        const dz = p.z - pos.z;
        pos.x += dx * k;
        pos.z += dz * k;
        isMoving = p.moving || Math.hypot(dx, dz) > 0.08;
        if (p.moving) av.root.rotation.y = p.heading + HEADING_OFFSET;
      }

      const action =
        p.action === "swim"
          ? "swim"
          : isMoving
            ? "run"
            : p.action === "chop" || p.action === "mine"
              ? p.action
              : "idle";
      av.play(action, action === "run" ? 1.35 : 1);
    });

    for (const [id, av] of this.avatars) {
      if (!seen.has(id)) {
        av.dispose();
        this.avatars.delete(id);
      }
    }
  }
}
