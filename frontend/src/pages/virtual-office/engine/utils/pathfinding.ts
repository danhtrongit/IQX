import type { Cell } from '../types';

/** Grid navigation with 4-directional A*. */
export class NavGrid {
  private readonly blocked: Uint8Array;

  readonly width: number;
  readonly height: number;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.blocked = new Uint8Array(width * height);
  }

  inside(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  block(x: number, y: number): void {
    if (this.inside(x, y)) this.blocked[y * this.width + x] = 1;
  }

  isWalkable(x: number, y: number): boolean {
    return this.inside(x, y) && this.blocked[y * this.width + x] === 0;
  }

  findPath(start: Cell, goal: Cell): Cell[] | null {
    const { width: w } = this;
    if (!this.inside(start.x, start.y) || !this.isWalkable(goal.x, goal.y)) return null;
    const size = w * this.height;
    const g = new Float32Array(size).fill(Infinity);
    const came = new Int32Array(size).fill(-1);
    const closed = new Uint8Array(size);
    const s = start.y * w + start.x;
    const t = goal.y * w + goal.x;
    const h = (i: number) => Math.abs((i % w) - goal.x) + Math.abs(Math.floor(i / w) - goal.y);
    const open: number[] = [s];
    const f = new Float32Array(size).fill(Infinity);
    g[s] = 0;
    f[s] = h(s);

    while (open.length) {
      let bi = 0;
      for (let i = 1; i < open.length; i++) if (f[open[i]] < f[open[bi]]) bi = i;
      const cur = open[bi];
      open.splice(bi, 1);
      if (cur === t) break;
      closed[cur] = 1;
      const cx = cur % w;
      const cy = Math.floor(cur / w);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (!this.isWalkable(nx, ny)) continue;
        const n = ny * w + nx;
        if (closed[n]) continue;
        const ng = g[cur] + 1;
        if (ng < g[n]) {
          if (g[n] === Infinity) open.push(n);
          g[n] = ng;
          f[n] = ng + h(n);
          came[n] = cur;
        }
      }
    }

    if (s !== t && came[t] === -1) return null;
    const path: Cell[] = [];
    for (let i = t; i !== -1; i = came[i]) {
      path.push({ x: i % w, y: Math.floor(i / w) });
      if (i === s) break;
    }
    return path.reverse();
  }
}
