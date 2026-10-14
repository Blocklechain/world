import type { AnimationGroup } from "@babylonjs/core/Animations/animationGroup";
import type { AssetContainer } from "@babylonjs/core/assetContainer";
import type { Bone } from "@babylonjs/core/Bones/bone";
import { SceneLoader } from "@babylonjs/core/Loading/sceneLoader";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Scene } from "@babylonjs/core/scene";
import "@babylonjs/loaders/glTF/2.0";
import type { Room } from "colyseus.js";

import { ITEMS, WATER_LEVEL, decodeLook, heightAt, isWalkable, resolveMove, slopeSpeedMult, type Appearance } from "@world/content";

const WEAPON_MODELS: Record<string, string> = Object.fromEntries(
  Object.values(ITEMS)
    .filter((i) => i.equip)
    .map((i) => [i.id, i.equip!.model]),
);
import { RUN_SPEED } from "@world/shared";

interface PlayerLike {
  x: number;
  z: number;
  heading: number;
  moving: boolean;
  name: string;
  action: string;
  look: string;
  weapon: string;
}

/** Yaw offset between the GLB's authored forward and world heading 0. */
const HEADING_OFFSET = 0;

/** Loads body/hair GLBs once and hands out instances. */
export class CharacterLibrary {
  private bodies = new Map<string, Promise<AssetContainer>>();
  private hair: Promise<AssetContainer> | null = null;

  constructor(private scene: Scene) {}

  body(race: string, sex: string): Promise<AssetContainer> {
    const key = `${race}_${sex}`;
    let p = this.bodies.get(key);
    if (!p) {
      p = SceneLoader.LoadAssetContainerAsync("/assets/characters/", `body_${key}.glb`, this.scene);
      this.bodies.set(key, p);
    }
    return p;
  }

  private gearCache = new Map<string, Promise<AssetContainer>>();

  async gear(model: string): Promise<Mesh | null> {
    let p = this.gearCache.get(model);
    if (!p) {
      p = SceneLoader.LoadAssetContainerAsync("/assets/gear/", `${model}.glb`, this.scene);
      this.gearCache.set(model, p);
    }
    const c = await p.catch(() => null);
    const src = c?.meshes.find((m) => m.getTotalVertices() > 0) as Mesh | undefined;
    if (!src) return null;
    const clone = src.clone(`${model}:inst`, null)!;
    clone.setEnabled(true);
    return clone;
  }

  async attachment(name: string): Promise<Mesh | null> {
    this.hair ??= SceneLoader.LoadAssetContainerAsync("/assets/characters/", "hair.glb", this.scene);
    const c = await this.hair;
    const src = c.meshes.find((m) => m.name === name && m.getTotalVertices() > 0) as Mesh | undefined;
    if (!src) return null;
    const clone = src.clone(`${name}:inst`, null)!;
    clone.setEnabled(true);
    return clone;
  }
}

export class PlayerAvatar {
  root: TransformNode;
  loaded = false;
  private clips = new Map<string, AnimationGroup>();
  private current: AnimationGroup | null = null;
  private disposed = false;
  private lib2: CharacterLibrary;
  private handNode: TransformNode | null = null;
  private weaponMesh: Mesh | null = null;
  private weaponId = "";

  constructor(
    private scene: Scene,
    lib: CharacterLibrary,
    look: Appearance,
    id: string,
    onMeshes?: (root: TransformNode) => void,
  ) {
    this.root = new TransformNode(`player:${id}`, scene);
    this.lib2 = lib;
    void this.init(lib, look, id, onMeshes);
  }

  private async init(lib: CharacterLibrary, look: Appearance, id: string, onMeshes?: (root: TransformNode) => void) {
    const container = await lib.body(look.race, look.sex);
    if (this.disposed) return;
    const entries = container.instantiateModelsToScene((n) => `${id}:${n}`, false);
    for (const node of entries.rootNodes) node.parent = this.root;
    for (const group of entries.animationGroups) {
      const base = group.name.split(":").pop() ?? group.name;
      this.clips.set(base, group);
      group.stop();
    }

    // hair/beard ride the head bone's linked transform node
    const skeleton = entries.skeletons[0];
    const headBone = skeleton?.bones.find((b: Bone) => b.name === "head");
    const headNode = headBone?.getTransformNode();
    this.handNode = skeleton?.bones.find((b: Bone) => b.name === "socket.hand_r")?.getTransformNode() ?? null;
    if (headNode) {
      const scale = look.race === "dwarf" ? 1.12 : look.race === "elf" ? 0.94 : 1;
      const mount = async (name: string, yOff: number) => {
        const mesh = await lib.attachment(name);
        if (!mesh || this.disposed) {
          mesh?.dispose();
          return;
        }
        mesh.parent = headNode;
        mesh.position.set(0, yOff, 0);
        mesh.scaling.setAll(scale);
      };
      if (look.hair !== "bald") await mount(`hair_${look.hair}_${look.hairColor}`, 0.14 * scale);
      if (look.beard !== "none") await mount(`beard_${look.beard}_${look.hairColor}`, 0.05 * scale);
    }

    this.loaded = true;
    this.play("idle");
    onMeshes?.(this.root);
  }

  setWeapon(itemId: string) {
    if (itemId === this.weaponId) return;
    this.weaponId = itemId;
    this.weaponMesh?.dispose();
    this.weaponMesh = null;
    const model = itemId ? WEAPON_MODELS[itemId] : undefined;
    if (!model || !this.handNode) return;
    void this.lib2.gear(model).then((mesh) => {
      if (!mesh) return;
      if (this.disposed || this.weaponId !== itemId) {
        mesh.dispose();
        return;
      }
      mesh.parent = this.handNode;
      mesh.position.set(0, 0.04, 0);
      mesh.rotation.set(Math.PI / 2, 0, 0); // grip axis -> along the hand bone
      this.weaponMesh = mesh;
    });
  }

  play(name: string, speedRatio = 1) {
    if (name === "melee") name = "attack_1h";
    const clip =
      this.clips.get(name) ??
      this.clips.get("idle"); // graceful if a clip is missing from an older GLB
    if (!clip || this.current === clip) {
      if (clip) clip.speedRatio = speedRatio;
      return;
    }
    this.current?.stop();
    clip.start(true, speedRatio);
    this.current = clip;
  }

  dispose() {
    this.disposed = true;
    this.clips.forEach((c) => c.dispose());
    this.root.dispose(false, true);
  }
}

/**
 * Renders every player in room state with their chosen race/sex/hair. The
 * local player is predicted; remotes are smoothed toward server state.
 */
export class PlayerRenderer {
  private avatars = new Map<string, PlayerAvatar>();
  private localTarget: { x: number; z: number } | null = null;
  private lib: CharacterLibrary;

  constructor(
    private scene: Scene,
    private room: Room,
    private selfId: string,
    private onAvatar?: (root: TransformNode) => void,
    lib?: CharacterLibrary,
  ) {
    this.lib = lib ?? new CharacterLibrary(scene);
  }

  setLocalTarget(x: number, z: number) {
    this.localTarget = { x, z };
  }

  getSelfPosition(): { x: number; z: number } | null {
    const a = this.avatars.get(this.selfId);
    return a ? { x: a.root.position.x, z: a.root.position.z } : null;
  }

  update(dtMs: number) {
    const players = (this.room.state as { players?: Map<string, PlayerLike> }).players;
    if (!players) return;
    const seen = new Set<string>();

    players.forEach((p: PlayerLike, id: string) => {
      seen.add(id);
      let av = this.avatars.get(id);
      if (!av) {
        av = new PlayerAvatar(this.scene, this.lib, decodeLook(p.look), id, this.onAvatar);
        av.root.position.set(p.x, 0, p.z);
        this.avatars.set(id, av);
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
          const ux = dx / dist;
          const uz = dz / dist;
          const s = Math.min(step * slopeSpeedMult(pos.x, pos.z, ux, uz), dist);
          const slid = resolveMove(pos.x + ux * s, pos.z + uz * s);
          if (isWalkable(slid.x, slid.z) && Math.hypot(slid.x - pos.x, slid.z - pos.z) > s * 0.15) {
            pos.x = slid.x;
            pos.z = slid.z;
            av.root.rotation.y = Math.atan2(dx, dz) + HEADING_OFFSET;
          } else {
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

      av.setWeapon(p.weapon ?? "");
      const action = p.action === "swim" ? "swim" : isMoving ? "run" : p.action || "idle";
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
