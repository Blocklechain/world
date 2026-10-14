import { heightAt, regionAt } from "@world/content";
import { connect, type AuthResult, type Net } from "./net";
import { PlayerRenderer } from "./players";
import { ScatterManager } from "./scatter";
import { createScene } from "./scene";
import { TerrainManager } from "./terrain";
import { mountAuth, mountCreate, mountHud, mountStatus } from "./ui";

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
    net = await connect(auth?.name ?? guestName, auth?.token ?? null);
  } catch (err) {
    console.error(err);
    localStorage.removeItem("world:auth");
    mountAuth(hudEl, (a) => void start(a));
    return;
  }

  const scatter = new ScatterManager(world.scene, (id) => net.isDepleted(id));
  void scatter.load();
  net.onDepletedChange(() => scatter.markDirty());

  const renderer = new PlayerRenderer(world.scene, net.room, net.sessionId, (root) => {
    for (const m of root.getChildMeshes()) world.shadows.addShadowCaster(m, false);
  });

  const statusFor = (x: number, z: number) =>
    `${regionAt(x, z).name} — ${auth?.name ?? guestName}`;
  mountHud(hudEl, net, statusFor(0, 0));
  let lastRegion = "";

  net.room.onLeave(() => mountStatus(hudEl, "Disconnected — reload to rejoin"));

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
    const node = scatter.nearestNode(x, z);
    if (node && !net.isDepleted(node.id)) {
      net.interact(node.id);
      renderer.setLocalTarget(node.x, node.z);
    } else {
      net.sendMove(x, z);
      renderer.setLocalTarget(x, z);
    }
  });

  world.scene.onBeforeRenderObservable.add(() => {
    renderer.update(world.engine.getDeltaTime());
    const self = renderer.getSelfPosition();
    if (!self) return;
    terrain.update(self.x, self.z);
    scatter.update(self.x, self.z);
    const ty = heightAt(self.x, self.z) + 1.1;
    world.camera.target.x += (self.x - world.camera.target.x) * 0.12;
    world.camera.target.z += (self.z - world.camera.target.z) * 0.12;
    world.camera.target.y += (ty - world.camera.target.y) * 0.08;
    const region = regionAt(self.x, self.z).name;
    if (region !== lastRegion) {
      lastRegion = region;
      mountHud(hudEl, net, statusFor(self.x, self.z));
    }
  });
}
