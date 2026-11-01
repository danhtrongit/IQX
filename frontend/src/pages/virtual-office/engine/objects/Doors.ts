import { BoxGeometry, Group, Mesh, type Object3D } from 'three';
import { brushedMetalTexture } from '../utils/canvasTextures';
import { M, mat } from '../utils/materials';

/** An animated door that can be opened / closed by the simulation. */
export interface DoorController {
  open(): void;
  close(): void;
  readonly isOpen: boolean;
  update(dt: number): void;
}

const smooth = (t: number) => t * t * (3 - 2 * t);

/** Shared open/close progress with easing; `apply` receives the eased 0..1 amount. */
class Door implements DoorController {
  private target = 0;
  private t = 0;
  private readonly speed: number;
  private readonly apply: (k: number) => void;

  constructor(seconds: number, apply: (k: number) => void) {
    this.speed = 1 / seconds;
    this.apply = apply;
    apply(0);
  }

  get isOpen(): boolean {
    return this.target === 1;
  }

  open(): void {
    this.target = 1;
  }

  close(): void {
    this.target = 0;
  }

  update(dt: number): void {
    if (this.t === this.target) return;
    const step = this.speed * dt;
    this.t = this.target > this.t ? Math.min(this.target, this.t + step) : Math.max(this.target, this.t - step);
    this.apply(smooth(this.t));
  }
}

/**
 * Two brushed-steel leaves sliding into the left wall (plane x = 0) between z0 and z1.
 * Leaves slide into the wall cavity, so they disappear behind the wall when open.
 */
export function createElevatorDoor(parent: Object3D, z0: number, z1: number, height: number): DoorController {
  const steel = mat(0xd5dae0, { map: brushedMetalTexture(), metalness: 0.85, roughness: 0.32 });
  const half = (z1 - z0) / 2;
  const geo = new BoxGeometry(0.03, height, half + 0.01);
  const g = new Group();
  parent.add(g);
  const leaves = [-1, 1].map((s) => {
    const m = new Mesh(geo, steel);
    m.position.set(-0.07, height / 2, (z0 + z1) / 2 + (s * (half + 0.01)) / 2);
    g.add(m);
    return { m, s, base: m.position.z };
  });
  // Thin dark seam strip on each leaf edge (child, moves with the leaf).
  const seam = new BoxGeometry(0.032, height, 0.012);
  const dark = M.darkMetal();
  for (const l of leaves) {
    const s = new Mesh(seam, dark);
    s.position.set(0, 0, -l.s * ((half + 0.01) / 2 - 0.006));
    l.m.add(s);
  }
  return new Door(1.1, (k) => {
    for (const l of leaves) l.m.position.z = l.base + l.s * k * (half - 0.04);
  });
}

/** Hinged door in the left wall between z0 and z1; hinge at z1, swings into the room behind the wall (-X). */
export function createHingedDoor(parent: Object3D, z0: number, z1: number, height: number): DoorController {
  const pivot = new Group();
  pivot.position.set(-0.075, 0, z1);
  parent.add(pivot);
  const w = z1 - z0 - 0.02;
  const panel = new Mesh(new BoxGeometry(0.045, height - 0.02, w), mat(0xe9e2d4, { roughness: 0.5 }));
  panel.position.set(0, height / 2, -w / 2);
  const handle = new Mesh(new BoxGeometry(0.06, 0.025, 0.16), M.chrome());
  handle.position.set(0.04, 1.02, -w + 0.12);
  const kick = new Mesh(new BoxGeometry(0.05, 0.22, w - 0.04), M.aluminium());
  kick.position.set(0.002, 0.13, -w / 2);
  pivot.add(panel, handle, kick);
  return new Door(0.7, (k) => {
    pivot.rotation.y = k * 1.55;
  });
}
