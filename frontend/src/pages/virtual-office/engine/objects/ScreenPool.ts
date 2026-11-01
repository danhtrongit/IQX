import type { CanvasTexture } from 'three';
import type { BoardQuote } from '../types';
import { canvas, toTexture } from '../utils/canvasTextures';
import { DASH, fmt, fmtSigned } from '../utils/format';
import { pick } from '../utils/helpers';
import type { Market } from '../utils/market';

const W = 512;
const H = 320;
const BG = '#0a1426';
const BAND = '#13233f';
const TEXT = '#c9d4e5';
const MUTED = '#7f93b5';

/**
 * A trading-terminal screen drawn to a canvas texture from real IQX data: either
 * today's VN-Index intraday line or one board symbol's order book. With no data
 * yet it says so instead of drawing placeholder numbers.
 */
class Screen {
  readonly texture: CanvasTexture;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly kind: 'chart' | 'book';
  private symbol: string | null = null;

  constructor(kind: 'chart' | 'book') {
    const [c, ctx] = canvas(W, H);
    this.ctx = ctx;
    this.texture = toTexture(c);
    this.kind = kind;
  }

  step(market: Market): void {
    if (this.kind === 'chart') this.drawChart(market);
    else this.drawBook(market);
    this.texture.needsUpdate = true;
  }

  private header(left: string, right: string, color: string): void {
    const { ctx } = this;
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = BAND;
    ctx.fillRect(0, 0, W, 36);
    ctx.font = 'bold 22px Arial';
    ctx.fillStyle = TEXT;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillText(left, 12, 18);
    ctx.textAlign = 'right';
    ctx.fillStyle = color;
    ctx.fillText(right, W - 12, 18);
  }

  private empty(text: string): void {
    const { ctx } = this;
    ctx.font = '20px Arial';
    ctx.fillStyle = MUTED;
    ctx.textAlign = 'center';
    ctx.fillText(text, W / 2, H / 2 + 10);
  }

  private drawChart(market: Market): void {
    const { ctx } = this;
    const closes = market.snapshot.intraday;
    const ref = market.snapshot.intradayRef;
    const idx = market.index;
    this.header('VN-INDEX', idx ? `${fmt(idx.value)} ${fmtSigned(idx.pct)}%` : DASH, market.indexColor());
    if (closes.length < 2) {
      this.empty('Chưa có dữ liệu phiên');
      return;
    }
    const top = 50;
    const bottom = H - 16;
    const values = ref === null ? closes : [...closes, ref];
    const min = Math.min(...values);
    const max = Math.max(...values);
    const Y = (v: number) => bottom - ((v - min) / (max - min || 1)) * (bottom - top);
    const X = (i: number) => 8 + (i / (closes.length - 1)) * (W - 16);
    ctx.strokeStyle = 'rgba(80,110,160,0.25)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 5; i++) {
      const y = top + ((bottom - top) * i) / 4;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }
    if (ref !== null) {
      ctx.strokeStyle = market.palette.ref;
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.moveTo(0, Y(ref));
      ctx.lineTo(W, Y(ref));
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.strokeStyle = market.indexColor();
    ctx.lineWidth = 3;
    ctx.beginPath();
    closes.forEach((v, i) => (i ? ctx.lineTo(X(i), Y(v)) : ctx.moveTo(X(i), Y(v))));
    ctx.stroke();
  }

  private drawBook(market: Market): void {
    const { ctx } = this;
    const quotes = market.quotes;
    if (!this.symbol || Math.random() < 0.1) this.symbol = quotes.length ? pick(quotes).symbol : null;
    const q: BoardQuote | undefined = quotes.find((x) => x.symbol === this.symbol);
    if (!q) {
      this.header(DASH, DASH, MUTED);
      this.empty('Đang tải bảng giá');
      return;
    }
    this.header(q.symbol, fmt(q.price), market.colorOf(q));
    const levels = Math.max(q.bid.length, q.ask.length);
    if (!levels) {
      this.empty('Chưa có dư mua / dư bán');
      return;
    }
    const maxVol = Math.max(1, ...q.bid.map((l) => l.volume), ...q.ask.map((l) => l.volume));
    ctx.font = '18px Arial';
    ctx.textBaseline = 'middle';
    for (let i = 0; i < Math.min(levels, 6); i++) {
      const y = 62 + i * 40;
      const bid = q.bid[i];
      const ask = q.ask[i];
      if (bid) {
        const w = (bid.volume / maxVol) * 220;
        ctx.globalAlpha = 0.22;
        ctx.fillStyle = market.palette.up;
        ctx.fillRect(W / 2 - w, y - 14, w, 28);
        ctx.globalAlpha = 1;
        ctx.textAlign = 'left';
        ctx.fillStyle = market.colorOf({ ...q, price: bid.price });
        ctx.fillText(fmt(bid.price), 14, y);
        ctx.fillStyle = TEXT;
        ctx.textAlign = 'center';
        ctx.fillText(Math.round(bid.volume).toLocaleString('en-US'), W / 2 - 70, y);
      }
      if (ask) {
        const w = (ask.volume / maxVol) * 220;
        ctx.globalAlpha = 0.22;
        ctx.fillStyle = market.palette.down;
        ctx.fillRect(W / 2, y - 14, w, 28);
        ctx.globalAlpha = 1;
        ctx.textAlign = 'right';
        ctx.fillStyle = market.colorOf({ ...q, price: ask.price });
        ctx.fillText(fmt(ask.price), W - 14, y);
        ctx.fillStyle = TEXT;
        ctx.textAlign = 'center';
        ctx.fillText(Math.round(ask.volume).toLocaleString('en-US'), W / 2 + 70, y);
      }
    }
  }
}

/** Pool of shared screen textures; monitors pick one so 40+ displays stay cheap. */
export class ScreenPool {
  private readonly screens: Screen[] = [];
  private cursor = 0;

  constructor(size = 10) {
    for (let i = 0; i < size; i++) this.screens.push(new Screen(i % 4 === 3 ? 'book' : 'chart'));
  }

  get(i: number): CanvasTexture {
    return this.screens[i % this.screens.length].texture;
  }

  random(): CanvasTexture {
    return pick(this.screens).texture;
  }

  /** Redraws a couple of screens per call. */
  step(market: Market): void {
    for (let i = 0; i < 2; i++) {
      this.screens[this.cursor].step(market);
      this.cursor = (this.cursor + 1) % this.screens.length;
    }
  }

  primeAll(market: Market): void {
    for (const s of this.screens) s.step(market);
  }

  dispose(): void {
    for (const s of this.screens) s.texture.dispose();
  }
}
