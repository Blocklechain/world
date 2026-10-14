import type { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import type { Scene } from "@babylonjs/core/scene";

export interface ControlCallbacks {
  /** short tap at a picked terrain point */
  onTap(x: number, z: number): void;
  /** continuous steering toward a picked terrain point (throttled upstream) */
  onSteer(x: number, z: number): void;
  onSteerEnd(): void;
}

const TAP_MS = 300;
const TAP_SLOP = 14;
const HOLD_MS = 170;

/**
 * Mobile-MMO controls:
 * - tap: interact / move-to-point
 * - hold or drag one finger: steer continuously toward the finger
 * - two fingers: pinch to zoom, twist/drag horizontally to orbit
 * - desktop: right-drag orbits, wheel zooms
 */
export function installControls(
  canvas: HTMLCanvasElement,
  scene: Scene,
  camera: ArcRotateCamera,
  cb: ControlCallbacks,
) {
  // we own the pointer; the camera keeps nothing
  camera.inputs.removeByType("ArcRotateCameraPointersInput");
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());

  interface P {
    x: number;
    y: number;
  }
  const pointers = new Map<number, P>();
  let steerPid: number | null = null;
  let downAt = 0;
  let downPos: P = { x: 0, y: 0 };
  let steering = false;
  let orbiting = false; // desktop right-drag
  let lastTwo: { dist: number; midX: number } | null = null;

  const pickGround = (sx: number, sy: number) => {
    const pick = scene.pick(sx, sy, (m) => m.name.startsWith("terrain:"));
    return pick?.pickedPoint ?? null;
  };

  canvas.addEventListener("pointerdown", (e) => {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (e.button === 2) {
      orbiting = true;
      return;
    }
    if (pointers.size === 1) {
      steerPid = e.pointerId;
      downAt = performance.now();
      downPos = { x: e.clientX, y: e.clientY };
      steering = false;
    } else {
      // a second finger cancels steering and starts pinch/orbit
      steerPid = null;
      steering = false;
      cb.onSteerEnd();
      lastTwo = null;
    }
  });

  canvas.addEventListener("pointermove", (e) => {
    const prev = pointers.get(e.pointerId);
    if (!prev) return;
    const dx = e.clientX - prev.x;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (orbiting) {
      camera.alpha -= dx * 0.008;
      camera.beta = Math.min(camera.upperBetaLimit!, Math.max(camera.lowerBetaLimit!, camera.beta - (e.movementY || 0) * 0.005));
      return;
    }

    if (pointers.size >= 2) {
      const [a, b] = [...pointers.values()];
      const dist = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      const midX = (a!.x + b!.x) / 2;
      if (lastTwo) {
        camera.radius = Math.min(
          camera.upperRadiusLimit ?? 38,
          Math.max(camera.lowerRadiusLimit ?? 7, camera.radius * (lastTwo.dist / Math.max(1, dist))),
        );
        camera.alpha -= (midX - lastTwo.midX) * 0.006;
      }
      lastTwo = { dist, midX };
      return;
    }

    if (e.pointerId === steerPid && !steering) {
      const moved = Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y);
      if (moved > TAP_SLOP || performance.now() - downAt > HOLD_MS) steering = true;
    }
  });

  const endPointer = (e: PointerEvent) => {
    const wasSteer = e.pointerId === steerPid;
    pointers.delete(e.pointerId);
    if (e.button === 2 || pointers.size === 0) orbiting = false;
    if (pointers.size < 2) lastTwo = null;
    if (!wasSteer) return;
    steerPid = null;
    const dt = performance.now() - downAt;
    const moved = Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y);
    if (steering) {
      steering = false;
      cb.onSteerEnd();
    } else if (dt <= TAP_MS && moved <= TAP_SLOP) {
      const p = pickGround(e.clientX, e.clientY);
      if (p) cb.onTap(p.x, p.z);
    }
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

  // per-frame steering: aim at the terrain under the held finger
  scene.onBeforeRenderObservable.add(() => {
    if (!steering || steerPid === null) return;
    const p = pointers.get(steerPid);
    if (!p) return;
    const point = pickGround(p.x, p.y);
    if (point) cb.onSteer(point.x, point.z);
  });
}
