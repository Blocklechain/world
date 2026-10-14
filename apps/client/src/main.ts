import { PORTALS, activeMap, mapHeightAt, regionAt, setActiveMap } from "@world/content";
import { FxManager } from "./fx";
import { MonsterRenderer } from "./monsters";
import { connect, type AuthResult, type Net } from "./net";
import { NpcRenderer } from "./npcs";
import { CharacterLibrary, PlayerRenderer } from "./players";
import { ScatterManager } from "./scatter";
import { createScene } from "./scene";
import { TerrainManager } from "./terrain";
import { mountAuth, mountCreate, mountHud, mountStatus, type CombatRef } from "./ui";

setActiveMap(sessionStorage.getItem("world:map") ?? "overworld");

const canvas = document.getElementById("game") as HTMLCanvasElement;
const hudEl = document.getElementById("hud") as HTMLElement;

const world = createScene(canvas);
const terrain = new TerrainManager(world.scene);

function storedAuth(): AuthResult | null {
  try {
    return JSON.parse(localStorage.getItem("world:auth") ?? "null");
  } catch {
    return null;
  }
}

const existing = storedAuth();
if (existing) {
  void gate(existing);
} else {
  mountAuth(hudEl, (auth) => (auth ? gate(auth) : void start(null)));
}

/** New accounts design their hero before entering the world. */
function gate(auth: AuthResult) {
  if (auth.hasAppearance === false) {
    mountCreate(hudEl, auth, () => {
      auth.hasAppearance = true;
      localStorage.setItem("world:auth", JSON.stringify(auth));
      void start(auth);
    });
  } else {
    void start(auth);
  }
}

async function start(auth: AuthResult | null) {
  mountStatus(hudEl, "Entering Veyra…");
  const guestName = localStorage.getItem("world:name") ?? `Wanderer${Math.floor(Math.random() * 999)}`;
  localStorage.setItem("world:name", guestName);

  let net: Net;
  try {
    const fromMap = sessionStorage.getItem("world:from");
    sessionStorage.removeItem("world:from");
    net = await connect(
      auth?.name ?? guestName,
      auth?.token ?? null,
      activeMap().kind === "cave" ? "cave" : "zone",
      fromMap,
    );
  } catch (err) {
    console.error(err);
    localStorage.removeItem("world:auth");
    mountAuth(hudEl, (a) => void start(a));
    return;
  }

  const scatter = new ScatterManager(world.scene, (id) => net.isDepleted(id));
  void scatter.load();
  net.onDepletedChange(() => scatter.markDirty());

  const lib = new CharacterLibrary(world.scene);
  const renderer = new PlayerRenderer(
    world.scene,
    net.room,
    net.sessionId,
    (root) => {
      for (const m of root.getChildMeshes()) world.shadows.addShadowCaster(m, false);
    },
    lib,
  );
  const npcs = activeMap().id === "overworld" ? new NpcRenderer(world.scene, lib) : null;
  const monsters = new MonsterRenderer(world.scene, net.room);
  const fx = new FxManager(world.scene);
  const combat: CombatRef = { style: "melee" };

  net.onFx((e) => {
    if (e.kind === "attack" && e.monsterId) {
      const to = monsters.monsterAt(e.monsterId);
      const attacker = (net.room.state as { players?: Map<string, { x: number; z: number }> }).players?.get(
        e.sid ?? "",
      );
      if (to && attacker && (e.style === "archery" || e.style === "magic")) {
        fx.shoot(attacker, to, e.style);
      }
      if (to) fx.splat(to.x, to.z, 1.7, e.dmg > 0 ? String(e.dmg) : "0", e.dmg > 0 ? "hit" : "miss");
    } else if (e.kind === "monsterAttack" && e.monsterId) {
      monsters.lunge(e.monsterId);
      const victim = (net.room.state as { players?: Map<string, { x: number; z: number }> }).players?.get(
        e.sid ?? "",
      );
      if (victim) fx.splat(victim.x, victim.z, 1.9, e.dmg > 0 ? String(e.dmg) : "0", e.dmg > 0 ? "hurt" : "miss");
    }
  });

  // debug handle (dev console only)
  (window as unknown as Record<string, unknown>).__world = { net, monsters, renderer, scene: world.scene };

  let pendingPortal: string | null = null;
  function travel(toMap: string) {
    pendingPortal = null;
    mountStatus(hudEl, toMap === "overworld" ? "Climbing back to daylight…" : "Descending into the dark…");
    sessionStorage.setItem("world:map", toMap);
    sessionStorage.setItem("world:from", activeMap().id);
    net.room.leave();
    setTimeout(() => location.reload(), 350);
  }

  const statusFor = (x: number, z: number) =>
    activeMap().id === "overworld"
      ? `${regionAt(x, z).name} — ${auth?.name ?? guestName}`
      : `${activeMap().name} — ${auth?.name ?? guestName}`;
  mountHud(hudEl, net, statusFor(0, 0), combat);
  let lastRegion = "";

  net.room.onLeave(() => mountStatus(hudEl, "Disconnected — reload to rejoin"));

  // tap highlight: a pulsing ring on whatever you targeted
  const { MeshBuilder } = await import("@babylonjs/core/Meshes/meshBuilder");
  const { StandardMaterial } = await import("@babylonjs/core/Materials/standardMaterial");
  const { Color3 } = await import("@babylonjs/core/Maths/math");
  const ring = MeshBuilder.CreateTorus("target-ring", { diameter: 2.4, thickness: 0.09, tessellation: 28 }, world.scene);
  const ringMat = new StandardMaterial("ring", world.scene);
  ringMat.emissiveColor = new Color3(1.0, 0.82, 0.3);
  ringMat.disableLighting = true;
  ring.material = ringMat;
  ring.isPickable = false;
  ring.setEnabled(false);
  let ringUntil = 0;
  const showRing = (x: number, z: number, radius = 1.2) => {
    ring.position.set(x, mapHeightAt(x, z) + 0.12, z);
    ring.scaling.setAll(radius);
    ring.setEnabled(true);
    ringUntil = performance.now() + 1600;
  };

  // tap-to-move / tap-to-gather (short taps only; drags orbit the camera)
  let downAt = 0;
  let downPos = { x: 0, y: 0 };
  canvas.addEventListener("pointerdown", (e) => {
    downAt = performance.now();
    downPos = { x: e.clientX, y: e.clientY };
  });
  canvas.addEventListener("pointerup", (e) => {
    const dt = performance.now() - downAt;
    const moved = Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y);
    if (dt > 350 || moved > 12) return;
    const pick = world.scene.pick(e.clientX, e.clientY, (m) => m.name.startsWith("terrain:"));
    if (!pick?.pickedPoint) return;
    const { x, z } = pick.pickedPoint;
    const portal = PORTALS.find((pt) => pt.map === activeMap().id && Math.hypot(pt.x - x, pt.z - z) < 3);
    if (portal) {
      const self = renderer.getSelfPosition();
      if (self && Math.hypot(self.x - portal.x, self.z - portal.z) > 4) {
        net.sendMove(portal.x, portal.z);
        renderer.setLocalTarget(portal.x, portal.z);
        showRing(portal.x, portal.z, 1.2);
        pendingPortal = portal.toMap;
        return;
      }
      travel(portal.toMap);
      return;
    }
    const npcId = npcs?.nearest(x, z) ?? null;
    if (npcId) {
      const np = npcs!.npcPos(npcId)!;
      const self = renderer.getSelfPosition();
      if (self && Math.hypot(self.x - np.x, self.z - np.z) > 5.5) {
        const dx = self.x - np.x;
        const dz = self.z - np.z;
        const d = Math.hypot(dx, dz) || 1;
        const tx = np.x + (dx / d) * 2.2;
        const tz = np.z + (dz / d) * 2.2;
        net.sendMove(tx, tz);
        renderer.setLocalTarget(tx, tz);
      }
      net.npcTalk(npcId);
      showRing(np.x, np.z, 0.9);
      return;
    }
    const monster = monsters.nearest(x, z);
    if (monster) {
      net.attack(monster.id, combat.style);
      const mp = monsters.monsterAt(monster.id);
      if (mp) showRing(mp.x, mp.z, 1.0);
      return;
    }
    const node = scatter.nearestNode(x, z);
    if (node && !net.isDepleted(node.id)) {
      net.interact(node.id);
      renderer.setLocalTarget(node.x, node.z);
      showRing(node.x, node.z, 1.1);
    } else {
      net.sendMove(x, z);
      renderer.setLocalTarget(x, z);
    }
  });

  world.scene.onBeforeRenderObservable.add(() => {
    const dt = world.engine.getDeltaTime();
    renderer.update(dt);
    fx.update(dt);
    if (ring.isEnabled()) {
      if (performance.now() > ringUntil) ring.setEnabled(false);
      else {
        const pulse = 1 + 0.12 * Math.sin(performance.now() / 110);
        ring.scaling.x = ring.scaling.z = ring.scaling.y * 0 + pulse * ring.scaling.y;
      }
    }
    const self = renderer.getSelfPosition();
    if (!self) return;
    monsters.update(dt, self.x, self.z);
    npcs?.update(self.x, self.z);
    if (pendingPortal) {
      const pt = PORTALS.find((q) => q.toMap === pendingPortal && q.map === activeMap().id);
      if (pt && Math.hypot(self.x - pt.x, self.z - pt.z) < 3.4) travel(pendingPortal);
    }
    terrain.update(self.x, self.z);
    scatter.update(self.x, self.z);
    const ty = mapHeightAt(self.x, self.z) + 1.1;
    world.camera.target.x += (self.x - world.camera.target.x) * 0.12;
    world.camera.target.z += (self.z - world.camera.target.z) * 0.12;
    world.camera.target.y += (ty - world.camera.target.y) * 0.08;
    const region = activeMap().id === "overworld" ? regionAt(self.x, self.z).name : activeMap().name;
    if (region !== lastRegion) {
      lastRegion = region;
      mountHud(hudEl, net, statusFor(self.x, self.z), combat);
    }
  });
}
