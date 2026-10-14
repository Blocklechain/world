import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { Engine } from "@babylonjs/core/Engines/engine";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3, Color4, Vector3 } from "@babylonjs/core/Maths/math";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Scene } from "@babylonjs/core/scene";
import "@babylonjs/core/Culling/ray"; // enables scene.pick

import { ZONES, type ZoneId } from "@world/shared";

export interface WorldScene {
  engine: Engine;
  scene: Scene;
  camera: ArcRotateCamera;
  ground: ReturnType<typeof MeshBuilder.CreateGround>;
}

/** Greybox zone: flat ground, hearth marker, a few blockout buildings. */
export function createScene(canvas: HTMLCanvasElement, zone: ZoneId): WorldScene {
  const engine = new Engine(canvas, true, { adaptToDeviceRatio: false });
  engine.setHardwareScalingLevel(1 / Math.min(window.devicePixelRatio, 2));

  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.09, 0.1, 0.13, 1);
  scene.fogMode = Scene.FOGMODE_LINEAR;
  scene.fogStart = 40;
  scene.fogEnd = 90;
  scene.fogColor = new Color3(0.09, 0.1, 0.13);

  const camera = new ArcRotateCamera("cam", -Math.PI / 2, 1.05, 18, Vector3.Zero(), scene);
  camera.attachControl(canvas, true);
  camera.lowerRadiusLimit = 8;
  camera.upperRadiusLimit = 32;
  camera.lowerBetaLimit = 0.5;
  camera.upperBetaLimit = 1.35;
  camera.panningSensibility = 0; // orbit + pinch only, no pan
  camera.pinchPrecision = 40;

  new HemisphericLight("hemi", new Vector3(0, 1, 0), scene).intensity = 0.55;
  const sun = new DirectionalLight("sun", new Vector3(-0.4, -1, 0.3), scene);
  sun.intensity = 0.9;

  const size = ZONES[zone].size;
  const ground = MeshBuilder.CreateGround("ground", { width: size, height: size, subdivisions: 2 }, scene);
  const gmat = new StandardMaterial("ground", scene);
  gmat.diffuseColor = new Color3(0.25, 0.32, 0.2);
  gmat.specularColor = Color3.Black();
  ground.material = gmat;
  ground.freezeWorldMatrix();

  // greybox blockout: hearth + ring of placeholder buildings
  const grey = new StandardMaterial("grey", scene);
  grey.diffuseColor = new Color3(0.45, 0.42, 0.38);
  grey.specularColor = Color3.Black();
  const hearth = MeshBuilder.CreateCylinder("hearth", { diameter: 3, height: 0.6, tessellation: 8 }, scene);
  hearth.position.y = 0.3;
  hearth.material = grey;
  const rng = mulberry(42);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const r = 18 + rng() * 8;
    const w = 4 + rng() * 4;
    const h = 3 + rng() * 3;
    const b = MeshBuilder.CreateBox(`bld${i}`, { width: w, depth: w * (0.7 + rng() * 0.6), height: h }, scene);
    b.position.set(Math.cos(a) * r, h / 2, Math.sin(a) * r);
    b.rotation.y = a + rng();
    b.material = grey;
    b.freezeWorldMatrix();
  }

  engine.runRenderLoop(() => scene.render());
  window.addEventListener("resize", () => engine.resize());
  return { engine, scene, camera, ground };
}

function mulberry(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
