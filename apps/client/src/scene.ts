import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { Engine } from "@babylonjs/core/Engines/engine";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import "@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent";
import { Color3, Color4, Vector3 } from "@babylonjs/core/Maths/math";
import { Scene } from "@babylonjs/core/scene";
import "@babylonjs/core/Culling/ray";

import { SPAWN, heightAt } from "@world/content";

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
  const engine = new Engine(canvas, true, { adaptToDeviceRatio: false });
  engine.setHardwareScalingLevel(1 / Math.min(window.devicePixelRatio, 2));

  const scene = new Scene(engine);
  // warm late-afternoon sky; fog melts terrain into it at the draw limit
  scene.clearColor = new Color4(0.62, 0.72, 0.85, 1);
  scene.ambientColor = new Color3(0.3, 0.32, 0.35);
  scene.fogMode = Scene.FOGMODE_LINEAR;
  scene.fogStart = 110;
  scene.fogEnd = 185;
  scene.fogColor = new Color3(0.62, 0.72, 0.85);

  const camera = new ArcRotateCamera(
    "cam",
    -Math.PI / 2,
    1.0,
    20,
    new Vector3(SPAWN.x, heightAt(SPAWN.x, SPAWN.z), SPAWN.z),
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
  hemi.intensity = 0.55;
  hemi.diffuse = new Color3(0.85, 0.88, 1.0);
  hemi.groundColor = new Color3(0.35, 0.32, 0.26);

  const sun = new DirectionalLight("sun", new Vector3(-0.45, -0.85, 0.3), scene);
  sun.intensity = 1.15;
  sun.diffuse = new Color3(1.0, 0.95, 0.82);
  sun.autoCalcShadowZBounds = true;

  const shadows = new ShadowGenerator(1024, sun);
  shadows.usePercentageCloserFiltering = true;
  shadows.filteringQuality = ShadowGenerator.QUALITY_LOW;
  shadows.darkness = 0.45;

  engine.runRenderLoop(() => scene.render());
  window.addEventListener("resize", () => engine.resize());
  return { engine, scene, camera, sun, shadows };
}
