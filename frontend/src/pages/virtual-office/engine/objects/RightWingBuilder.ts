import { Group, type Material } from 'three';
import { GRID_W, WALL_H } from '../config/constants';
import {
  CAFE_TABLES, CHAIR_SLOTS, CONSULT_TABLES, FOOD_COUNTER, FRONT_WALL_Y, RIGHT_WALL_X, SERVER_DOOR_Y, SERVER_GLASS_X, SERVER_GLASS_Y,
  SERVER_RACKS, VIP_DOOR_X, VIP_GLASS_Y, VIP_SOFA,
} from '../config/layout';
import type { Slot } from '../types';
import {
  brushedMetalTexture, clockFaceTexture, fabricTexture, fridgeTexture, logoTexture, marbleTexture, menuBoardTexture, rugTexture,
  serverFaceTexture, signTexture,
} from '../utils/canvasTextures';
import { M, mat } from '../utils/materials';
import { GLASS_H } from './BuilderBase';
import { FrontZonesBuilder } from './FrontZonesBuilder';
import { createClockHands, createServerLeds } from './Props';

const LOW_WALL_H = 1.05;
const ry = (s: Slot) => Math.atan2(-s.face.x, -s.face.y);

/** Right wing (x 22..29): partition wall, VIP room, quiet nook, server room and cafeteria. */
export class RightWingBuilder extends FrontZonesBuilder {
  private readonly steel = mat(0xd5dae0, { map: brushedMetalTexture(), metalness: 0.75, roughness: 0.3 });
  private readonly gold = mat(0xd4af37, { metalness: 1, roughness: 0.25 });

  // ------------------------------------------------------------ partition x = 22

  /** Column x = 22 (y 0..16): low solid wall with glass above, walnut-clad toward the VIP room. */
  rightWall(): void {
    const R = this.staticRoot;
    const x = RIGHT_WALL_X + 0.5;
    const z1 = FRONT_WALL_Y + 0.6;
    const T = 0.2;
    this.box(R, T, LOW_WALL_H, z1, M.wall(), x, LOW_WALL_H / 2, z1 / 2);
    this.box(R, T + 0.06, 0.04, z1, M.walnut(), x, LOW_WALL_H + 0.02, z1 / 2, { r: 0.01 });
    for (const s of [-1, 1]) this.box(R, 0.025, 0.1, z1, M.skirting(), x + s * (T / 2 + 0.012), 0.05, z1 / 2, { shadow: false });
    // Glass above, 1 m bays
    const al = M.aluminium();
    const gh = GLASS_H - LOW_WALL_H - 0.04;
    for (let z = 0; z < z1 - 0.05; z++) {
      const len = Math.min(1, z1 - z);
      this.plane(R, len, gh - 0.06, M.glass(), x, LOW_WALL_H + 0.04 + gh / 2, z + len / 2, { ry: Math.PI / 2 });
      this.box(R, 0.06, GLASS_H, 0.05, al, x, GLASS_H / 2, z, { r: 0.008 });
    }
    this.box(R, 0.07, 0.06, z1, al, x, GLASS_H - 0.03, z1 / 2);
    // Right-wing face (+X): walnut cladding in the VIP room, light oak slats in the cafeteria
    const fx = x + T / 2;
    this.box(R, 0.02, LOW_WALL_H - 0.12, VIP_GLASS_Y + 0.4, M.walnut(), fx + 0.01, 0.1 + (LOW_WALL_H - 0.12) / 2, (VIP_GLASS_Y + 0.4) / 2);
    for (let z = 0.5; z < VIP_GLASS_Y; z += 1) this.box(R, 0.025, LOW_WALL_H - 0.2, 0.008, this.gold, fx + 0.02, 0.1 + (LOW_WALL_H - 0.12) / 2, z, { shadow: false });
    for (let z = SERVER_GLASS_Y + 0.6; z < z1 - 0.05; z += 0.11) this.box(R, 0.03, LOW_WALL_H - 0.14, 0.06, M.oak(), fx + 0.015, 0.1 + (LOW_WALL_H - 0.14) / 2, z);
    this.block(RIGHT_WALL_X, 0, 1, FRONT_WALL_Y + 1);
  }

  // ------------------------------------------------------------ VIP room

  vipRoom(): void {
    const R = this.staticRoot;
    const x0 = RIGHT_WALL_X + 0.6;
    const zg = VIP_GLASS_Y + 0.5;
    // Glass front with door + plaque
    this.glassAlongX(zg, x0, GRID_W, [[VIP_DOOR_X, VIP_DOOR_X + 1]], GLASS_H, false);
    this.box(R, 1, 0.008, 0.12, M.aluminium(), VIP_DOOR_X + 0.5, 0.004, zg, { shadow: false });
    const plaque = signTexture(['VIP LOUNGE', 'Tư vấn đầu tư · Private Wealth'], { w: 512, h: 160, bg: '#15171b', fg: '#e8c372' });
    this.plane(R, 0.9, 0.28, this.litMat(plaque, 0.7), VIP_DOOR_X + 1.6, 1.55, zg + 0.012);
    this.plane(R, 0.9, 0.28, this.litMat(plaque, 0.7), VIP_DOOR_X + 1.6, 1.55, zg - 0.012, { ry: Math.PI });
    // Gold film stripes on the glass
    for (let x = x0; x < GRID_W; x++) {
      if (x === VIP_DOOR_X) continue;
      this.box(R, 0.98, 0.02, 0.012, this.gold, x + 0.5, 1.0, zg, { shadow: false });
      this.box(R, 0.98, 0.006, 0.012, this.gold, x + 0.5, 1.05, zg, { shadow: false });
    }
    for (let x = RIGHT_WALL_X + 1; x < GRID_W; x++) if (x !== VIP_DOOR_X) this.block(x, VIP_GLASS_Y);

    // Back wall: fabric panels in walnut frames, art, sconces, lit lettering
    const fabric = mat(0xffffff, { map: fabricTexture(0x283447, 51), roughness: 1 });
    const pw = (GRID_W - x0) / 4;
    for (let i = 0; i < 4; i++) {
      const cx = x0 + pw * (i + 0.5);
      this.box(R, pw - 0.04, WALL_H - 0.3, 0.03, M.walnut(), cx, 0.12 + (WALL_H - 0.3) / 2, 0.015);
      this.box(R, pw - 0.2, WALL_H - 0.5, 0.03, fabric, cx, 0.22 + (WALL_H - 0.5) / 2, 0.035);
    }
    const sofaC = VIP_SOFA.x + VIP_SOFA.w / 2;
    this.frameArt(R, sofaC, 1.75, 0.05, 2.0, 0.9, 0, 19);
    for (const s of [-1, 1]) {
      this.box(R, 0.1, 0.28, 0.08, this.gold, sofaC + s * 1.5, 1.8, 0.09, { r: 0.02 });
      this.cyl(R, 0.06, 0.08, 0.16, this.glow(0xffd9a0, 1.4), sofaC + s * 1.5, 1.98, 0.12, { seg: 12, shadow: false });
    }
    this.plane(R, 2.2, 0.4, mat(0xffffff, { map: logoTexture('IQX PRIVATE', null, 2048, 384), transparent: true, metalness: 0.6, roughness: 0.3, emissive: 0x8a6a2a, emissiveIntensity: 0.25 }), sofaC, 2.75, 0.06);

    // Rugs
    const rugTex = rugTexture(0x6b5446, 0x2b211b, 0xd4af37);
    for (const t of CONSULT_TABLES) {
      const rug = this.cyl(R, 1.25, 1.25, 0.012, mat(0xffffff, { map: rugTex, roughness: 1 }), t.x + 0.5, 0.008, t.y + 0.5, { seg: 32, shadow: false });
      rug.receiveShadow = true;
    }
    this.box(R, 3.2, 0.012, 1.6, mat(0xffffff, { map: rugTexture(0x2b3446, 0x151a24, 0xd4af37), roughness: 1 }), sofaC, 0.008, 1.0, { shadow: false });

    // Consultation tables + leather chairs
    const leather = mat(0x6b3a22, { roughness: 0.45 });
    CONSULT_TABLES.forEach((t, i) => this.consultTable(t.x + 0.5, t.y + 0.5, i));
    for (const s of CHAIR_SLOTS) if (s.cell.x > RIGHT_WALL_X && s.cell.y < VIP_GLASS_Y) this.clubChair(s.cell.x + 0.5, s.cell.y + 0.5, ry(s), leather);
    // Ring chandeliers over the tables
    for (const t of CONSULT_TABLES) {
      const cx = t.x + 0.5;
      const cz = t.y + 0.5;
      for (let k = 0; k < 3; k++) {
        const a = (k / 3) * Math.PI * 2;
        this.cyl(R, 0.003, 0.003, 1.4, M.darkMetal(), cx + Math.cos(a) * 0.38, WALL_H - 0.5, cz + Math.sin(a) * 0.38, { seg: 4, shadow: false });
      }
      this.torus(R, 0.4, 0.025, this.gold, cx, 2.0, cz, { rx: Math.PI / 2, seg: 28, shadow: false });
      this.torus(R, 0.38, 0.012, this.glow(0xffe2b0, 2.2), cx, 1.98, cz, { rx: Math.PI / 2, seg: 28, shadow: false });
      this.glowSpots.push({ x: cx, z: cz, r: 1.5, color: 0xffd9a0 });
    }

    this.vipSofa();
    this.plant(RIGHT_WALL_X + 1, 0, 'fig');
    this.plant(GRID_W - 1, 0, 'bush');
    this.vipCredenza();
  }

  private consultTable(x: number, z: number, index: number): void {
    const g = this.group(x, z);
    const top = mat(0xffffff, { map: marbleTexture(0xf3f0ea, 0xa39b8f, 33), roughness: 0.15 });
    this.cyl(g, 0.46, 0.46, 0.04, top, 0, 0.74, 0, { seg: 32 });
    this.torus(g, 0.46, 0.012, this.gold, 0, 0.74, 0, { rx: Math.PI / 2, seg: 32 });
    this.cyl(g, 0.05, 0.07, 0.68, this.gold, 0, 0.38, 0, { seg: 12 });
    this.cyl(g, 0.28, 0.3, 0.035, M.darkMetal(), 0, 0.018, 0, { seg: 24 });
    // Tablet facing the client (+Z side), documents, pen, cups, flowers
    const tab = this.group(0.02, 0.1, index ? 0.2 : -0.15, g);
    this.box(tab, 0.25, 0.008, 0.18, M.blackPlastic(), 0, 0.764, 0, { r: 0.004 });
    this.plane(tab, 0.23, 0.16, this.screenMat(this.screens.get(4 + index)), 0, 0.769, 0, { rx: -Math.PI / 2 });
    for (let i = 0; i < 3; i++) this.box(g, 0.21, 0.004, 0.29, M.paper(), -0.18 + i * 0.01, 0.763 + i * 0.004, -0.14, { ry: 0.3 + i * 0.12 });
    this.box(g, 0.13, 0.006, 0.006, this.gold, -0.05, 0.775, -0.2, { ry: 0.6 });
    for (const [cx, cz] of [[0.25, -0.2], [-0.22, 0.25]] as const) {
      this.cyl(g, 0.065, 0.065, 0.006, mat(0xf7f5ef, { roughness: 0.3 }), cx, 0.763, cz, { seg: 14 });
      this.cyl(g, 0.035, 0.03, 0.06, mat(0xf7f5ef, { roughness: 0.3 }), cx, 0.795, cz, { seg: 12 });
      this.cyl(g, 0.031, 0.031, 0.004, mat(0x4a2c1a, { roughness: 0.2 }), cx, 0.823, cz, { seg: 12 });
    }
    this.cyl(g, 0.03, 0.04, 0.14, mat(0x1d222b, { roughness: 0.2 }), 0.22, 0.83, 0.18, { seg: 10 });
    for (let i = 0; i < 4; i++) this.sphere(g, 0.028, mat([0xf7f1e3, 0xe63946, 0xf4a6b8, 0xf7f1e3][i], { roughness: 0.7 }), 0.22 + Math.cos(i * 1.6) * 0.03, 0.93 + (i % 2) * 0.03, 0.18 + Math.sin(i * 1.6) * 0.03, { seg: 8 });
    this.block(Math.floor(x), Math.floor(z));
  }

  /** Leather club chair; occupant faces local -Z. */
  private clubChair(x: number, z: number, angle: number, leather: Material): void {
    const g = this.armchair(x, z, angle, leather, M.darkMetal(), 0.74);
    for (let i = 0; i < 3; i++) this.sphere(g, 0.012, this.gold, -0.18 + i * 0.18, 0.75, 0.355, { seg: 6 });
  }

  private vipSofa(): void {
    const S = VIP_SOFA;
    const w = S.w - 0.1;
    const g = this.group(S.x + 0.05, S.y + 0.05);
    const leather = mat(0x2a1a14, { roughness: 0.42 });
    this.box(g, w, 0.24, 0.82, leather, w / 2, 0.2, 0.44, { r: 0.04 });
    const n = 3;
    const cw = (w - 0.3) / n;
    for (let i = 0; i < n; i++) {
      const cx = 0.15 + cw * (i + 0.5);
      this.box(g, cw - 0.02, 0.12, 0.62, leather, cx, 0.38, 0.5, { r: 0.05 });
      this.box(g, cw - 0.02, 0.44, 0.16, leather, cx, 0.6, 0.18, { r: 0.06, rx: -0.12 });
      for (let k = 0; k < 2; k++) for (let j = 0; j < 2; j++) this.sphere(g, 0.01, M.blackPlastic(), cx - 0.12 + k * 0.24, 0.55 + j * 0.16, 0.27 - j * 0.02, { seg: 6 });
    }
    this.box(g, w, 0.6, 0.14, leather, w / 2, 0.42, 0.08, { r: 0.04 });
    for (const ax of [0.08, w - 0.08]) this.box(g, 0.16, 0.56, 0.82, leather, ax, 0.32, 0.44, { r: 0.06 });
    for (const lx of [0.12, w - 0.12]) for (const lz of [0.12, 0.78]) this.cyl(g, 0.02, 0.015, 0.08, this.gold, lx, 0.04, lz, { seg: 8 });
    for (const [px, col] of [[0.4, 0xd4af37], [w / 2, 0xe9e4da], [w - 0.4, 0x2a9d8f]] as const)
      this.box(g, 0.34, 0.32, 0.1, mat(col, { roughness: 1 }), px, 0.6, 0.32, { r: 0.05, rx: -0.25, rz: px < w / 2 ? 0.12 : -0.12 });
    this.block(S.x, S.y, S.w, 1);
  }

  /** Low walnut credenza along the partition (cells (23,2..4)). */
  private vipCredenza(): void {
    const g = this.group(RIGHT_WALL_X + 1.05, 2.1);
    const L = 2.8;
    this.box(g, 0.42, 0.62, L, M.walnut(), 0.21, 0.36, L / 2, { r: 0.012 });
    this.box(g, 0.38, 0.05, L - 0.06, M.darkMetal(), 0.2, 0.025, L / 2);
    for (let i = 0; i < 4; i++) {
      this.box(g, 0.005, 0.54, 0.004, mat(0x2a1a10), 0.422, 0.37, (L / 4) * i + 0.01);
      this.box(g, 0.02, 0.012, 0.18, this.gold, 0.435, 0.56, (L / 4) * (i + 0.5));
    }
    this.box(g, 0.44, 0.02, L + 0.02, this.darkStone(), 0.21, 0.68, L / 2);
    // Lamp, books, bronze sculpture, framed award
    this.cyl(g, 0.07, 0.09, 0.3, mat(0xe9e4da, { roughness: 0.3 }), 0.2, 0.84, 0.35, { seg: 12 });
    this.cyl(g, 0.12, 0.17, 0.2, this.glow(0xffe2b0, 0.9), 0.2, 1.1, 0.35, { seg: 16 });
    for (let i = 0; i < 4; i++) this.box(g, 0.24, 0.04, 0.17, mat([0x1d3557, 0x8c2f39, 0xe9c46a, 0x2b2f36][i], { roughness: 0.8 }), 0.22, 0.71 + i * 0.04, 1.2, { ry: i * 0.12 });
    const bronze = mat(0x9c6b3c, { metalness: 0.9, roughness: 0.35 });
    this.box(g, 0.14, 0.05, 0.14, M.blackPlastic(), 0.2, 0.715, 2.1);
    this.torus(g, 0.11, 0.025, bronze, 0.2, 0.86, 2.1, { ry: 0.6, seg: 18 });
    this.box(g, 0.03, 0.26, 0.2, M.blackPlastic(), 0.1, 0.83, 2.55, { rz: 0.15 });
    this.block(RIGHT_WALL_X + 1, 2, 1, 3);
  }

  private darkStone(): Material {
    return mat(0xffffff, { map: marbleTexture(0x2a2c30, 0xb8b2a6, 31), roughness: 0.2 });
  }

  // ------------------------------------------------------------ server room

  serverRoom(): void {
    const R = this.staticRoot;
    const gx = SERVER_GLASS_X + 1; // glass on the room boundary so column x = 26 stays a corridor to the VIP door
    const zTop = VIP_GLASS_Y + 0.5;
    const zBot = SERVER_GLASS_Y + 0.5;
    this.glassAlongZ(gx, zTop, zBot, [[SERVER_DOOR_Y, SERVER_DOOR_Y + 1]], GLASS_H, false);
    this.glassAlongX(zBot, gx, GRID_W, [], GLASS_H, false);
    // Glass door slid open over the next bay + card reader
    this.plane(R, 0.92, 2.2, M.glass(), gx + 0.05, 1.12, SERVER_DOOR_Y + 1.5, { ry: Math.PI / 2 });
    for (const s of [-1, 1]) this.box(R, 0.03, 2.22, 0.03, M.aluminium(), gx + 0.05, 1.12, SERVER_DOOR_Y + 1.5 + s * 0.46);
    this.box(R, 0.03, 0.14, 0.08, M.blackPlastic(), gx - 0.05, 1.2, SERVER_DOOR_Y - 0.12, { r: 0.006 });
    this.box(R, 0.005, 0.02, 0.03, this.glow(0x43e97b, 2), gx - 0.068, 1.24, SERVER_DOOR_Y - 0.12, { shadow: false });
    // Warning band + sign on the front glass
    const sign = signTexture(['SERVER ROOM', 'Authorized personnel only'], { w: 512, h: 160, bg: '#101318', fg: '#e8edf5', accent: '#f5a623' });
    this.plane(R, 1.1, 0.34, this.litMat(sign, 0.8), gx + 1.5, 1.55, zBot + 0.012);
    for (let x = gx; x < GRID_W - 0.01; x += 1) this.box(R, 0.98, 0.05, 0.012, mat(0xf5a623, { roughness: 0.5 }), x + 0.5, 1.0, zBot, { shadow: false });

    // Racks with server faces + animated LED overlay
    const face = mat(0xffffff, { map: serverFaceTexture(), emissive: 0xffffff, emissiveMap: serverFaceTexture(), emissiveIntensity: 0.12, roughness: 0.4 });
    const leds: { x: number; y: number; z: number; w: number; h: number }[] = [];
    const rackBody = mat(0x15171b, { roughness: 0.45, metalness: 0.4 });
    for (const c of SERVER_RACKS) {
      const g = this.group(c.x + 0.5, c.y);
      const W = 0.8;
      const H = 2.1;
      const D = 0.92;
      const zc = -0.38 + D / 2 + 0.02;
      const fz = zc + D / 2;
      this.box(g, W, H, D, rackBody, 0, H / 2 + 0.03, zc);
      this.box(g, W - 0.04, 0.03, D - 0.04, M.blackPlastic(), 0, 0.015, zc);
      this.box(g, W, 0.04, D, M.darkMetal(), 0, H + 0.05, zc);
      for (let k = 0; k < 6; k++) this.box(g, W - 0.12, 0.004, 0.02, M.blackPlastic(), 0, H + 0.072, zc - 0.3 + k * 0.12, { shadow: false });
      this.plane(g, W - 0.1, H - 0.2, face, 0, H / 2 + 0.03, fz + 0.003);
      for (const s of [-1, 1]) this.box(g, 0.04, H, 0.04, M.darkMetal(), s * (W / 2 - 0.02), H / 2 + 0.03, fz);
      this.box(g, W, 0.08, 0.03, mat(0xf5a623, { roughness: 0.5, emissive: 0xf5a623, emissiveIntensity: 0.15 }), 0, H - 0.04, fz + 0.01);
      leds.push({ x: c.x + 0.5, y: H / 2 + 0.03, z: c.y + fz + 0.008, w: W - 0.1, h: H - 0.2 });
      this.block(c.x, c.y);
    }
    this.animated.push(createServerLeds(this.dynamicRoot, leds));

    // Overhead ladder cable tray with bundles dropping into the racks
    const ty = 2.5;
    const tz = SERVER_RACKS[0].y + 0.1;
    const tx0 = gx + 0.05;
    const tl = GRID_W - tx0;
    for (const s of [-1, 1]) this.box(R, tl, 0.06, 0.012, M.aluminium(), tx0 + tl / 2, ty, tz + s * 0.15, { shadow: false });
    for (let x = tx0 + 0.1; x < GRID_W; x += 0.25) this.box(R, 0.02, 0.012, 0.3, M.aluminium(), x, ty - 0.025, tz, { shadow: false });
    const cables = [0x2e86de, 0xf5a623, 0xd62828, 0x43aa8b];
    cables.forEach((c, i) => {
      this.cyl(R, 0.018, 0.018, tl, mat(c, { roughness: 0.6 }), tx0 + tl / 2, ty - 0.005, tz - 0.09 + i * 0.06, { seg: 6, rz: Math.PI / 2, shadow: false });
    });
    for (const c of SERVER_RACKS) {
      const h = ty - 2.18;
      this.cyl(R, 0.04, 0.04, h, mat(0x2e86de, { roughness: 0.6 }), c.x + 0.5, 2.18 + h / 2, tz, { seg: 6, shadow: false });
    }
    for (const s of [0.5, 2.5]) this.cyl(R, 0.006, 0.006, WALL_H + 0.3 - ty, M.darkMetal(), tx0 + s, (WALL_H + 0.3 + ty) / 2, tz, { seg: 4, shadow: false });

    // Precision AC unit facing +X in cell (27,10)
    const ac = this.group(gx + 0.45, SERVER_GLASS_Y - 0.5);
    this.box(ac, 0.8, 1.95, 0.88, M.whitePlastic(), 0, 0.99, 0, { r: 0.02 });
    for (let k = 0; k < 14; k++) this.box(ac, 0.01, 0.025, 0.74, M.greyPlastic(), 0.402, 0.3 + k * 0.06, 0, { shadow: false });
    this.box(ac, 0.012, 0.16, 0.24, M.blackPlastic(), 0.402, 1.55, 0.18);
    this.plane(ac, 0.2, 0.12, this.screenMat(signTexture(['18.5°C', 'RH 45%'], { w: 256, h: 160, bg: '#031a2b', fg: '#5fd0ff' }), 1.2), 0.41, 1.55, 0.18, { ry: Math.PI / 2 });
    this.box(ac, 0.8, 0.06, 0.88, M.greyPlastic(), 0, 1.97, 0);
    this.block(SERVER_GLASS_X + 1, SERVER_GLASS_Y - 1);
    // Fire extinguisher next to the AC
    this.cyl(R, 0.07, 0.07, 0.45, mat(0xc1121f, { roughness: 0.35 }), gx + 0.14, 0.24, SERVER_GLASS_Y - 0.08, { seg: 12 });
    this.cyl(R, 0.025, 0.035, 0.08, M.blackPlastic(), gx + 0.14, 0.5, SERVER_GLASS_Y - 0.08, { seg: 8 });

    // Planter along the glass in corridor cells (26, 9..11): blocks crossings through the glass line.
    const pz0 = SERVER_DOOR_Y + 1;
    const pl = this.group(SERVER_GLASS_X + 0.5, pz0);
    const len = SERVER_GLASS_Y + 1 - pz0;
    this.box(pl, 0.55, 0.55, len - 0.1, mat(0x2a2e35, { roughness: 0.4 }), 0.12, 0.275, len / 2, { r: 0.015 });
    this.box(pl, 0.5, 0.02, len - 0.16, M.soil(), 0.12, 0.54, len / 2);
    const greens = [mat(0x2d6a4f, { roughness: 0.55 }), mat(0x40916c, { roughness: 0.55 }), mat(0x52b788, { roughness: 0.6 })];
    const r = this.rnd;
    for (let i = 0; i < 24; i++) {
      const h = 0.4 + r() * 0.6;
      const blade = this.box(pl, 0.06, h, 0.012, greens[i % 3], 0.12 + (r() - 0.5) * 0.35, 0.55 + h / 2, 0.15 + r() * (len - 0.3));
      blade.rotation.set((r() - 0.5) * 0.35, r() * Math.PI, (r() - 0.5) * 0.35);
    }
    this.block(SERVER_GLASS_X, pz0, 1, len);
    this.block(SERVER_GLASS_X + 1, SERVER_GLASS_Y, GRID_W - SERVER_GLASS_X - 1, 1);
  }

  // ------------------------------------------------------------ quiet nook

  /** Reading corner x 23..25, y 7..10: low bookshelf, reading armchair + ottoman, arc lamp, side table, plant. */
  quietNook(): void {
    const R = this.staticRoot;
    const x0 = RIGHT_WALL_X + 1;
    const z0 = VIP_GLASS_Y + 1;
    // Rug
    this.box(R, 2.6, 0.012, 3.6, mat(0xffffff, { map: rugTexture(0x9c6644, 0x5a3825, 0xede0d4), roughness: 1 }), x0 + 1.55, 0.008, z0 + 1.95, { shadow: false });
    // Low bookshelf against the partition (x = 23, z 7..10)
    const bs = this.group(x0 + 0.02, z0 + 0.05);
    const L = 2.9;
    const D = 0.36;
    const H = 1.0;
    const oak = M.oak();
    this.box(bs, D, 0.03, L, oak, D / 2, H, L / 2);
    this.box(bs, D, 0.03, L, oak, D / 2, 0.05, L / 2);
    this.box(bs, D, 0.025, L, oak, D / 2, 0.52, L / 2);
    for (let i = 0; i <= 4; i++) this.box(bs, D, H, 0.025, oak, D / 2, H / 2, (L / 4) * i);
    const colors = [0x8c2f39, 0x264653, 0xe9c46a, 0x2a9d8f, 0x3a3f48, 0xf4f1de, 0x6a4c93, 0xe76f51];
    const r = this.rnd;
    for (const sy of [0.065, 0.535]) {
      let pz = 0.04;
      while (pz < L - 0.08) {
        if (Math.abs(pz - Math.round(pz / (L / 4)) * (L / 4)) < 0.03) {
          pz += 0.03;
          continue;
        }
        if (r() < 0.08) {
          pz += 0.18;
          continue;
        }
        const bw = 0.03 + r() * 0.03;
        const bh = 0.24 + r() * 0.14;
        this.box(bs, 0.24, bh, bw, mat(colors[Math.floor(r() * colors.length)], { roughness: 0.75 }), 0.15, sy + bh / 2, pz + bw / 2);
        pz += bw + 0.005;
      }
    }
    // Top decor: vase, stacked books, small sculpture
    this.cyl(bs, 0.05, 0.08, 0.26, mat(0x2a9d8f, { roughness: 0.25 }), D / 2, H + 0.145, 0.4, { seg: 12 });
    for (let i = 0; i < 3; i++) this.box(bs, 0.24, 0.04, 0.17, mat(colors[i + 3], { roughness: 0.8 }), D / 2, H + 0.035 + i * 0.04, 1.5, { ry: i * 0.15 });
    this.succulent(bs, D / 2, H + 0.015, 2.5);
    this.block(x0, z0, 1, 3);
    // Reading armchair + ottoman, side table, arc lamp
    const tweed = mat(0xffffff, { map: fabricTexture(0xb5835a, 61), roughness: 1 });
    this.armchair(x0 + 1.5, z0 + 0.55, -Math.PI * 0.8, tweed, M.walnut(), 0.82);
    this.box(R, 0.5, 0.26, 0.42, tweed, x0 + 1.75, 0.2, z0 + 1.45, { r: 0.05, ry: 0.3 });
    this.cyl(R, 0.2, 0.2, 0.03, M.walnut(), x0 + 0.65, 0.55, z0 + 1.5, { seg: 16 });
    this.cyl(R, 0.02, 0.02, 0.52, M.darkMetal(), x0 + 0.65, 0.27, z0 + 1.5, { seg: 6 });
    this.cyl(R, 0.15, 0.15, 0.015, M.darkMetal(), x0 + 0.65, 0.008, z0 + 1.5, { seg: 14 });
    this.cyl(R, 0.04, 0.035, 0.09, mat(0xf4f1de, { roughness: 0.35 }), x0 + 0.6, 0.61, z0 + 1.45, { seg: 10 });
    this.box(R, 0.17, 0.03, 0.23, mat(0x264653, { roughness: 0.8 }), x0 + 0.72, 0.58, z0 + 1.56, { ry: 0.4 });
    // arc lamp: base behind the chair, arm over it
    const lb = { x: x0 + 0.65, z: z0 + 0.3 };
    this.cyl(R, 0.16, 0.17, 0.05, this.darkStone(), lb.x, 0.025, lb.z, { seg: 16 });
    this.cyl(R, 0.012, 0.012, 1.7, M.chrome(), lb.x, 0.9, lb.z, { seg: 6 });
    this.cyl(R, 0.012, 0.012, 0.9, M.chrome(), lb.x + 0.32, 1.85, lb.z + 0.22, { seg: 6, rz: -1.0, rx: 0.6 });
    const shadeX = lb.x + 0.7;
    const shadeZ = lb.z + 0.45;
    this.sphere(R, 0.16, mat(0x1d222b, { roughness: 0.35, metalness: 0.6 }), shadeX, 1.95, shadeZ, { seg: 14 }).scale.set(1, 0.6, 1);
    this.cyl(R, 0.13, 0.13, 0.01, this.glow(0xffe0b0, 1.8), shadeX, 1.86, shadeZ, { seg: 14, shadow: false });
    this.glowSpots.push({ x: shadeX, z: shadeZ + 0.1, r: 1.1, color: 0xffd29a });
    this.block(x0 + 1, z0, 1, 2);
    this.plant(x0, z0 + 3, 'fig');
  }

  // ------------------------------------------------------------ cafeteria

  cafeteria(): void {
    const R = this.staticRoot;
    this.foodCounter();
    this.drinksFridge(FOOD_COUNTER.x + FOOD_COUNTER.w, FOOD_COUNTER.y);
    this.recycling(FOOD_COUNTER.x + FOOD_COUNTER.w, FOOD_COUNTER.y + 1);

    // Menu board + clock suspended above the counter
    const mz = FOOD_COUNTER.y + 0.25;
    const mx = FOOD_COUNTER.x + 1.95;
    this.box(R, 3.3, 0.86, 0.05, M.walnut(), mx, 2.55, mz, { r: 0.01, shadow: false });
    this.plane(R, 3.2, 0.76, this.litMat(menuBoardTexture(), 0.75), mx, 2.55, mz + 0.027);
    for (const s of [-1, 1]) this.cyl(R, 0.003, 0.003, WALL_H + 0.3 - 2.98, M.darkMetal(), mx + s * 1.4, (WALL_H + 0.3 + 2.98) / 2, mz, { seg: 4, shadow: false });
    const ckx = FOOD_COUNTER.x + 4.25;
    this.cyl(R, 0.27, 0.27, 0.05, M.blackPlastic(), ckx, 2.55, mz, { seg: 28, rx: Math.PI / 2, shadow: false });
    this.plane(R, 0.48, 0.48, mat(0xffffff, { map: clockFaceTexture(), transparent: true, roughness: 0.4 }), ckx, 2.55, mz + 0.027);
    this.cyl(R, 0.003, 0.003, 0.63, M.darkMetal(), ckx, 3.13, mz, { seg: 4, shadow: false });
    const hands = new Group();
    hands.position.set(ckx, 2.55, mz + 0.03);
    this.dynamicRoot.add(hands);
    this.animated.push(createClockHands(hands, 0.22));

    // Tables, chairs, pendants
    const tableTop = mat(0xffffff, { map: marbleTexture(0xf6f4ef, 0xbdb6aa, 41), roughness: 0.25 });
    CAFE_TABLES.forEach((t, i) => this.cafeTable(t.x + 0.5, t.y + 0.5, tableTop, i));
    const seats = [mat(0xc58b4e, { roughness: 0.55 }), mat(0x2a9d8f, { roughness: 0.6 }), mat(0xe9c46a, { roughness: 0.6 }), mat(0xe76f51, { roughness: 0.6 })];
    for (const s of CHAIR_SLOTS) {
      if (s.cell.y < FOOD_COUNTER.y || s.cell.x <= RIGHT_WALL_X) continue;
      const ti = CAFE_TABLES.findIndex((t) => Math.abs(t.x - s.cell.x) + Math.abs(t.y - s.cell.y) === 1);
      this.cafeChair(s.cell.x + 0.5 + s.face.x * 0.05, s.cell.y + 0.5 + s.face.y * 0.05, ry(s), seats[(ti < 0 ? 0 : ti) % seats.length]);
    }
    for (const t of CAFE_TABLES) {
      this.pendant(t.x + 0.5, 1.95, t.y + 0.5, false);
      this.glowSpots.push({ x: t.x + 0.5, z: t.y + 0.5, r: 1.1, color: 0xffd9a8 });
    }
    this.plant(GRID_W - 1, 17, 'bush');
  }

  private foodCounter(): void {
    const F = FOOD_COUNTER;
    const w = F.w - 0.1;
    const g = this.group(F.x + 0.05, F.y);
    const H = 0.9;
    const D = 0.75;
    const zc = 0.1 + D / 2;
    const fz = zc + D / 2;
    // Body, facade, kick, tray rail
    this.box(g, w, H - 0.08, D, M.whitePlastic(), w / 2, 0.08 + (H - 0.08) / 2, zc);
    this.box(g, w - 0.04, 0.08, D - 0.06, M.skirting(), w / 2, 0.04, zc - 0.02);
    for (let x = 0.06; x < w - 0.03; x += 0.09) this.box(g, 0.05, H - 0.2, 0.02, M.oak(), x, 0.12 + (H - 0.2) / 2, fz + 0.01);
    this.box(g, w - 0.1, 0.012, 0.02, this.glow(0xffd28a, 1.8), w / 2, 0.09, fz + 0.01, { shadow: false });
    this.box(g, w + 0.04, 0.04, D + 0.06, this.steel, w / 2, H + 0.02, zc + 0.02);
    this.cyl(g, 0.018, 0.018, w, this.steel, w / 2, H - 0.06, fz + 0.2, { seg: 8, rz: Math.PI / 2 });
    for (let x = 0.2; x < w; x += 1.1) this.box(g, 0.02, 0.02, 0.2, this.steel, x, H - 0.06, fz + 0.1);
    this.box(g, w, 0.02, 0.26, this.steel, w / 2, H - 0.05, fz + 0.15);
    // Food wells (2 rows) with colourful dishes
    const pan = M.darkMetal();
    const foods = [0xf4f1de, 0x6a994e, 0xbc4749, 0xf2a541, 0x8b5a2b, 0xe9c46a, 0x386641, 0xd8572a, 0xfefae0, 0xa7c957];
    let fi = 0;
    for (let x = 0.4; x < w - 1.1; x += 0.52) {
      for (const pzOff of [-0.17, 0.12]) {
        const pzc = zc + pzOff;
        this.box(g, 0.46, 0.03, 0.26, pan, x, H + 0.035, pzc);
        const col = foods[fi++ % foods.length];
        this.box(g, 0.42, 0.02, 0.22, mat(col, { roughness: 0.7 }), x, H + 0.05, pzc);
        for (let k = 0; k < 3; k++) {
          const b = this.sphere(g, 0.03, mat(foods[(fi + k * 3) % foods.length], { roughness: 0.6 }), x - 0.12 + k * 0.12, H + 0.06, pzc + (k % 2 ? 0.04 : -0.04), { seg: 6, shadow: false });
          b.scale.set(1.2, 0.5, 1);
        }
        this.box(g, 0.02, 0.012, 0.18, this.steel, x + 0.15, H + 0.07, pzc, { ry: 0.3, shadow: false });
      }
    }
    // Sneeze guard: posts, sloped glass, top shelf, heat-lamp strip
    const gw = w - 1.1;
    for (let x = 0.12; x <= gw + 0.13; x += gw / 3) this.cyl(g, 0.012, 0.012, 0.5, this.steel, x, H + 0.27, fz - 0.06, { seg: 8 });
    this.plane(g, gw, 0.4, M.glass(), gw / 2 + 0.12, H + 0.3, fz - 0.02, { rx: -0.45 });
    this.box(g, gw + 0.04, 0.02, 0.36, M.glass(), gw / 2 + 0.12, H + 0.52, zc + 0.12, { shadow: false });
    this.box(g, gw, 0.02, 0.03, this.glow(0xff8a3d, 1.6), gw / 2 + 0.12, H + 0.505, zc, { shadow: false });
    this.glowSpots.push({ x: F.x + gw / 2, z: F.y + 1.1, r: 1.6, color: 0xffb070 });
    // Tray stack + cutlery at the start, POS at the end
    for (let i = 0; i < 6; i++) this.box(g, 0.42, 0.012, 0.32, mat([0x2b3446, 0xe76f51][i % 2], { roughness: 0.5 }), 0.32, H + 0.05 + i * 0.013, zc + 0.12, { r: 0.004 });
    const px = w - 0.45;
    this.box(g, 0.14, 0.02, 0.1, M.greyPlastic(), px, H + 0.05, zc, { r: 0.005 });
    this.box(g, 0.03, 0.18, 0.03, M.greyPlastic(), px, H + 0.15, zc);
    this.monitor(g, px, H + 0.3, zc + 0.02, 0.36, 0.24, 0.15, this.screens.get(9));
    this.box(g, 0.08, 0.02, 0.15, M.blackPlastic(), px + 0.28, H + 0.05, zc + 0.15, { r: 0.008, rx: -0.3 });
    this.box(g, 0.06, 0.004, 0.04, this.glow(0x5cff9d, 1.5), px + 0.28, H + 0.065, zc + 0.12, { shadow: false, rx: -0.3 });
    this.box(g, 0.34, 0.12, 0.3, M.greyPlastic(), px, H + 0.08, zc - 0.2, { r: 0.01 });
    this.block(F.x, F.y, F.w, 1);
  }

  private drinksFridge(x: number, z: number): void {
    const g = this.group(x + 0.5, z);
    const W = 0.84;
    const H = 2.0;
    const D = 0.72;
    const zc = 0.05 + D / 2;
    const fz = zc + D / 2;
    this.box(g, W, H, D, M.whitePlastic(), 0, H / 2, zc, { r: 0.015 });
    this.box(g, W - 0.08, H - 0.32, 0.02, M.darkMetal(), 0, 0.12 + (H - 0.32) / 2, fz);
    const tex = fridgeTexture();
    this.plane(g, W - 0.14, H - 0.4, this.litMat(tex, 0.75), 0, 0.12 + (H - 0.32) / 2, fz + 0.012);
    this.plane(g, W - 0.14, H - 0.4, M.glass(), 0, 0.12 + (H - 0.32) / 2, fz + 0.02);
    this.box(g, 0.025, 0.7, 0.03, M.chrome(), W / 2 - 0.09, 1.0, fz + 0.04);
    const head = signTexture(['FRESH DRINKS'], { w: 512, h: 96, bg: '#0b5e4a', fg: '#ffffff' });
    this.plane(g, W - 0.06, 0.16, this.litMat(head, 1.1), 0, H - 0.1, fz + 0.002);
    this.box(g, W, 0.08, D, M.blackPlastic(), 0, 0.04, zc);
    this.block(x, z);
  }

  private recycling(x: number, z: number): void {
    const g = this.group(x + 0.5, z + 0.5);
    const cols = [0x2e86de, 0xf5a623, 0x43aa8b];
    cols.forEach((c, i) => {
      const bx = -0.27 + i * 0.27;
      this.box(g, 0.25, 0.72, 0.34, mat(c, { roughness: 0.45 }), bx, 0.36, -0.15, { r: 0.02 });
      this.box(g, 0.25, 0.04, 0.34, M.greyPlastic(), bx, 0.74, -0.15, { r: 0.012 });
      this.box(g, 0.14, 0.012, 0.06, M.blackPlastic(), bx, 0.762, -0.08);
    });
    this.block(x, z);
  }

  private cafeTable(x: number, z: number, top: Material, index: number): void {
    const g = this.group(x, z);
    this.box(g, 0.8, 0.035, 0.8, top, 0, 0.74, 0, { r: 0.012 });
    this.box(g, 0.76, 0.012, 0.76, M.oak(), 0, 0.716, 0);
    this.cyl(g, 0.035, 0.035, 0.7, M.blackPlastic(), 0, 0.36, 0, { seg: 10 });
    for (const a of [Math.PI / 4, -Math.PI / 4]) this.box(g, 0.6, 0.03, 0.05, M.blackPlastic(), 0, 0.02, 0, { ry: a });
    // Plates with food, cups, napkin holder
    const r = this.rnd;
    const foods = [0xf2a541, 0x6a994e, 0xbc4749, 0xf4f1de, 0x8b5a2b];
    const plate = mat(0xfbfbf8, { roughness: 0.3 });
    const places: [number, number][] = [[0, -0.22], [0, 0.22], [-0.22, 0], [0.22, 0]];
    places.forEach(([px, pz], k) => {
      if ((index + k) % 3 === 2) return;
      this.cyl(g, 0.12, 0.1, 0.015, plate, px, 0.765, pz, { seg: 16 });
      const f = this.sphere(g, 0.06, mat(foods[Math.floor(r() * foods.length)], { roughness: 0.7 }), px, 0.78, pz, { seg: 8 });
      f.scale.set(1.2, 0.45, 1);
      this.sphere(g, 0.025, mat(0x6a994e, { roughness: 0.7 }), px + 0.04, 0.79, pz + 0.03, { seg: 6 });
      const cx = px + (pz === 0 ? 0 : 0.18);
      const cz = pz + (pz === 0 ? 0.18 : 0);
      this.cyl(g, 0.03, 0.025, 0.09, mat([0xffffff, 0xe76f51, 0x2a9d8f][k % 3], { roughness: 0.35 }), cx, 0.8, cz, { seg: 10 });
    });
    this.box(g, 0.08, 0.08, 0.05, M.chrome(), 0, 0.8, 0);
    this.box(g, 0.07, 0.06, 0.03, M.paper(), 0, 0.81, 0);
    this.block(Math.floor(x), Math.floor(z));
  }
}

