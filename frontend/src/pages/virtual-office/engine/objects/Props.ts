import {
  type BufferGeometry, BoxGeometry, type CanvasTexture, CylinderGeometry, Group, Mesh, MeshStandardMaterial, type Object3D,
  PlaneGeometry,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { bakeStatic } from '../utils/bake';
import { canvas, toTexture } from '../utils/canvasTextures';
import { seeded } from '../utils/helpers';
import { M, mat } from '../utils/materials';

/** Something ticked every frame by the scene (dt in seconds). */
export interface Animated {
  update(dt: number): void;
}

// ---------------------------------------------------------------- server LEDs

/**
 * Blinking status LEDs for a row of server racks. All panels share one small canvas texture
 * (one atlas column per rack) and are merged into a single mesh = one draw call.
 * `panels` are rack fronts: centre position (world), width, height; the panel faces +Z.
 */
export function createServerLeds(parent: Object3D, panels: { x: number; y: number; z: number; w: number; h: number }[]): Animated {
  const n = panels.length;
  const CW = 64;
  const CH = 256;
  const [c, ctx] = canvas(CW * n, CH);
  const tex: CanvasTexture = toTexture(c);
  const r = seeded(77);
  const colors = ['#36ff7a', '#36ff7a', '#36ff7a', '#38b6ff', '#ffb02e', '#ff4d4d'];
  // LED slots: per rack ~ 2 columns x 24 rows
  const leds: { x: number; y: number; col: string; on: boolean; rate: number }[] = [];
  for (let i = 0; i < n; i++)
    for (let row = 0; row < 24; row++)
      for (let k = 0; k < 3; k++) {
        if (r() < 0.2) continue;
        leds.push({
          x: i * CW + 6 + k * 9 + (k === 2 ? 30 : 0), y: 5 + row * 10.3,
          col: colors[Math.floor(r() * colors.length)], on: r() < 0.6, rate: 0.5 + r() * 6,
        });
      }
  const draw = () => {
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, CW * n, CH);
    for (const l of leds) {
      if (!l.on) continue;
      ctx.fillStyle = l.col;
      ctx.fillRect(l.x, l.y, 6, 5);
    }
    tex.needsUpdate = true;
  };
  draw();
  const geos: BufferGeometry[] = panels.map((p, i) => {
    const g = new PlaneGeometry(p.w, p.h);
    const uv = g.attributes.uv;
    for (let k = 0; k < uv.count; k++) uv.setX(k, (i + uv.getX(k)) / n);
    g.translate(p.x, p.y, p.z);
    return g;
  });
  const material = new MeshStandardMaterial({
    color: 0x000000, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 3, transparent: true, alphaMap: tex, depthWrite: false,
  });
  const mesh = new Mesh(mergeGeometries(geos), material);
  for (const g of geos) g.dispose();
  parent.add(mesh);
  let acc = 0;
  const flicker = seeded(99);
  return {
    update(dt: number) {
      acc += dt;
      if (acc < 0.09) return;
      for (const l of leds) if (flicker() < l.rate * acc * 0.25) l.on = !l.on;
      acc = 0;
      draw();
    },
  };
}

// ---------------------------------------------------------------- glow pulse

/** Gently pulses the emissive intensity of one material (vending fronts, signs). */
export function createGlowPulse(material: MeshStandardMaterial, base: number, amp: number, speed: number, phase = 0): Animated {
  let t = phase;
  return {
    update(dt: number) {
      t += dt * speed;
      material.emissiveIntensity = base + Math.sin(t) * amp + Math.sin(t * 2.7) * amp * 0.25;
    },
  };
}

// ---------------------------------------------------------------- wall clock hands

/**
 * Hour / minute / second hands showing local time. `group` is placed by the caller (dial in its local XY plane,
 * facing local +Z); the hands are added to it.
 */
export function createClockHands(group: Group, radius: number): Animated {
  const dark = mat(0x1d222b, { roughness: 0.4 });
  const red = mat(0xd62828, { roughness: 0.4 });
  const hand = (len: number, w: number, m: MeshStandardMaterial, z: number) => {
    const geo = new BoxGeometry(w, len, 0.006);
    geo.translate(0, len / 2 - len * 0.12, 0);
    const mesh = new Mesh(geo, m);
    mesh.position.z = z;
    group.add(mesh);
    return mesh;
  };
  const h = hand(radius * 0.55, radius * 0.07, dark, 0.006);
  const m = hand(radius * 0.8, radius * 0.05, dark, 0.012);
  const s = hand(radius * 0.86, radius * 0.018, red, 0.018);
  let acc = 1;
  return {
    update(dt: number) {
      acc += dt;
      if (acc < 0.25) return;
      acc = 0;
      const d = new Date();
      const sec = d.getSeconds() + d.getMilliseconds() / 1000;
      const min = d.getMinutes() + sec / 60;
      const hr = (d.getHours() % 12) + min / 60;
      s.rotation.z = -(sec / 60) * Math.PI * 2;
      m.rotation.z = -(min / 60) * Math.PI * 2;
      h.rotation.z = -(hr / 12) * Math.PI * 2;
    },
  };
}

// ---------------------------------------------------------------- robot vacuum

/**
 * A round robot vacuum (~0.34 m), origin on the floor at its centre, forward = local +Z.
 * Geometry is merged per material so the robot costs only a handful of draw calls.
 */
export function createRobotVacuum(): Group {
  const raw = new Group();
  const add = (geo: BufferGeometry, m: MeshStandardMaterial, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) => {
    const mesh = new Mesh(geo, m);
    mesh.position.set(x, y, z);
    mesh.rotation.set(rx, ry, rz);
    raw.add(mesh);
    return mesh;
  };
  const shell = mat(0xeef0f3, { roughness: 0.35 });
  const top = mat(0x1a1d22, { roughness: 0.15, metalness: 0.2 });
  const grey = M.greyPlastic();
  const black = M.blackPlastic();
  const R = 0.17;
  // Body: skirt + shell + glossy lid
  add(new CylinderGeometry(R - 0.01, R - 0.02, 0.025, 24), black, 0, 0.0175, 0);
  add(new CylinderGeometry(R, R, 0.05, 28), shell, 0, 0.055, 0);
  add(new CylinderGeometry(R - 0.012, R, 0.012, 28), shell, 0, 0.086, 0);
  add(new CylinderGeometry(R - 0.03, R - 0.03, 0.006, 28), top, 0, 0.094, 0);
  // Front bumper: half ring hugging the front
  add(new CylinderGeometry(R + 0.006, R + 0.006, 0.04, 20, 1, true, -Math.PI / 2 - 0.2, Math.PI + 0.4), grey, 0, 0.05, 0);
  // Lidar turret (rear-centre) with a dark window band
  add(new CylinderGeometry(0.042, 0.045, 0.028, 16), shell, 0, 0.11, -0.035);
  add(new CylinderGeometry(0.0435, 0.0435, 0.01, 16), black, 0, 0.108, -0.035);
  add(new CylinderGeometry(0.036, 0.042, 0.006, 16), top, 0, 0.127, -0.035);
  // Buttons + status LED (front of the lid)
  add(new CylinderGeometry(0.014, 0.014, 0.006, 12), grey, -0.025, 0.098, 0.06);
  add(new CylinderGeometry(0.014, 0.014, 0.006, 12), grey, 0.025, 0.098, 0.06);
  add(new BoxGeometry(0.05, 0.004, 0.008), mat(0x37e0ff, { emissive: 0x37e0ff, emissiveIntensity: 2.5 }), 0, 0.098, 0.1);
  // Cliff-sensor window on the bumper
  add(new BoxGeometry(0.08, 0.012, 0.01), top, 0, 0.055, R + 0.003);
  // Side brush (front-left) with three bristles
  add(new CylinderGeometry(0.012, 0.012, 0.01, 8), black, 0.11, 0.008, 0.1);
  for (let i = 0; i < 3; i++) add(new BoxGeometry(0.004, 0.003, 0.07), mat(0x5a5f69), 0.11, 0.005, 0.1, 0, (i / 3) * Math.PI * 2, 0).geometry.translate(0, 0, 0.035);
  // Wheels peeking under the skirt
  for (const s of [-1, 1]) add(new CylinderGeometry(0.03, 0.03, 0.02, 12), black, s * 0.12, 0.03, 0, 0, 0, Math.PI / 2);
  const baked = bakeStatic(raw);
  baked.traverse((o) => {
    o.castShadow = false;
    o.receiveShadow = false;
  });
  raw.traverse((o) => (o as Mesh).geometry?.dispose());
  return baked;
}
