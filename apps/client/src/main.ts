import { DEFAULT_ZONE, ZONES } from "@world/shared";
import { connect, type Net } from "./net";
import { PlayerRenderer } from "./players";
import { createScene } from "./scene";
import { mountHud } from "./ui";

const canvas = document.getElementById("game") as HTMLCanvasElement;
const hudEl = document.getElementById("hud") as HTMLElement;

const world = createScene(canvas, DEFAULT_ZONE);
mountHud(hudEl, null, "Connecting…");

const name = localStorage.getItem("world:name") ?? `Wanderer${Math.floor(Math.random() * 999)}`;
localStorage.setItem("world:name", name);

let net: Net | null = null;
let renderer: PlayerRenderer | null = null;

connect(name, DEFAULT_ZONE)
  .then((n) => {
    net = n;
    renderer = new PlayerRenderer(world.scene, n.room, n.sessionId);
    mountHud(hudEl, n, `${ZONES[DEFAULT_ZONE].name} — ${name}`);
    n.room.onLeave(() => mountHud(hudEl, n, "Disconnected — reload to rejoin"));
  })
  .catch((err) => {
    console.error(err);
    mountHud(hudEl, null, "Could not reach the server");
  });

// tap-to-move: short taps only, so camera drags don't move the player
let downAt = 0;
let downPos = { x: 0, y: 0 };
canvas.addEventListener("pointerdown", (e) => {
  downAt = performance.now();
  downPos = { x: e.clientX, y: e.clientY };
});
canvas.addEventListener("pointerup", (e) => {
  const dt = performance.now() - downAt;
  const moved = Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y);
  if (dt > 350 || moved > 12 || !net || !renderer) return;
  const pick = world.scene.pick(e.clientX, e.clientY, (m) => m.name === "ground");
  if (pick?.pickedPoint) {
    net.sendMove(pick.pickedPoint.x, pick.pickedPoint.z);
    renderer.setLocalTarget(pick.pickedPoint.x, pick.pickedPoint.z);
  }
});

// camera follows the local player
world.scene.onBeforeRenderObservable.add(() => {
  renderer?.update(world.engine.getDeltaTime());
  const self = renderer?.getSelfPosition();
  if (self) {
    world.camera.target.x += (self.x - world.camera.target.x) * 0.12;
    world.camera.target.z += (self.z - world.camera.target.z) * 0.12;
  }
});
