import { Mesh, MeshStandardMaterial, PlaneGeometry } from 'three';
import {
  ELEVATOR_DOOR, FOOSBALL_CELL, FRONT_WALL_OPENINGS, FRONT_WALL_Y, LOBBY_TABLE_CELLS, PHONE_PODS, PINGPONG_TABLE, POD_BLOCKED,
  RECEPTION_DESK, RECEPTION_WALL_X1, RECEPTIONIST_SEAT, RESTROOM_DOOR, RIGHT_WALL_X, ROBOT_DOCK, VENDING_CELLS, WAITING_SEATS,
} from '../config/layout';
import {
  fabricTexture, logoTexture, marbleTexture, rugTexture, signTexture, vendingTexture,
} from '../utils/canvasTextures';
import { M, mat } from '../utils/materials';
import { BuilderBase, DOOR_H } from './BuilderBase';
import { createGlowPulse } from './Props';

/** Height of the solid reception backdrop (kept below ceiling so the trading floor behind stays visible). */
const BACKDROP_H = 2.45;

/** Front strip of the office: partition, lobby, lounge and phone booths (rows y = 16..20). */
export class FrontZonesBuilder extends BuilderBase {
  private readonly marble = mat(0xffffff, { map: marbleTexture(0xf1eee9, 0x9a958c), roughness: 0.18 });
  private readonly darkMarble = mat(0xffffff, { map: marbleTexture(0x2a2c30, 0xb8b2a6, 31), roughness: 0.2 });

  // ------------------------------------------------------------ partition y = 16

  /** Row y = 16: solid reception backdrop (x 0..8, lit logo on its +Z face) and glass (x 9..21), with openings. */
  frontPartition(): void {
    const R = this.staticRoot;
    const z = FRONT_WALL_Y + 0.5;
    const T = 0.2;
    const x1 = RECEPTION_WALL_X1 + 1;
    const wall = M.wall();
    const doors = FRONT_WALL_OPENINGS.filter((x) => x < x1);
    // Solid segments between door openings
    let a = 0;
    for (const d of [...doors, x1]) {
      if (d > a) {
        this.box(R, d - a, BACKDROP_H, T, wall, (a + d) / 2, BACKDROP_H / 2, z);
        this.box(R, d - a, 0.1, 0.025, M.skirting(), (a + d) / 2, 0.05, z - T / 2 - 0.012, { shadow: false });
        this.box(R, d - a, 0.1, 0.025, M.skirting(), (a + d) / 2, 0.05, z + T / 2 + 0.012, { shadow: false });
      }
      if (d < x1) {
        // Door opening: header + steel jambs
        this.box(R, 1, BACKDROP_H - 2.2, T, wall, d + 0.5, (2.2 + BACKDROP_H) / 2, z);
        for (const jx of [d + 0.02, d + 0.98]) this.box(R, 0.04, 2.2, T + 0.03, M.darkMetal(), jx, 1.1, z);
        this.box(R, 1, 0.04, T + 0.03, M.darkMetal(), d + 0.5, 2.2, z);
      }
      a = d + 1;
    }
    this.box(R, x1 + 0.02, 0.05, T + 0.06, M.walnut(), x1 / 2, BACKDROP_H + 0.025, z, { r: 0.01 });

    // Reception face (+Z): dark marble field framed by walnut slats, backlit logo, cove light
    const face = z + T / 2;
    const fx0 = 2.2;
    const fx1 = x1 - 0.1;
    const fc = (fx0 + fx1) / 2;
    this.box(R, fx1 - fx0, BACKDROP_H - 0.25, 0.03, this.darkMarble, fc, 0.12 + (BACKDROP_H - 0.25) / 2, face + 0.015);
    for (let x = fx0 + 0.05; x < fx0 + 0.75; x += 0.1) this.box(R, 0.05, BACKDROP_H - 0.25, 0.04, M.walnut(), x, 0.12 + (BACKDROP_H - 0.25) / 2, face + 0.05);
    for (let x = fx1 - 0.05; x > fx1 - 0.75; x -= 0.1) this.box(R, 0.05, BACKDROP_H - 0.25, 0.04, M.walnut(), x, 0.12 + (BACKDROP_H - 0.25) / 2, face + 0.05);
    const lx = (fx0 + 0.8 + fx1 - 0.8) / 2;
    // Halo panel + lit letters
    this.box(R, 3.3, 0.86, 0.02, mat(0x0d0f12, { roughness: 0.4 }), lx, 1.72, face + 0.04);
    this.plane(R, 3.2, 0.8, mat(0xffffff, { emissive: 0xffb347, emissiveIntensity: 0.25, transparent: true, opacity: 0.18 }), lx, 1.72, face + 0.052);
    const logo = logoTexture('IQX SECURITIES', 'CHỨNG KHOÁN IQX  ·  SINCE 2009', 2048, 512);
    this.plane(R, 3.1, 0.78, this.litMat(logo, 1.15, true), lx, 1.72, face + 0.058);
    this.box(R, 3.3, 0.012, 0.03, this.glow(0xffd28a, 2), lx, 1.28, face + 0.05, { shadow: false });
    this.box(R, fx1 - fx0, 0.02, 0.04, this.glow(0xffe4b8, 1.6), fc, BACKDROP_H - 0.12, face + 0.04, { shadow: false });
    // Spot lights on the logo (decorative pucks)
    for (const sx of [lx - 1.1, lx, lx + 1.1]) {
      this.cyl(R, 0.035, 0.035, 0.05, M.darkMetal(), sx, BACKDROP_H - 0.04, face + 0.18, { seg: 10 });
      this.cyl(R, 0.03, 0.03, 0.005, this.glow(0xfff1d6, 2), sx, BACKDROP_H - 0.067, face + 0.18, { seg: 10, shadow: false });
    }
    // Small part left of the door (x 0..1): stone panel continuing the elevator lobby cladding
    this.box(R, 0.98, BACKDROP_H - 0.25, 0.03, this.darkMarble, 0.5, 0.12 + (BACKDROP_H - 0.25) / 2, face + 0.015);

    // Glass x 9..21 (extends to the right wall line) with the openings
    const gaps: [number, number][] = [];
    for (const d of FRONT_WALL_OPENINGS) if (d >= x1) gaps.push([d, d + 1]);
    const merged: [number, number][] = [];
    for (const g of gaps) {
      const last = merged[merged.length - 1];
      if (last && Math.abs(last[1] - g[0]) < 1e-6) last[1] = g[1];
      else merged.push([...g]);
    }
    this.glassAlongX(z, x1, RIGHT_WALL_X + 0.5, merged);
    for (const [g0, g1] of merged) this.box(R, g1 - g0, 0.008, 0.2, M.aluminium(), (g0 + g1) / 2, 0.004, z, { shadow: false });

    for (let x = 0; x <= RIGHT_WALL_X - 1; x++) if (!FRONT_WALL_OPENINGS.includes(x)) this.block(x, FRONT_WALL_Y);
  }

  // ------------------------------------------------------------ lobby

  lobby(): void {
    const R = this.staticRoot;
    // ---- elevator surround (left wall, x = 0)
    const e0 = ELEVATOR_DOOR.y0;
    const e1 = ELEVATOR_DOOR.y1;
    const stone = this.darkMarble;
    const steel = M.chrome();
    this.box(R, 0.03, 2.9, 0.5, stone, 0.015, 1.45, e0 - 0.25);
    this.box(R, 0.03, 2.9, 0.5, stone, 0.015, 1.45, e1 + 0.25);
    this.box(R, 0.03, 2.9 - DOOR_H, e1 - e0, stone, 0.015, (2.9 + DOOR_H) / 2, (e0 + e1) / 2);
    for (const jz of [e0 + 0.02, e1 - 0.02]) this.box(R, 0.06, DOOR_H, 0.04, steel, 0.02, DOOR_H / 2, jz);
    this.box(R, 0.06, 0.04, e1 - e0, steel, 0.02, DOOR_H + 0.02, (e0 + e1) / 2);
    this.box(R, 0.16, 0.01, e1 - e0, M.aluminium(), 0.02, 0.005, (e0 + e1) / 2, { shadow: false });
    // Floor indicator above the doors
    this.box(R, 0.03, 0.18, 0.5, M.blackPlastic(), 0.04, 2.6, (e0 + e1) / 2, { r: 0.008 });
    const ind = signTexture(['▲  12'], { w: 256, h: 96, bg: '#050505', fg: '#ff5a3c' });
    this.plane(R, 0.44, 0.14, this.litMat(ind, 1.6), 0.057, 2.6, (e0 + e1) / 2, { ry: Math.PI / 2 });
    // Call panel (brushed steel plate with lit up/down buttons)
    const cpz = e0 - 0.25;
    this.box(R, 0.02, 0.28, 0.12, M.aluminium(), 0.04, 1.15, cpz, { r: 0.006 });
    this.cyl(R, 0.022, 0.022, 0.015, this.glow(0x7fd4ff, 2.2), 0.055, 1.21, cpz, { seg: 12, rz: Math.PI / 2, shadow: false });
    this.cyl(R, 0.022, 0.022, 0.015, steel, 0.055, 1.1, cpz, { seg: 12, rz: Math.PI / 2 });
    // ---- restroom door surround + sign
    const r0 = RESTROOM_DOOR.y0;
    const r1 = RESTROOM_DOOR.y1;
    const casing = M.walnut();
    for (const jz of [r0 - 0.03, r1 + 0.03]) this.box(R, 0.04, DOOR_H + 0.06, 0.07, casing, 0.02, (DOOR_H + 0.06) / 2, jz);
    this.box(R, 0.04, 0.07, r1 - r0 + 0.13, casing, 0.02, DOOR_H + 0.05, (r0 + r1) / 2);
    const wc = signTexture(['WC', 'NAM  ·  NỮ'], { w: 256, h: 160, bg: '#20252e', fg: '#f4f1ea', accent: '#f5a623' });
    this.box(R, 0.02, 0.25, 0.4, M.darkMetal(), 0.02, 2.62, (r0 + r1) / 2, { r: 0.006 });
    this.plane(R, 0.37, 0.22, this.litMat(wc, 0.7), 0.032, 2.62, (r0 + r1) / 2, { ry: Math.PI / 2 });
    // Wall plaque between the doors: building directory
    const dir = signTexture(['IQX TOWER', 'Tầng 12 · Floor 12', 'Lobby · Lounge · Canteen'], { w: 256, h: 256, bg: '#2b2f36', fg: '#e8e2d4', accent: '#f5a623' });
    this.box(R, 0.025, 0.46, 0.4, M.walnut(), 0.012, 1.45, (e1 + r0) / 2 + 0.02, { r: 0.008 });
    this.plane(R, 0.36, 0.4, this.litMat(dir, 0.35), 0.027, 1.45, (e1 + r0) / 2 + 0.02, { ry: Math.PI / 2 });

    // ---- reception counter
    this.receptionCounter();
    this.chair(RECEPTIONIST_SEAT.x, RECEPTIONIST_SEAT.y, Math.PI, 0x2b1c16, true);
    // Three globe pendants over the counter
    for (const px of [4.6, 5.5, 6.4]) {
      this.cyl(R, 0.004, 0.004, 1.2, M.darkMetal(), px, 3.2 - 0.6, 18.5, { seg: 4, shadow: false });
      this.sphere(R, 0.11, this.glow(0xffe0b0, 1.4), px, 1.95, 18.5, { seg: 12, shadow: false });
      this.cyl(R, 0.04, 0.04, 0.05, M.darkMetal(), px, 2.07, 18.5, { seg: 10, shadow: false });
    }
    this.glowSpots.push({ x: 5.5, z: 18.4, r: 1.3, color: 0xffd9a8 });

    // ---- waiting area: rug, armchairs, coffee table
    this.box(R, 2.8, 0.012, 2.1, mat(0xffffff, { map: rugTexture(0x8a6e57, 0x3e2f25, 0xe9c46a), roughness: 1 }), 3.0, 0.008, 19.95, { shadow: false });
    const velvet = mat(0x2f6b68, { map: fabricTexture(0x8fb8b4, 5), roughness: 0.95 });
    for (const s of WAITING_SEATS) {
      const g = this.armchair(s.cell.x + 0.5, s.cell.y + 0.55, Math.atan2(-s.face.x, -s.face.y), velvet);
      this.box(g, 0.32, 0.26, 0.1, mat(0xe9c46a, { roughness: 1 }), 0.12, 0.58, 0.2, { r: 0.04, rx: -0.25, rz: 0.12 });
    }
    const tc = LOBBY_TABLE_CELLS;
    const tx = (tc[0].x + tc[tc.length - 1].x + 1) / 2;
    const tz = tc[0].y + 0.5;
    const top = this.cyl(R, 0.42, 0.42, 0.035, this.marble, tx, 0.42, tz, { seg: 28 });
    top.scale.set(1.8, 1, 0.95);
    const shelf = this.cyl(R, 0.36, 0.36, 0.02, M.walnut(), tx, 0.14, tz, { seg: 24 });
    shelf.scale.set(1.8, 1, 0.95);
    for (const s of [-1, 1]) {
      this.box(R, 0.04, 0.4, 0.5, mat(0xc9a25e, { metalness: 0.9, roughness: 0.3 }), tx + s * 0.55, 0.2, tz, { r: 0.012 });
    }
    // magazines, bowl with fruit, small vase
    this.box(R, 0.24, 0.012, 0.32, mat(0x1d3557, { roughness: 0.7 }), tx - 0.35, 0.445, tz + 0.05, { ry: 0.3 });
    this.box(R, 0.24, 0.012, 0.32, mat(0xe76f51, { roughness: 0.7 }), tx - 0.3, 0.457, tz + 0.02, { ry: -0.15 });
    const bowl = this.sphere(R, 0.13, mat(0xf2efe8, { roughness: 0.3 }), tx + 0.25, 0.47, tz, { seg: 14 });
    bowl.scale.set(1, 0.4, 1);
    for (const [ox, oz, c] of [[0.03, 0.02, 0xf4a261], [-0.04, 0.03, 0x8ac926], [0.0, -0.05, 0xe63946]] as const)
      this.sphere(R, 0.04, mat(c, { roughness: 0.5 }), tx + 0.25 + ox, 0.52, tz + oz, { seg: 8 });
    this.box(R, 0.18, 0.04, 0.12, M.paper(), tx - 0.05, 0.458, tz - 0.12, { ry: 0.5 });

    // ---- plants + robot dock
    this.plant(8, 17, 'fig');
    this.plant(4, 17, 'snake');
    const dock = this.group(ROBOT_DOCK.x + 0.5, ROBOT_DOCK.y + 0.9);
    this.box(dock, 0.34, 0.012, 0.22, M.greyPlastic(), 0, 0.006, -0.08, { r: 0.004 });
    this.box(dock, 0.3, 0.11, 0.08, M.whitePlastic(), 0, 0.055, 0.0, { r: 0.02 });
    this.box(dock, 0.22, 0.012, 0.004, M.blackPlastic(), 0, 0.085, -0.041);
    for (const s of [-1, 1]) this.box(dock, 0.05, 0.012, 0.03, M.chrome(), s * 0.07, 0.018, -0.12);
    this.box(dock, 0.03, 0.008, 0.004, this.glow(0x37e0ff, 2.5), 0, 0.07, -0.042, { shadow: false });
  }

  private receptionCounter(): void {
    const D = RECEPTION_DESK;
    const x0 = D.x + 0.05;
    const x1 = D.x + D.w - 0.05;
    const cx = (x0 + x1) / 2;
    const w = x1 - x0;
    const g = this.group(cx, 0);
    const front = D.y + 0.92; // visitor face
    const solid = mat(0xf4f2ee, { roughness: 0.35 });
    // Tall front body
    this.box(g, w, 1.0, 0.22, solid, 0, 0.56, front - 0.11, { r: 0.02 });
    this.box(g, w - 0.08, 0.08, 0.2, M.skirting(), 0, 0.04, front - 0.13);
    this.box(g, w - 0.1, 0.012, 0.02, this.glow(0xffc477, 2.2), 0, 0.075, front - 0.025, { shadow: false });
    // Walnut slat band across the front + lit logo plate
    for (let x = -w / 2 + 0.06; x < w / 2 - 0.04; x += 0.07) this.box(g, 0.035, 0.62, 0.025, M.walnut(), x, 0.56, front + 0.012);
    this.box(g, 1.0, 0.3, 0.03, mat(0x14171c, { roughness: 0.3 }), 0, 0.62, front + 0.035, { r: 0.01 });
    this.plane(g, 0.92, 0.23, this.litMat(logoTexture('IQX', null, 1024, 256), 1.1, true), 0, 0.62, front + 0.052);
    // Transaction ledge (marble) and lower walnut work surface behind
    this.box(g, w + 0.1, 0.04, 0.38, this.marble, 0, 1.08, front - 0.12, { r: 0.012 });
    this.box(g, w, 0.035, 0.56, M.walnut(), 0, 0.74, D.y + 0.42, { r: 0.01 });
    for (const s of [-1, 1]) this.box(g, 0.05, 0.72, 0.62, solid, s * (w / 2 - 0.025), 0.36, D.y + 0.4);
    this.box(g, 0.6, 0.6, 0.45, M.whitePlastic(), w / 2 - 0.4, 0.38, D.y + 0.35, { r: 0.012 }); // drawer pedestal
    for (let i = 0; i < 3; i++) this.box(g, 0.14, 0.012, 0.012, M.chrome(), w / 2 - 0.4, 0.22 + i * 0.2, D.y + 0.12);
    // Monitor facing the receptionist (-Z), keyboard, phone
    this.box(g, 0.2, 0.012, 0.14, M.aluminium(), -0.15, 0.764, D.y + 0.62, { r: 0.005 });
    this.box(g, 0.04, 0.25, 0.03, M.aluminium(), -0.15, 0.88, D.y + 0.64);
    this.monitor(g, -0.15, 1.0, D.y + 0.6, 0.56, 0.34, Math.PI, this.screens.get(7));
    this.box(g, 0.44, 0.018, 0.14, M.blackPlastic(), -0.15, 0.767, D.y + 0.28, { r: 0.006 });
    this.plane(g, 0.42, 0.12, mat(0xffffff, { map: this.kbTex, roughness: 0.6 }), -0.15, 0.7765, D.y + 0.28, { rx: -Math.PI / 2, rz: Math.PI });
    this.box(g, 0.2, 0.05, 0.18, M.blackPlastic(), -1.0, 0.785, D.y + 0.4, { r: 0.015, rx: 0.2 });
    this.box(g, 0.05, 0.035, 0.19, M.greyPlastic(), -1.08, 0.82, D.y + 0.4, { r: 0.012 });
    // Ledge: service bell, brochure stand, flowers, name plate
    const gold = mat(0xd4af37, { metalness: 1, roughness: 0.22 });
    this.cyl(g, 0.06, 0.065, 0.012, M.darkMetal(), 0.55, 1.106, front - 0.12, { seg: 14 });
    const bell = this.sphere(g, 0.055, gold, 0.55, 1.112, front - 0.12, { seg: 12 });
    bell.scale.set(1, 0.85, 1);
    this.sphere(g, 0.012, gold, 0.55, 1.165, front - 0.12, { seg: 6 });
    this.box(g, 0.24, 0.2, 0.1, M.glass(), 0.95, 1.2, front - 0.12, { shadow: false });
    for (let i = 0; i < 3; i++) this.box(g, 0.07, 0.17, 0.005, mat([0x1d3557, 0xf5a623, 0x2a9d8f][i], { roughness: 0.6 }), 0.87 + i * 0.08, 1.19, front - 0.13, { rx: -0.12 });
    const vaseX = -1.15;
    this.cyl(g, 0.05, 0.065, 0.2, mat(0xcfe8ff, { transparent: true, opacity: 0.45, roughness: 0.05 }), vaseX, 1.2, front - 0.14, { seg: 12, shadow: false });
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      const r = 0.04 + (i % 3) * 0.025;
      this.cyl(g, 0.004, 0.004, 0.22, mat(0x40916c), vaseX + Math.cos(a) * r * 0.4, 1.38, front - 0.14 + Math.sin(a) * r * 0.4, { seg: 4, rz: Math.cos(a) * 0.2, rx: -Math.sin(a) * 0.2 });
      this.sphere(g, 0.035, mat([0xf7f1e3, 0xf4a6b8, 0xe63946][i % 3], { roughness: 0.7 }), vaseX + Math.cos(a) * r, 1.48 + (i % 2) * 0.04, front - 0.14 + Math.sin(a) * r, { seg: 8 });
    }
    this.box(g, 0.26, 0.06, 0.015, mat(0x1d222b, { roughness: 0.3 }), 0.1, 1.13, front - 0.04, { rx: -0.35 });
    this.block(D.x, D.y, D.w, 1);
  }

  // ------------------------------------------------------------ lounge

  lounge(): void {
    this.vending(VENDING_CELLS[0].x, VENDING_CELLS[0].y, 'drinks', 0xb3202a, 0);
    if (VENDING_CELLS[1]) this.vending(VENDING_CELLS[1].x, VENDING_CELLS[1].y, 'snacks', 0x1d3a6b, 1.7);
    this.pingPong();
    this.foosball();
    this.chillCorner();
  }

  private vending(x: number, z: number, kind: 'drinks' | 'snacks', body: number, phase: number): void {
    const g = this.group(x + 0.5, z + 0.5);
    const W = 0.88;
    const H = 1.92;
    const D = 0.78;
    const bz = -0.5 + 0.13 + D / 2; // back against the partition
    const fz = bz + D / 2;
    const shell = mat(body, { roughness: 0.35, metalness: 0.2 });
    this.box(g, W, H, D, shell, 0, H / 2 + 0.04, bz, { r: 0.02 });
    this.box(g, W - 0.04, 0.05, D - 0.04, M.blackPlastic(), 0, 0.025, bz);
    // Window recess + glass bezel
    this.box(g, 0.6, 1.36, 0.02, M.blackPlastic(), -0.1, 1.16, fz + 0.005);
    // Header sign
    const head = signTexture([kind === 'drinks' ? 'COLD DRINKS' : 'SNACKS'], { w: 512, h: 96, bg: kind === 'drinks' ? '#c1121f' : '#1d4e89', fg: '#ffffff' });
    this.plane(g, W - 0.08, 0.15, this.litMat(head, 1.2), 0, H - 0.08, fz + 0.002);
    // Control column: display, keypad, coin & card slots
    this.box(g, 0.2, 1.36, 0.02, mat(0x2a2e35, { roughness: 0.4 }), 0.32, 1.16, fz + 0.005);
    this.box(g, 0.14, 0.08, 0.01, this.glow(0x5cff9d, 1.4), 0.32, 1.6, fz + 0.018, { shadow: false });
    for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) this.box(g, 0.034, 0.03, 0.012, M.aluminium(), 0.28 + c * 0.04, 1.46 - r * 0.042, fz + 0.02);
    this.box(g, 0.1, 0.02, 0.012, M.blackPlastic(), 0.32, 1.22, fz + 0.02);
    this.box(g, 0.12, 0.08, 0.015, M.blackPlastic(), 0.32, 1.08, fz + 0.02, { r: 0.008 });
    this.box(g, 0.05, 0.03, 0.01, this.glow(0x37b4ff, 1.8), 0.32, 1.09, fz + 0.03, { shadow: false });
    // Pickup bin
    this.box(g, 0.62, 0.22, 0.04, M.blackPlastic(), -0.05, 0.3, fz + 0.01, { r: 0.01 });
    this.box(g, 0.56, 0.16, 0.01, mat(0x3a3f48, { roughness: 0.2, metalness: 0.4 }), -0.05, 0.3, fz + 0.032);
    // Animated, self-lit product window (dynamic)
    const tex = vendingTexture(kind);
    const m = new MeshStandardMaterial({ color: 0xffffff, map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.55, roughness: 0.15 });
    const win = new Mesh(new PlaneGeometry(0.56, 1.3), m);
    win.position.set(x + 0.5 - 0.1, 1.16, z + 0.5 + fz + 0.017);
    this.dynamicRoot.add(win);
    this.animated.push(createGlowPulse(m, 0.6, 0.12, 1.6, phase));
    this.block(x, z);
  }

  private pingPong(): void {
    const T = PINGPONG_TABLE;
    const cx = T.x + T.w / 2;
    const cz = T.y + T.d / 2;
    const g = this.group(cx, cz);
    const L = 2.74;
    const Wd = 1.525;
    const Y = 0.76;
    const blue = mat(0x1f5aa6, { roughness: 0.55 });
    const white = mat(0xffffff, { roughness: 0.5 });
    const frame = M.darkMetal();
    this.box(g, L, 0.03, Wd, blue, 0, Y - 0.015, 0);
    this.box(g, L - 0.04, 0.06, Wd - 0.04, frame, 0, Y - 0.06, 0);
    // painted lines
    for (const s of [-1, 1]) {
      this.box(g, L, 0.004, 0.02, white, 0, Y + 0.002, s * (Wd / 2 - 0.01), { shadow: false });
      this.box(g, 0.02, 0.004, Wd, white, s * (L / 2 - 0.01), Y + 0.002, 0, { shadow: false });
    }
    this.box(g, L - 0.04, 0.004, 0.006, white, 0, Y + 0.002, 0, { shadow: false });
    // legs (folding frame with castors)
    for (const s of [-1, 1]) {
      for (const lz of [-0.55, 0.55]) {
        this.box(g, 0.05, Y - 0.12, 0.05, frame, s * 0.95, (Y - 0.12) / 2 + 0.03, lz);
        this.cyl(g, 0.035, 0.035, 0.03, M.blackPlastic(), s * 0.95, 0.03, lz, { seg: 10, rx: Math.PI / 2 });
      }
      this.box(g, 0.04, 0.04, 1.1, frame, s * 0.95, 0.25, 0);
    }
    this.box(g, 1.9, 0.04, 0.04, frame, 0, 0.3, 0);
    // net
    this.box(g, 0.006, 0.15, Wd + 0.3, mat(0x1b1d22, { transparent: true, opacity: 0.55, roughness: 1 }), 0, Y + 0.075, 0, { shadow: false });
    this.box(g, 0.012, 0.018, Wd + 0.3, white, 0, Y + 0.15, 0);
    for (const s of [-1, 1]) this.cyl(g, 0.012, 0.012, 0.17, frame, 0, Y + 0.075, s * (Wd / 2 + 0.15), { seg: 8 });
    // paddles + ball
    const paddle = (px: number, pz: number, ry: number, rubber: number) => {
      const p = this.group(px, pz, ry, g);
      this.cyl(p, 0.078, 0.078, 0.014, mat(rubber, { roughness: 0.9 }), 0, Y + 0.008, 0, { seg: 14 });
      this.box(p, 0.035, 0.022, 0.1, mat(0xb88a5a, { roughness: 0.6 }), 0, Y + 0.012, 0.12, { r: 0.008 });
    };
    paddle(-0.9, 0.3, 0.5, 0xc0392b);
    paddle(0.85, -0.35, -2.4, 0x1b1d22);
    this.sphere(g, 0.02, mat(0xff8c1a, { roughness: 0.4 }), 0.35, Y + 0.02, 0.18, { seg: 8 });
    // Linear pendant over the table + suspended GAME ZONE sign
    const R = this.staticRoot;
    for (const s of [-1, 1]) this.cyl(R, 0.003, 0.003, 0.75, M.darkMetal(), cx + s * 1.0, 2.83, cz, { seg: 4, shadow: false });
    this.box(R, 2.2, 0.035, 0.07, M.blackPlastic(), cx, 2.45, cz, { shadow: false });
    this.box(R, 2.16, 0.008, 0.05, this.glow(0xfff4e0, 2), cx, 2.43, cz, { shadow: false });
    this.glowSpots.push({ x: cx, z: cz, r: 2.0, color: 0xfff0d8 });
    const sign = signTexture(['GAME ZONE'], { w: 512, h: 128, bg: '#11141a', fg: '#57f2c6' });
    this.box(R, 1.3, 0.3, 0.03, M.blackPlastic(), cx, 2.75, cz - 0.95, { shadow: false });
    this.plane(R, 1.24, 0.25, this.litMat(sign, 1.3), cx, 2.75, cz - 0.934);
    this.block(T.x, T.y, T.w, T.d);
  }

  private foosball(): void {
    const c = FOOSBALL_CELL;
    const g = this.group(c.x + 0.5, c.y + 0.5);
    const L = 0.96;
    const Wd = 0.62;
    const Y = 0.78;
    const wood = mat(0x3b2a1f, { roughness: 0.45 });
    // cabinet walls
    for (const s of [-1, 1]) {
      this.box(g, L, 0.2, 0.04, wood, 0, Y + 0.02, s * (Wd / 2), { r: 0.008 });
      this.box(g, 0.04, 0.2, Wd, wood, s * (L / 2 - 0.02), Y + 0.02, 0, { r: 0.008 });
      this.box(g, 0.012, 0.06, 0.16, M.blackPlastic(), s * (L / 2 - 0.045), Y - 0.02, 0);
    }
    this.box(g, L - 0.06, 0.02, Wd - 0.04, mat(0x2f8f3a, { roughness: 0.9 }), 0, Y - 0.07, 0);
    const white = mat(0xffffff, { roughness: 0.6 });
    this.box(g, 0.006, 0.003, Wd - 0.06, white, 0, Y - 0.058, 0, { shadow: false });
    this.cyl(g, 0.08, 0.08, 0.003, white, 0, Y - 0.059, 0, { seg: 16, shadow: false }).scale.set(1, 1, 1);
    this.cyl(g, 0.072, 0.072, 0.004, mat(0x2f8f3a, { roughness: 0.9 }), 0, Y - 0.057, 0, { seg: 16, shadow: false });
    // legs
    for (const lx of [-1, 1]) for (const lz of [-1, 1]) this.box(g, 0.07, Y - 0.08, 0.07, wood, lx * (L / 2 - 0.05), (Y - 0.08) / 2, lz * (Wd / 2 - 0.04));
    // rods along Z (players stand on the Z sides), alternating handles and teams
    const counts = [1, 2, 3, 3, 2, 1];
    const red = mat(0xd62828, { roughness: 0.5 });
    const blue = mat(0x1d4ed8, { roughness: 0.5 });
    counts.forEach((n, i) => {
      const rx = -L / 2 + 0.11 + i * ((L - 0.22) / (counts.length - 1));
      const side = i % 2 === 0 ? 1 : -1;
      this.cyl(g, 0.007, 0.007, Wd + 0.3, M.chrome(), rx, Y + 0.06, side * 0.08, { seg: 6, rx: Math.PI / 2 });
      this.cyl(g, 0.018, 0.018, 0.12, M.blackPlastic(), rx, Y + 0.06, side * (Wd / 2 + 0.2), { seg: 8, rx: Math.PI / 2 });
      const team = i < 3 ? (i % 2 === 0 ? red : blue) : (i % 2 === 0 ? blue : red);
      for (let k = 0; k < n; k++) {
        const pz = (k - (n - 1) / 2) * 0.17;
        this.box(g, 0.022, 0.1, 0.03, team, rx, Y + 0.02, pz);
        this.sphere(g, 0.016, mat(0xf1c7a3, { roughness: 0.6 }), rx, Y + 0.085, pz, { seg: 6 });
      }
    });
    // score beads + ball
    for (let i = 0; i < 5; i++) this.sphere(g, 0.012, i < 3 ? red : blue, -0.15 + i * 0.07, Y + 0.13, Wd / 2, { seg: 6 });
    this.sphere(g, 0.017, white, 0.05, Y - 0.04, 0.1, { seg: 8 });
    this.block(c.x, c.y);
  }

  /** Bean bags, round rug and a side table on cells (14,20) and (15,20). */
  private chillCorner(): void {
    const R = this.staticRoot;
    const cz = 20.5;
    const rug = this.cyl(R, 1.0, 1.0, 0.012, mat(0xffffff, { map: rugTexture(0xd9c9a8, 0x7c5c3e, 0xe76f51), roughness: 1 }), 15.0, 0.008, cz, { seg: 28, shadow: false });
    rug.scale.set(1, 1, 0.48);
    const bag = (x: number, z: number, color: number, ry: number) => {
      const m = mat(color, { map: fabricTexture(0xffffff, 8), roughness: 1 });
      this.sphere(R, 0.38, m, x, 0.2, z, { seg: 12 }).scale.set(1, 0.6, 0.95);
      const back = this.sphere(R, 0.26, m, x + Math.sin(ry) * 0.2, 0.42, z + Math.cos(ry) * 0.2, { seg: 10 });
      back.scale.set(1.05, 0.8, 0.6);
      back.rotation.y = ry;
    };
    bag(14.45, 20.5, 0xe76f51, 0.4);
    bag(15.55, 20.5, 0x2a9d8f, -0.4);
    // side table with drinks
    this.cyl(R, 0.16, 0.16, 0.03, M.oak(), 15.0, 0.4, 20.45, { seg: 16 });
    this.cyl(R, 0.02, 0.02, 0.38, M.darkMetal(), 15.0, 0.2, 20.45, { seg: 6 });
    this.cyl(R, 0.12, 0.12, 0.015, M.darkMetal(), 15.0, 0.008, 20.45, { seg: 14 });
    this.cyl(R, 0.03, 0.03, 0.12, mat(0xd62828, { roughness: 0.3, metalness: 0.5 }), 14.95, 0.475, 20.42, { seg: 10 });
    this.cyl(R, 0.03, 0.03, 0.12, mat(0x8ac926, { roughness: 0.3, metalness: 0.5 }), 15.06, 0.475, 20.5, { seg: 10 });
    this.block(14, 20, 2, 1);
  }

  // ------------------------------------------------------------ phone booths

  phonePods(): void {
    const felts = [0x2f6d5a, 0xa4573c, 0x4b5d8a];
    PHONE_PODS.forEach((c, i) => this.phonePod(c.x, c.y, felts[i % felts.length], i));
    // Planters / acoustic panels in the blocked cells between pods
    for (const c of POD_BLOCKED) this.podPlanter(c.x, c.y);
    for (const c of POD_BLOCKED) this.block(c.x, c.y);
  }

  private phonePod(x: number, z: number, felt: number, index: number): void {
    const g = this.group(x + 0.5, 0);
    const H = 2.25;
    const z0 = z - 0.38; // back panel (just in front of the partition)
    const z1 = z + 1.0; // door line
    const D = z1 - z0;
    const zc = (z0 + z1) / 2;
    const half = 0.62;
    const shell = mat(0x3a3f48, { roughness: 0.9 });
    const trim = M.oak();
    const feltMat = mat(0xffffff, { map: fabricTexture(felt, 40 + index), roughness: 1 });
    const G0 = 0.95; // glass band in the side walls
    const G1 = 1.95;
    // Side walls: solid base, glass band, solid head; felt lining inside
    for (const s of [-1, 1]) {
      const sx = s * (half - 0.05);
      this.box(g, 0.1, G0, D, shell, sx, G0 / 2, zc);
      this.box(g, 0.1, H - G1, D, shell, sx, (G1 + H) / 2, zc);
      this.box(g, 0.1, G1 - G0, 0.08, shell, sx, (G0 + G1) / 2, z0 + 0.04);
      this.plane(g, D - 0.1, G1 - G0, M.glass(), sx, (G0 + G1) / 2, zc + 0.04, { ry: Math.PI / 2 });
      this.box(g, 0.11, 0.03, D, trim, sx, G0, zc);
      this.box(g, 0.02, G0 - 0.1, D - 0.04, feltMat, sx - s * 0.06, G0 / 2, zc, { shadow: false });
      this.box(g, 0.12, H, 0.06, trim, sx, H / 2, z1 - 0.03);
    }
    this.box(g, 2 * half, H, 0.08, shell, 0, H / 2, z0 + 0.04);
    this.box(g, 2 * half - 0.2, H - 0.1, 0.02, feltMat, 0, H / 2, z0 + 0.09, { shadow: false });
    // Open roof: oak frame + felt baffles so the interior reads from above
    this.box(g, 2 * half, 0.16, 0.08, trim, 0, H - 0.08, z1 - 0.04);
    this.box(g, 2 * half, 0.06, 0.06, trim, 0, H - 0.03, z0 + 0.03);
    for (let k = 0; k < 4; k++) this.box(g, 2 * half - 0.2, 0.08, 0.06, feltMat, 0, H - 0.05, z0 + 0.3 + k * 0.25);
    this.box(g, 2 * half - 0.2, 0.02, D - 0.1, mat(0x1a1d22, { roughness: 1 }), 0, 0.012, zc, { shadow: false });
    // interior: desk shelf on the back, stool, pendant, acoustic stripes
    this.box(g, 0.9, 0.035, 0.3, M.walnut(), 0, 1.02, z0 + 0.25, { r: 0.008 });
    this.box(g, 0.04, 0.12, 0.25, M.darkMetal(), -0.3, 0.95, z0 + 0.23);
    this.box(g, 0.04, 0.12, 0.25, M.darkMetal(), 0.3, 0.95, z0 + 0.23);
    this.box(g, 0.24, 0.014, 0.17, M.blackPlastic(), 0.15, 1.045, z0 + 0.26, { r: 0.004 });
    this.box(g, 0.08, 0.012, 0.15, M.blackPlastic(), -0.2, 1.044, z0 + 0.25, { r: 0.006 });
    this.cyl(g, 0.17, 0.15, 0.06, feltMat, 0, 0.62, z0 + 0.62, { seg: 14 });
    this.cyl(g, 0.02, 0.02, 0.58, M.chrome(), 0, 0.3, z0 + 0.62, { seg: 8 });
    this.cyl(g, 0.17, 0.19, 0.02, M.darkMetal(), 0, 0.01, z0 + 0.62, { seg: 14 });
    this.cyl(g, 0.003, 0.003, 0.32, M.darkMetal(), 0, H - 0.21, zc, { seg: 4, shadow: false });
    this.sphere(g, 0.09, this.glow(0xffe2b0, 1.6), 0, H - 0.42, zc, { seg: 12, shadow: false });
    // occupancy light + label above the door
    this.box(g, 0.08, 0.03, 0.012, this.glow(0x43e97b, 2.2), 0.42, H - 0.08, z1 + 0.002, { shadow: false });
    const lab = signTexture([`BOOTH 0${index + 1}`], { w: 256, h: 64, bg: '#2a2320', fg: '#f0e6d2' });
    this.plane(g, 0.42, 0.1, this.litMat(lab, 0.5), -0.1, H - 0.08, z1 + 0.002);
    // Glass sliding door, parked open in front of the neighbouring planter (+X)
    const dx = half + 0.42;
    this.box(g, 0.86, 0.03, 0.03, M.aluminium(), dx, H - 0.2, z1 + 0.03);
    this.plane(g, 0.82, 1.95, M.glass(), dx, 1.0, z1 + 0.04);
    for (const s of [-1, 1]) this.box(g, 0.025, 1.98, 0.03, M.aluminium(), dx + s * 0.41, 1.0, z1 + 0.04);
    this.box(g, 0.02, 0.5, 0.03, M.chrome(), dx - 0.33, 1.05, z1 + 0.07);
    this.box(g, 0.82, 0.12, 0.012, M.frosted(), dx, 1.2, z1 + 0.04, { shadow: false });
  }

  /** Planter box with acoustic slat screen in a blocked phone-strip cell. */
  private podPlanter(x: number, z: number): void {
    const g = this.group(x + 0.5, z + 0.5);
    const w = 0.66;
    this.box(g, w, 0.5, 0.6, mat(0x2a2e35, { roughness: 0.4 }), 0, 0.25, -0.12, { r: 0.015 });
    this.box(g, w - 0.06, 0.02, 0.54, M.soil(), 0, 0.49, -0.12);
    const greens = [mat(0x2d6a4f, { roughness: 0.55 }), mat(0x40916c, { roughness: 0.55 })];
    const r = this.rnd;
    for (let i = 0; i < 10; i++) {
      const h = 0.4 + r() * 0.5;
      const blade = this.box(g, 0.06, h, 0.012, greens[i % 2], (r() - 0.5) * (w - 0.15), 0.5 + h / 2, -0.12 + (r() - 0.5) * 0.4);
      blade.rotation.set((r() - 0.5) * 0.3, r() * Math.PI, (r() - 0.5) * 0.3);
    }
  }
}
