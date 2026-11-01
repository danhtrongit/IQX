import {
  ACESFilmicToneMapping, Box3, Color, DirectionalLight, HalfFloatType, HemisphereLight, type Object3D,
  OrthographicCamera, PCFSoftShadowMap, PMREMGenerator, Raycaster, Scene, SRGBColorSpace, Vector2, Vector3,
  WebGLRenderer, WebGLRenderTarget, MOUSE, TOUCH,
} from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { GRID_H, GRID_W, WALL_H } from '../config/constants';

const VIEW_HEIGHT = 15; // initial guess; replaced by fitOffice()
/** Everything that must be visible at the default zoom. */
const OFFICE_BOUNDS = new Box3(new Vector3(-0.3, -0.3, -0.3), new Vector3(GRID_W + 0.2, WALL_H + 0.1, GRID_H + 0.2));
const FIT_MARGIN = 1.02;
/** Screen fractions reserved for the HUD: index panel on top, ticker tape at the bottom. */
const HUD_PAD_TOP = 0.1;
const HUD_PAD_BOTTOM = 0.05;

export type Quality = 'low' | 'medium' | 'high';
export const QUALITY_LABEL: Record<Quality, string> = { low: 'Thấp', medium: 'Vừa', high: 'Cao' };

const DAY_BG = new Color(0x161c27);
const NIGHT_BG = new Color(0x080b12);
const SUN_LOW = new Color(0xffa860);
const SUN_HIGH = new Color(0xfff0d8);
const SKY_DAY = new Color(0xe8eeff);
const SKY_NIGHT = new Color(0x4a5d8c);

/** Owns the three.js renderer, camera, controls, lighting and post-processing. */
export class World3D {
  readonly scene = new Scene();
  readonly camera: OrthographicCamera;
  readonly renderer: WebGLRenderer;
  readonly labels: CSS2DRenderer;
  readonly controls: OrbitControls;
  private viewHeight = VIEW_HEIGHT;
  private sun!: DirectionalLight;
  private hemi!: HemisphereLight;
  private fill!: DirectionalLight;
  private lastSunElevation = -1;
  private composer: EffectComposer | null = null;
  quality: Quality = 'medium';
  private readonly maxPixelRatio = Math.min(window.devicePixelRatio, 2);
  private pixelRatio = this.maxPixelRatio;
  private frames = 0;
  private frameTime = 0;
  private lastFrame = performance.now();
  private readonly raycaster = new Raycaster();
  private readonly host: HTMLElement;
  private readonly resizeObserver: ResizeObserver;
  private readonly center = new Vector3(GRID_W / 2 - 1, 0, GRID_H / 2);

  constructor(host: HTMLElement, labelHost: HTMLElement) {
    this.host = host;
    const w = host.clientWidth;
    const h = host.clientHeight;

    this.renderer = new WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(w, h);
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.95;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFSoftShadowMap;
    // Only static props cast shadows, so the shadow map is rendered once (see refreshShadows).
    this.renderer.shadowMap.autoUpdate = false;
    host.appendChild(this.renderer.domElement);

    this.labels = new CSS2DRenderer();
    this.labels.setSize(w, h);
    labelHost.appendChild(this.labels.domElement);

    this.scene.background = new Color(0x161c27);
    const pmrem = new PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.3;
    pmrem.dispose();

    const aspect = w / h;
    this.camera = new OrthographicCamera((-VIEW_HEIGHT * aspect) / 2, (VIEW_HEIGHT * aspect) / 2, VIEW_HEIGHT / 2, -VIEW_HEIGHT / 2, 0.1, 200);
    this.camera.position.copy(this.center).add(new Vector3(30, 30, 34));
    this.camera.zoom = 1;
    this.camera.lookAt(this.center);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.copy(this.center);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.screenSpacePanning = false;
    this.controls.minZoom = 1;
    this.controls.maxZoom = 7;
    this.controls.minPolarAngle = 0.45;
    this.controls.maxPolarAngle = 1.15;
    this.controls.minAzimuthAngle = 0.15;
    this.controls.maxAzimuthAngle = 1.45;
    this.controls.zoomToCursor = true;
    this.controls.mouseButtons = { LEFT: MOUSE.PAN, MIDDLE: MOUSE.DOLLY, RIGHT: MOUSE.ROTATE };
    this.controls.touches = { ONE: TOUCH.PAN, TWO: TOUCH.DOLLY_ROTATE };
    this.controls.addEventListener('change', () => this.clampTarget());
    this.controls.update();

    this.addLights();
    this.fitOffice();

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(host);
  }

  /** Releases the GPU context, listeners and DOM nodes (the route can unmount). */
  dispose(): void {
    this.resizeObserver.disconnect();
    this.controls.dispose();
    this.composer?.dispose();
    this.scene.traverse((o) => {
      const mesh = o as { geometry?: { dispose(): void }; material?: { dispose(): void } | { dispose(): void }[] };
      mesh.geometry?.dispose();
      const m = mesh.material;
      if (Array.isArray(m)) m.forEach((x) => x.dispose());
      else m?.dispose();
    });
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
    this.labels.domElement.remove();
  }

  private addLights(): void {
    this.hemi = new HemisphereLight(0xe8eeff, 0x4a3f35, 0.75);
    this.scene.add(this.hemi);

    const sun = new DirectionalLight(0xffe0b5, 2.4);
    this.sun = sun;
    sun.position.set(-14, 16, 9);
    sun.target.position.set(GRID_W / 2, 0, GRID_H / 2);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const s = sun.shadow.camera;
    s.left = -20;
    s.right = 20;
    s.top = 20;
    s.bottom = -20;
    s.near = 1;
    s.far = 60;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.02;
    sun.shadow.radius = 3;
    this.scene.add(sun, sun.target);

    const fill = new DirectionalLight(0xcfe0ff, 0.6);
    fill.position.set(GRID_W + 30, 25, GRID_H + 40);
    this.fill = fill;
    this.scene.add(fill);
  }

  /** Moves the sun and blends day/night lighting. `minutes` = minutes since midnight. */
  setTimeOfDay(minutes: number): void {
    const e = Math.sin((Math.PI * (minutes - 360)) / 720); // 0 at 06:00, 1 at 12:00, 0 at 18:00
    const day = Math.max(0, Math.min(1, e * 1.8));
    const az = ((minutes - 360) / 720) * Math.PI; // morning → afternoon
    const c = new Vector3(GRID_W / 2, 0, GRID_H / 2);
    this.sun.position.set(c.x - 18, 4 + Math.max(0.15, e) * 16, c.z + Math.cos(az) * 14);
    this.sun.color.copy(SUN_LOW).lerp(SUN_HIGH, Math.min(1, Math.max(0, e) * 1.6));
    this.sun.intensity = 2.4 * day;
    this.hemi.intensity = 0.3 + 0.45 * day;
    this.hemi.color.copy(SKY_NIGHT).lerp(SKY_DAY, day);
    this.fill.intensity = 0.25 + 0.35 * day;
    (this.scene.background as Color).copy(NIGHT_BG).lerp(DAY_BG, day);
    this.scene.environmentIntensity = 0.15 + 0.15 * day;
    if (Math.abs(e - this.lastSunElevation) > 0.04) {
      this.lastSunElevation = e;
      this.refreshShadows();
    }
  }

  /** Low: 1x resolution, no shadows. Medium: shadows. High: shadows + bloom. */
  setQuality(q: Quality): void {
    this.quality = q;
    this.sun.castShadow = q !== 'low';
    this.scene.traverse((o) => {
      const m = (o as { material?: { needsUpdate: boolean } }).material;
      if (m) m.needsUpdate = true;
    });
    this.pixelRatio = q === 'low' ? 1 : this.maxPixelRatio;
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(this.host.clientWidth, this.host.clientHeight);
    this.composer?.dispose();
    this.composer = null;
    if (q === 'high') {
      const w = this.host.clientWidth;
      const h = this.host.clientHeight;
      const target = new WebGLRenderTarget(w * this.pixelRatio, h * this.pixelRatio, { type: HalfFloatType, samples: 4 });
      this.composer = new EffectComposer(this.renderer, target);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      this.composer.addPass(new UnrealBloomPass(new Vector2(w / 2, h / 2), 0.35, 0.45, 0.85));
      this.composer.addPass(new OutputPass());
    }
    this.refreshShadows();
  }

  private clampTarget(): void {
    const t = this.controls.target;
    const before = t.clone();
    t.x = Math.max(-2, Math.min(GRID_W + 2, t.x));
    t.z = Math.max(-2, Math.min(GRID_H + 2, t.z));
    t.y = 0;
    this.camera.position.add(t.clone().sub(before));
  }

  /** Frames the whole office so it fills the viewport at zoom 1 (also the zoom-out limit). */
  fitOffice(): void {
    const aspect = this.host.clientWidth / this.host.clientHeight;
    this.camera.updateMatrixWorld();
    const inv = this.camera.matrixWorldInverse;
    const min = new Vector2(Infinity, Infinity);
    const max = new Vector2(-Infinity, -Infinity);
    const { min: a, max: b } = OFFICE_BOUNDS;
    for (const x of [a.x, b.x]) for (const y of [a.y, b.y]) for (const z of [a.z, b.z]) {
      const p = new Vector3(x, y, z).applyMatrix4(inv);
      min.min(new Vector2(p.x, p.y));
      max.max(new Vector2(p.x, p.y));
    }
    const free = 1 - HUD_PAD_TOP - HUD_PAD_BOTTOM;
    this.viewHeight = Math.max((max.y - min.y) / free, (max.x - min.x) / aspect) * FIT_MARGIN;
    // Re-centre on the projected box centre, nudged so the box sits in the HUD-free band.
    const right = new Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0);
    const up = new Vector3().setFromMatrixColumn(this.camera.matrixWorld, 1);
    const cy = (min.y + max.y) / 2 + ((HUD_PAD_TOP - HUD_PAD_BOTTOM) / 2) * this.viewHeight;
    const shift = right.multiplyScalar((min.x + max.x) / 2).add(up.multiplyScalar(cy));
    // Move along the ground plane only so the orbit target stays on y = 0.
    const forward = new Vector3();
    this.camera.getWorldDirection(forward);
    shift.addScaledVector(forward, -shift.y / forward.y);
    this.camera.position.add(shift);
    this.controls.target.add(shift);

    this.camera.left = (-this.viewHeight * aspect) / 2;
    this.camera.right = (this.viewHeight * aspect) / 2;
    this.camera.top = this.viewHeight / 2;
    this.camera.bottom = -this.viewHeight / 2;
    this.camera.zoom = 1;
    this.camera.updateProjectionMatrix();
    this.controls.update();
  }

  resize(): void {
    const w = this.host.clientWidth;
    const h = this.host.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h);
    this.labels.setSize(w, h);
    this.composer?.setSize(w, h);
    const aspect = w / h;
    this.camera.left = (-this.viewHeight * aspect) / 2;
    this.camera.right = (this.viewHeight * aspect) / 2;
    this.camera.updateProjectionMatrix();
    this.fitOffice();
  }

  /** Returns the first object hit under a client-space point. */
  pick(clientX: number, clientY: number, targets: Object3D[]): Object3D | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    return this.raycaster.intersectObjects(targets, true)[0]?.object ?? null;
  }

  refreshShadows(): void {
    this.renderer.shadowMap.needsUpdate = true;
  }

  /** Lowers / restores the render resolution to keep the frame rate smooth. */
  private adaptQuality(): void {
    const now = performance.now();
    this.frameTime += now - this.lastFrame;
    this.lastFrame = now;
    if (++this.frames < 90) return;
    const fps = (this.frames * 1000) / this.frameTime;
    this.frames = 0;
    this.frameTime = 0;
    let next = this.pixelRatio;
    const max = this.quality === 'low' ? 1 : this.maxPixelRatio;
    if (fps < 48) next = Math.max(1, this.pixelRatio - 0.25);
    else if (fps > 58) next = Math.min(max, this.pixelRatio + 0.25);
    if (next !== this.pixelRatio) {
      this.pixelRatio = next;
      this.renderer.setPixelRatio(next);
      this.renderer.setSize(this.host.clientWidth, this.host.clientHeight);
      this.composer?.setPixelRatio(next);
    }
  }

  render(): void {
    this.adaptQuality();
    this.controls.update();
    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
    this.labels.render(this.scene, this.camera);
  }
}
