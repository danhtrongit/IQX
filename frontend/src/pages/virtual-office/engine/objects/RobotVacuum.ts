import type { Group } from 'three';
import type { Cell, Point } from '../types';
import { cellCenter, rand } from '../utils/helpers';
import type { NavGrid } from '../utils/pathfinding';

const SPEED = 0.35; // m/s
const NIGHT_SPEED = 0.55;
const TURN = 3; // rad/s

/** Wanders between random walkable cells, pausing now and then. More active at night. */
export class RobotVacuum {
  readonly mesh: Group;
  private readonly grid: NavGrid;
  private pos: Point;
  private path: Point[] = [];
  private pause = 2;
  private yaw = 0;
  night = false;

  constructor(mesh: Group, grid: NavGrid, dock: Cell) {
    this.mesh = mesh;
    this.grid = grid;
    this.pos = cellCenter(dock);
    this.mesh.position.set(this.pos.x, 0, this.pos.y);
  }

  private plan(): void {
    const from = { x: Math.floor(this.pos.x), y: Math.floor(this.pos.y) };
    for (let i = 0; i < 20; i++) {
      const to = { x: Math.floor(Math.random() * this.grid.width), y: Math.floor(Math.random() * this.grid.height) };
      if (!this.grid.isWalkable(to.x, to.y)) continue;
      const cells = this.grid.findPath(from, to);
      if (cells && cells.length > 2) {
        this.path = cells.slice(1).map((c) => ({ x: c.x + 0.5 + rand(-0.25, 0.25), y: c.y + 0.5 + rand(-0.25, 0.25) }));
        return;
      }
    }
  }

  update(dt: number): void {
    if (this.pause > 0) {
      this.pause -= dt;
      this.mesh.rotation.y += dt * 1.2; // spins in place while "thinking"
      this.yaw = this.mesh.rotation.y;
      return;
    }
    if (!this.path.length) {
      this.plan();
      this.pause = this.night ? rand(0.5, 2) : rand(3, 9);
      return;
    }
    const t = this.path[0];
    const dx = t.x - this.pos.x;
    const dy = t.y - this.pos.y;
    const d = Math.hypot(dx, dy);
    const want = Math.atan2(dx, dy);
    let diff = Math.atan2(Math.sin(want - this.yaw), Math.cos(want - this.yaw));
    const turn = TURN * dt;
    this.yaw += Math.abs(diff) < turn ? diff : Math.sign(diff) * turn;
    diff = Math.atan2(Math.sin(want - this.yaw), Math.cos(want - this.yaw));
    if (Math.abs(diff) < 0.5) {
      const step = (this.night ? NIGHT_SPEED : SPEED) * dt;
      if (d <= step) {
        this.pos = t;
        this.path.shift();
      } else this.pos = { x: this.pos.x + (dx / d) * step, y: this.pos.y + (dy / d) * step };
    }
    this.mesh.position.set(this.pos.x, 0, this.pos.y);
    this.mesh.rotation.y = this.yaw;
  }
}
