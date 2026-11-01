import { Group, type Material, Mesh, TorusGeometry, type Texture } from 'three';
import { GRID_H, GRID_W, WALL_H } from '../config/constants';
import {
  ELEVATOR_DOOR, FRONT_WALL_Y, GLASS_X, GLASS_Y, PHONE_PODS, RECEPTION_WALL_X1, RESTROOM_DOOR, RIGHT_WALL_X, SERVER_GLASS_X,
  SERVER_GLASS_Y, VIP_GLASS_Y,
} from '../config/layout';
import type { Point } from '../types';
import {
  brushedMetalTexture, carpetTexture, herringboneTexture, logoTexture, raisedFloorTexture, rubberTileTexture, rugTexture,
  checkerTileTexture, terrazzoTexture, tileTexture, woodTexture,
} from '../utils/canvasTextures';
import { M, mat } from '../utils/materials';
import { DOOR_H } from './BuilderBase';
import { RightWingBuilder } from './RightWingBuilder';

export type { DoorController } from './Doors';
export { createRobotVacuum } from './Props';

const WINDOWS: [number, number][] = [[4.6, 7.0], [7.4, 9.8]];
const WIN_Y0 = 0.9;
const WIN_Y1 = 2.6;

/**
 * Builds every static prop of the office out of primitives and registers obstacles on the nav grid.
 * Static meshes go into `staticRoot` (merged later by material); lamp positions go to `glowSpots`;
 * animated props live in `dynamicRoot` and are ticked through `animated`.
 * Zone builders are layered: BuilderBase → FrontZonesBuilder → RightWingBuilder → OfficeBuilder.
 */
export class OfficeBuilder extends RightWingBuilder {
  // ------------------------------------------------------------ shell

  floor(): void {
    const R = this.staticRoot;
    this.box(R, GRID_W + 0.3, 0.3, GRID_H + 0.3, mat(0x262b34, { roughness: 0.7 }), GRID_W / 2 - 0.15, -0.15, GRID_H / 2 - 0.15, { shadow: false });
    this.box(R, GRID_W + 0.34, 0.04, 0.04, M.aluminium(), GRID_W / 2 - 0.15, -0.02, GRID_H + 0.02, { shadow: false });
    this.box(R, 0.04, 0.04, GRID_H + 0.34, M.aluminium(), GRID_W + 0.02, -0.02, GRID_H / 2 - 0.15, { shadow: false });

    const fy = FRONT_WALL_Y + 0.5; // partition line between main floor and front strip
    const rx = RIGHT_WALL_X + 0.5; // partition line between centre rooms and right wing
    const carpet = carpetTexture(0x46536b, 0x8796b3, 1);
    // Main floor (trading + mini pantry), boss office, meeting room
    this.floorZone(0, 0, GLASS_X + 0.5, 10, carpet, 0.95);
    this.floorZone(3, 10, GLASS_X + 0.5, fy, carpet, 0.95);
    this.floorZone(0, 10, 3, fy, tileTexture(0xe9e4da, 0xb9b2a5), 0.35, 1.2);
    this.floorZone(GLASS_X + 0.5, 0, rx, GLASS_Y + 0.5, woodTexture(0x9a6b45), 0.45, 2);
    this.floorZone(GLASS_X + 0.5, GLASS_Y + 0.5, rx, fy, carpetTexture(0x5b5368, 0x9a8fb0, 5), 0.95);
    // Front strip: lobby terrazzo, lounge rubber tiles, phone-booth carpet
    const lounge0 = RECEPTION_WALL_X1 + 1;
    const pods0 = PHONE_PODS[0].x - 1;
    this.floorZone(0, fy, lounge0, GRID_H, terrazzoTexture(0xd9d3c9, [0x8a8279, 0x2f3338, 0xc9a77c, 0xffffff, 0x6b7a8f]), 0.22, 2);
    this.floorZone(lounge0, fy, pods0, GRID_H, rubberTileTexture(0x2f4858, [0x86bbd8, 0xf6ae2d, 0xffffff, 0x1b2a33]), 0.9, 1);
    this.floorZone(pods0, fy, RIGHT_WALL_X, GRID_H, carpetTexture(0x3a3f4a, 0x6c7385, 7), 0.95);
    // Right wing: VIP herringbone, nook oak, raised server floor, cafeteria tiles (incl. corridor x = 22)
    const vz = VIP_GLASS_Y + 0.5;
    const sz = SERVER_GLASS_Y + 0.5;
    const sx = SERVER_GLASS_X + 1;
    this.floorZone(rx, 0, GRID_W, vz, herringboneTexture(0x8a5a3b), 0.4, 0.8);
    this.floorZone(rx, vz, sx, sz, woodTexture(0xa87b52, 4), 0.5, 2);
    this.floorZone(sx, vz, GRID_W, sz, raisedFloorTexture(), 0.55, 1.2, 0.004);
    const cafeTiles = checkerTileTexture(0xd8cdbb, 0x8f8576, 0xb9ad99);
    this.floorZone(rx, sz, GRID_W, GRID_H, cafeTiles, 0.3, 1.2);
    this.floorZone(RIGHT_WALL_X, fy, rx, GRID_H, cafeTiles, 0.3, 1.2);
    // Thresholds between finishes
    const strip = M.aluminium();
    this.box(R, 0.04, 0.006, GRID_H - fy, strip, lounge0, 0.003, (fy + GRID_H) / 2, { shadow: false });
    this.box(R, 0.04, 0.006, GRID_H - fy, strip, pods0, 0.003, (fy + GRID_H) / 2, { shadow: false });
    this.box(R, 0.04, 0.006, GRID_H - fy, strip, RIGHT_WALL_X, 0.003, (fy + GRID_H) / 2, { shadow: false });
    this.box(R, GRID_W - rx, 0.006, 0.04, strip, (rx + GRID_W) / 2, 0.003, sz, { shadow: false });

    const rug = (x0: number, z0: number, x1: number, z1: number, tex: Texture) =>
      this.box(R, x1 - x0, 0.012, z1 - z0, mat(0xffffff, { map: tex, roughness: 1 }), (x0 + x1) / 2, 0.008, (z0 + z1) / 2, { shadow: false });
    rug(17.2, 1.2, 20.8, 4.7, rugTexture(0x7b2d35, 0x3c1a1f, 0xd9a85b));
    rug(16.3, 9.2, 20.7, 12.8, rugTexture(0x2f3c55, 0x1c2433, 0x8fa6c9));
    rug(4.2, 1.15, 11.8, 2.0, rugTexture(0x2b3446, 0x1a2030, 0xf5a623));
    rug(16.2, 18.15, 21.8, 19.85, rugTexture(0x4a4e58, 0x2a2d33, 0x9fb4c7));
  }

  walls(): void {
    const R = this.staticRoot;
    const wall = M.wall();
    const T = 0.15;
    // Back wall (z = 0)
    this.box(R, GRID_W + T, WALL_H, T, wall, GRID_W / 2 - T / 2, WALL_H / 2, -T / 2);
    // Left wall (x = 0): windows, elevator and restroom openings
    const openings: { a: number; b: number; y0: number; y1: number }[] = [
      ...WINDOWS.map(([a, b]) => ({ a, b, y0: WIN_Y0, y1: WIN_Y1 })),
      { a: ELEVATOR_DOOR.y0, b: ELEVATOR_DOOR.y1, y0: 0, y1: DOOR_H },
      { a: RESTROOM_DOOR.y0, b: RESTROOM_DOOR.y1, y0: 0, y1: DOOR_H },
    ].sort((p, q) => p.a - q.a);
    let z = 0;
    for (const o of openings) {
      if (o.a > z) this.box(R, T, WALL_H, o.a - z, wall, -T / 2, WALL_H / 2, (z + o.a) / 2);
      if (o.y0 > 0) this.box(R, T, o.y0, o.b - o.a, wall, -T / 2, o.y0 / 2, (o.a + o.b) / 2);
      this.box(R, T, WALL_H - o.y1, o.b - o.a, wall, -T / 2, (o.y1 + WALL_H) / 2, (o.a + o.b) / 2);
      z = o.b;
    }
    if (z < GRID_H) this.box(R, T, WALL_H, GRID_H - z, wall, -T / 2, WALL_H / 2, (z + GRID_H) / 2);

    // Wall caps, skirting (broken at doors) and crown
    this.box(R, GRID_W + T, 0.03, T + 0.04, M.trim(), GRID_W / 2 - T / 2, WALL_H + 0.015, -T / 2);
    this.box(R, T + 0.04, 0.03, GRID_H, M.trim(), -T / 2, WALL_H + 0.015, GRID_H / 2);
    this.box(R, GRID_W, 0.1, 0.025, M.skirting(), GRID_W / 2, 0.05, 0.012);
    let sz0 = 0;
    for (const o of openings.filter((p) => p.y0 === 0)) {
      this.box(R, 0.025, 0.1, o.a - sz0, M.skirting(), 0.012, 0.05, (sz0 + o.a) / 2);
      sz0 = o.b;
    }
    this.box(R, 0.025, 0.1, GRID_H - sz0, M.skirting(), 0.012, 0.05, (sz0 + GRID_H) / 2);
    this.box(R, GRID_W, 0.05, 0.04, M.trim(), GRID_W / 2, WALL_H - 0.04, 0.02);
    this.box(R, 0.04, 0.05, GRID_H, M.trim(), 0.02, WALL_H - 0.04, GRID_H / 2);

    // Elevator car (visible when the doors open) and restroom vestibule behind the wall
    this.elevatorCar(ELEVATOR_DOOR.y0, ELEVATOR_DOOR.y1);
    this.restroomVestibule(RESTROOM_DOOR.y0, RESTROOM_DOOR.y1);

    // Feature wall behind the price board
    this.box(R, 11.6, WALL_H - 0.22, 0.03, M.featureWall(), 7.5, 0.1 + (WALL_H - 0.22) / 2, 0.015);
    for (const x of [1.72, 13.28]) this.box(R, 0.04, WALL_H - 0.22, 0.05, M.aluminium(), x, 0.1 + (WALL_H - 0.22) / 2, 0.025);

    // Boss office: oak slat wall (stops at the right-wing partition)
    const slatEnd = RIGHT_WALL_X + 0.4;
    this.box(R, slatEnd - 15.7, WALL_H - 0.22, 0.02, mat(0x2a2320, { roughness: 0.9 }), (15.7 + slatEnd) / 2, 0.1 + (WALL_H - 0.22) / 2, 0.01);
    for (let x = 15.8; x < slatEnd - 0.03; x += 0.12) this.box(R, 0.06, WALL_H - 0.22, 0.04, M.oak(), x, 0.1 + (WALL_H - 0.22) / 2, 0.04);

    // Windows: frames, mullions, glass, sills and roller blinds
    const frame = M.darkMetal();
    for (const [a, b] of WINDOWS) {
      const mid = (a + b) / 2;
      const len = b - a;
      this.box(R, 0.18, 0.05, len, frame, -0.07, WIN_Y0 + 0.025, mid);
      this.box(R, 0.18, 0.05, len, frame, -0.07, WIN_Y1 - 0.025, mid);
      this.box(R, 0.18, WIN_Y1 - WIN_Y0, 0.05, frame, -0.07, (WIN_Y0 + WIN_Y1) / 2, a + 0.025);
      this.box(R, 0.18, WIN_Y1 - WIN_Y0, 0.05, frame, -0.07, (WIN_Y0 + WIN_Y1) / 2, b - 0.025);
      this.box(R, 0.12, WIN_Y1 - WIN_Y0, 0.035, frame, -0.07, (WIN_Y0 + WIN_Y1) / 2, mid);
      this.box(R, 0.12, 0.035, len, frame, -0.07, 2.15, mid);
      this.plane(R, len, WIN_Y1 - WIN_Y0, M.glass(), -0.07, (WIN_Y0 + WIN_Y1) / 2, mid, { ry: Math.PI / 2 });
      this.plane(R, len + 0.4, WIN_Y1 - WIN_Y0 + 0.4, mat(0x000000, { emissive: 0xffffff, emissiveMap: this.viewTex, emissiveIntensity: 1 }), -0.35, (WIN_Y0 + WIN_Y1) / 2, mid, { ry: Math.PI / 2 });
      this.box(R, 0.26, 0.035, len + 0.14, M.trim(), 0.06, WIN_Y0 - 0.015, mid, { r: 0.01 });
      this.box(R, 0.05, 0.36, len - 0.08, mat(0xf2efe8, { roughness: 1 }), 0.03, WIN_Y1 - 0.2, mid);
      this.box(R, 0.06, 0.06, len, M.aluminium(), 0.035, WIN_Y1 - 0.02, mid, { r: 0.02 });
    }

    // Wall graphics: company logo above windows, artwork, boss plaque
    const logo = logoTexture('IQX', 'SECURITIES  ·  CHỨNG KHOÁN');
    this.plane(R, 2.6, 0.65, mat(0xffffff, { map: logo, transparent: true, roughness: 0.3, metalness: 0.5 }), 0.02, 2.9, 7.2, { ry: Math.PI / 2 });
    this.frameArt(R, 1.0, 1.75, 0.02, 1.0, 0.75, 0, 7);
    this.frameArt(R, 0.02, 1.75, 15.0, 1.1, 0.8, Math.PI / 2, 11);
    this.box(R, 2.2, 0.8, 0.05, M.walnut(), 19.3, 1.85, 0.08, { r: 0.015 });
    this.plane(R, 2.0, 0.6, mat(0xffffff, { map: logoTexture('IQX', 'Chi nhánh Hà Nội'), transparent: true, roughness: 0.3, metalness: 0.6 }), 19.3, 1.85, 0.106);
  }

  /**
   * Shallow room behind the left wall made only of inward-facing planes, so it is invisible from outside the building
   * and only seen through its door opening. Origin at the wall's outer face, centred on the opening.
   */
  private backRoom(zc: number, w: number, h: number, walls: Material, floor: Material, ceil: Material) {
    const d = 0.8;
    const g = this.group(-0.15, zc);
    const R = g;
    this.plane(R, d, w, floor, -d / 2, 0.003, 0, { rx: -Math.PI / 2 });
    this.plane(R, d, w, ceil, -d / 2, h, 0, { rx: Math.PI / 2 });
    this.plane(R, w, h, walls, -d, h / 2, 0, { ry: Math.PI / 2 });
    this.plane(R, d, h, walls, -d / 2, h / 2, -w / 2);
    this.plane(R, d, h, walls, -d / 2, h / 2, w / 2, { ry: Math.PI });
    return { g, d };
  }

  private elevatorCar(z0: number, z1: number): void {
    const steel = mat(0xc9ced6, { map: brushedMetalTexture(), metalness: 0.8, roughness: 0.3 });
    const { g, d } = this.backRoom((z0 + z1) / 2, z1 - z0 + 0.3, DOOR_H + 0.05, steel, mat(0x2b2f36, { roughness: 0.4 }), this.glow(0xfff4e0, 1.4));
    this.box(g, 0.03, 0.04, z1 - z0, M.chrome(), -d + 0.04, 0.95, 0, { shadow: false });
    this.plane(g, 0.6, 1.0, mat(0xdfe8f2, { roughness: 0.05, metalness: 0.9 }), -d + 0.005, 1.5, 0, { ry: Math.PI / 2 });
  }

  private restroomVestibule(z0: number, z1: number): void {
    const tile = mat(0xffffff, { map: tileTexture(0xdfe7ea, 0xa9b4b8, 9), roughness: 0.25 });
    const { g, d } = this.backRoom((z0 + z1) / 2, z1 - z0 + 0.3, DOOR_H + 0.05, tile, mat(0x5b6168, { roughness: 0.5 }), this.glow(0xf4f8ff, 0.8));
    this.box(g, 0.4, 0.8, 0.45, M.whitePlastic(), -d + 0.2, 0.4, 0, { shadow: false });
    this.plane(g, 0.45, 0.6, mat(0xdfe8f2, { roughness: 0.05, metalness: 0.9 }), -d + 0.005, 1.45, 0, { ry: Math.PI / 2 });
  }

  // ------------------------------------------------------------ furniture

  /** Trading desk occupying cells (x,z)-(x+1,z); owner sits at (x+1, z+1.45) facing -Z. */
  desk(x: number, z: number, index: number): void {
    const g = this.group(x, z);
    const r = this.rnd;
    const metal = M.darkMetal();
    // Frame legs (side panels) & beam
    for (const lx of [0.06, 1.94]) {
      this.box(g, 0.05, 0.72, 0.06, metal, lx, 0.36, 0.15);
      this.box(g, 0.05, 0.72, 0.06, metal, lx, 0.36, 0.82);
      this.box(g, 0.06, 0.04, 0.78, metal, lx, 0.02, 0.48, { r: 0.015 });
      this.box(g, 0.05, 0.04, 0.72, metal, lx, 0.7, 0.48);
    }
    this.box(g, 1.84, 0.06, 0.04, metal, 1, 0.66, 0.15);
    this.box(g, 1.84, 0.34, 0.015, mat(0x353b46, { roughness: 0.7 }), 1, 0.45, 0.14);
    // Top
    this.box(g, 1.98, 0.035, 0.9, M.laminate(), 1, 0.74, 0.5, { r: 0.012 });
    this.box(g, 1.98, 0.012, 0.9, M.walnut(), 1, 0.719, 0.5);
    // Acoustic partition with aluminium cap and accent stripe
    this.box(g, 2.0, 0.46, 0.04, M.fabricBlue(), 1, 0.99, 0.03, { r: 0.015 });
    this.box(g, 2.0, 0.025, 0.06, M.aluminium(), 1, 1.23, 0.03, { r: 0.01 });
    this.box(g, 2.0, 0.02, 0.045, mat(0xf5a623, { roughness: 0.5, emissive: 0xf5a623, emissiveIntensity: 0.15 }), 1, 0.79, 0.03);
    // Monitor arm and two monitors angled toward the user
    this.cyl(g, 0.02, 0.02, 0.5, M.aluminium(), 1, 1.0, 0.16);
    this.box(g, 0.2, 0.012, 0.14, M.aluminium(), 1, 0.762, 0.16, { r: 0.005 });
    for (const side of [-1, 1]) {
      const mx = 1 + side * 0.37;
      this.box(g, 0.32, 0.03, 0.03, M.aluminium(), 1 + side * 0.17, 1.12, 0.2, { r: 0.01, ry: side * 0.15 });
      this.monitor(g, mx, 1.08, 0.27, 0.66, 0.4, -side * 0.16, this.screens.get(index * 2 + (side > 0 ? 1 : 0)));
    }
    // Keyboard, mouse, pad
    this.box(g, 0.46, 0.018, 0.15, M.blackPlastic(), 0.98, 0.767, 0.66, { r: 0.006 });
    this.plane(g, 0.44, 0.13, mat(0xffffff, { map: this.kbTex, roughness: 0.6 }), 0.98, 0.7765, 0.66, { rx: -Math.PI / 2 });
    this.box(g, 0.26, 0.004, 0.22, mat(0x1e2430, { roughness: 1 }), 1.42, 0.759, 0.68, { r: 0.002 });
    const mouse = this.sphere(g, 0.035, M.blackPlastic(), 1.42, 0.77, 0.68);
    mouse.scale.set(0.9, 0.45, 1.4);
    // Random accessories
    if (r() < 0.6) {
      this.cyl(g, 0.04, 0.035, 0.1, mat([0xffffff, 0xe76f51, 0x2a9d8f, 0xf4a261][Math.floor(r() * 4)], { roughness: 0.35 }), 0.2, 0.81, 0.62);
      const handle = new Mesh(new TorusGeometry(0.025, 0.007, 8, 16), M.whitePlastic());
      this.place(handle, g, 0.245, 0.81, 0.62, { ry: Math.PI / 2 });
    }
    if (r() < 0.55) for (let i = 0; i < 3; i++) this.box(g, 0.21, 0.004, 0.29, M.paper(), 1.72 + r() * 0.02, 0.76 + i * 0.005, 0.5 + r() * 0.04, { ry: (r() - 0.5) * 0.3 });
    if (r() < 0.5) {
      this.box(g, 0.18, 0.05, 0.2, M.blackPlastic(), 0.28, 0.785, 0.35, { r: 0.02, rx: -0.2 });
      this.box(g, 0.05, 0.03, 0.18, M.greyPlastic(), 0.21, 0.82, 0.35, { r: 0.012 });
    }
    if (r() < 0.35) this.succulent(g, 1.75, 0.76, 0.2);
    if (r() < 0.4) this.cyl(g, 0.12, 0.1, 0.3, mat(0x2d323c, { roughness: 0.6 }), 1.75, 0.15, 0.6);
    this.block(x, z, 2, 1);
  }

  bossDesk(x: number, z: number): void {
    const g = this.group(x, z);
    const w = M.walnut();
    this.box(g, 2.2, 0.06, 1.0, w, 1, 0.75, 0.5, { r: 0.02 });
    this.box(g, 1.9, 0.004, 0.55, mat(0x1d1f24, { roughness: 0.6 }), 1, 0.782, 0.62);
    for (const px of [0.25, 1.75]) {
      this.box(g, 0.46, 0.72, 0.9, w, px, 0.36, 0.5, { r: 0.012 });
      for (let i = 0; i < 3; i++) {
        this.box(g, 0.4, 0.005, 0.005, mat(0x2a1a10), px, 0.24 + i * 0.2, 0.952);
        this.box(g, 0.1, 0.012, 0.02, M.chrome(), px, 0.31 + i * 0.2, 0.96, { r: 0.004 });
      }
    }
    this.box(g, 1.1, 0.6, 0.03, w, 1, 0.42, 0.08);
    // Monitor, laptop, lamp, nameplate, documents
    this.box(g, 0.25, 0.012, 0.18, M.aluminium(), 0.8, 0.786, 0.22, { r: 0.006 });
    this.box(g, 0.05, 0.3, 0.03, M.aluminium(), 0.8, 0.93, 0.2);
    this.monitor(g, 0.8, 1.08, 0.24, 0.82, 0.48, 0.08, this.screens.get(41));
    this.box(g, 0.34, 0.012, 0.24, M.aluminium(), 1.45, 0.787, 0.6, { r: 0.008 });
    const lid = new Group();
    lid.position.set(1.45, 0.793, 0.48);
    lid.rotation.x = -0.25;
    g.add(lid);
    this.box(lid, 0.34, 0.23, 0.01, M.aluminium(), 0, 0.115, 0, { r: 0.006 });
    this.plane(lid, 0.31, 0.2, this.screenMat(this.screens.get(42)), 0, 0.115, 0.0056);
    this.cyl(g, 0.07, 0.08, 0.02, M.darkMetal(), 0.15, 0.79, 0.25);
    this.cyl(g, 0.01, 0.01, 0.4, M.darkMetal(), 0.15, 0.99, 0.25, { rz: 0.25 });
    this.cyl(g, 0.05, 0.09, 0.1, mat(0xf2d7a0, { emissive: 0xffd28a, emissiveIntensity: 0.8, roughness: 0.6 }), 0.22, 1.17, 0.3);
    this.box(g, 0.32, 0.07, 0.03, mat(0xd4af37, { metalness: 0.9, roughness: 0.25 }), 1.85, 0.815, 0.85, { rx: -0.4 });
    for (let i = 0; i < 4; i++) this.box(g, 0.22, 0.006, 0.3, M.paper(), 0.35 + this.rnd() * 0.04, 0.786 + i * 0.006, 0.7, { ry: this.rnd() * 0.3 });
    this.block(x, z, 2, 1);
  }

  credenza(x: number, z: number, w: number): void {
    const g = this.group(x, z);
    this.box(g, w, 0.68, 0.46, M.walnut(), w / 2, 0.36, 0.25, { r: 0.012 });
    this.box(g, w - 0.04, 0.05, 0.4, M.darkMetal(), w / 2, 0.025, 0.25);
    for (let i = 0; i < 4; i++) {
      this.box(g, 0.004, 0.6, 0.004, mat(0x2a1a10), (w / 4) * i + 0.01, 0.37, 0.482);
      this.box(g, 0.012, 0.16, 0.02, M.chrome(), (w / 4) * (i + 0.5) + 0.2, 0.42, 0.49, { r: 0.004 });
    }
    // Decor: vase, books, trophy
    this.cyl(g, 0.06, 0.09, 0.32, mat(0x2a9d8f, { roughness: 0.25 }), 0.3, 0.86, 0.25);
    for (let i = 0; i < 5; i++) this.box(g, 0.04, 0.24, 0.17, mat([0x8c2f39, 0x264653, 0xe9c46a, 0x3a3f48, 0xf4f1de][i], { roughness: 0.8 }), 0.75 + i * 0.045, 0.82, 0.25);
    const gold = mat(0xd4af37, { metalness: 1, roughness: 0.22 });
    this.box(g, 0.14, 0.05, 0.14, M.blackPlastic(), w - 0.4, 0.725, 0.25);
    this.cyl(g, 0.015, 0.03, 0.14, gold, w - 0.4, 0.82, 0.25);
    this.cyl(g, 0.08, 0.04, 0.1, gold, w - 0.4, 0.94, 0.25);
    this.block(Math.floor(x), Math.floor(z), Math.ceil(w), 1);
  }

  sofa(x: number, z: number, w: number): void {
    const g = this.group(x, z);
    const f = mat(0x51607a, { roughness: 1 });
    const f2 = mat(0x5d6d89, { roughness: 1 });
    this.box(g, w, 0.22, 0.82, f, w / 2, 0.17, 0.45, { r: 0.04 });
    for (const s of [0, 1]) {
      this.box(g, w / 2 - 0.12, 0.12, 0.62, f2, 0.13 + (w / 2 - 0.12) / 2 + s * (w / 2 - 0.08), 0.33, 0.52, { r: 0.05 });
      this.box(g, w / 2 - 0.12, 0.42, 0.16, f2, 0.13 + (w / 2 - 0.12) / 2 + s * (w / 2 - 0.08), 0.55, 0.18, { r: 0.06, rx: -0.1 });
    }
    this.box(g, w, 0.5, 0.14, f, w / 2, 0.45, 0.1, { r: 0.04 });
    for (const ax of [0.06, w - 0.06]) this.box(g, 0.14, 0.52, 0.82, f, ax, 0.3, 0.45, { r: 0.05 });
    for (const [px, col] of [[0.35, 0xf5a623], [w - 0.35, 0xe9e4da]] as const)
      this.box(g, 0.32, 0.3, 0.1, mat(col, { roughness: 1 }), px, 0.54, 0.3, { r: 0.05, rx: -0.25, rz: 0.1 });
    for (const lx of [0.1, w - 0.1]) for (const lz of [0.12, 0.8]) this.cyl(g, 0.02, 0.015, 0.06, M.darkMetal(), lx, 0.03, lz);
    // Coffee table
    this.box(g, 1.1, 0.02, 0.5, M.glass(), w / 2, 0.42, 1.35, { r: 0.008 });
    this.box(g, 1.0, 0.02, 0.42, M.walnut(), w / 2, 0.15, 1.35, { r: 0.008 });
    for (const lx of [-0.5, 0.5]) for (const lz of [-0.2, 0.2]) this.cyl(g, 0.012, 0.012, 0.42, M.darkMetal(), w / 2 + lx, 0.21, 1.35 + lz);
    this.box(g, 0.28, 0.02, 0.2, mat(0xc0392b, { roughness: 0.6 }), w / 2 - 0.2, 0.44, 1.32, { ry: 0.2 });
    this.box(g, 0.28, 0.02, 0.2, mat(0x2e86de, { roughness: 0.6 }), w / 2 - 0.18, 0.455, 1.34, { ry: -0.1 });
    this.block(Math.floor(x), Math.floor(z), Math.ceil(w), 2);
  }

  floorLamp(x: number, z: number, lights: boolean): void {
    const g = this.group(x, z);
    this.cyl(g, 0.16, 0.18, 0.03, M.darkMetal(), 0, 0.015, 0);
    this.cyl(g, 0.012, 0.012, 1.55, M.darkMetal(), 0, 0.8, 0);
    this.cyl(g, 0.12, 0.2, 0.26, mat(0xf3e3c3, { roughness: 0.9, emissive: 0xffd9a0, emissiveIntensity: 0.6 }), 0, 1.62, 0, { seg: 32 });
    if (lights) this.glowSpots.push({ x, z, r: 1.4, color: 0xffd29a });
    this.block(Math.floor(x), Math.floor(z));
  }

  meetingRoom(x: number, z: number, seats: { pos: Point; face: Point }[], tvX: number, tvZ: number): void {
    const g = this.group(x, z);
    const top = mat(0x3a2a1f, { roughness: 0.25 });
    this.box(g, 3.0, 0.05, 2.0, top, 1.5, 0.75, 1.0, { r: 0.02 });
    this.box(g, 2.9, 0.012, 0.16, mat(0x1a1d22, { roughness: 0.3 }), 1.5, 0.778, 1.0);
    for (const px of [0.7, 2.3]) {
      this.box(g, 0.12, 0.7, 1.2, M.darkMetal(), px, 0.37, 1.0, { r: 0.02 });
      this.box(g, 0.5, 0.03, 1.4, M.darkMetal(), px, 0.015, 1.0, { r: 0.01 });
    }
    // Conference phone, laptops, bottles, notepads
    this.cyl(g, 0.14, 0.16, 0.035, M.blackPlastic(), 1.5, 0.79, 1.0, { seg: 3 });
    for (const [lx, lz, ry] of [[0.6, 1.55, 0], [2.4, 0.45, Math.PI]] as const) {
      const l = new Group();
      l.position.set(lx, 0.776, lz);
      l.rotation.y = ry;
      g.add(l);
      this.box(l, 0.34, 0.012, 0.24, M.aluminium(), 0, 0.006, 0, { r: 0.006 });
      const lid = new Group();
      lid.position.set(0, 0.012, -0.12);
      lid.rotation.x = -0.3;
      l.add(lid);
      this.box(lid, 0.34, 0.23, 0.01, M.aluminium(), 0, 0.115, 0, { r: 0.006 });
      this.plane(lid, 0.31, 0.2, this.screenMat(this.screens.get(43 + Math.round(lx))), 0, 0.115, 0.0056);
    }
    for (const [bx, bz] of [[0.9, 0.4], [1.9, 1.6], [2.6, 1.5], [0.3, 0.6]]) {
      this.cyl(g, 0.03, 0.03, 0.2, mat(0xbfe3ff, { transparent: true, opacity: 0.5, roughness: 0.05 }), bx, 0.875, bz, { seg: 12 });
      this.cyl(g, 0.015, 0.015, 0.03, mat(0x2e86de), bx, 0.99, bz, { seg: 12 });
    }
    for (const [nx, nz] of [[1.2, 0.3], [2.0, 1.7], [0.35, 1.2]]) this.box(g, 0.15, 0.008, 0.21, mat(0xf7e9a8, { roughness: 0.9 }), nx, 0.78, nz, { ry: 0.2 });
    // Chairs around the table
    for (const s of seats) this.chair(s.pos.x, s.pos.y, Math.atan2(-s.face.x, -s.face.y), 0x4a3f5c);
    // TV on a stand facing -X
    const tv = this.group(tvX, tvZ, -Math.PI / 2);
    for (const lx of [-0.5, 0.5]) {
      this.box(tv, 0.05, 1.4, 0.05, M.darkMetal(), lx, 0.7, 0);
      this.box(tv, 0.08, 0.04, 0.6, M.darkMetal(), lx, 0.02, 0, { r: 0.01 });
    }
    this.box(tv, 1.7, 0.98, 0.05, M.blackPlastic(), 0, 1.45, 0.03, { r: 0.01 });
    this.plane(tv, 1.64, 0.92, this.screenMat(this.screens.get(3), 1.2), 0, 1.45, 0.056);
    this.block(x, z, 3, 2);
    this.block(Math.floor(tvX), Math.floor(tvZ - 0.5), 1, 2);
  }

  /** Bookcase against the left wall spanning cells (x, z..z+len-1). */
  bookcase(x: number, z: number, len: number): void {
    const g = this.group(x, z);
    const r = this.rnd;
    const w = M.oak();
    const D = 0.42;
    const H = 2.1;
    this.box(g, D, H, 0.03, w, D / 2, H / 2, 0.015);
    this.box(g, D, H, 0.03, w, D / 2, H / 2, len - 0.015);
    this.box(g, 0.02, H, len, mat(0x7a5a3c, { roughness: 0.8 }), 0.01, H / 2, len / 2);
    const shelves = [0.06, 0.48, 0.9, 1.32, 1.74, H - 0.015];
    for (const y of shelves) this.box(g, D, 0.03, len, w, D / 2, y, len / 2);
    for (let i = 1; i < len; i++) this.box(g, D, H, 0.025, w, D / 2, H / 2, i);
    const colors = [0x8c2f39, 0x264653, 0xe9c46a, 0x2a9d8f, 0x3a3f48, 0xf4f1de, 0x6a4c93, 0xe76f51, 0x1d3557];
    for (let s = 0; s < shelves.length - 1; s++) {
      let pz = 0.05;
      while (pz < len - 0.08) {
        if (r() < 0.07) {
          pz += 0.15;
          continue;
        }
        if (r() < 0.05) {
          this.sphere(g, 0.07, mat(colors[Math.floor(r() * colors.length)], { roughness: 0.3 }), 0.2, shelves[s] + 0.09, pz + 0.07, { seg: 14 });
          pz += 0.18;
          continue;
        }
        const bw = 0.025 + r() * 0.035;
        const bh = 0.24 + r() * 0.12;
        const bd = 0.22 + r() * 0.1;
        const lean = r() < 0.06 ? 0.25 : 0;
        this.box(g, bd, bh, bw, mat(colors[Math.floor(r() * colors.length)], { roughness: 0.75 }), 0.03 + bd / 2, shelves[s] + 0.015 + bh / 2, pz + bw / 2, { rx: lean });
        pz += bw + 0.004 + lean * 0.2;
      }
    }
    this.block(x, z, 1, len);
  }

  printer(x: number, z: number): void {
    const g = this.group(x + 0.5, z + 0.45);
    this.box(g, 0.66, 0.5, 0.58, M.greyPlastic(), 0, 0.27, 0, { r: 0.02 });
    for (let i = 0; i < 2; i++) this.box(g, 0.6, 0.004, 0.004, M.blackPlastic(), 0, 0.15 + i * 0.18, 0.292);
    this.box(g, 0.66, 0.36, 0.58, M.whitePlastic(), 0, 0.7, 0, { r: 0.025 });
    this.box(g, 0.5, 0.03, 0.3, M.greyPlastic(), 0, 0.64, 0.2, { r: 0.008 });
    for (let i = 0; i < 4; i++) this.box(g, 0.21, 0.004, 0.29, M.paper(), 0, 0.66 + i * 0.005, 0.2);
    this.box(g, 0.66, 0.06, 0.58, M.whitePlastic(), 0, 0.91, 0, { r: 0.02 });
    const panel = this.box(g, 0.26, 0.02, 0.12, M.blackPlastic(), 0.15, 0.95, 0.24, { r: 0.006, rx: -0.4 });
    void panel;
    this.plane(g, 0.18, 0.08, this.screenMat(this.screens.get(5), 0.6), 0.15, 0.962, 0.245, { rx: -Math.PI / 2 + 0.4 });
    this.box(g, 0.4, 0.28, 0.3, mat(0xd8c3a0, { roughness: 0.9 }), 0.75, 0.14, 0.05, { r: 0.01 });
    this.block(x, z);
  }

  waterCooler(x: number, z: number): void {
    const g = this.group(x + 0.4, z + 0.5);
    this.box(g, 0.34, 0.96, 0.34, M.whitePlastic(), 0, 0.48, 0, { r: 0.03 });
    this.box(g, 0.2, 0.2, 0.02, M.greyPlastic(), 0.17, 0.74, 0, { r: 0.01, ry: Math.PI / 2 });
    this.box(g, 0.03, 0.04, 0.03, mat(0x2e86de), 0.2, 0.8, -0.05, { r: 0.005 });
    this.box(g, 0.03, 0.04, 0.03, mat(0xc0392b), 0.2, 0.8, 0.05, { r: 0.005 });
    this.box(g, 0.12, 0.02, 0.18, M.greyPlastic(), 0.2, 0.62, 0, { r: 0.005 });
    const water = mat(0x7fc8ff, { roughness: 0.05, transparent: true, opacity: 0.55, envMapIntensity: 2 });
    this.cyl(g, 0.14, 0.14, 0.34, water, 0, 1.17, 0, { seg: 32, shadow: false });
    this.sphere(g, 0.14, water, 0, 1.34, 0, { seg: 24, shadow: false }).scale.set(1, 0.5, 1);
    this.cyl(g, 0.045, 0.045, 0.05, water, 0, 0.98, 0, { seg: 16, shadow: false });
    for (let i = 0; i < 4; i++) this.cyl(g, 0.03, 0.022, 0.07, M.paper(), -0.12 + i * 0.004, 0.995 + i * 0.012, 0.21, { seg: 12 });
    this.block(x, z);
  }

  pantry(x: number, z0: number, len: number): void {
    const g = this.group(x, z0);
    const D = 0.62;
    const H = 0.88;
    const doorMat = mat(0x7d8f88, { roughness: 0.55 });
    this.box(g, D - 0.06, 0.08, len, M.skirting(), (D - 0.06) / 2, 0.04, len / 2);
    this.box(g, D, H - 0.08, len, M.whitePlastic(), D / 2, 0.08 + (H - 0.08) / 2, len / 2);
    const doors = Math.round(len / 0.5);
    for (let i = 0; i < doors; i++) {
      const dz = (i + 0.5) * (len / doors);
      this.box(g, 0.02, H - 0.14, len / doors - 0.012, doorMat, D + 0.005, 0.08 + (H - 0.08) / 2, dz, { r: 0.006 });
      this.box(g, 0.025, 0.012, 0.16, M.chrome(), D + 0.025, H - 0.12, dz, { r: 0.005 });
    }
    const stone = mat(0x2f3338, { roughness: 0.18, metalness: 0.1 });
    this.box(g, D + 0.05, 0.04, len + 0.02, stone, (D + 0.05) / 2, H + 0.02, len / 2, { r: 0.006 });
    this.box(g, 0.02, 0.62, len, mat(0xdfe6e8, { roughness: 0.2 }), 0.012, H + 0.35, len / 2);
    // Upper cabinets with LED strip
    this.box(g, 0.36, 0.72, len, M.whitePlastic(), 0.18, 1.95, len / 2);
    for (let i = 0; i < doors; i++) {
      const dz = (i + 0.5) * (len / doors);
      this.box(g, 0.015, 0.68, len / doors - 0.012, doorMat, 0.365, 1.95, dz, { r: 0.006 });
      this.box(g, 0.02, 0.012, 0.16, M.chrome(), 0.38, 1.64, dz, { r: 0.005 });
    }
    this.box(g, 0.03, 0.008, len - 0.1, mat(0xffffff, { emissive: 0xfff1d6, emissiveIntensity: 1.2 }), 0.3, 1.585, len / 2, { shadow: false });
    // Espresso machine
    const cm = this.group(0.27, 0.45, 0, g);
    this.box(cm, 0.36, 0.42, 0.34, M.chrome(), 0, H + 0.25, 0, { r: 0.02 });
    this.box(cm, 0.37, 0.08, 0.35, M.blackPlastic(), 0, H + 0.46, 0, { r: 0.015 });
    this.box(cm, 0.12, 0.05, 0.3, M.blackPlastic(), 0.18, H + 0.08, 0, { r: 0.008 });
    this.cyl(cm, 0.03, 0.03, 0.06, M.darkMetal(), 0.17, H + 0.24, -0.06, { seg: 16 });
    this.cyl(cm, 0.03, 0.03, 0.06, M.darkMetal(), 0.17, H + 0.24, 0.06, { seg: 16 });
    this.box(cm, 0.012, 0.03, 0.06, mat(0xff4d4f, { emissive: 0xff4d4f, emissiveIntensity: 2 }), 0.185, H + 0.38, 0, { shadow: false });
    for (let i = 0; i < 3; i++) this.cyl(cm, 0.03, 0.025, 0.06, M.whitePlastic(), -0.08 + i * 0.08, H + 0.53, 0.05, { seg: 14 });
    // Sink + faucet
    this.box(g, 0.4, 0.006, 0.5, M.chrome(), 0.33, H + 0.042, 1.55);
    this.box(g, 0.34, 0.006, 0.44, M.darkMetal(), 0.33, H + 0.046, 1.55);
    this.cyl(g, 0.015, 0.015, 0.3, M.chrome(), 0.12, H + 0.19, 1.55, { seg: 12 });
    this.box(g, 0.2, 0.02, 0.02, M.chrome(), 0.21, H + 0.33, 1.55, { r: 0.008 });
    // Microwave
    const mw = this.group(0.3, len - 0.4, 0, g);
    this.box(mw, 0.38, 0.26, 0.48, M.whitePlastic(), 0, H + 0.17, 0, { r: 0.015 });
    this.box(mw, 0.01, 0.2, 0.32, mat(0x111418, { roughness: 0.1 }), 0.19, H + 0.17, -0.06);
    this.box(mw, 0.01, 0.2, 0.1, M.greyPlastic(), 0.19, H + 0.17, 0.17);
    this.block(x, z0, 1, len);
  }

  fridge(x: number, z: number): void {
    const g = this.group(x + 0.38, z + 0.5);
    const steel = mat(0xc9ced6, { metalness: 0.75, roughness: 0.3 });
    this.box(g, 0.7, 1.86, 0.74, steel, 0, 0.93, 0, { r: 0.02 });
    this.box(g, 0.004, 0.01, 0.72, M.darkMetal(), 0.352, 1.25, 0);
    for (const y of [1.55, 0.75]) this.box(g, 0.04, 0.4, 0.025, M.darkMetal(), 0.37, y, -0.28, { r: 0.01 });
    this.box(g, 0.004, 0.18, 0.14, mat(0x111418, { emissive: 0x3aa0ff, emissiveIntensity: 0.4 }), 0.352, 1.45, 0.12);
    this.block(x, z);
  }

  pantryTable(x: number, z: number): void {
    const g = this.group(x, z);
    this.cyl(g, 0.45, 0.45, 0.035, M.whitePlastic(), 0, 0.74, 0, { seg: 40 });
    this.cyl(g, 0.035, 0.035, 0.7, M.chrome(), 0, 0.37, 0);
    this.cyl(g, 0.24, 0.26, 0.02, M.darkMetal(), 0, 0.01, 0, { seg: 32 });
    this.cyl(g, 0.04, 0.035, 0.09, mat(0xe76f51, { roughness: 0.35 }), 0.12, 0.8, -0.1);
    this.cyl(g, 0.07, 0.07, 0.01, mat(0xf4f1de), -0.15, 0.762, 0.1, { seg: 24 });
    for (const [sx, sz] of [[0.75, 0], [0, 0.75]]) {
      this.cyl(g, 0.17, 0.17, 0.05, mat(0xf5a623, { roughness: 0.7 }), sx, 0.64, sz, { seg: 24 });
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + 0.4;
        this.cyl(g, 0.012, 0.012, 0.64, M.darkMetal(), sx + Math.cos(a) * 0.12, 0.31, sz + Math.sin(a) * 0.12, { seg: 8, rx: Math.sin(a) * 0.1, rz: -Math.cos(a) * 0.1 });
      }
    }
    this.block(Math.floor(x), Math.floor(z));
  }

  /** Glass partition along X = x+0.5 for cells z0..z1, skipping door rows. */
  glassColumn(x: number, z0: number, z1: number, doors: number[]): void {
    const R = this.staticRoot;
    const px = x + 0.5;
    const H = 2.75;
    for (let z = z0; z <= z1; z++) {
      this.box(R, 0.06, H, 0.05, M.aluminium(), px, H / 2, z, { r: 0.008 });
      if (doors.includes(z)) {
        this.box(R, 0.08, 0.12, 1, M.aluminium(), px, H - 0.06, z + 0.5);
        this.box(R, 0.06, H, 0.05, M.aluminium(), px, H / 2, z + 1, { r: 0.008 });
        continue;
      }
      this.box(R, 0.06, 0.06, 1, M.aluminium(), px, 0.03, z + 0.5);
      this.box(R, 0.06, 0.06, 1, M.aluminium(), px, H - 0.03, z + 0.5);
      this.plane(R, 1, H - 0.12, M.glass(), px, H / 2, z + 0.5, { ry: Math.PI / 2 });
      this.box(R, 0.012, 0.22, 0.98, M.frosted(), px, 1.2, z + 0.5, { shadow: false });
      this.grid.block(x, z);
    }
    this.box(R, 0.06, H, 0.05, M.aluminium(), px, H / 2, z1 + 1, { r: 0.008 });
  }

  /** Glass partition along Z = z+0.5 for cells x0..x1. */
  glassRow(z: number, x0: number, x1: number): void {
    const R = this.staticRoot;
    const pz = z + 0.5;
    const H = 2.75;
    for (let x = x0; x <= x1; x++) {
      this.box(R, 0.05, H, 0.06, M.aluminium(), x + 1, H / 2, pz, { r: 0.008 });
      this.box(R, 1, 0.06, 0.06, M.aluminium(), x + 0.5, 0.03, pz);
      this.box(R, 1, 0.06, 0.06, M.aluminium(), x + 0.5, H - 0.03, pz);
      this.plane(R, 1, H - 0.12, M.glass(), x + 0.5, H / 2, pz);
      this.box(R, 0.98, 0.22, 0.012, M.frosted(), x + 0.5, 1.2, pz, { shadow: false });
      this.grid.block(x, z);
    }
  }
}
