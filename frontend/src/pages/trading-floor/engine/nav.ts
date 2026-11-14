/** Walkable grid with 8-way A* and line-of-sight smoothing. World units throughout. */

export type Point = { x: number; y: number }

const SQRT2 = Math.SQRT2
const DIRS: [number, number, number][] = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, SQRT2],
  [1, -1, SQRT2],
  [-1, 1, SQRT2],
  [-1, -1, SQRT2],
]

export class NavGrid {
  readonly cols: number
  readonly rows: number
  readonly cell: number
  private readonly blocked: Uint8Array

  constructor(width: number, height: number, cell: number) {
    this.cell = cell
    this.cols = Math.ceil(width / cell)
    this.rows = Math.ceil(height / cell)
    this.blocked = new Uint8Array(this.cols * this.rows)
  }

  /** Blocks every cell that the world rectangle touches. */
  blockRect(x: number, y: number, w: number, h: number): void {
    const c0 = Math.max(0, Math.floor(x / this.cell))
    const r0 = Math.max(0, Math.floor(y / this.cell))
    const c1 = Math.min(this.cols - 1, Math.floor((x + w - 0.001) / this.cell))
    const r1 = Math.min(this.rows - 1, Math.floor((y + h - 0.001) / this.cell))
    for (let r = r0; r <= r1; r += 1)
      for (let c = c0; c <= c1; c += 1) this.blocked[r * this.cols + c] = 1
  }

  freeCell(c: number, r: number): boolean {
    return (
      c >= 0 &&
      r >= 0 &&
      c < this.cols &&
      r < this.rows &&
      this.blocked[r * this.cols + c] === 0
    )
  }

  free(p: Point): boolean {
    return this.freeCell(
      Math.floor(p.x / this.cell),
      Math.floor(p.y / this.cell)
    )
  }

  private centre(c: number, r: number): Point {
    return { x: (c + 0.5) * this.cell, y: (r + 0.5) * this.cell }
  }

  /** The free cell closest to a point (breadth-first), or null when the grid has none. */
  nearestFree(p: Point): Point | null {
    const sc = Math.max(0, Math.min(this.cols - 1, Math.floor(p.x / this.cell)))
    const sr = Math.max(0, Math.min(this.rows - 1, Math.floor(p.y / this.cell)))
    if (this.freeCell(sc, sr)) return p
    const seen = new Uint8Array(this.cols * this.rows)
    const queue = [sc, sr]
    seen[sr * this.cols + sc] = 1
    for (let i = 0; i < queue.length; i += 2) {
      const c = queue[i]
      const r = queue[i + 1]
      if (this.freeCell(c, r)) return this.centre(c, r)
      for (const [dc, dr] of DIRS) {
        const nc = c + dc
        const nr = r + dr
        if (
          nc < 0 ||
          nr < 0 ||
          nc >= this.cols ||
          nr >= this.rows ||
          seen[nr * this.cols + nc]
        )
          continue
        seen[nr * this.cols + nc] = 1
        queue.push(nc, nr)
      }
    }
    return null
  }

  /** True when a straight walk from a to b crosses only free cells. */
  lineFree(a: Point, b: Point): boolean {
    const dist = Math.hypot(b.x - a.x, b.y - a.y)
    const steps = Math.max(1, Math.ceil(dist / (this.cell * 0.35)))
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps
      if (!this.free({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }))
        return false
    }
    return true
  }

  /** Waypoints from `from` to the free point nearest `to` (the start is not included). Empty when unreachable. */
  findPath(from: Point, to: Point): Point[] {
    const goal = this.nearestFree(to)
    const start = this.nearestFree(from)
    if (!goal || !start) return []
    if (this.lineFree(from, goal)) return [goal]

    const cols = this.cols
    const sc = Math.floor(start.x / this.cell)
    const sr = Math.floor(start.y / this.cell)
    const gc = Math.floor(goal.x / this.cell)
    const gr = Math.floor(goal.y / this.cell)
    const n = cols * this.rows
    const g = new Float32Array(n).fill(Infinity)
    const parent = new Int32Array(n).fill(-1)
    const closed = new Uint8Array(n)
    const heap = new MinHeap()
    const h = (c: number, r: number): number => {
      const dx = Math.abs(c - gc)
      const dy = Math.abs(r - gr)
      return Math.max(dx, dy) + (SQRT2 - 1) * Math.min(dx, dy)
    }
    const s = sr * cols + sc
    g[s] = 0
    heap.push(s, h(sc, sr))
    let found = false
    while (heap.size) {
      const cur = heap.pop()
      if (closed[cur]) continue
      closed[cur] = 1
      const c = cur % cols
      const r = (cur - c) / cols
      if (c === gc && r === gr) {
        found = true
        break
      }
      for (const [dc, dr, cost] of DIRS) {
        const nc = c + dc
        const nr = r + dr
        if (!this.freeCell(nc, nr)) continue
        // No corner cutting: a diagonal step needs both side cells free.
        if (
          dc &&
          dr &&
          (!this.freeCell(c + dc, r) || !this.freeCell(c, r + dr))
        )
          continue
        const ni = nr * cols + nc
        const ng = g[cur] + cost
        if (ng < g[ni]) {
          g[ni] = ng
          parent[ni] = cur
          heap.push(ni, ng + h(nc, nr))
        }
      }
    }
    if (!found) return []
    const cells: Point[] = []
    for (let i = gr * cols + gc; i !== -1 && i !== s; i = parent[i]) {
      const c = i % cols
      cells.push(this.centre(c, (i - c) / cols))
    }
    cells.reverse()
    cells[cells.length - 1] = goal
    // String pulling: skip waypoints that can be seen past.
    const out: Point[] = []
    let anchor = from
    for (let i = 0; i < cells.length; i += 1) {
      const next = cells[i + 1]
      if (next && this.lineFree(anchor, next)) continue
      out.push(cells[i])
      anchor = cells[i]
    }
    return out
  }
}

class MinHeap {
  private readonly ids: number[] = []
  private readonly keys: number[] = []

  get size(): number {
    return this.ids.length
  }

  push(id: number, key: number): void {
    const { ids, keys } = this
    let i = ids.length
    ids.push(id)
    keys.push(key)
    while (i > 0) {
      const p = (i - 1) >> 1
      if (keys[p] <= key) break
      ids[i] = ids[p]
      keys[i] = keys[p]
      i = p
    }
    ids[i] = id
    keys[i] = key
  }

  pop(): number {
    const { ids, keys } = this
    const top = ids[0]
    const lastId = ids.pop()!
    const lastKey = keys.pop()!
    if (ids.length) {
      let i = 0
      for (;;) {
        const l = 2 * i + 1
        const r = l + 1
        let m = i
        let mk = lastKey
        if (l < ids.length && keys[l] < mk) {
          m = l
          mk = keys[l]
        }
        if (r < ids.length && keys[r] < mk) m = r
        if (m === i) break
        ids[i] = ids[m]
        keys[i] = keys[m]
        i = m
      }
      ids[i] = lastId
      keys[i] = lastKey
    }
    return top
  }
}
