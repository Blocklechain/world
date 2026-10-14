import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { Engine } from "@babylonjs/core/Engines/engine";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import "@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3, Color4, Vector3 } from "@babylonjs/core/Maths/math";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Scene } from "@babylonjs/core/scene";
import "@babylonjs/core/Culling/ray";

import { activeMap } from "@world/content";

export interface WorldScene {
  engine: Engine;
  scene: Scene;
  camera: ArcRotateCamera;
  sun: DirectionalLight;
  shadows: ShadowGenerator;
}

/** Engine, camera and the light rig for the overworld. Terrain and props are
 * streamed by TerrainManager / ScatterManager. */
export function createScene(canvas: HTMLCanvasElement): WorldScene {
  const cave = activeMap().kind === "cave";
  const engine = new Engine(canvas, true, { adaptToDeviceRatio: false });
  engine.setHardwareScalingLevel(1 / Math.min(window.devicePixelRatio, 2));

  const scene = new Scene(engine);
  // warm late-afternoon light; fog melts terrain into the horizon band
  scene.clearColor = cave ? new Color4(0.02, 0.02, 0.03, 1) : new Color4(0.74, 0.8, 0.9, 1);
  scene.ambientColor = cave ? new Color3(0.1, 0.1, 0.14) : new Color3(0.3, 0.32, 0.35);
  scene.fogMode = Scene.FOGMODE_LINEAR;
  scene.fogStart = cave ? 18 : 105;
  scene.fogEnd = cave ? 52 : 190;
  scene.fogColor = cave ? new Color3(0.02, 0.02, 0.03) : new Color3(0.78, 0.8, 0.86);

  // cinematic grade: ACES tonemap + gentle contrast + vignette
  const ipc = scene.imageProcessingConfiguration;
  ipc.toneMappingEnabled = true;
  ipc.toneMappingType = 1; // ACES
  ipc.exposure = 1.15;
  ipc.contrast = 1.12;
  ipc.vignetteEnabled = true;
  ipc.vignetteWeight = 1.4;
  ipc.vignetteColor = new Color4(0.05, 0.06, 0.1, 0);

  const sp = activeMap().spawn;
  const camera = new ArcRotateCamera(
    "cam",
    -Math.PI / 2,
    1.0,
    20,
    new Vector3(sp.x, activeMap().heightAt(sp.x, sp.z), sp.z),
    scene,
  );
  camera.attachControl(canvas, true);
  camera.lowerRadiusLimit = 7;
  camera.upperRadiusLimit = 38;
  camera.lowerBetaLimit = 0.45;
  camera.upperBetaLimit = 1.38;
  camera.panningSensibility = 0;
  camera.pinchPrecision = 40;
  camera.minZ = 0.5;
  camera.maxZ = 260;

  const hemi = new HemisphericLight("hemi", new Vector3(0, 1, 0), scene);
  hemi.intensity = cave ? 0.32 : 0.55;
  hemi.diffuse = new Color3(0.85, 0.88, 1.0);
  hemi.groundColor = new Color3(0.35, 0.32, 0.26);

  const sun = new DirectionalLight("sun", new Vector3(-0.45, -0.85, 0.3), scene);
  sun.intensity = cave ? 0.25 : 1.15;
  sun.diffuse = new Color3(1.0, 0.95, 0.82);
  sun.autoCalcShadowZBounds = true;

  const shadows = new ShadowGenerator(1024, sun);
  shadows.usePercentageCloserFiltering = true;
  shadows.filteringQuality = ShadowGenerator.QUALITY_LOW;
  shadows.darkness = 0.45;

  // gradient sky dome: deep zenith blue -> warm horizon band (surface only)
  if (!cave) {
  const sky = MeshBuilder.CreateSphere("sky", { diameter: 480, segments: 12, sideOrientation: 1 }, scene);
  const pos = sky.getVerticesData(VertexBuffer.PositionKind)!;
  const cols = new Float32Array((pos.length / 3) * 4);
  const zenith = [0.3, 0.5, 0.78];
  const horizon = [0.86, 0.82, 0.78];
  const below = [0.55, 0.62, 0.72];
  for (let i = 0, c = 0; i < pos.length; i += 3, c += 4) {
    const t = pos[i + 1]! / 240; // -1..1
    const col =
      t > 0
        ? horizon.map((h, k) => h + (zenith[k]! - h) * Math.min(1, t * 1.8))
        : horizon.map((h, k) => h + (below[k]! - h) * Math.min(1, -t * 2.5));
    cols[c] = col[0]!;
    cols[c + 1] = col[1]!;
    cols[c + 2] = col[2]!;
    cols[c + 3] = 1;
  }
  sky.setVerticesData(VertexBuffer.ColorKind, cols);
  const skyMat = new StandardMaterial("sky", scene);
  skyMat.disableLighting = true;
  skyMat.emissiveColor = new Color3(1, 1, 1);
  skyMat.backFaceCulling = false;
  sky.material = skyMat;
  sky.applyFog = false;
  sky.isPickable = false;
  sky.infiniteDistance = true;
  }

  engine.runRenderLoop(() => scene.render());
  window.addEventListener("resize", () => engine.resize());
  return { engine, scene, camera, sun, shadows };
}
