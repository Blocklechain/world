import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { Engine } from "@babylonjs/core/Engines/engine";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import "@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent";
import { DefaultRenderingPipeline } from "@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline";
import { SSAO2RenderingPipeline } from "@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/ssao2RenderingPipeline";
import "@babylonjs/core/Rendering/prePassRendererSceneComponent";
import "@babylonjs/core/Rendering/geometryBufferRendererSceneComponent";
import { VolumetricLightScatteringPostProcess } from "@babylonjs/core/PostProcesses/volumetricLightScatteringPostProcess";
import { ParticleSystem } from "@babylonjs/core/Particles/particleSystem";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Color4 as BColor4 } from "@babylonjs/core/Maths/math.color";
import { RawCubeTexture } from "@babylonjs/core/Materials/Textures/rawCubeTexture";
import { Engine as BEngine } from "@babylonjs/core/Engines/engine";
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
  void cave;
  engine.setHardwareScalingLevel(1 / Math.min(window.devicePixelRatio, 2));

  const scene = new Scene(engine);

  // tiny sky-tinted cube so PBR metals have something to reflect (no IBL file).
  // faces order: +X -X +Y(sky) -Y(ground) +Z -Z
  const sky0 = [150, 180, 220], horiz = [200, 205, 210], grnd = [96, 110, 86];
  const faceRGBA = (rgb: number[]) => {
    const d = new Uint8Array(4 * 4 * 4);
    for (let i = 0; i < 16; i++) { d[i*4]=rgb[0]!; d[i*4+1]=rgb[1]!; d[i*4+2]=rgb[2]!; d[i*4+3]=255; }
    return d;
  };
  const envTex = new RawCubeTexture(
    scene,
    [faceRGBA(horiz), faceRGBA(horiz), faceRGBA(sky0), faceRGBA(grnd), faceRGBA(horiz), faceRGBA(horiz)],
    4,
    BEngine.TEXTUREFORMAT_RGBA,
    BEngine.TEXTURETYPE_UNSIGNED_BYTE,
  );
  scene.environmentTexture = cave ? null : envTex;
  scene.environmentIntensity = 0.55;
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

  const shadows = new ShadowGenerator(2048, sun);
  shadows.useContactHardeningShadow = true;
  shadows.contactHardeningLightSizeUVRatio = 0.04;
  shadows.filteringQuality = ShadowGenerator.QUALITY_HIGH;
  shadows.darkness = 0.4;
  shadows.bias = 0.0011;

  // post FX: AA + bloom + subtle sharpen + grain + chromatic edge
  const pipeline = new DefaultRenderingPipeline("rp", true, scene, [camera]);
  pipeline.samples = 4;
  pipeline.fxaaEnabled = true;
  pipeline.bloomEnabled = true;
  pipeline.bloomThreshold = 0.82;
  pipeline.bloomWeight = 0.22;
  pipeline.bloomScale = 0.55;
  pipeline.imageProcessingEnabled = true;
  pipeline.imageProcessing.toneMappingEnabled = true;
  pipeline.imageProcessing.toneMappingType = 1;
  pipeline.imageProcessing.exposure = 1.18;
  pipeline.imageProcessing.contrast = 1.15;
  pipeline.imageProcessing.vignetteEnabled = true;
  pipeline.imageProcessing.vignetteWeight = 1.6;
  pipeline.grainEnabled = true;
  pipeline.grain.intensity = 4;
  pipeline.grain.animated = true;
  pipeline.sharpenEnabled = true;
  pipeline.sharpen.edgeAmount = 0.22;
  pipeline.depthOfFieldEnabled = false;

  if (!cave) {
    // ambient occlusion deepens contact shadows
    const ssao = new SSAO2RenderingPipeline("ssao", scene, { ssaoRatio: 0.75, blurRatio: 1 }, [camera]);
    ssao.radius = 1.6;
    ssao.totalStrength = 0.9;
    ssao.expensiveBlur = true;
    ssao.samples = 12;
    ssao.maxZ = 180;
  }

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

  // sun disc on the dome
  const sunDisc = MeshBuilder.CreateDisc("sunDisc", { radius: 14, tessellation: 20 }, scene);
  const sunMat = new StandardMaterial("sunDisc", scene);
  sunMat.emissiveColor = new Color3(1.0, 0.93, 0.78);
  sunMat.disableLighting = true;
  sunDisc.material = sunMat;
  sunDisc.parent = sky;
  sunDisc.position.set(105, 165, -80);
  sunDisc.billboardMode = 7;
  sunDisc.applyFog = false;
  sunDisc.isPickable = false;
  // volumetric light shafts from the sun
  const godRays = new VolumetricLightScatteringPostProcess("godrays", 1.0, camera, sunDisc, 50, undefined, engine, false);
  godRays.exposure = 0.18;
  godRays.decay = 0.965;
  godRays.weight = 0.4;
  godRays.density = 0.92;

  // drifting cloud billboards
  const cloudTex = new Texture("/assets/terrain/clouds.png", scene);
  cloudTex.hasAlpha = true;
  const cloudMat = new StandardMaterial("clouds", scene);
  cloudMat.diffuseTexture = cloudTex;
  cloudMat.opacityTexture = cloudTex;
  cloudMat.emissiveColor = new Color3(1, 1, 1);
  cloudMat.disableLighting = true;
  cloudMat.backFaceCulling = false;
  const cloudSeeds = [0.1, 0.35, 0.55, 0.72, 0.9, 0.22];
  const clouds = cloudSeeds.map((seed, i) => {
    const c = MeshBuilder.CreatePlane(`cloud${i}`, { width: 120 + seed * 90, height: 36 + seed * 26 }, scene);
    c.material = cloudMat;
    c.billboardMode = 7;
    c.applyFog = false;
    c.isPickable = false;
    return { mesh: c, seed };
  });
  scene.onBeforeRenderObservable.add(() => {
    const t = performance.now() / 1000;
    const target = camera.target;
    clouds.forEach(({ mesh, seed }, i) => {
      const ang = seed * Math.PI * 2 + t * 0.004 * (0.6 + seed);
      const r = 150 + seed * 60;
      mesh.position.set(target.x + Math.cos(ang) * r, 78 + seed * 34, target.z + Math.sin(ang) * r);
    });
  });

  // ambient pollen drifting around the player
  const dot = new DynamicTexture("dot", 32, scene, false);
  const ctx = dot.getContext();
  const grad = ctx.createRadialGradient(16, 16, 2, 16, 16, 15);
  grad.addColorStop(0, "rgba(255,250,225,0.9)");
  grad.addColorStop(1, "rgba(255,250,225,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 32, 32);
  dot.update();
  const pollen = new ParticleSystem("pollen", 40, scene);
  pollen.particleTexture = dot;
  pollen.minSize = 0.04;
  pollen.maxSize = 0.12;
  pollen.minLifeTime = 4;
  pollen.maxLifeTime = 8;
  pollen.emitRate = 6;
  pollen.color1 = new BColor4(1, 0.98, 0.85, 0.55);
  pollen.color2 = new BColor4(1, 0.95, 0.7, 0.35);
  pollen.colorDead = new BColor4(1, 1, 1, 0);
  pollen.gravity = new Vector3(0.05, -0.02, 0.03);
  pollen.minEmitPower = 0.02;
  pollen.maxEmitPower = 0.12;
  pollen.updateSpeed = 0.012;
  pollen.start();
  scene.onBeforeRenderObservable.add(() => {
    pollen.emitter = camera.target.clone();
    pollen.minEmitBox = new Vector3(-16, -1, -16);
    pollen.maxEmitBox = new Vector3(16, 7, 16);
  });
  }

  engine.runRenderLoop(() => scene.render());
  window.addEventListener("resize", () => engine.resize());
  return { engine, scene, camera, sun, shadows };
}
