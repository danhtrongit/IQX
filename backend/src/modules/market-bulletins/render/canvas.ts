/**
 * Mô hình vẽ trung gian của bản tin: một danh sách nguyên hàm vector (chữ, hình chữ nhật, đường, đa giác,
 * liên kết) theo px CSS ở 96 dpi. Một bộ dựng trang tạo danh sách này; hai bộ xuất (SVG cho xem trước,
 * PDF cho file Public) chỉ đọc nó, nên xem trước và PDF giống nhau theo cấu trúc.
 */

export type TextAnchor = 'start' | 'middle' | 'end';

export type TextStyle = {
  size?: number;
  weight?: number;
  color?: string;
  anchor?: TextAnchor;
  /** Giãn chữ (px), như `letter-spacing` của CSS. */
  spacing?: number;
  /** Viền trắng quanh chữ để đọc được khi đè lên nến. */
  halo?: { color: string; width: number };
};

export type ShapeStyle = {
  fill?: string;
  stroke?: string;
  sw?: number;
  /** Bán kính bo góc của hình chữ nhật. */
  rx?: number;
  /** Độ trong suốt 0..1. */
  op?: number;
  /** Nét đứt dạng "6 4". */
  dash?: string;
};

export type Prim =
  | ({ k: 'rect'; x: number; y: number; w: number; h: number } & ShapeStyle)
  | {
      k: 'line';
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      stroke: string;
      sw: number;
      dash?: string;
      op?: number;
    }
  | ({ k: 'poly'; pts: [number, number][]; closed: boolean } & ShapeStyle)
  | { k: 'circle'; cx: number; cy: number; r: number; fill?: string; stroke?: string; sw?: number }
  | {
      k: 'text';
      x: number;
      y: number;
      text: string;
      size: number;
      weight: number;
      color: string;
      anchor: TextAnchor;
      spacing: number;
      halo?: { color: string; width: number };
    }
  | { k: 'link'; x: number; y: number; w: number; h: number; url: string };

export type PageDoc = { width: number; height: number; prims: Prim[] };

export type Point = readonly [number, number];

/** Bút vẽ lên một danh sách nguyên hàm, có thể dịch gốc toạ độ (`at`) để vẽ biểu đồ trong khung. */
export class Canvas {
  constructor(
    readonly prims: Prim[] = [],
    private readonly ox = 0,
    private readonly oy = 0,
  ) {}

  at(dx: number, dy: number): Canvas {
    return new Canvas(this.prims, this.ox + dx, this.oy + dy);
  }

  rect(x: number, y: number, w: number, h: number, style: ShapeStyle = {}): void {
    this.prims.push({ k: 'rect', x: x + this.ox, y: y + this.oy, w, h, ...style });
  }

  line(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    stroke: string,
    sw = 1,
    dash?: string,
    op?: number,
  ): void {
    this.prims.push({
      k: 'line',
      x1: x1 + this.ox,
      y1: y1 + this.oy,
      x2: x2 + this.ox,
      y2: y2 + this.oy,
      stroke,
      sw,
      ...(dash ? { dash } : {}),
      ...(op !== undefined ? { op } : {}),
    });
  }

  /** Đường gấp khúc; phần tử null làm đứt đường (thiếu số liệu không bao giờ là 0). */
  polyline(points: readonly (Point | null)[], stroke: string, sw = 1.4, dash?: string): void {
    let run: [number, number][] = [];
    const flush = () => {
      if (run.length > 1)
        this.prims.push({
          k: 'poly',
          pts: run,
          closed: false,
          stroke,
          sw,
          ...(dash ? { dash } : {}),
        });
      run = [];
    };
    for (const point of points) {
      if (point === null) flush();
      else run.push([point[0] + this.ox, point[1] + this.oy]);
    }
    flush();
  }

  polygon(points: readonly Point[], style: ShapeStyle): void {
    this.prims.push({
      k: 'poly',
      pts: points.map(([x, y]) => [x + this.ox, y + this.oy] as [number, number]),
      closed: true,
      ...style,
    });
  }

  circle(
    cx: number,
    cy: number,
    r: number,
    style: { fill?: string; stroke?: string; sw?: number } = {},
  ): void {
    this.prims.push({ k: 'circle', cx: cx + this.ox, cy: cy + this.oy, r, ...style });
  }

  text(x: number, y: number, text: string, style: TextStyle = {}): void {
    if (!text) return;
    this.prims.push({
      k: 'text',
      x: x + this.ox,
      y: y + this.oy,
      text,
      size: style.size ?? 10,
      weight: style.weight ?? 500,
      color: style.color ?? '#1e3a5f',
      anchor: style.anchor ?? 'start',
      spacing: style.spacing ?? 0,
      ...(style.halo ? { halo: style.halo } : {}),
    });
  }

  link(x: number, y: number, w: number, h: number, url: string): void {
    this.prims.push({ k: 'link', x: x + this.ox, y: y + this.oy, w, h, url });
  }
}

export function newPage(width: number, height: number): { page: PageDoc; canvas: Canvas } {
  const prims: Prim[] = [];
  return { page: { width, height, prims }, canvas: new Canvas(prims) };
}

/** Bảng màu của bản tin (theo HTML mẫu); bản tin là tài liệu in nên không dùng token của giao diện web. */
export const COL = {
  navy: '#0b2a4a',
  navy2: '#123d6a',
  ink: '#0f2740',
  ink2: '#1e3a5f',
  grid: '#e3ebf4',
  line: '#c9d7e6',
  soft: '#eef4fa',
  soft2: '#f6f9fc',
  up: '#15803d',
  upf: '#16a34a',
  dn: '#dc2626',
  flat: '#a16207',
  s20: '#2563eb',
  s50: '#f97316',
  s200: '#7c3aed',
  rsi: '#7c3aed',
  amber: '#f59e0b',
  amberText: '#b45309',
  white: '#ffffff',
  scenarioBg: '#f1f5fa',
} as const;
