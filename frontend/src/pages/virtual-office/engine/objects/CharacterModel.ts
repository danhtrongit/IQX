import {
  BufferGeometry,
  CapsuleGeometry,
  CircleGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  Euler,
  Float32BufferAttribute,
  FrontSide,
  Group,
  LatheGeometry,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Quaternion,
  RingGeometry,
  SphereGeometry,
  SplineCurve,
  TorusGeometry,
  Vector2,
  Vector3,
} from 'three';
import type { Material, Side } from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { EmployeeProfile } from '../types';

export type Pose =
  | 'idle' | 'walk' | 'sit' | 'type' | 'drink' | 'talk' | 'sitTalk'
  | 'phone' | 'sitPhone' | 'cheer' | 'stress' | 'stretch' | 'eat' | 'pingpong' | 'foosball'
  | 'wave' | 'present' | 'sitIdle'
  | 'fall' | 'argue' | 'fight' | 'sitGame' | 'scroll' | 'sitScroll' | 'sleep' | 'dance';

export const ALL_POSES: readonly Pose[] = [
  'idle', 'walk', 'sit', 'type', 'drink', 'talk', 'sitTalk',
  'phone', 'sitPhone', 'cheer', 'stress', 'stretch', 'eat', 'pingpong', 'foosball',
  'wave', 'present', 'sitIdle',
  'fall', 'argue', 'fight', 'sitGame', 'scroll', 'sitScroll', 'sleep', 'dance',
];

const SEATED: ReadonlySet<Pose> = new Set<Pose>([
  'sit', 'type', 'sitTalk', 'sitPhone', 'eat', 'sitIdle', 'sitGame', 'sitScroll', 'sleep',
]);

/* ------------------------------------------------------------------ */
/* Skeleton dimensions (body units = meters for a 1.65 m character)    */
/* ------------------------------------------------------------------ */

const HIP_Y = 0.86; // pelvis origin when standing
const SPINE_Y = 0.06;
const CHEST_Y = 0.18;
const SH_X = 0.19;
const SH_Y = 0.17;
const NECK_Y = 0.22;
const HEAD_Y = 0.06;
const HEAD_C = 0.115; // skull centre above head pivot
const HEAD_R = 0.14;
const HEAD_S = new Vector3(1.02, 0.98, 0.95);
const HIPJ_X = 0.088;
const HIPJ_Y = -0.05;
const THIGH = 0.38;
const SHIN = 0.355;
const LEG = THIGH + SHIN;
const UPPER = 0.26;
const FORE = 0.23;
const SEAT_HIP_Y = 0.54; // pelvis origin when seated -> hip joints ~0.49, butt on a 0.47 m seat
const SEAT_HIP_Z = -0.05;
const TORSO_ZS = 0.66;
const PELVIS_ZS = 0.62;
const BLEND_TIME = 0.25;
const TAU = Math.PI * 2;
const HALF_PI = Math.PI / 2;

/* ------------------------------------------------------------------ */
/* Animation channels                                                  */
/* ------------------------------------------------------------------ */

const CH = [
  'hipX', 'hipY', 'hipZ', 'hipRX', 'hipRY', 'hipRZ',
  'spineRX', 'spineRY', 'spineRZ', 'chestRX', 'chestRY', 'chestRZ',
  'neckRX', 'neckRY', 'headRX', 'headRY', 'headRZ',
  'shLX', 'shLY', 'shLZ', 'elL', 'hdLX', 'hdLY', 'hdLZ',
  'shRX', 'shRY', 'shRZ', 'elR', 'hdRX', 'hdRY', 'hdRZ',
  'thLX', 'thLY', 'thLZ', 'knL', 'ftL',
  'thRX', 'thRY', 'thRZ', 'knR', 'ftR',
  'shrug', 'eyeOpen', 'prMug', 'prPhone', 'prPaddle', 'prUtensil',
] as const;
type ChName = (typeof CH)[number];
const I = {} as Record<ChName, number>;
CH.forEach((n, i) => (I[n] = i));
const NCH = CH.length;
const IS_LINEAR = new Uint8Array(NCH);
for (const n of ['hipX', 'hipY', 'hipZ', 'shrug', 'eyeOpen', 'prMug', 'prPhone', 'prPaddle', 'prUtensil'] as const) {
  IS_LINEAR[I[n]] = 1;
}

type Side1 = 1 | -1; // +1 = character's left (+X), -1 = right
const SIDES: readonly Side1[] = [1, -1];

const ARM = {
  1: { sh: [I.shLX, I.shLY, I.shLZ], el: I.elL, hd: [I.hdLX, I.hdLY, I.hdLZ] },
  [-1]: { sh: [I.shRX, I.shRY, I.shRZ], el: I.elR, hd: [I.hdRX, I.hdRY, I.hdRZ] },
} as const;
const LEGS = {
  1: { th: [I.thLX, I.thLY, I.thLZ], kn: I.knL, ft: I.ftL },
  [-1]: { th: [I.thRX, I.thRY, I.thRZ], kn: I.knR, ft: I.ftR },
} as const;

/* ------------------------------------------------------------------ */
/* Small math helpers                                                  */
/* ------------------------------------------------------------------ */

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (e0: number, e1: number, x: number) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};
/** 0→1 over [a,b], 1 until c, 1→0 over [c,d] */
const window4 = (x: number, a: number, b: number, c: number, d: number) => smooth(a, b, x) * (1 - smooth(c, d, x));
const lerpAngle = (a: number, b: number, t: number) => {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  else if (d < -Math.PI) d += TAU;
  return a + d * t;
};
const fract = (x: number) => x - Math.floor(x);
/** cheap smooth pseudo-noise in [-1,1] */
const wobble = (t: number, s: number) =>
  0.5 * Math.sin(t * 0.71 + s) + 0.3 * Math.sin(t * 1.37 + s * 2.3) + 0.2 * Math.sin(t * 2.13 + s * 4.1);

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}

function shade(color: number, f: number): number {
  return new Color(color).multiplyScalar(f).getHex();
}
function mix(a: number, b: number, t: number): number {
  return new Color(a).lerp(new Color(b), t).getHex();
}

/* ------------------------------------------------------------------ */
/* Shared materials                                                    */
/* ------------------------------------------------------------------ */

interface MatOpts {
  emissive?: number;
  emissiveIntensity?: number;
  side?: Side;
}
const MATS = new Map<string, MeshStandardMaterial>();
function mat(color: number, roughness: number, metalness = 0, o: MatOpts = {}): MeshStandardMaterial {
  const key = `${color}|${roughness}|${metalness}|${o.emissive ?? 0}|${o.emissiveIntensity ?? 1}|${o.side ?? FrontSide}`;
  let m = MATS.get(key);
  if (!m) {
    m = new MeshStandardMaterial({
      color,
      roughness,
      metalness,
      emissive: o.emissive ?? 0,
      emissiveIntensity: o.emissiveIntensity ?? 1,
      side: o.side ?? FrontSide,
    });
    MATS.set(key, m);
  }
  return m;
}
/**
 * Prop material: a hair of emissive keeps props out of the rig's vertex-colour skinning pass,
 * so they stay real meshes under their `prop:` group and can be hidden via group.visible.
 */
const propMat = (color: number, roughness: number) => mat(color, roughness, 0, { emissive: 0x030303 });

/* ------------------------------------------------------------------ */
/* Shared geometries                                                   */
/* ------------------------------------------------------------------ */

/** Tapered limb along -Y: rounded cap centred at y=0 (rTop) and y=-len (rBot). */
function limb(rTop: number, rBot: number, len: number, radial = 10): LatheGeometry {
  const pts: Vector2[] = [];
  const cap = 3;
  for (let i = 0; i <= cap; i++) {
    const a = -HALF_PI + (i / cap) * HALF_PI;
    pts.push(new Vector2(rBot * Math.cos(a), -len + rBot * Math.sin(a)));
  }
  for (let i = 1; i <= cap; i++) {
    const a = (i / cap) * HALF_PI;
    pts.push(new Vector2(rTop * Math.cos(a), rTop * Math.sin(a)));
  }
  pts[0].x = 0;
  pts[pts.length - 1].x = 0;
  return new LatheGeometry(pts, radial);
}

/** Surface of revolution between two (y-dependent) azimuth limits; phi=0 faces +Z. */
function latheBand(
  profile: Vector2[],
  segs: number,
  phiA: (y: number) => number,
  phiB: (y: number) => number,
  rOff = 0,
): BufferGeometry {
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const rows = profile.length;
  for (let i = 0; i < rows; i++) {
    const p = profile[i];
    const a = phiA(p.y);
    const b = phiB(p.y);
    for (let j = 0; j <= segs; j++) {
      const phi = a + (b - a) * (j / segs);
      const r = p.x + rOff;
      pos.push(r * Math.sin(phi), p.y, r * Math.cos(phi));
      uv.push(j / segs, i / (rows - 1));
    }
  }
  const w = segs + 1;
  for (let i = 0; i < rows - 1; i++) {
    for (let j = 0; j < segs; j++) {
      const A = i * w + j;
      const B = A + 1;
      const D = A + w;
      const C = D + 1;
      idx.push(A, B, D, C, D, B);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function profileFrom(ctrl: [number, number][], n: number, closeEnds = true): Vector2[] {
  const p = new SplineCurve(ctrl.map(([r, y]) => new Vector2(r, y))).getPoints(n);
  if (closeEnds) {
    p[0].x = 0;
    p[p.length - 1].x = 0;
  }
  return p;
}

// torso (chest-local) profile: radius, y
const TORSO_PTS = profileFrom(
  [
    [0.0, -0.245], [0.12, -0.24], [0.158, -0.2], [0.16, -0.12], [0.164, -0.04],
    [0.176, 0.04], [0.184, 0.11], [0.176, 0.17], [0.148, 0.215], [0.09, 0.245], [0.0, 0.258],
  ],
  18,
);

function torsoR(y: number): number {
  const p = TORSO_PTS;
  for (let i = 1; i < p.length; i++) {
    if (p[i].y >= y) {
      const t = (y - p[i - 1].y) / Math.max(1e-6, p[i].y - p[i - 1].y);
      return p[i - 1].x + (p[i].x - p[i - 1].x) * t;
    }
  }
  return 0;
}
/** z of the shirt's front surface at chest-local height y (x=0) */
const torsoFront = (y: number) => torsoR(y) * TORSO_ZS;

const JACKET_PTS = profileFrom(
  [
    [0.168, -0.33], [0.17, -0.24], [0.168, -0.14], [0.17, -0.04], [0.182, 0.04],
    [0.19, 0.11], [0.183, 0.17], [0.155, 0.215], [0.105, 0.243], [0.07, 0.252],
  ],
  14,
  false,
);
const jacketGap = (y: number) => {
  // azimuth half-gap of the open jacket front: wide at the chest, buttoned at the waist, flaring at hem
  if (y > -0.06) return 0.12 + 0.5 * smooth(-0.06, 0.2, y);
  return 0.12 + 0.25 * smooth(-0.06, -0.33, y);
};
const lapelW = (y: number) => 0.42 * smooth(-0.06, 0.12, y) * (1 - 0.55 * smooth(0.17, 0.25, y));

function buildGeo() {
  const tieBlade = new CylinderGeometry(0.024, 0.04, 0.27, 4, 1);
  tieBlade.rotateY(Math.PI / 4);
  tieBlade.scale(1, 1, 0.22);
  const tieTip = new CylinderGeometry(0.0, 0.04, 0.03, 4, 1);
  tieTip.rotateY(Math.PI / 4);
  tieTip.rotateX(Math.PI);
  tieTip.scale(1, 1, 0.22);

  const ring = new RingGeometry(0.36, 0.42, 48);
  ring.rotateX(-HALF_PI);
  const ringGlow = new RingGeometry(0.3, 0.5, 48);
  ringGlow.rotateX(-HALF_PI);

  const coffee = new CircleGeometry(0.031, 12);
  coffee.rotateX(-HALF_PI);

  // chopsticks span y -0.03..0.18 (gripped near the back end)
  const stick = new CylinderGeometry(0.0022, 0.0038, 0.21, 4, 1);
  stick.translate(0, 0.075, 0);
  // paddle blade: disc with its faces along X (palm normal)
  const blade = new CylinderGeometry(0.074, 0.074, 0.01, 18, 1);
  blade.rotateZ(HALF_PI);
  const rubber = new CylinderGeometry(0.071, 0.071, 0.003, 18, 1);
  rubber.rotateZ(HALF_PI);

  return {
    torso: new LatheGeometry(TORSO_PTS, 24),
    pelvis: new LatheGeometry(
      profileFrom(
        [[0.0, -0.125], [0.045, -0.12], [0.1, -0.095], [0.145, -0.055], [0.161, -0.005], [0.162, 0.04], [0.15, 0.085], [0.1, 0.103], [0.0, 0.108]],
        11,
      ),
      20,
    ),
    jacket: latheBand(JACKET_PTS, 24, (y) => jacketGap(y), (y) => TAU - jacketGap(y), 0.012),
    lapelL: latheBand(JACKET_PTS, 3, (y) => jacketGap(y), (y) => jacketGap(y) + lapelW(y), 0.018),
    lapelR: latheBand(JACKET_PTS, 3, (y) => TAU - jacketGap(y) - lapelW(y), (y) => TAU - jacketGap(y), 0.018),
    belt: new CylinderGeometry(0.166, 0.166, 0.034, 20, 1, true),
    buckle: new RoundedBoxGeometry(0.04, 0.03, 0.012, 1, 0.004),
    head: new SphereGeometry(HEAD_R, 28, 20),
    neck: new CylinderGeometry(0.05, 0.054, 0.15, 10, 1, true),
    ear: new SphereGeometry(0.034, 8, 6),
    eye: new SphereGeometry(0.021, 10, 7),
    glint: new SphereGeometry(0.0058, 5, 4),
    brow: new CapsuleGeometry(0.0062, 0.026, 1, 5),
    nose: new SphereGeometry(0.019, 8, 6),
    mouth: new TorusGeometry(0.019, 0.0052, 3, 8, Math.PI),
    cheek: new SphereGeometry(0.02, 6, 4),
    hairCap: new SphereGeometry(1, 24, 9, 0, TAU, 0, Math.PI * 0.56),
    blob: new SphereGeometry(1, 14, 10),
    shoulder: new SphereGeometry(0.056, 10, 7),
    upperArm: limb(0.054, 0.046, UPPER),
    foreArm: limb(0.046, 0.039, FORE - 0.02),
    cuff: new CylinderGeometry(0.043, 0.043, 0.03, 10, 1, true),
    palm: new SphereGeometry(1, 10, 7),
    thumb: new CapsuleGeometry(0.011, 0.026, 1, 5),
    thigh: limb(0.09, 0.064, THIGH, 12),
    shin: limb(0.063, 0.053, SHIN - 0.03),
    hem: new CylinderGeometry(0.056, 0.058, 0.05, 10, 1, true),
    shoe: new RoundedBoxGeometry(0.1, 0.07, 0.2, 2, 0.032),
    sole: new RoundedBoxGeometry(0.106, 0.022, 0.21, 1, 0.009),
    collar: new RoundedBoxGeometry(0.058, 0.034, 0.008, 1, 0.004),
    collarBand: new TorusGeometry(0.056, 0.013, 4, 14),
    button: new SphereGeometry(0.0075, 4, 3),
    pocket: new RoundedBoxGeometry(0.065, 0.06, 0.008, 1, 0.004),
    tieKnot: new RoundedBoxGeometry(0.034, 0.03, 0.022, 1, 0.008),
    tieBlade,
    tieTip,
    mugBody: new CylinderGeometry(0.037, 0.034, 0.09, 12),
    mugHandle: new TorusGeometry(0.022, 0.0065, 4, 8),
    coffee,
    phone: new RoundedBoxGeometry(0.01, 0.14, 0.07, 1, 0.004),
    phoneScreen: new RoundedBoxGeometry(0.002, 0.125, 0.06, 1, 0.001),
    stick,
    paddleHandle: new CylinderGeometry(0.013, 0.015, 0.1, 6),
    blade,
    rubber,
    ring,
    ringGlow,
  };
}
type Geo = ReturnType<typeof buildGeo>;
let GEO: Geo | null = null;
const geo = (): Geo => (GEO ??= buildGeo());

/** Free the module-level shared geometries/materials (only when no CharacterModel remains). */
export function disposeCharacterSharedResources(): void {
  if (GEO) for (const g of Object.values(GEO)) g.dispose();
  GEO = null;
  MATS.forEach((m) => m.dispose());
  MATS.clear();
}

/* ------------------------------------------------------------------ */
/* IK + orientation helpers (module temps: no per-frame allocation)    */
/* ------------------------------------------------------------------ */

const _S = new Vector3();
const _D = new Vector3();
const _P = new Vector3();
const _U = new Vector3();
const _X = new Vector3();
const _Y = new Vector3();
const _Z = new Vector3();
const _T = new Vector3();
const _A = new Vector3();
const _hx = new Vector3();
const _hy = new Vector3();
const _hz = new Vector3();
const _m = new Matrix4();
const _hm = new Matrix4();
const _qS = new Quaternion();
const _qE = new Quaternion();
const _qH = new Quaternion();
const _qA = new Quaternion();
const _qB = new Quaternion();
const _qD = new Quaternion();
const _e = new Euler();
const _he = new Euler();
const _AX = new Vector3(1, 0, 0);
const _Zf = new Vector3(0, 0, 1);

/**
 * Chest-space hand orientation from where the fingers point and where the palm faces.
 * (Right hand palm = local +X, left hand palm = local -X; fingers = local -Y.)
 */
function handQ(out: Quaternion, side: Side1, fx: number, fy: number, fz: number, px: number, py: number, pz: number): Quaternion {
  _hy.set(-fx, -fy, -fz).normalize();
  _hx.set(px, py, pz).multiplyScalar(side === 1 ? -1 : 1);
  _hx.addScaledVector(_hy, -_hx.dot(_hy));
  if (_hx.lengthSq() < 1e-8) _hx.set(1, 0, 0);
  _hx.normalize();
  _hz.crossVectors(_hx, _hy);
  _hm.makeBasis(_hx, _hy, _hz);
  return out.setFromRotationMatrix(_hm);
}
function qEul(out: Quaternion, x: number, y: number, z: number): Quaternion {
  _he.set(x, y, z, 'XYZ');
  return out.setFromEuler(_he);
}

/**
 * Two-bone arm IK in chest space. Writes shoulder (XYZ euler), elbow bend and hand (YXZ euler)
 * so the wrist reaches (tx,ty,tz), the elbow bends toward the pole and the hand takes qDes.
 */
function solveArm(
  o: Float32Array, side: Side1,
  tx: number, ty: number, tz: number,
  px: number, py: number, pz: number,
  qDes: Quaternion,
): void {
  const L1 = UPPER;
  const L2 = FORE;
  _S.set(side * SH_X, SH_Y, 0);
  _D.set(tx, ty, tz).sub(_S);
  let d = _D.length();
  const dir = _D.normalize();
  d = clamp(d, Math.abs(L1 - L2) + 0.02, L1 + L2 - 0.002);
  _P.set(px, py, pz);
  _P.addScaledVector(dir, -_P.dot(dir));
  if (_P.lengthSq() < 1e-8) _P.set(0, 0, -1);
  _P.normalize();
  const a = Math.acos(clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1));
  const beta = Math.PI - Math.acos(clamp((L1 * L1 + L2 * L2 - d * d) / (2 * L1 * L2), -1, 1));
  const ca = Math.cos(a);
  const sa = Math.sin(a);
  _U.copy(dir).multiplyScalar(ca).addScaledVector(_P, sa);
  _Y.copy(_U).negate();
  _Z.copy(dir).multiplyScalar(sa).addScaledVector(_P, -ca).normalize();
  _X.crossVectors(_Y, _Z).normalize();
  _m.makeBasis(_X, _Y, _Z);
  _qS.setFromRotationMatrix(_m);
  const arm = ARM[side];
  _e.setFromQuaternion(_qS, 'XYZ');
  o[arm.sh[0]] = _e.x;
  o[arm.sh[1]] = _e.y;
  o[arm.sh[2]] = _e.z;
  o[arm.el] = beta;
  _qE.setFromAxisAngle(_AX, -beta);
  _qS.multiply(_qE).invert();
  _qH.copy(qDes);
  _qS.multiply(_qH);
  _e.setFromQuaternion(_qS, 'YXZ');
  o[arm.hd[0]] = _e.x;
  o[arm.hd[1]] = _e.y;
  o[arm.hd[2]] = _e.z;
}

function armFK(o: Float32Array, side: Side1, rx: number, rzOut: number, elbow: number, hRx = 0, hRz = 0): void {
  const a = ARM[side];
  o[a.sh[0]] = rx;
  o[a.sh[1]] = 0;
  o[a.sh[2]] = side * rzOut;
  o[a.el] = elbow;
  o[a.hd[0]] = hRx;
  o[a.hd[1]] = 0;
  o[a.hd[2]] = side * hRz;
}

function legFK(o: Float32Array, side: Side1, rx: number, rzOut: number, knee: number, foot: number): void {
  const l = LEGS[side];
  o[l.th[0]] = rx;
  o[l.th[1]] = 0;
  o[l.th[2]] = side * rzOut;
  o[l.kn] = knee;
  o[l.ft] = foot;
}

/** Knee-bend crouch keeping the feet planted; returns the pelvis drop. */
function crouch(o: Float32Array, side: Side1, alpha: number, rzOut = 0): number {
  legFK(o, side, -alpha, rzOut, 2 * alpha, -alpha);
  return LEG * (1 - Math.cos(alpha));
}

/* ------------------------------------------------------------------ */
/* CharacterModel                                                      */
/* ------------------------------------------------------------------ */

export class CharacterModel {
  readonly root: Group;

  private readonly body: Group;
  private readonly scaleF: number;
  private readonly seed: number;
  private readonly hips: Group;
  private readonly spine: Group;
  private readonly chest: Group;
  private readonly breath: Group;
  private readonly neck: Group;
  private readonly head: Group;
  private readonly headTop: Object3D;
  private readonly eyes: Object3D[] = [];
  private readonly shoulders: Group[] = [];
  private readonly elbows: Group[] = [];
  private readonly hands: Group[] = [];
  private readonly thighs: Group[] = [];
  private readonly knees: Group[] = [];
  private readonly feet: Group[] = [];
  private readonly props: Group[] = [];
  private readonly propCh: number[] = [];
  private readonly ring: Group;
  private readonly ringMat: MeshStandardMaterial;
  private readonly ringGlowMat: MeshStandardMaterial;

  private pose: Pose = 'idle';
  private time = 0;
  private poseTime = 0;
  private walkPhase = 0;
  private walkFreq = 1;
  private walkAmp = 1;
  private blendT = BLEND_TIME;
  private started = false;
  private readonly cur = new Float32Array(NCH);
  private readonly from = new Float32Array(NCH);
  private readonly target = new Float32Array(NCH);
  private blinkIn: number;
  private blinkT = -1;
  private selected = false;

  constructor(profile: EmployeeProfile) {
    const G = geo();
    this.seed = hashString(profile.name || 'x') * 100;
    this.scaleF = profile.isBoss ? 1.72 / 1.65 : 1;
    this.blinkIn = 1 + (this.seed % 3);

    const skin = mat(profile.skin, 0.62);
    const hairM = mat(profile.hair, 0.5, 0, { side: DoubleSide });
    const browM = mat(shade(profile.hair, 0.85), 0.6);
    const shirtColor = profile.isBoss ? 0xf4f4f0 : profile.shirt;
    const shirt = mat(shirtColor, 0.85);
    const shirtDark = mat(shade(shirtColor, 0.88), 0.85);
    const sleeve = profile.isBoss ? mat(profile.shirt, 0.7, 0, { side: DoubleSide }) : shirt;
    const pants = mat(profile.pants, 0.82);
    const pantsDark = mat(shade(profile.pants, 0.82), 0.82);
    const beltM = mat(0x2a211c, 0.45);
    const buckleM = mat(0xc9a85a, 0.35, 0.2);
    const shoeM = mat(0x2b2420, 0.32);
    const soleM = mat(0x16120f, 0.7);
    const eyeM = mat(0x1d1612, 0.12);
    const glintM = mat(0xffffff, 0.2);
    const mouthM = mat(0x7b3a36, 0.55);
    const cheekM = mat(mix(profile.skin, 0xff8f86, 0.32), 0.7);

    this.root = new Group();
    this.root.name = `Character:${profile.name}`;
    this.body = new Group();
    this.body.scale.setScalar(this.scaleF);
    this.root.add(this.body);

    const mk = (g: BufferGeometry, m: Material, parent: Object3D, x = 0, y = 0, z = 0, cast = true): Mesh => {
      const me = new Mesh(g, m);
      me.position.set(x, y, z);
      me.castShadow = cast;
      me.receiveShadow = cast;
      parent.add(me);
      return me;
    };
    const grp = (parent: Object3D, x = 0, y = 0, z = 0): Group => {
      const g = new Group();
      g.position.set(x, y, z);
      parent.add(g);
      return g;
    };

    /* ---- hips / legs ---- */
    this.hips = grp(this.body, 0, HIP_Y, 0);
    const pel = mk(G.pelvis, pants, this.hips);
    pel.scale.z = PELVIS_ZS;
    const belt = mk(G.belt, beltM, this.hips, 0, 0.055, 0);
    belt.scale.z = 0.72;
    mk(G.buckle, buckleM, this.hips, 0, 0.055, 0.166 * 0.72 + 0.004, false);

    for (const side of SIDES) {
      const th = grp(this.hips, side * HIPJ_X, HIPJ_Y, 0);
      mk(G.thigh, pants, th);
      const kn = grp(th, 0, -THIGH, 0);
      mk(G.shin, pants, kn);
      mk(G.hem, pantsDark, kn, 0, -SHIN + 0.055, 0);
      const ft = grp(kn, 0, -SHIN, 0);
      mk(G.shoe, shoeM, ft, 0, -0.04, 0.035);
      mk(G.sole, soleM, ft, 0, -0.064, 0.035);
      this.thighs.push(th);
      this.knees.push(kn);
      this.feet.push(ft);
    }

    /* ---- spine / chest ---- */
    this.spine = grp(this.hips, 0, SPINE_Y, 0);
    this.chest = grp(this.spine, 0, CHEST_Y, 0);
    this.breath = grp(this.chest); // breathing scales this joint, never the mesh
    const torso = mk(G.torso, shirt, this.breath);
    torso.scale.z = TORSO_ZS;

    // collar
    const band = mk(G.collarBand, profile.isBoss ? shirt : shirtDark, this.chest, 0, 0.232, -0.004);
    band.rotation.x = HALF_PI + 0.25;
    band.scale.set(1, 0.92, 1);
    const hasTie = profile.isBoss || profile.tie !== null;
    for (const side of SIDES) {
      const c = mk(G.collar, profile.isBoss ? shirt : shirtDark, this.chest, side * 0.034, 0.212, torsoFront(0.212) + 0.006);
      c.rotation.set(-0.62, side * 0.3, side * (hasTie ? 0.95 : 1.2));
    }
    if (hasTie) {
      const tieM = mat(profile.tie ?? 0x8c1d2a, 0.55);
      const knot = mk(G.tieKnot, tieM, this.chest, 0, 0.198, torsoFront(0.198) + 0.008);
      knot.rotation.x = -0.25;
      const bz = torsoFront(0.1) + 0.006;
      const blade = mk(G.tieBlade, tieM, this.chest, 0, 0.045, bz);
      blade.rotation.x = 0.03;
      const tip = mk(G.tieTip, tieM, this.chest, 0, 0.045 - 0.15, bz + 0.0045);
      tip.rotation.x = 0.03;
    } else {
      const btn = mat(shade(shirtColor, 0.7), 0.4);
      for (const y of [0.13, 0.04, -0.05, -0.14]) mk(G.button, btn, this.chest, 0, y, torsoFront(y) + 0.002, false);
    }
    if (!profile.isBoss) {
      const pk = mk(G.pocket, shirtDark, this.chest, 0.075, 0.09, torsoFront(0.09) - 0.009);
      pk.rotation.y = 0.42;
    } else {
      const jm = mat(profile.shirt, 0.7, 0, { side: DoubleSide });
      const lm = mat(shade(profile.shirt, 0.82), 0.6, 0, { side: DoubleSide });
      mk(G.jacket, jm, this.chest).scale.z = TORSO_ZS;
      mk(G.lapelL, lm, this.chest).scale.z = TORSO_ZS;
      mk(G.lapelR, lm, this.chest).scale.z = TORSO_ZS;
      mk(G.button, mat(0x1a1a1a, 0.3), this.chest, 0, -0.07, torsoFront(-0.07) + 0.017, false);
    }

    /* ---- arms ---- */
    for (const side of SIDES) {
      const sh = grp(this.chest, side * SH_X, SH_Y, 0);
      mk(G.shoulder, sleeve, sh);
      mk(G.upperArm, sleeve, sh);
      const el = grp(sh, 0, -UPPER, 0);
      mk(G.foreArm, sleeve, el);
      mk(G.cuff, profile.isBoss ? shirt : mat(shade(profile.shirt, 0.9), 0.85), el, 0, -FORE + 0.02, 0);
      const hd = grp(el, 0, -FORE, 0);
      hd.rotation.order = 'YXZ';
      const palm = mk(G.palm, skin, hd, 0, -0.045, 0);
      palm.scale.set(0.024, 0.05, 0.041);
      const th = mk(G.thumb, skin, hd, -side * 0.008, -0.028, 0.034);
      th.rotation.set(0.45, 0, side * 0.15);
      this.shoulders.push(sh);
      this.elbows.push(el);
      this.hands.push(hd);
    }
    const handR = this.hands[1];

    /* ---- props (all in the right hand; palm = local +X, fingers = local -Y) ---- */
    const prop = (name: string, ch: number): Group => {
      const g = new Group();
      g.name = `prop:${name}`;
      g.visible = false;
      handR.add(g);
      this.props.push(g);
      this.propCh.push(ch);
      return g;
    };
    // mug: upright when fingers point forward with the palm facing the midline
    const mugG = prop('mug', I.prMug);
    mugG.position.set(0.062, -0.062, 0);
    mugG.rotation.x = HALF_PI;
    const mugM = propMat(0xf2efe8, 0.35);
    mk(G.mugBody, mugM, mugG);
    mk(G.mugHandle, mugM, mugG, -0.041, 0, 0);
    mk(G.coffee, propMat(0x3b2416, 0.2), mugG, 0, 0.0455, 0, false);
    // phone: lying against the palm, screen facing away from the palm
    const phoneG = prop('phone', I.prPhone);
    phoneG.position.set(0.03, -0.068, 0.004);
    mk(G.phone, propMat(0x23262d, 0.35), phoneG);
    mk(G.phoneScreen, propMat(0x3d5a80, 0.15), phoneG, 0.0055, 0.002, 0, false);
    // paddle: handle in the fist, blade beyond the fingers, faces along the palm normal
    const padG = prop('paddle', I.prPaddle);
    padG.position.set(0.004, -0.05, 0);
    mk(G.paddleHandle, propMat(0xc9a06b, 0.6), padG);
    mk(G.blade, propMat(0xb98b55, 0.6), padG, 0, -0.12, 0);
    mk(G.rubber, propMat(0xc0282d, 0.55), padG, 0.0065, -0.12, 0, false);
    mk(G.rubber, propMat(0x1c1c1c, 0.55), padG, -0.0065, -0.12, 0, false);
    // chopsticks: pointing out between thumb and fingers
    const utG = prop('utensil', I.prUtensil);
    utG.position.set(0.012, -0.045, 0.0);
    utG.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), new Vector3(0, -0.6, 0.8).normalize());
    const woodM = propMat(0xd8b98a, 0.6);
    const s1 = mk(G.stick, woodM, utG, 0.004, 0, 0);
    s1.rotation.z = -0.02;
    const s2 = mk(G.stick, woodM, utG, -0.004, 0, 0.004);
    s2.rotation.z = 0.02;

    /* ---- neck / head ---- */
    this.neck = grp(this.chest, 0, NECK_Y, 0);
    mk(G.neck, skin, this.neck, 0, 0.02, -0.005);
    this.head = grp(this.neck, 0, HEAD_Y, 0);
    const skull = grp(this.head, 0, HEAD_C, 0.008);
    mk(G.head, skin, skull).scale.copy(HEAD_S);
    this.headTop = new Object3D();
    this.headTop.position.set(0, HEAD_C + HEAD_R + 0.17, 0);
    this.head.add(this.headTop);

    const a = HEAD_R * HEAD_S.x;
    const b = HEAD_R * HEAD_S.y;
    const c = HEAD_R * HEAD_S.z;
    const onFace = (o: Object3D, x: number, y: number, inset: number) => {
      const zz = c * Math.sqrt(Math.max(0, 1 - (x / a) ** 2 - (y / b) ** 2));
      const n = new Vector3(x / (a * a), y / (b * b), zz / (c * c)).normalize();
      o.position.set(x, y, zz).addScaledVector(n, -inset);
      o.quaternion.setFromUnitVectors(_Zf, n);
      skull.add(o);
      return o;
    };
    for (const side of SIDES) {
      const eg = new Group();
      onFace(eg, side * 0.048, 0.002, 0.008);
      mk(G.eye, eyeM, eg, 0, 0, 0, false).scale.set(1, 1.18, 0.55);
      mk(G.glint, glintM, eg, 0.006, 0.009, 0.011, false);
      this.eyes.push(eg);

      const bg = new Group();
      onFace(bg, side * 0.05, 0.05, 0.002);
      mk(G.brow, browM, bg, 0, 0, 0, false).rotation.z = HALF_PI - side * 0.12;

      const ck = new Group();
      onFace(ck, side * 0.078, -0.036, 0.004);
      mk(G.cheek, cheekM, ck, 0, 0, 0, false).scale.set(1.25, 0.8, 0.28);

      mk(G.ear, skin, skull, side * a * 0.98, -0.012, -0.008).scale.set(0.5, 1, 0.75);
    }
    const ng = new Group();
    onFace(ng, 0, -0.026, 0.012);
    mk(G.nose, skin, ng, 0, 0, 0, false).scale.set(1.1, 0.85, 1);
    const mg = new Group();
    onFace(mg, 0, -0.064, 0.004);
    const mo = mk(G.mouth, mouthM, mg, 0, 0, 0, false);
    mo.rotation.z = Math.PI;
    mo.scale.set(1, 0.75, 1);

    /* ---- hair ---- */
    const r = HEAD_R * 1.075;
    const cap = mk(G.hairCap, hairM, skull, 0, 0.004, -0.004);
    cap.scale.set(r * HEAD_S.x, r * HEAD_S.y, r * HEAD_S.z);
    cap.rotation.x = -0.62;
    const part = this.seed % 2 < 1 ? 1 : -1;
    const bangs = mk(G.blob, hairM, skull, part * 0.02, 0.095, 0.08);
    bangs.scale.set(0.115, 0.048, 0.075);
    bangs.rotation.set(0.55, 0, part * 0.22);
    mk(G.blob, hairM, skull, 0, -0.03, -0.045).scale.set(0.125, 0.085, 0.09);
    if (profile.longHair) {
      const back = mk(G.blob, hairM, skull, 0, -0.085, -0.07);
      back.scale.set(0.158, 0.2, 0.1);
      back.rotation.x = 0.12;
      for (const side of SIDES) {
        const s = mk(G.blob, hairM, skull, side * 0.128, -0.06, -0.01);
        s.scale.set(0.048, 0.155, 0.095);
        s.rotation.z = side * 0.08;
      }
      mk(G.blob, hairM, skull, 0, 0.06, -0.02).scale.set(0.155, 0.11, 0.15);
    } else {
      const quiff = mk(G.blob, hairM, skull, -part * 0.03, 0.12, 0.045);
      quiff.scale.set(0.1, 0.05, 0.08);
      quiff.rotation.set(0.3, 0, -part * 0.25);
      for (const side of SIDES) mk(G.blob, hairM, skull, side * 0.135, 0.01, -0.02).scale.set(0.03, 0.06, 0.07);
    }

    // small/curved head parts: cast but don't receive (avoids shadow acne on the face & hair)
    this.head.traverse((n) => {
      if ((n as Mesh).isMesh) (n as Mesh).receiveShadow = false;
    });

    /* ---- selection ring ---- */
    this.ringMat = new MeshStandardMaterial({
      color: 0xf5c542, emissive: 0xf5c542, emissiveIntensity: 1.4,
      transparent: true, opacity: 0.9, depthWrite: false, roughness: 0.4,
    });
    this.ringGlowMat = new MeshStandardMaterial({
      color: 0xf5c542, emissive: 0xf5c542, emissiveIntensity: 0.8,
      transparent: true, opacity: 0.22, depthWrite: false, roughness: 0.6,
    });
    this.ring = new Group();
    this.ring.position.y = 0.01;
    this.ring.visible = false;
    const rg = new Mesh(G.ringGlow, this.ringGlowMat);
    rg.renderOrder = 1;
    const rm = new Mesh(G.ring, this.ringMat);
    rm.renderOrder = 2;
    this.ring.add(rg, rm);
    this.root.add(this.ring);

    this.update(0);
  }

  setPose(pose: Pose): void {
    if (pose === this.pose) return;
    this.pose = pose;
    this.poseTime = 0;
    this.from.set(this.cur);
    this.blendT = 0;
  }

  /** Walk speed in m/s: scales step frequency (2 steps/s at 1.4 m/s) and stride amplitude. */
  setWalkSpeed(mps: number): void {
    const s = Math.max(0, mps);
    this.walkFreq = clamp(0.35 + 0.65 * (s / 1.4), 0.35, 1.8);
    this.walkAmp = clamp(s / 1.4 / this.walkFreq, 0.4, 1.25);
  }

  setSelected(on: boolean): void {
    this.selected = on;
    this.ring.visible = on;
  }

  getHeadTop(target: Vector3): Vector3 {
    return this.headTop.getWorldPosition(target);
  }

  dispose(): void {
    this.root.removeFromParent();
    this.ringMat.dispose();
    this.ringGlowMat.dispose();
  }

  update(dt: number): void {
    const t = (this.time += dt);
    this.poseTime += dt;
    this.walkPhase = (this.walkPhase + dt * this.walkFreq) % 1000;
    const o = this.target;
    this.evalPose(this.pose, t, o);

    const cur = this.cur;
    if (!this.started) {
      cur.set(o);
      this.started = true;
    } else if (this.blendT >= BLEND_TIME) {
      cur.set(o);
    } else {
      this.blendT = Math.min(BLEND_TIME, this.blendT + dt);
      const w = smooth(0, 1, this.blendT / BLEND_TIME);
      const f = this.from;
      for (let i = 0; i < NCH; i++) {
        cur[i] = IS_LINEAR[i] ? f[i] + (o[i] - f[i]) * w : lerpAngle(f[i], o[i], w);
      }
    }
    this.apply(cur);

    // breathing (applied on top, not blended)
    const seated = SEATED.has(this.pose);
    const slow = this.pose === 'sleep';
    const br = Math.sin(t * (TAU / (this.pose === 'walk' ? 2.2 : slow ? 5.5 : 4.2)) + this.seed) * (slow ? 1.8 : 1);
    this.breath.scale.set(1 + 0.012 * br, 1 + 0.008 * br, 1 + 0.018 * br);
    const lift = 0.003 * br;
    const shrug = cur[I.shrug];
    this.neck.position.y = NECK_Y + lift;
    const sy = SH_Y + lift * (seated ? 0.5 : 1) + shrug;
    this.shoulders[0].position.y = sy;
    this.shoulders[1].position.y = sy;

    // blinking
    this.blinkIn -= dt;
    if (this.blinkIn <= 0 && this.blinkT < 0) {
      this.blinkT = 0;
      this.blinkIn = 2 + fract(Math.sin(t * 12.9898 + this.seed) * 43758.5453) * 3.5;
    }
    let ey = 1;
    if (this.blinkT >= 0) {
      this.blinkT += dt;
      const p = this.blinkT / 0.15;
      if (p >= 1) this.blinkT = -1;
      else ey = 1 - 0.92 * Math.sin(Math.PI * p);
    }
    ey *= clamp(cur[I.eyeOpen], 0.06, 1);
    this.eyes[0].scale.y = ey;
    this.eyes[1].scale.y = ey;

    // props: shown/hidden only via their prop: group
    for (let k = 0; k < this.props.length; k++) this.props[k].visible = cur[this.propCh[k]] > 0.5;

    // selection ring pulse
    if (this.selected) {
      const p = 0.5 + 0.5 * Math.sin(t * 4);
      this.ringMat.emissiveIntensity = 1.1 + 0.7 * p;
      this.ringMat.opacity = 0.75 + 0.2 * p;
      this.ringGlowMat.opacity = 0.12 + 0.16 * p;
      const s = 1 + 0.035 * p;
      this.ring.scale.set(s, 1, s);
    }
  }

  /* ---------------------------------------------------------------- */

  private apply(c: Float32Array): void {
    this.hips.position.set(c[I.hipX], c[I.hipY], c[I.hipZ]);
    this.hips.rotation.set(c[I.hipRX], c[I.hipRY], c[I.hipRZ]);
    this.spine.rotation.set(c[I.spineRX], c[I.spineRY], c[I.spineRZ]);
    this.chest.rotation.set(c[I.chestRX], c[I.chestRY], c[I.chestRZ]);
    this.neck.rotation.set(c[I.neckRX], c[I.neckRY], 0);
    this.head.rotation.set(c[I.headRX], c[I.headRY], c[I.headRZ]);
    for (let k = 0; k < 2; k++) {
      const a = ARM[SIDES[k]];
      const l = LEGS[SIDES[k]];
      this.shoulders[k].rotation.set(c[a.sh[0]], c[a.sh[1]], c[a.sh[2]]);
      this.elbows[k].rotation.x = -c[a.el];
      this.hands[k].rotation.set(c[a.hd[0]], c[a.hd[1]], c[a.hd[2]], 'YXZ');
      this.thighs[k].rotation.set(c[l.th[0]], c[l.th[1]], c[l.th[2]]);
      this.knees[k].rotation.x = c[l.kn];
      this.feet[k].rotation.x = c[l.ft];
    }
  }

  /** Convert a root-space point into chest space for the current channel values in o (hips unrotated). */
  private toChest(o: Float32Array, x: number, y: number, z: number): Vector3 {
    const s = this.scaleF;
    const l1 = o[I.spineRX];
    const l = l1 + o[I.chestRX];
    const cy = o[I.hipY] + SPINE_Y + CHEST_Y * Math.cos(l1);
    const cz = o[I.hipZ] + CHEST_Y * Math.sin(l1);
    const py = y / s - cy;
    const pz = z / s - cz;
    const cl = Math.cos(l);
    const sl = Math.sin(l);
    return _T.set(x / s - o[I.hipX], py * cl + pz * sl, -py * sl + pz * cl);
  }

  private resetExtras(o: Float32Array): void {
    o[I.shrug] = 0;
    o[I.eyeOpen] = 1;
    o[I.prMug] = 0;
    o[I.prPhone] = 0;
    o[I.prPaddle] = 0;
    o[I.prUtensil] = 0;
  }

  private standBase(o: Float32Array, t: number, amt: number): void {
    const sd = this.seed;
    const sway = wobble(t * 0.55, sd) * amt;
    o[I.hipX] = 0.014 * sway;
    o[I.hipY] = HIP_Y - 0.005 * Math.abs(sway);
    o[I.hipZ] = 0;
    o[I.hipRX] = 0;
    o[I.hipRY] = 0.04 * wobble(t * 0.3, sd + 3) * amt;
    o[I.hipRZ] = 0.035 * sway;
    o[I.spineRX] = 0.02;
    o[I.spineRY] = 0;
    o[I.spineRZ] = -0.022 * sway;
    o[I.chestRX] = 0.0;
    o[I.chestRY] = -o[I.hipRY] * 0.6;
    o[I.chestRZ] = -0.012 * sway;
    o[I.neckRX] = 0;
    o[I.neckRY] = 0;
    o[I.headRX] = 0.03 * Math.sin(t * 0.5 + sd);
    o[I.headRY] = 0.22 * wobble(t * 0.35, sd + 7) * amt;
    o[I.headRZ] = -0.6 * o[I.hipRZ] - 0.6 * o[I.spineRZ];
    const legTilt = -o[I.hipRZ] - Math.asin(clamp(o[I.hipX] / 0.8, -1, 1));
    for (let k = 0; k < 2; k++) {
      const side = SIDES[k];
      const relax = Math.max(0, -side * sway) * 0.12;
      legFK(o, side, -0.02 - relax * 0.4, 0, 0.04 + relax, -0.004 - relax * 0.6);
      o[LEGS[side].th[2]] = legTilt;
      o[LEGS[side].th[1]] = side * 0.06;
    }
    const arm = 0.02 * Math.sin(t * 1.1 + sd);
    armFK(o, 1, 0.04 + arm, 0.1 + 0.015 * sway, 0.2, 0.05, -0.05);
    armFK(o, -1, 0.04 - arm, 0.1 - 0.015 * sway, 0.2, 0.05, -0.05);
    this.resetExtras(o);
  }

  private seatBase(o: Float32Array, t: number): void {
    const sd = this.seed;
    o[I.hipX] = 0;
    o[I.hipY] = SEAT_HIP_Y / this.scaleF;
    o[I.hipZ] = SEAT_HIP_Z;
    o[I.hipRX] = 0;
    o[I.hipRY] = 0;
    o[I.hipRZ] = 0;
    o[I.spineRX] = 0.04;
    o[I.spineRY] = 0;
    o[I.spineRZ] = 0.01 * wobble(t * 0.3, sd);
    o[I.chestRX] = 0.02;
    o[I.chestRY] = 0.03 * wobble(t * 0.25, sd + 1);
    o[I.chestRZ] = 0;
    o[I.neckRX] = 0;
    o[I.neckRY] = 0;
    o[I.headRX] = 0.02 * Math.sin(t * 0.5 + sd);
    o[I.headRY] = 0.15 * wobble(t * 0.3, sd + 5);
    o[I.headRZ] = 0;
    const th = HALF_PI - 0.15;
    legFK(o, 1, -th, 0.05, th, 0);
    legFK(o, -1, -th, 0.05, th, 0);
    this.resetExtras(o);
  }

  /** IK the hand to a root-space point (seated / desk work). */
  private reachRoot(o: Float32Array, side: Side1, x: number, y: number, z: number, px: number, py: number, pz: number, q: Quaternion): void {
    const p = this.toChest(o, x, y, z);
    solveArm(o, side, p.x, p.y, p.z, px, py, pz, q);
  }

  private lapHands(o: Float32Array, t: number, liftR = 0, cross = 0): void {
    const sd = this.seed;
    for (let k = 0; k < 2; k++) {
      const side = SIDES[k];
      const lift = side === -1 ? liftR : 0;
      qEul(_qD, -HALF_PI + 0.25 + lift * 0.6, side === 1 ? -HALF_PI : HALF_PI - lift * 1.2, 0);
      this.reachRoot(
        o, side,
        side * 0.115 - 0.06 * cross,
        0.615 + 0.004 * Math.sin(t * 0.8 + sd + side) + lift * 0.12 + 0.09 * cross,
        0.12 + lift * 0.12 + 0.1 * cross,
        side * 0.6, -0.4, -0.6, _qD,
      );
    }
  }

  /** Palm-down hand resting on the desk/table surface (0.75 m). */
  private deskHand(o: Float32Array, side: Side1, x: number, z: number, dy = 0): void {
    handQ(_qD, side, -side * 0.25, -0.15, 1, 0, -1, 0);
    this.reachRoot(o, side, x, 0.785 + dy, z, side * 0.7, -0.5, -0.5, _qD);
  }

  /** Right hand holding the phone to the right ear (chest space). */
  private phoneToEar(o: Float32Array, t: number): void {
    handQ(_qD, -1, 0.12, 1, 0.3, 1, 0, -0.1);
    solveArm(o, -1, -0.205, 0.305 + 0.005 * Math.sin(t * 0.7), 0.0, -0.5, -0.6, 0.6, _qD);
    o[I.headRZ] = 0.08;
    o[I.headRY] = 0.1 * wobble(t * 0.3, this.seed);
    o[I.prPhone] = 1;
  }

  /** Both hands holding the phone in front of the chest, thumb-scrolling. */
  private phoneScroll(o: Float32Array, t: number, dy: number): void {
    const sd = this.seed;
    const flick = Math.max(0, Math.sin(t * 5.5 + sd)) ** 4 * smooth(-0.3, 0.3, Math.sin(t * 0.7 + sd));
    handQ(_qD, -1, 0.35, 0.3 + 0.15 * flick, 1, 0.1, 0.75, -0.65);
    solveArm(o, -1, -0.06, -0.03 + dy + 0.01 * flick, 0.25, -0.6, -0.6, -0.3, _qD);
    handQ(_qD, 1, -0.4, 0.25, 1, -0.2, 0.75, -0.6);
    solveArm(o, 1, 0.05, -0.05 + dy, 0.25, 0.6, -0.6, -0.3, _qD);
    o[I.headRX] = 0.32;
    o[I.neckRX] = 0.12;
    o[I.headRY] = 0.04 * Math.sin(t * 0.4 + sd);
    // occasional chuckle: shoulders shake, eyes squint
    const laugh = window4(fract((t + sd) / 7) * 7, 4.6, 4.8, 5.8, 6.1);
    o[I.shrug] = laugh * (0.012 + 0.01 * Math.sin(t * 28));
    o[I.chestRX] += laugh * 0.04 * Math.sin(t * 28);
    o[I.eyeOpen] = 1 - 0.65 * laugh;
    o[I.prPhone] = 1;
  }

  private evalPose(pose: Pose, t: number, o: Float32Array): void {
    const sd = this.seed;
    switch (pose) {
      case 'idle':
        this.standBase(o, t, 1);
        break;

      case 'walk': {
        this.resetExtras(o);
        const ph = this.walkPhase * TAU; // 1 stride = 2 steps
        const A = this.walkAmp;
        const s = Math.sin(ph);
        const c = Math.cos(ph);
        o[I.hipX] = 0.012 * c;
        o[I.hipY] = HIP_Y - 0.022 * A + 0.018 * A * Math.cos(2 * ph);
        o[I.hipZ] = 0;
        o[I.hipRX] = 0;
        o[I.hipRY] = -0.11 * s * A;
        o[I.hipRZ] = 0.03 * c;
        o[I.spineRX] = 0.05;
        o[I.spineRY] = 0.08 * s * A;
        o[I.spineRZ] = -0.02 * c;
        o[I.chestRX] = 0.02;
        o[I.chestRY] = 0.1 * s * A;
        o[I.chestRZ] = -0.01 * c;
        o[I.neckRX] = -0.03;
        o[I.neckRY] = -0.04 * s;
        o[I.headRX] = 0.02 * Math.cos(2 * ph);
        o[I.headRY] = -0.03 * s + 0.06 * wobble(t * 0.3, sd);
        o[I.headRZ] = -0.02 * c;
        for (let k = 0; k < 2; k++) {
          const side = SIDES[k];
          const p = side === 1 ? ph : ph + Math.PI;
          const ls = Math.sin(p);
          const swing = Math.max(0, Math.cos(p + Math.PI / 5));
          const thx = -0.46 * ls * A;
          const kn = 0.1 + 0.95 * A * swing * swing + 0.08 * Math.max(0, Math.sin(p - HALF_PI - 0.3));
          const ft = clamp(0.08 - 0.3 * ls * A - (thx + kn), -1.1, 0.7);
          legFK(o, side, thx, 0.015, kn, ft);
          o[LEGS[side].th[2]] -= o[I.hipRZ];
          o[LEGS[side].th[1]] = -o[I.hipRY] + side * 0.04;
          armFK(o, side, 0.42 * ls * A, 0.09, 0.28 + 0.38 * Math.max(0, -ls) * A, 0.05, -0.05);
        }
        break;
      }

      case 'sit':
        this.seatBase(o, t);
        this.lapHands(o, t);
        break;

      case 'sitIdle': {
        this.seatBase(o, t);
        const look = wobble(t * 0.22, sd + 3);
        o[I.neckRY] = 0.25 * look;
        o[I.headRY] = 0.45 * look;
        o[I.headRX] = -0.05 + 0.06 * Math.sin(t * 0.37 + sd);
        o[I.spineRX] = -0.02;
        o[I.chestRX] = -0.03;
        const cross = smooth(0.1, 0.5, Math.sin(t * 0.21 + sd));
        if (cross > 0) {
          const th = HALF_PI - 0.15 + 0.42 * cross;
          const r = LEGS[-1];
          o[r.th[0]] = -th;
          o[r.th[2]] = -0.05 * (1 - cross) + 0.34 * cross;
          o[r.kn] = th;
          o[r.ft] = 0.3 * cross;
          o[I.hipRY] = -0.06 * cross;
        }
        this.lapHands(o, t, 0, cross);
        break;
      }

      case 'sitTalk': {
        this.seatBase(o, t);
        const turn = wobble(t * 0.45, sd + 2);
        o[I.neckRY] = 0.2 * turn;
        o[I.headRY] = 0.35 * turn;
        o[I.chestRY] = 0.08 * turn;
        o[I.headRX] = 0.08 * Math.sin(t * 3.6) * Math.max(0, Math.sin(t * 0.8 + sd)) - 0.03;
        o[I.headRZ] = 0.05 * Math.sin(t * 0.7 + sd);
        const gest = smooth(0.2, 0.8, Math.sin(t * 0.55 + sd));
        this.lapHands(o, t, gest * (0.7 + 0.3 * Math.sin(t * 3.1)));
        break;
      }

      case 'type': {
        this.seatBase(o, t);
        o[I.spineRX] = 0.09;
        o[I.chestRX] = 0.04;
        o[I.headRX] = -0.02 + 0.02 * Math.sin(t * 0.4 + sd);
        o[I.headRY] = 0.08 * wobble(t * 0.25, sd + 9);
        o[I.neckRX] = 0.02;
        const active = smooth(-0.6, -0.2, Math.sin(t * 0.33 + sd)); // occasional pauses
        for (let k = 0; k < 2; k++) {
          const side = SIDES[k];
          const f = t * (side === 1 ? 7.3 : 8.1) + sd + side;
          const tap = Math.max(0, Math.sin(f)) ** 3 * active;
          const drift = 0.012 * Math.sin(t * 0.9 + side * 2 + sd);
          qEul(_qD, -HALF_PI + 0.24 + 0.16 * tap, side === 1 ? -HALF_PI + 0.25 : HALF_PI - 0.25, 0);
          this.reachRoot(o, side, side * 0.155 + drift, 0.79 + 0.012 * tap, 0.365 + 0.008 * Math.sin(f * 0.37),
            side * 0.7, -0.5, -0.5, _qD);
        }
        break;
      }

      case 'sitGame': {
        this.seatBase(o, t);
        o[I.spineRX] = 0.2;
        o[I.chestRX] = 0.1;
        o[I.neckRX] = -0.08;
        o[I.headRX] = -0.12 + 0.06 * Math.sin(t * 8.5);
        // sneaky glance over the shoulder every ~7 s
        const gp = fract((t + sd) / 7) * 7;
        const glance = window4(gp, 5.2, 5.5, 6.1, 6.4);
        const gs = Math.floor((t + sd) / 7) % 2 === 0 ? 1 : -1;
        o[I.neckRY] = gs * 0.45 * glance;
        o[I.headRY] = gs * 0.75 * glance + 0.05 * Math.sin(t * 3);
        o[I.chestRY] = gs * 0.12 * glance;
        o[I.eyeOpen] = 1 + 0.15 * glance;
        // WASD hand
        const wasd = Math.max(0, Math.sin(t * 11 + sd)) ** 2;
        handQ(_qD, 1, -0.2, -0.35 - 0.3 * wasd, 1, 0, -1, 0);
        this.reachRoot(o, 1, 0.13 + 0.015 * Math.sin(t * 3.3), 0.79 + 0.012 * wasd, 0.37, 0.7, -0.5, -0.5, _qD);
        // mouse hand: frantic jitter + clicks
        const click = Math.max(0, Math.sin(t * 17 + sd)) ** 6;
        const jx = 0.025 * Math.sin(t * 6.1) + 0.012 * Math.sin(t * 13.7);
        const jz = 0.02 * Math.sin(t * 5.3 + 1) + 0.01 * Math.sin(t * 15.1);
        handQ(_qD, -1, 0.05, -0.3 - 0.35 * click, 1, 0, -1, 0);
        this.reachRoot(o, -1, -0.27 + jx, 0.78, 0.36 + jz, -0.7, -0.5, -0.5, _qD);
        break;
      }

      case 'sitPhone': {
        this.seatBase(o, t);
        this.phoneToEar(o, t);
        o[I.spineRX] = 0.03;
        this.deskHand(o, 1, 0.17, 0.34);
        o[I.headRX] = 0.04 * Math.sin(t * 2.5) * Math.max(0, Math.sin(t * 0.6 + sd));
        break;
      }

      case 'sitScroll': {
        this.seatBase(o, t);
        o[I.spineRX] = 0.08;
        this.phoneScroll(o, t, -0.06);
        break;
      }

      case 'eat': {
        this.seatBase(o, t);
        o[I.spineRX] = 0.08;
        o[I.chestRX] = 0.04;
        this.deskHand(o, 1, 0.17, 0.36);
        const P = 4.6;
        const ph = fract((t + sd) / P) * P;
        const raise = window4(ph, 0.9, 1.7, 2.5, 3.3);
        const scoop = (1 - raise) * 0.012 * Math.sin(t * 4);
        const pb = this.toChest(o, -0.08, 0.94 + scoop, 0.29);
        const bx = pb.x;
        const by = pb.y;
        const bz = pb.z;
        qEul(_qD, lerp(0, 2.805, raise), 0, 0);
        solveArm(o, -1, lerp(bx, -0.03, raise), lerp(by, 0.235, raise), lerp(bz, 0.3, raise), -0.6, -0.5, -0.4, _qD);
        o[I.headRX] = 0.18 * (1 - raise) - 0.04;
        o[I.neckRX] = 0.06 * raise;
        o[I.headRY] = 0.05 * Math.sin(t * 0.5 + sd);
        o[I.prUtensil] = 1;
        break;
      }

      case 'sleep': {
        this.seatBase(o, t);
        const b = Math.sin(t * (TAU / 5.5) + sd);
        o[I.spineRX] = 0.55 + 0.02 * b;
        o[I.chestRX] = 0.45;
        o[I.chestRY] = 0;
        o[I.neckRX] = 0.15;
        o[I.neckRY] = 0;
        o[I.headRX] = 0.1;
        o[I.headRY] = 1.15;
        o[I.headRZ] = 0.15;
        o[I.eyeOpen] = 0.06;
        // forearms folded on the desk under the head
        handQ(_qD, 1, -1, -0.05, 0.25, 0, -1, 0);
        this.reachRoot(o, 1, 0.1, 0.79, 0.47, 1, -0.2, -0.2, _qD);
        handQ(_qD, -1, 1, -0.05, 0.25, 0, -1, 0);
        this.reachRoot(o, -1, -0.1, 0.79, 0.43, -1, -0.2, -0.2, _qD);
        break;
      }

      case 'drink': {
        this.standBase(o, t, 0.6);
        const P = 6.5;
        const ph = fract((t + sd) / P) * P;
        const raise = window4(ph, 0, 0.9, 2.5, 3.4);
        const sip = window4(ph, 0.7, 1.1, 2.2, 2.6);
        qEul(_qD, -HALF_PI - 0.1 - 0.75 * sip - 0.35 * raise, 0.1, 0);
        solveArm(o, -1, -0.13 + 0.07 * raise, -0.17 + 0.38 * raise, 0.2 - 0.05 * raise, -0.6, -0.3, -0.7, _qD);
        o[I.headRX] = -0.12 * sip + 0.03 * (1 - raise);
        o[I.headRY] *= 1 - raise;
        o[I.prMug] = 1;
        break;
      }

      case 'talk': {
        this.standBase(o, t, 0.7);
        const beat = Math.max(0, Math.sin(t * 3.4 + sd)) ** 2;
        o[I.headRX] = 0.07 * Math.sin(t * 3.4) * Math.max(0, Math.sin(t * 0.9 + sd)) - 0.02;
        o[I.headRY] = 0.12 * wobble(t * 0.5, sd + 4);
        o[I.chestRY] = 0.06 * Math.sin(t * 0.8 + sd);
        const gR = 0.5 + 0.5 * wobble(t * 1.2, sd + 11);
        const gL = 0.5 + 0.5 * wobble(t * 0.9, sd + 17);
        qEul(_qD, -HALF_PI + 0.3, -0.7 - 0.3 * gR, 0);
        solveArm(o, -1, -0.14 + 0.04 * Math.sin(t * 1.7 + sd), -0.1 + 0.1 * gR + 0.03 * beat, 0.27 + 0.05 * gR,
          -0.6, -0.4, -0.5, _qD);
        qEul(_qD, -HALF_PI + 0.45, 0.5 + 0.3 * gL, 0);
        solveArm(o, 1, 0.16 + 0.03 * Math.sin(t * 1.3 + sd), -0.2 + 0.1 * gL, 0.2 + 0.06 * gL, 0.6, -0.4, -0.5, _qD);
        break;
      }

      case 'phone': {
        this.standBase(o, t, 1.4);
        o[I.hipRY] = 0.22 * wobble(t * 0.35, sd + 2);
        o[I.chestRY] = -0.3 * o[I.hipRY];
        this.phoneToEar(o, t);
        const g = smooth(0.2, 0.7, Math.sin(t * 0.6 + sd));
        const jig = 0.03 * Math.sin(t * 4.1) * g;
        handQ(_qA, 1, 0, -1, 0.1, -1, 0, 0);
        handQ(_qB, 1, -0.2, 0.3, 1, 0, 1, 0);
        _qD.slerpQuaternions(_qA, _qB, g);
        solveArm(o, 1, lerp(0.215, 0.17, g), lerp(-0.3, -0.12, g) + jig, lerp(0.05, 0.27, g), 0.6, -0.6, -0.5, _qD);
        o[I.headRX] = 0.05 * Math.sin(t * 2.8) * g;
        break;
      }

      case 'scroll':
        this.standBase(o, t, 0.6);
        this.phoneScroll(o, t, 0);
        break;

      case 'cheer': {
        this.resetExtras(o);
        this.standBase(o, t, 0);
        const w = TAU * 1.6;
        const j = Math.sin(t * w);
        let hy = HIP_Y;
        if (j > 0) {
          hy += 0.07 * j;
          legFK(o, 1, -0.05 * j, 0.03, 0.15 * j, 0.35 * j);
          legFK(o, -1, -0.05 * j, 0.03, 0.15 * j, 0.35 * j);
        } else {
          hy -= crouch(o, 1, 0.38 * -j, 0.03);
          crouch(o, -1, 0.38 * -j, 0.03);
        }
        o[I.hipY] = hy;
        o[I.hipX] = 0;
        o[I.hipRZ] = 0;
        o[I.spineRX] = -0.08;
        o[I.headRX] = -0.2 + 0.06 * j;
        o[I.headRY] = 0.1 * Math.sin(t * 1.3);
        o[I.headRZ] = 0.06 * Math.sin(t * 3.2);
        for (let k = 0; k < 2; k++) {
          const side = SIDES[k];
          const pump = 0.5 + 0.5 * Math.sin(t * w + (side === 1 ? 0 : 0.6));
          handQ(_qD, side, side * 0.15, 1, 0.15, 0, 0.1, 1);
          solveArm(o, side, side * 0.24, 0.48 + 0.12 * pump, 0.08, side * 1, -0.2, -0.2, _qD);
        }
        o[I.eyeOpen] = 0.75;
        break;
      }

      case 'dance': {
        this.standBase(o, t, 0);
        const w = TAU * 2; // 120 bpm
        const bt = t * w;
        const sw = Math.sin(bt / 2);
        const bob = 0.5 + 0.5 * Math.cos(bt);
        o[I.hipX] = 0.05 * sw;
        o[I.hipRZ] = 0.08 * sw;
        o[I.hipRY] = 0.15 * Math.sin(bt / 4);
        o[I.spineRZ] = -0.12 * sw;
        o[I.chestRZ] = -0.05 * sw;
        o[I.chestRY] = -0.1 * Math.sin(bt / 4);
        const drop = crouch(o, 1, 0.12 + 0.14 * bob) * 0.5 + crouch(o, -1, 0.12 + 0.14 * bob) * 0.5;
        o[I.hipY] = HIP_Y - drop;
        for (let k = 0; k < 2; k++) {
          const side = SIDES[k];
          const l = LEGS[side];
          o[l.th[2]] = -o[I.hipRZ] - Math.asin(clamp(o[I.hipX] / 0.8, -1, 1));
          // step: lift the leg on the "off" side
          const lift = Math.max(0, side * sw) ** 2 * 0.35;
          o[l.th[0]] -= lift;
          o[l.kn] += lift * 1.6;
          o[l.ft] -= lift * 0.4;
        }
        for (let k = 0; k < 2; k++) {
          const side = SIDES[k];
          const pump = Math.max(0, Math.sin(bt / 2 + (side === 1 ? 0 : Math.PI)));
          handQ(_qD, side, side * 0.2, 1, 0.3, 0, 0, 1);
          solveArm(o, side, side * 0.26, -0.05 + 0.4 * pump, 0.15 + 0.06 * pump, side, -0.6, -0.2, _qD);
        }
        o[I.headRZ] = 0.12 * Math.sin(bt / 2 + 0.5);
        o[I.headRX] = 0.06 * Math.cos(bt);
        o[I.eyeOpen] = 0.8;
        break;
      }

      case 'stress': {
        this.standBase(o, t, 0.4);
        o[I.spineRX] = 0.2;
        o[I.chestRX] = 0.12;
        o[I.neckRX] = 0.12;
        o[I.headRX] = 0.1;
        o[I.headRY] = 0.32 * Math.sin(t * 2.4);
        o[I.headRZ] = 0.05 * Math.sin(t * 1.2);
        o[I.shrug] = 0.012;
        for (let k = 0; k < 2; k++) {
          const side = SIDES[k];
          handQ(_qD, side, -side * 0.35, 0.75, -0.3, -side, -0.3, 0);
          solveArm(o, side, side * 0.17, 0.42 + 0.01 * Math.sin(t * 2.4 + side), 0.1, side * 0.5, 0, 1, _qD);
        }
        o[I.eyeOpen] = 0.55;
        break;
      }

      case 'stretch': {
        this.standBase(o, t, 0.3);
        const bend = Math.sin(t * 0.9 + sd);
        o[I.spineRZ] = 0.2 * bend;
        o[I.chestRZ] = 0.12 * bend;
        o[I.hipX] = -0.03 * bend;
        o[I.spineRX] = -0.06;
        o[I.headRX] = -0.12 + 0.14 * Math.cos(t * 1.3);
        o[I.headRZ] = 0.18 * Math.sin(t * 1.3);
        o[I.headRY] = 0;
        for (let k = 0; k < 2; k++) {
          const side = SIDES[k];
          handQ(_qD, side, -side * 0.2, 1, 0, -side, 0.3, 0);
          solveArm(o, side, side * 0.07, 0.64, 0.0, side, 0, 0, _qD);
        }
        o[I.eyeOpen] = 0.3 + 0.7 * smooth(0.5, 1, Math.cos(t * 1.3));
        break;
      }

      case 'wave': {
        this.standBase(o, t, 0.6);
        const wv = Math.sin(t * 8.5);
        const a = 0.42 * wv;
        handQ(_qD, -1, Math.sin(a) * -1, Math.cos(a), 0.1, 0, 0, 1);
        solveArm(o, -1, -0.3 + 0.025 * wv, 0.38, 0.1, -1, -0.6, 0, _qD);
        o[I.headRZ] = -0.1;
        o[I.headRX] = -0.04 + 0.04 * Math.sin(t * 2.2);
        o[I.headRY] = 0.05 * Math.sin(t * 0.7);
        o[I.chestRZ] = 0.04;
        break;
      }

      case 'present': {
        this.standBase(o, t, 0.5);
        const look = smooth(-0.3, 0.3, Math.sin(t * 0.5 + sd));
        o[I.chestRY] = 0.18;
        o[I.neckRY] = 0.15 * look;
        o[I.headRY] = 0.45 * look - 0.15;
        // pointing arm (left) toward the screen at front-left
        const emph = Math.max(0, Math.sin(t * 2.6)) ** 3 * look;
        _A.set(0.72, 0.3 + 0.08 * emph, 0.62).normalize();
        handQ(_qD, 1, _A.x, _A.y, _A.z, 0, -0.4, 1);
        solveArm(o, 1, SH_X + _A.x * 0.47, SH_Y + _A.y * 0.47, _A.z * 0.47, 0.2, -1, -0.2, _qD);
        // explaining hand
        const g = 0.5 + 0.5 * wobble(t * 1.1, sd + 3);
        qEul(_qD, -HALF_PI + 0.3, -0.7 - 0.3 * g, 0);
        solveArm(o, -1, -0.13, -0.12 + 0.1 * g + 0.03 * Math.sin(t * 3.3), 0.26, -0.6, -0.4, -0.5, _qD);
        o[I.headRX] = 0.04 * Math.sin(t * 3.1) * (1 - look);
        break;
      }

      case 'pingpong': {
        this.standBase(o, t, 0);
        const shuffle = Math.sin(t * Math.PI * 0.5 + sd);
        o[I.hipX] = 0.07 * shuffle;
        const drop = crouch(o, 1, 0.42, 0.13);
        crouch(o, -1, 0.42, 0.13);
        o[I.hipY] = HIP_Y - drop - 0.012;
        o[I.hipRZ] = 0;
        for (let k = 0; k < 2; k++) {
          const l = LEGS[SIDES[k]];
          o[l.th[2]] = SIDES[k] * 0.13 - Math.asin(clamp(o[I.hipX] / 0.8, -1, 1));
          o[l.th[1]] = 0;
        }
        o[I.spineRX] = 0.22;
        o[I.chestRX] = 0.05;
        o[I.neckRX] = -0.12;
        o[I.headRX] = -0.12;
        o[I.headRY] = 0;
        // ~1 swing per second alternating forehand / backhand
        const cyc = Math.floor(t);
        const fr = t - cyc;
        const fore = cyc % 2 === 0;
        const wind = smooth(0, 0.35, fr);
        const strike = smooth(0.35, 0.6, fr);
        const rec = smooth(0.6, 1, fr);
        // keys: ready R, start S, end E (chest space)
        const Rx = -0.12, Ry = -0.04, Rz = 0.3;
        const Sx = fore ? -0.38 : 0.06, Sy = -0.02, Sz = fore ? -0.02 : 0.14;
        const Ex = fore ? 0.05 : -0.3, Ey = 0.1, Ez = 0.36;
        let x: number, y: number, z: number;
        if (fr < 0.35) {
          x = lerp(Rx, Sx, wind); y = lerp(Ry, Sy, wind); z = lerp(Rz, Sz, wind);
          handQ(_qA, -1, -0.3, 0.6, 0.7, 0, 0, 1);
          if (fore) handQ(_qB, -1, -0.8, 0.5, -0.2, 0.2, 0, 1);
          else handQ(_qB, -1, 0.8, 0.4, 0.2, 0, 0, -1);
          _qD.slerpQuaternions(_qA, _qB, wind);
        } else if (fr < 0.6) {
          x = lerp(Sx, Ex, strike); y = lerp(Sy, Ey, strike); z = lerp(Sz, Ez, strike) + 0.08 * Math.sin(Math.PI * strike);
          if (fore) {
            handQ(_qA, -1, -0.8, 0.5, -0.2, 0.2, 0, 1);
            handQ(_qB, -1, 0.6, 0.6, 0.4, 0.4, 0, 0.9);
          } else {
            handQ(_qA, -1, 0.8, 0.4, 0.2, 0, 0, -1);
            handQ(_qB, -1, -0.6, 0.6, 0.4, -0.3, 0, -0.9);
          }
          _qD.slerpQuaternions(_qA, _qB, strike);
        } else {
          x = lerp(Ex, Rx, rec); y = lerp(Ey, Ry, rec); z = lerp(Ez, Rz, rec);
          if (fore) handQ(_qA, -1, 0.6, 0.6, 0.4, 0.4, 0, 0.9);
          else handQ(_qA, -1, -0.6, 0.6, 0.4, -0.3, 0, -0.9);
          handQ(_qB, -1, -0.3, 0.6, 0.7, 0, 0, 1);
          _qD.slerpQuaternions(_qA, _qB, rec);
        }
        solveArm(o, -1, x, y, z, -0.6, -0.6, -0.3, _qD);
        const twist = fr < 0.35 ? (fore ? -0.35 : 0.3) * wind : fr < 0.6 ? lerp(fore ? -0.35 : 0.3, fore ? 0.35 : -0.25, strike) : (fore ? 0.35 : -0.25) * (1 - rec);
        o[I.chestRY] = twist;
        o[I.spineRY] = twist * 0.4;
        o[I.headRY] = -twist * 0.7;
        armFK(o, 1, -0.55, 0.35, 1.4, 0, 0);
        o[I.prPaddle] = 1;
        break;
      }

      case 'foosball': {
        this.standBase(o, t, 0);
        const drop = crouch(o, 1, 0.2, 0.06);
        crouch(o, -1, 0.2, 0.06);
        o[I.hipY] = HIP_Y - drop;
        o[I.hipX] = 0.01 * Math.sin(t * 3);
        o[I.hipRZ] = 0;
        o[I.spineRX] = 0.22;
        o[I.chestRX] = 0.06;
        o[I.neckRX] = -0.05;
        o[I.headRX] = 0.2;
        o[I.headRY] = 0.12 * Math.sin(t * 2.3);
        const burst = 0.4 + 0.6 * smooth(-0.2, 0.4, Math.sin(t * 0.9 + sd));
        for (let k = 0; k < 2; k++) {
          const side = SIDES[k];
          const tw = burst * (0.7 * Math.sin(t * 11 + side * 1.7) + 0.3 * Math.sin(t * 17 + side));
          const a = 0.2 + tw;
          handQ(_qD, side, 0, -Math.sin(a), Math.cos(a), 0, -Math.cos(a), -Math.sin(a));
          const slide = 0.04 * burst * Math.sin(t * 5.3 + side * 2.1);
          this.reachRoot(o, side, side * 0.22 + slide, 0.87, 0.36, side * 1, -0.4, -0.2, _qD);
        }
        break;
      }

      case 'argue': {
        this.standBase(o, t, 0.4);
        o[I.spineRX] = 0.14;
        o[I.chestRX] = 0.06;
        o[I.neckRX] = -0.06;
        const P = 5.2;
        const ph = fract((t + sd) / P) * P;
        const what = window4(ph, 3.4, 3.7, 4.5, 4.9); // "what?!" both-arms-out
        o[I.headRY] = 0.25 * Math.sin(t * 7) * (1 - what) + 0.1 * Math.sin(t * 1.1);
        o[I.headRX] = -0.12 * what;
        o[I.headRZ] = 0.12 * what;
        o[I.shrug] = 0.03 * what;
        o[I.eyeOpen] = 0.7 + 0.5 * what;
        // right: jabbing finger
        const jab = Math.max(0, Math.sin(t * 9)) ** 2;
        handQ(_qA, -1, 0.15, 0.1 + 0.15 * jab, 1, 0.8, 0, 0);
        handQ(_qB, -1, -0.7, 0.2, 0.7, 0, 1, 0);
        _qD.slerpQuaternions(_qA, _qB, what);
        solveArm(o, -1,
          lerp(-0.08, -0.4, what), lerp(0.12 + 0.03 * jab, -0.12, what), lerp(0.34 + 0.07 * jab, 0.2, what),
          -0.6, -0.6, -0.2, _qD);
        // left: hand on hip
        handQ(_qA, 1, 0.2, -0.6, -0.5, -1, 0, 0);
        handQ(_qB, 1, 0.7, 0.2, 0.7, 0, 1, 0);
        _qD.slerpQuaternions(_qA, _qB, what);
        solveArm(o, 1, lerp(0.25, 0.4, what), lerp(-0.25, -0.12, what), lerp(-0.01, 0.2, what), 1, 0.1, -0.4, _qD);
        o[I.chestRY] = -0.12 * (1 - what) + 0.05 * Math.sin(t * 9) * (1 - what);
        break;
      }

      case 'fight': {
        this.standBase(o, t, 0);
        const hop = Math.abs(Math.sin(t * 9));
        o[I.hipY] = HIP_Y + 0.035 * hop - 0.01;
        o[I.hipX] = 0.02 * Math.sin(t * 4.5);
        o[I.hipRZ] = 0;
        for (let k = 0; k < 2; k++) {
          const side = SIDES[k];
          legFK(o, side, -0.08 * Math.sin(t * 9 + side), 0.08, 0.2 * hop + 0.05, 0.25 * hop);
        }
        o[I.spineRX] = 0.12;
        o[I.chestRZ] = 0.08 * Math.sin(t * 9);
        o[I.chestRY] = 0.18 * Math.sin(t * 4.5);
        o[I.headRY] = 0.3 * Math.sin(t * 11);
        o[I.headRX] = -0.05;
        o[I.eyeOpen] = 0.35;
        const P = 4;
        const ph = fract((t + sd) / P) * P;
        if (ph < 2.2) {
          // windmill flailing
          for (let k = 0; k < 2; k++) {
            const side = SIDES[k];
            const ang = -(t * 13 + (side === 1 ? 0 : Math.PI));
            armFK(o, side, ang, 0.35, 0.35, 0.2, 0);
          }
        } else {
          // alternating slaps toward +Z
          for (let k = 0; k < 2; k++) {
            const side = SIDES[k];
            const sl = Math.max(0, Math.sin(t * 12 + (side === 1 ? 0 : Math.PI)));
            handQ(_qD, side, side * 0.3 - side * 0.8 * sl, 0.6, 0.6, -side * 0.6, 0, 0.8);
            solveArm(o, side, side * (0.32 - 0.25 * sl), 0.12 + 0.05 * sl, 0.12 + 0.3 * sl, side, -0.3, -0.3, _qD);
          }
        }
        break;
      }

      case 'fall': {
        this.standBase(o, t, 0);
        const ph = this.poseTime % 3.0;
        // body pitches about the feet (theta: 0 upright .. PI/2 face-down)
        const stumble = window4(ph, 0, 0.12, 0.2, 0.3);
        const fallU = smooth(0.25, 1.2, ph);
        const upU = smooth(2.0, 2.85, ph);
        const bounce = window4(ph, 1.18, 1.25, 1.27, 1.4);
        const theta = HALF_PI * (fallU * fallU) * (1 - upU) - 0.12 * stumble;
        const down = fallU * (1 - upU);
        const H = HIP_Y;
        o[I.hipRX] = theta;
        o[I.hipY] = H * Math.cos(theta) + 0.11 * Math.sin(Math.max(0, theta)) + 0.02 * bounce;
        o[I.hipZ] = H * Math.sin(theta);
        o[I.hipX] = 0;
        o[I.hipRZ] = 0;
        o[I.hipRY] = 0;
        o[I.spineRX] = 0;
        o[I.chestRX] = 0;
        o[I.chestRY] = 0;
        o[I.spineRZ] = 0;
        o[I.chestRZ] = 0;
        // legs: comic feet-up kick while lying
        const kick = down * (0.9 + 0.25 * Math.sin(ph * 9) * window4(ph, 1.2, 1.4, 1.8, 2.0));
        legFK(o, 1, 0.1 * down, 0.06, kick, -0.3 * down);
        legFK(o, -1, 0.05 * down, 0.06, kick * 0.8, -0.3 * down);
        // arms: flail on stumble -> stretched out ahead on the floor -> push-up
        const flail = stumble + window4(ph, 0.2, 0.4, 0.8, 1.0);
        const push = window4(ph, 1.8, 2.05, 2.5, 2.9);
        for (let k = 0; k < 2; k++) {
          const side = SIDES[k];
          const fl = Math.sin(ph * 22 + side) * 0.6 * flail;
          const rx = lerp(-0.4 - 2.4 * down + fl, -1.35, push);
          armFK(o, side, rx, lerp(0.25 + 0.35 * down, 0.2, push), lerp(0.25, 0.2, push), 0, 0);
        }
        o[I.neckRX] = -0.35 * down;
        o[I.headRX] = -0.25 * down;
        o[I.headRY] = 0;
        // dizzy wobble after getting up
        const dizzy = window4(ph, 2.45, 2.6, 2.85, 3.0);
        o[I.headRZ] = 0.22 * dizzy * Math.sin(ph * 14);
        o[I.headRY] = 0.25 * dizzy * Math.cos(ph * 14);
        o[I.eyeOpen] = 1 - 0.7 * down;
        break;
      }
    }
  }
}
