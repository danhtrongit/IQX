import {
  BoxGeometry, type BufferGeometry, CylinderGeometry, FrontSide, Group, type Material, Mesh, MeshStandardMaterial, NearestFilter,
  Object3D, PlaneGeometry, SphereGeometry, type Texture, TorusGeometry,
} from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { WALL_H } from '../config/constants';
import { ELEVATOR_DOOR, RESTROOM_DOOR } from '../config/layout';
import { artTexture, canvas, keyboardTexture, toTexture, windowViewTexture } from '../utils/canvasTextures';
import { seeded } from '../utils/helpers';
import { M, mat } from '../utils/materials';
import type { NavGrid } from '../utils/pathfinding';
import { createElevatorDoor, createHingedDoor, type DoorController } from './Doors';
import type { Animated } from './Props';
import type { ScreenPool } from './ScreenPool';

export interface PartOpts {
  r?: number;
  rx?: number;
  ry?: number;
  rz?: number;
  shadow?: boolean;
  seg?: number;
}

const PAL = 32; // palette atlas: PAL x PAL colours
const ROUGH = [0.2, 0.35, 0.5, 0.65, 0.8, 1];
const METAL = [0, 0.4, 0.85];
const nearest = (v: number, xs: number[]) => xs.reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a));

/**
 * Colour-palette atlas: every plain solid-colour material (no maps, no emissive, opaque) is remapped to one of a few
 * shared materials (bucketed by roughness / metalness) whose map is a palette texture; each mesh's UVs point at its
 * colour texel. After baking, hundreds of distinct colours collapse into a handful of draw calls.
 */
class Palette {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly tex: Texture;
  private readonly index = new Map<number, number>();
  private readonly mats = new Map<string, MeshStandardMaterial>();

  constructor() {
    const [c, ctx] = canvas(PAL, PAL);
    this.ctx = ctx;
    this.tex = toTexture(c);
    this.tex.magFilter = NearestFilter;
    this.tex.minFilter = NearestFilter;
    this.tex.generateMipmaps = false;
    this.tex.anisotropy = 1;
  }

  /** Returns the shared palette material for `m` and sets the UVs of `geo`, or null if `m` is not eligible. */
  remap(m: Material, geo: BufferGeometry): Material | null {
    const s = m as MeshStandardMaterial;
    if (!s.isMeshStandardMaterial || s.map || s.emissiveMap || s.transparent || s.side !== FrontSide) return null;
    if (s.emissive.getHex() !== 0 || s.envMapIntensity !== 1) return null;
    const color = s.color.getHex();
    let i = this.index.get(color);
    if (i === undefined) {
      i = this.index.size;
      if (i >= PAL * PAL) return null;
      this.index.set(color, i);
      this.ctx.fillStyle = `#${color.toString(16).padStart(6, '0')}`;
      this.ctx.fillRect(i % PAL, Math.floor(i / PAL), 1, 1);
      this.tex.needsUpdate = true;
    }
    const u = ((i % PAL) + 0.5) / PAL;
    const v = 1 - (Math.floor(i / PAL) + 0.5) / PAL;
    const uv = geo.attributes.uv;
    if (!uv) return null;
    for (let k = 0; k < uv.count; k++) uv.setXY(k, u, v);
    uv.needsUpdate = true;
    const rough = nearest(s.roughness, ROUGH);
    const metal = nearest(s.metalness, METAL);
    const key = `${rough}|${metal}`;
    let pm = this.mats.get(key);
    if (!pm) this.mats.set(key, (pm = new MeshStandardMaterial({ map: this.tex, roughness: rough, metalness: metal })));
    return pm;
  }
}

const palette = new Palette();

/** Height of the elevator / restroom openings in the left wall. */
export const DOOR_H = 2.3;
/** Height of glass partitions. */
export const GLASS_H = 2.75;

/**
 * Shared primitives and common furniture for the office builders.
 * Static meshes go into `staticRoot` (merged later by material); moving / changing meshes go into `dynamicRoot`
 * and are ticked through `animated`.
 */
export class BuilderBase {
  readonly staticRoot = new Group();
  /** Meshes that move or change every frame (never baked, never cast shadows). */
  readonly dynamicRoot = new Group();
  /** Per-frame updaters (dt in seconds). Includes the door controllers. */
  readonly animated: Animated[] = [];
  /** Warm light pools painted on the floor under lamps (cheaper than real point lights). */
  readonly glowSpots: { x: number; z: number; r: number; color: number }[] = [];
  /** Brushed-steel sliding elevator doors in the left wall. */
  readonly elevator: DoorController;
  /** Hinged restroom door in the left wall. */
  readonly restroom: DoorController;
  protected readonly grid: NavGrid;
  protected readonly screens: ScreenPool;
  protected readonly rnd = seeded(42);
  protected readonly kbTex = keyboardTexture();
  protected readonly viewTex = windowViewTexture();

  constructor(grid: NavGrid, screens: ScreenPool) {
    this.grid = grid;
    this.screens = screens;
    this.elevator = createElevatorDoor(this.dynamicRoot, ELEVATOR_DOOR.y0, ELEVATOR_DOOR.y1, DOOR_H);
    this.restroom = createHingedDoor(this.dynamicRoot, RESTROOM_DOOR.y0, RESTROOM_DOOR.y1, DOOR_H);
    this.animated.push(this.elevator, this.restroom);
  }

  // ------------------------------------------------------------ primitives

  protected place(mesh: Mesh, parent: Object3D, x: number, y: number, z: number, o: PartOpts): Mesh {
    const pm = palette.remap(mesh.material as Material, mesh.geometry);
    if (pm) mesh.material = pm;
    mesh.position.set(x, y, z);
    mesh.rotation.set(o.rx ?? 0, o.ry ?? 0, o.rz ?? 0);
    const sh = o.shadow ?? true;
    mesh.castShadow = sh;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  protected box(p: Object3D, w: number, h: number, d: number, m: Material, x: number, y: number, z: number, o: PartOpts = {}): Mesh {
    const geo: BufferGeometry = o.r ? new RoundedBoxGeometry(w, h, d, o.r >= 0.03 ? 2 : 1, Math.min(o.r, w / 2, h / 2, d / 2)) : new BoxGeometry(w, h, d);
    return this.place(new Mesh(geo, m), p, x, y, z, o);
  }

  protected cyl(p: Object3D, rt: number, rb: number, h: number, m: Material, x: number, y: number, z: number, o: PartOpts = {}): Mesh {
    return this.place(new Mesh(new CylinderGeometry(rt, rb, h, o.seg ?? 16), m), p, x, y, z, o);
  }

  protected sphere(p: Object3D, r: number, m: Material, x: number, y: number, z: number, o: PartOpts = {}): Mesh {
    return this.place(new Mesh(new SphereGeometry(r, o.seg ?? 16, Math.max(6, Math.round((o.seg ?? 16) * 0.6))), m), p, x, y, z, o);
  }

  protected torus(p: Object3D, r: number, tube: number, m: Material, x: number, y: number, z: number, o: PartOpts = {}, arc = Math.PI * 2): Mesh {
    return this.place(new Mesh(new TorusGeometry(r, tube, 6, o.seg ?? 24, arc), m), p, x, y, z, o);
  }

  protected plane(p: Object3D, w: number, h: number, m: Material, x: number, y: number, z: number, o: PartOpts = {}): Mesh {
    return this.place(new Mesh(new PlaneGeometry(w, h), m), p, x, y, z, { shadow: false, ...o });
  }

  protected group(x: number, z: number, ry = 0, parent: Object3D = this.staticRoot): Group {
    const g = new Group();
    g.position.set(x, 0, z);
    g.rotation.y = ry;
    parent.add(g);
    return g;
  }

  protected block(x0: number, z0: number, w = 1, d = 1): void {
    for (let x = x0; x < x0 + w; x++) for (let z = z0; z < z0 + d; z++) this.grid.block(x, z);
  }

  protected screenMat(tex: Texture, intensity = 0.9): Material {
    return mat(0x000000, { emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: intensity, roughness: 0.18, metalness: 0.1 });
  }

  /** Self-lit printed graphic (signs, menu boards, lit logos). */
  protected litMat(tex: Texture, intensity = 1, transparent = false): Material {
    return mat(0xffffff, { map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: intensity, roughness: 0.4, transparent });
  }

  /** Emissive light-source material (lamp diffusers, LED strips). */
  protected glow(color: number, intensity = 1.2): Material {
    return mat(0xffffff, { emissive: color, emissiveIntensity: intensity, roughness: 0.6 });
  }

  /** Floor finish plane over [x0,x1]x[z0,z1]; `tile` = metres per texture repeat. */
  protected floorZone(x0: number, z0: number, x1: number, z1: number, tex: Texture, rough: number, tile = 1, y = 0.002): void {
    const t = tex.clone();
    t.needsUpdate = true;
    t.wrapS = t.wrapT = 1000; // RepeatWrapping
    t.repeat.set((x1 - x0) / tile, (z1 - z0) / tile);
    this.plane(this.staticRoot, x1 - x0, z1 - z0, mat(0xffffff, { map: t, roughness: rough }), (x0 + x1) / 2, y, (z0 + z1) / 2, { rx: -Math.PI / 2 });
  }

  // ------------------------------------------------------------ glass partitions

  /**
   * Glass partition along X (constant z) from world x0 to x1, split into ~1 m bays; `gaps` are [a,b] world-x door
   * openings (header only). Does not touch the nav grid.
   */
  protected glassAlongX(
    z: number, x0: number, x1: number, gaps: [number, number][] = [], H = GLASS_H, band = true, R: Object3D = this.staticRoot,
  ): void {
    const al = M.aluminium();
    const edges = [x0, x1, ...gaps.flat()].sort((a, b) => a - b);
    for (let i = 0; i < edges.length - 1; i++) {
      const a = edges[i];
      const b = edges[i + 1];
      if (b - a < 0.01) continue;
      const isGap = gaps.some(([g0, g1]) => a >= g0 - 1e-6 && b <= g1 + 1e-6);
      if (isGap) {
        this.box(R, b - a, 0.12, 0.08, al, (a + b) / 2, H - 0.06, z);
        continue;
      }
      const bays = Math.max(1, Math.round(b - a));
      const bw = (b - a) / bays;
      for (let k = 0; k < bays; k++) {
        const c = a + bw * (k + 0.5);
        this.box(R, bw, 0.06, 0.06, al, c, 0.03, z);
        this.box(R, bw, 0.06, 0.06, al, c, H - 0.03, z);
        this.plane(R, bw, H - 0.12, M.glass(), c, H / 2, z);
        if (band) this.box(R, bw - 0.02, 0.22, 0.012, M.frosted(), c, 1.2, z, { shadow: false });
      }
    }
    for (const e of edges) this.box(R, 0.05, H, 0.06, al, e, H / 2, z, { r: 0.008 });
    for (let x = Math.ceil(x0 + 0.01); x < x1 - 0.01; x++) if (!gaps.some(([g0, g1]) => x > g0 - 0.01 && x < g1 + 0.01)) this.box(R, 0.05, H, 0.06, al, x, H / 2, z, { r: 0.008 });
  }

  /** Glass partition along Z (constant x) from world z0 to z1 with door gaps. */
  protected glassAlongZ(x: number, z0: number, z1: number, gaps: [number, number][] = [], H = GLASS_H, band = true): void {
    // Same builder in a frame rotated so local +X = world +Z.
    this.glassAlongX(0, z0, z1, gaps, H, band, this.group(x, 0, -Math.PI / 2));
  }

  // ------------------------------------------------------------ shared furniture

  protected frameArt(p: Object3D, x: number, y: number, z: number, w: number, h: number, ry: number, seed: number): void {
    const g = new Group();
    g.position.set(x, y, z);
    g.rotation.y = ry;
    p.add(g);
    this.box(g, w + 0.08, h + 0.08, 0.04, M.blackPlastic(), 0, 0, 0.02, { r: 0.01 });
    this.box(g, w - 0.04, h - 0.04, 0.01, M.paper(), 0, 0, 0.04);
    this.plane(g, w - 0.2, h - 0.2, mat(0xffffff, { map: artTexture(seed), roughness: 0.7 }), 0, 0, 0.047);
  }

  protected monitor(p: Object3D, x: number, y: number, z: number, w: number, h: number, ry: number, tex: Texture): void {
    const g = new Group();
    g.position.set(x, y, z);
    g.rotation.y = ry;
    p.add(g);
    this.box(g, w, h, 0.028, M.blackPlastic(), 0, 0, 0, { r: 0.008 });
    this.box(g, w * 0.45, h * 0.45, 0.04, M.greyPlastic(), 0, 0, -0.025, { r: 0.012 });
    this.plane(g, w - 0.022, h - 0.03, this.screenMat(tex), 0, 0.004, 0.0145);
    this.box(g, 0.012, 0.006, 0.004, mat(0x2ecc71, { emissive: 0x2ecc71, emissiveIntensity: 2 }), w / 2 - 0.03, -h / 2 + 0.008, 0.015, { shadow: false });
  }

  protected succulent(p: Object3D, x: number, y: number, z: number): void {
    this.cyl(p, 0.045, 0.035, 0.07, mat(0xd9c7b0, { roughness: 0.8 }), x, y + 0.035, z);
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      const leaf = this.sphere(p, 0.03, mat(0x6aa36f, { roughness: 0.6 }), x + Math.cos(a) * 0.025, y + 0.09, z + Math.sin(a) * 0.025, { seg: 8 });
      leaf.scale.set(0.6, 1.2, 0.6);
      leaf.rotation.set(Math.sin(a) * 0.6, 0, -Math.cos(a) * 0.6);
    }
  }

  /** Ergonomic office chair; occupant faces local -Z. */
  chair(x: number, z: number, ry = 0, color = 0x2b3240, executive = false): void {
    const g = this.group(x, z, ry);
    const base = M.darkMetal();
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const leg = this.box(g, 0.035, 0.03, 0.3, base, Math.sin(a) * 0.14, 0.07, Math.cos(a) * 0.14, { r: 0.01 });
      leg.rotation.y = a;
      this.sphere(g, 0.028, M.blackPlastic(), Math.sin(a) * 0.28, 0.03, Math.cos(a) * 0.28, { seg: 8 });
    }
    this.cyl(g, 0.05, 0.06, 0.06, base, 0, 0.08, 0, { seg: 12 });
    this.cyl(g, 0.022, 0.022, 0.3, M.chrome(), 0, 0.24, 0, { seg: 10 });
    const seatMat = mat(color, { roughness: executive ? 0.5 : 0.95 });
    this.box(g, 0.32, 0.04, 0.3, base, 0, 0.39, 0, { r: 0.01 });
    this.box(g, 0.5, 0.08, 0.48, seatMat, 0, 0.44, 0, { r: 0.035 });
    // Back support and backrest
    this.box(g, 0.06, 0.32, 0.03, base, 0, 0.56, 0.25, { rx: 0.12 });
    const backH = executive ? 0.75 : 0.55;
    this.box(g, 0.48, backH, 0.07, seatMat, 0, 0.62 + backH / 2, 0.27, { r: 0.035, rx: 0.12 });
    if (!executive) this.box(g, 0.4, backH - 0.12, 0.01, mat(0x161a21, { roughness: 1 }), 0, 0.62 + backH / 2, 0.235, { rx: 0.12 });
    // Armrests
    for (const s of [-1, 1]) {
      this.box(g, 0.03, 0.2, 0.04, base, s * 0.27, 0.54, 0.02);
      this.box(g, 0.07, 0.03, 0.26, M.blackPlastic(), s * 0.27, 0.655, -0.01, { r: 0.012 });
    }
  }

  pendant(x: number, y: number, z: number, light: boolean): void {
    const R = this.staticRoot;
    this.cyl(R, 0.004, 0.004, WALL_H + 0.6 - y, M.darkMetal(), x, (WALL_H + 0.6 + y) / 2, z, { seg: 4, shadow: false });
    this.cyl(R, 0.06, 0.24, 0.22, mat(0x1f2329, { roughness: 0.4, metalness: 0.6 }), x, y, z, { seg: 24, shadow: false });
    this.cyl(R, 0.22, 0.22, 0.01, mat(0xfff1d6, { emissive: 0xffe2b0, emissiveIntensity: 1.2 }), x, y - 0.11, z, { seg: 24, shadow: false });
    if (light) this.glowSpots.push({ x, z, r: 1.6, color: 0xffe0b0 });
  }

  plant(x: number, z: number, kind: 'fig' | 'snake' | 'bush'): void {
    const g = this.group(x + 0.5, z + 0.5);
    const r = this.rnd;
    const pot = [mat(0xe9e4da, { roughness: 0.4 }), mat(0x2a2e35, { roughness: 0.35 }), mat(0xb5673d, { roughness: 0.8 })][Math.floor(r() * 3)];
    const ph = kind === 'snake' ? 0.36 : 0.44;
    this.cyl(g, 0.21, 0.16, ph, pot, 0, ph / 2, 0, { seg: 20 });
    this.place(new Mesh(new TorusGeometry(0.205, 0.015, 6, 20), pot), g, 0, ph, 0, { rx: Math.PI / 2 });
    this.cyl(g, 0.19, 0.19, 0.01, M.soil(), 0, ph - 0.02, 0, { seg: 20 });
    const greens = [mat(0x2d6a4f, { roughness: 0.55 }), mat(0x40916c, { roughness: 0.55 }), mat(0x52b788, { roughness: 0.6 })];
    if (kind === 'fig') {
      this.cyl(g, 0.018, 0.025, 1.1, mat(0x6b4f3a, { roughness: 0.9 }), 0, ph + 0.55, 0, { seg: 8 });
      for (let i = 0; i < 34; i++) {
        const a = r() * Math.PI * 2;
        const hgt = ph + 0.45 + r() * 1.0;
        const rad = 0.08 + r() * 0.22;
        const leaf = this.sphere(g, 0.12, greens[Math.floor(r() * 3)], Math.cos(a) * rad, hgt, Math.sin(a) * rad, { seg: 8 });
        leaf.scale.set(0.75, 0.12, 1.25);
        leaf.rotation.set((r() - 0.5) * 0.8, -a + Math.PI / 2, (r() - 0.5) * 0.9);
      }
    } else if (kind === 'snake') {
      for (let i = 0; i < 14; i++) {
        const a = r() * Math.PI * 2;
        const h = 0.5 + r() * 0.55;
        const blade = this.box(g, 0.07, h, 0.012, greens[Math.floor(r() * 2)], Math.cos(a) * 0.08, ph + h / 2 - 0.02, Math.sin(a) * 0.08);
        blade.rotation.set((r() - 0.5) * 0.3, a, (r() - 0.5) * 0.3);
      }
    } else {
      for (let i = 0; i < 16; i++) {
        const a = r() * Math.PI * 2;
        const rad = r() * 0.18;
        this.sphere(g, 0.12 + r() * 0.08, greens[Math.floor(r() * 3)], Math.cos(a) * rad, ph + 0.15 + r() * 0.35, Math.sin(a) * rad, { seg: 10 });
      }
    }
    this.block(x, z);
  }

  /** Upholstered lounge armchair; occupant faces local -Z. `legs` = wood or metal finish. */
  protected armchair(x: number, z: number, ry: number, fabric: Material, legs: Material = M.walnut(), wide = 0.78): Group {
    const g = this.group(x, z, ry);
    const w = wide;
    this.box(g, w - 0.1, 0.14, 0.62, fabric, 0, 0.3, 0.02, { r: 0.04 });
    this.box(g, w - 0.2, 0.1, 0.54, fabric, 0, 0.42, -0.01, { r: 0.045 });
    this.box(g, w - 0.08, 0.5, 0.14, fabric, 0, 0.6, 0.29, { r: 0.05, rx: 0.12 });
    for (const s of [-1, 1]) this.box(g, 0.1, 0.34, 0.66, fabric, s * (w / 2 - 0.05), 0.42, 0.02, { r: 0.04 });
    for (const lx of [-1, 1]) for (const lz of [-1, 1]) this.cyl(g, 0.018, 0.012, 0.24, legs, lx * (w / 2 - 0.08), 0.12, lz * 0.26, { seg: 6, rx: lz * 0.12, rz: -lx * 0.12 });
    return g;
  }

  /** Simple cafe chair (wood seat on black steel frame); occupant faces local -Z. */
  protected cafeChair(x: number, z: number, ry: number, seat: Material): void {
    const g = this.group(x, z, ry);
    const frame = M.blackPlastic();
    for (const lx of [-0.19, 0.19]) for (const lz of [-0.18, 0.18]) this.box(g, 0.025, 0.45, 0.025, frame, lx, 0.225, lz);
    this.box(g, 0.44, 0.035, 0.42, seat, 0, 0.465, 0, { r: 0.012 });
    for (const lx of [-0.19, 0.19]) this.box(g, 0.025, 0.42, 0.025, frame, lx, 0.69, 0.2, { rx: 0.08 });
    this.box(g, 0.42, 0.14, 0.025, seat, 0, 0.82, 0.215, { rx: 0.08 });
    this.box(g, 0.38, 0.02, 0.02, frame, 0, 0.15, 0.18);
  }
}
