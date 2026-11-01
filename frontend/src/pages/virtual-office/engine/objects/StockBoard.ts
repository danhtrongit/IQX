import { type CanvasTexture, Group, Mesh, MeshStandardMaterial, PlaneGeometry } from 'three';
import { canvas, toTexture } from '../utils/canvasTextures';
import { M } from '../utils/materials';
import type { Market } from '../utils/market';
import { DASH, fmt, fmtSigned, timeOf } from '../utils/format';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

const CW = 2600;
const CH = 520;

/** Large LED price board on the back wall (plane z = 0), plus a digital clock. */
export class StockBoard {
  readonly group = new Group();
  private readonly ctx: CanvasRenderingContext2D;
  private readonly tex: CanvasTexture;
  private readonly clockCtx: CanvasRenderingContext2D;
  private readonly clockTex: CanvasTexture;

  constructor(x0: number, x1: number, y0: number, y1: number) {
    const w = x1 - x0;
    const h = y1 - y0;
    const [c, ctx] = canvas(CW, CH);
    this.ctx = ctx;
    this.tex = toTexture(c);
    const frame = new Mesh(new RoundedBoxGeometry(w + 0.16, h + 0.16, 0.08, 3, 0.03), M.darkMetal());
    frame.position.set((x0 + x1) / 2, (y0 + y1) / 2, 0.04);
    frame.castShadow = true;
    const screenMat = new MeshStandardMaterial({ color: 0x000000, emissive: 0xffffff, emissiveMap: this.tex, emissiveIntensity: 1.0, roughness: 0.25 });
    const screen = new Mesh(new PlaneGeometry(w, h), screenMat);
    screen.position.set((x0 + x1) / 2, (y0 + y1) / 2, 0.082);
    this.group.add(frame, screen);

    const [cc, cctx] = canvas(512, 160);
    this.clockCtx = cctx;
    this.clockTex = toTexture(cc);
    const cf = new Mesh(new RoundedBoxGeometry(1.7, 0.56, 0.08, 3, 0.03), M.darkMetal());
    cf.position.set(14.2, 2.75, 0.04);
    const cs = new Mesh(
      new PlaneGeometry(1.6, 0.48),
      new MeshStandardMaterial({ color: 0x000000, emissive: 0xffffff, emissiveMap: this.clockTex, emissiveIntensity: 1.0 }),
    );
    cs.position.set(14.2, 2.75, 0.082);
    this.group.add(cf, cs);
  }

  redraw(m: Market): void {
    const { ctx } = this;
    const pal = m.palette;
    ctx.fillStyle = '#04060b';
    ctx.fillRect(0, 0, CW, CH);
    // LED dot grid texture
    ctx.fillStyle = 'rgba(255,255,255,0.025)';
    for (let y = 0; y < CH; y += 6) for (let x = (y / 6) % 2 ? 3 : 0; x < CW; x += 6) ctx.fillRect(x, y, 2, 2);

    const cols = [30, 330, 600, 870, 1140, 1460, 1760, 2080];
    const head = ['MÃ CK', 'TC', 'TRẦN', 'SÀN', 'GIÁ KHỚP', '+/-', '%', 'KL'];
    const rowH = 46;
    ctx.textBaseline = 'middle';

    // Header band with index
    ctx.fillStyle = '#0d1a33';
    ctx.fillRect(0, 0, CW, 70);
    ctx.font = 'bold 44px "Arial Narrow", Arial, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#e6edf7';
    ctx.fillText('IQX', 30, 36);
    ctx.fillText('VN-INDEX', 900, 36);
    const idx = m.index;
    ctx.fillStyle = m.indexColor();
    ctx.fillText(
      idx ? `${fmt(idx.value)}   ${fmtSigned(idx.change)}  (${fmtSigned(idx.pct)}%)` : DASH,
      1130,
      36,
    );
    ctx.textAlign = 'right';
    ctx.fillStyle = '#9fb3d1';
    const at = m.snapshot.updatedAt;
    ctx.fillText(at ? `CẬP NHẬT ${timeOf(at)}` : 'ĐANG TẢI DỮ LIỆU', CW - 30, 36);

    ctx.font = 'bold 30px Arial, sans-serif';
    ctx.fillStyle = '#7f93b5';
    head.forEach((t, i) => {
      ctx.textAlign = i === 0 ? 'left' : 'right';
      ctx.fillText(t, i === 0 ? cols[0] : cols[i] + 200, 100);
    });
    ctx.fillStyle = 'rgba(127,147,181,0.35)';
    ctx.fillRect(20, 122, CW - 40, 2);

    ctx.font = 'bold 36px "Courier New", monospace';
    m.quotes.slice(0, 8).forEach((q, r) => {
      const y = 152 + r * rowH;
      if (r % 2 === 0) {
        ctx.fillStyle = 'rgba(255,255,255,0.03)';
        ctx.fillRect(20, y - rowH / 2, CW - 40, rowH);
      }
      const color = m.colorOf(q);
      const cells: [string, string][] = [
        [q.symbol, color],
        [fmt(q.ref), pal.ref],
        [fmt(q.ceiling), pal.ceiling],
        [fmt(q.floor), pal.floor],
        [fmt(q.price), color],
        [fmtSigned(q.change), color],
        [q.pct === null ? DASH : `${fmtSigned(q.pct)}%`, color],
        [q.volume === null ? DASH : Math.round(q.volume).toLocaleString('en-US'), '#e6edf7'],
      ];
      cells.forEach(([t, col], i) => {
        ctx.fillStyle = col;
        ctx.textAlign = i === 0 ? 'left' : 'right';
        ctx.fillText(t, i === 0 ? cols[0] : cols[i] + 200, y);
      });
    });
    this.tex.needsUpdate = true;

    const cc = this.clockCtx;
    cc.fillStyle = '#05070c';
    cc.fillRect(0, 0, 512, 160);
    cc.font = 'bold 120px "Courier New", monospace';
    cc.textAlign = 'center';
    cc.textBaseline = 'middle';
    cc.fillStyle = '#ff4f45';
    cc.fillText(m.clock, 256, 84);
    this.clockTex.needsUpdate = true;
  }
}
