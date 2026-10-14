import type { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import type { Scene } from "@babylonjs/core/scene";

export interface ControlCallbacks {
  /** short tap at a picked terrain point */
  onTap(x: number, z: number): void;
  /** joystick steering: a world-space direction (unit-ish) */
  onSteerDir(dx: number, dz: number): void;
  onSteerEnd(): void;
}

const TAP_MS = 300;
const TAP_SLOP = 14;
const STICK_R = 54;

/**
 * MMO controls:
 * - on-screen joystick (bottom-left): drag to run, camera-relative
 * - drag anywhere on the world: orbit the camera
 * - tap: interact / move-to-point
 * - two fingers: pinch zoom; wheel zooms on desktop
 */
export function installControls(
  canvas: HTMLCanvasElement,
  scene: Scene,
  camera: ArcRotateCamera,
  cb: ControlCallbacks,
) {
  camera.inputs.removeByType("ArcRotateCameraPointersInput");
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());

  // ---- joystick DOM --------------------------------------------------------
  const hud = document.getElementById("hud")!;
  const base = document.createElement("div");
  base.className = "stick";
  const knob = document.createElement("div");
  knob.className = "stick-knob";
  base.appendChild(knob);
  hud.appendChild(base);

  let stickPid: number | null = null;
  let stickVec = { x: 0, y: 0 };

  const setKnob = (x: number, y: number) => {
    knob.style.transform = `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`;
  };

  base.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    e.stopPropagation();
    base.setPointerCapture(e.pointerId);
    stickPid = e.pointerId;
    stickVec = { x: 0, y: 0 };
  });
  base.addEventListener("pointermove", (e) => {
    if (e.pointerId !== stickPid) return;
    const r = base.getBoundingClientRect();
    let dx = e.clientX - (r.left + r.width / 2);
    let dy = e.clientY - (r.top + r.height / 2);
    const len = Math.hypot(dx, dy);
    if (len > STICK_R) {
      dx = (dx / len) * STICK_R;
      dy = (dy / len) * STICK_R;
    }
    stickVec = { x: dx, y: dy };
    setKnob(dx, dy);
  });
  const stickEnd = (e: PointerEvent) => {
    if (e.pointerId !== stickPid) return;
    stickPid = null;
    stickVec = { x: 0, y: 0 };
    setKnob(0, 0);
    cb.onSteerEnd();
  };
  base.addEventListener("pointerup", stickEnd);
  base.addEventListener("pointercancel", stickEnd);

  // per-frame: convert the stick vector to a camera-relative world direction
  scene.onBeforeRenderObservable.add(() => {
    if (stickPid === null) return;
    const mag = Math.hypot(stickVec.x, stickVec.y) / STICK_R;
    if (mag < 0.15) return;
    const fwd = camera.getTarget().subtract(camera.position);
    const f = normXZ(fwd.x, fwd.z);
    const right = { x: f.z, z: -f.x };
    const dx = f.x * -stickVec.y + right.x * stickVec.x;
    const dz = f.z * -stickVec.y + right.z * stickVec.x;
    const d = normXZ(dx, dz);
    cb.onSteerDir(d.x, d.z);
  });

  // ---- world drags orbit, taps interact ------------------------------------
  interface P {
    x: number;
    y: number;
  }
  const pointers = new Map<number, P>();
  let orbitPid: number | null = null;
  let downAt = 0;
  let downPos: P = { x: 0, y: 0 };
  let dragging = false;
  let lastPinch: number | null = null;

  canvas.addEventListener("pointerdown", (e) => {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) {
      orbitPid = e.pointerId;
      downAt = performance.now();
      downPos = { x: e.clientX, y: e.clientY };
      dragging = false;
    } else {
      lastPinch = null;
    }
  });

  canvas.addEventListener("pointermove", (e) => {
    const prev = pointers.get(e.pointerId);
    if (!prev) return;
    const dx = e.clientX - prev.x;
    const dy = e.clientY - prev.y;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.size >= 2) {
      const [a, b] = [...pointers.values()];
      const dist = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      if (lastPinch) {
        camera.radius = Math.min(
          camera.upperRadiusLimit ?? 38,
          Math.max(camera.lowerRadiusLimit ?? 7, camera.radius * (lastPinch / Math.max(1, dist))),
        );
      }
      lastPinch = dist;
      return;
    }

    if (e.pointerId !== orbitPid) return;
    if (!dragging && Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y) > TAP_SLOP) {
      dragging = true;
    }
    if (dragging) {
      camera.alpha -= dx * 0.006;
      camera.beta = Math.min(
        camera.upperBetaLimit ?? 1.38,
        Math.max(camera.lowerBetaLimit ?? 0.45, camera.beta - dy * 0.005),
      );
    }
  });

  const endPointer = (e: PointerEvent) => {
    const wasOrbit = e.pointerId === orbitPid;
    pointers.delete(e.pointerId);
    if (pointers.size < 2) lastPinch = null;
    if (!wasOrbit) return;
    orbitPid = null;
    const dt = performance.now() - downAt;
    const moved = Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y);
    if (!dragging && dt <= TAP_MS && moved <= TAP_SLOP) {
      const pick = scene.pick(e.clientX, e.clientY, (m) => m.name.startsWith("terrain:"));
      if (pick?.pickedPoint) cb.onTap(pick.pickedPoint.x, pick.pickedPoint.z);
    }
    dragging = false;
  };
  canvas.addEventListener("pointerup", endPointer);
  canvas.addEventListener("pointercancel", endPointer);

  canvas.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      camera.radius = Math.min(
        camera.upperRadiusLimit ?? 38,
        Math.max(camera.lowerRadiusLimit ?? 7, camera.radius * (1 + Math.sign(e.deltaY) * 0.09)),
      );
    },
    { passive: false },
  );

  // ---- compass -------------------------------------------------------------
  const compass = document.createElement("div");
  compass.className = "compass";
  compass.innerHTML =
    '<div class="dial"><span class="n">N</span><span class="e">E</span><span class="s">S</span><span class="w">W</span></div><div class="needle">▲</div>';
  hud.appendChild(compass);
  const dial = compass.querySelector(".dial") as HTMLDivElement;
  scene.onBeforeRenderObservable.add(() => {
    const fwd = camera.getTarget().subtract(camera.position);
    const bearing = Math.atan2(fwd.x, fwd.z); // 0 = facing north (+z)
    dial.style.transform = `rotate(${(bearing * 180) / Math.PI}deg)`;
  });
}

function normXZ(x: number, z: number): { x: number; z: number } {
  const l = Math.hypot(x, z) || 1;
  return { x: x / l, z: z / l };
}
