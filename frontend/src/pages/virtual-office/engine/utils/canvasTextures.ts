import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three';
import { seeded } from './helpers';

export function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

export function toTexture(c: HTMLCanvasElement, repeatX = 1, repeatY = 1): CanvasTexture {
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 8;
  if (repeatX !== 1 || repeatY !== 1) {
    t.wrapS = t.wrapT = RepeatWrapping;
    t.repeat.set(repeatX, repeatY);
  }
  return t;
}

const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;

function noise(ctx: CanvasRenderingContext2D, w: number, h: number, amount: number, seed: number): void {
  const r = seeded(seed);
  const img = ctx.getImageData(0, 0, w, h);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (r() - 0.5) * amount;
    img.data[i] += n;
    img.data[i + 1] += n;
    img.data[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
}

/** Carpet tiles: one texture = 2x2 tiles of 50cm with quarter-turned pile direction. */
export function carpetTexture(base: number, accent: number, seed = 1): CanvasTexture {
  const [c, ctx] = canvas(512, 512);
  const r = seeded(seed);
  for (let ty = 0; ty < 2; ty++)
    for (let tx = 0; tx < 2; tx++) {
      ctx.fillStyle = hex(base);
      ctx.fillRect(tx * 256, ty * 256, 256, 256);
      ctx.strokeStyle = hex(accent);
      ctx.globalAlpha = 0.18;
      ctx.lineWidth = 2;
      const vertical = (tx + ty) % 2 === 0;
      for (let i = 8; i < 256; i += 10 + r() * 4) {
        ctx.beginPath();
        if (vertical) {
          ctx.moveTo(tx * 256 + i, ty * 256);
          ctx.lineTo(tx * 256 + i, ty * 256 + 256);
        } else {
          ctx.moveTo(tx * 256, ty * 256 + i);
          ctx.lineTo(tx * 256 + 256, ty * 256 + i);
        }
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.strokeStyle = 'rgba(0,0,0,0.22)';
      ctx.lineWidth = 2;
      ctx.strokeRect(tx * 256 + 1, ty * 256 + 1, 254, 254);
    }
  noise(ctx, 512, 512, 22, seed);
  return toTexture(c);
}

/** Wood planks running along X. */
export function woodTexture(base: number, seed = 2): CanvasTexture {
  const [c, ctx] = canvas(1024, 1024);
  const r = seeded(seed);
  const plankH = 1024 / 8;
  for (let row = 0; row < 8; row++) {
    let x = -r() * 400;
    while (x < 1024) {
      const len = 300 + r() * 350;
      const k = 0.85 + r() * 0.3;
      const col = [(base >> 16) & 255, (base >> 8) & 255, base & 255].map((v) => Math.min(255, v * k));
      ctx.fillStyle = `rgb(${col.join(',')})`;
      ctx.fillRect(x, row * plankH, len, plankH);
      ctx.strokeStyle = 'rgba(40,20,5,0.18)';
      ctx.lineWidth = 1.5;
      for (let g = 0; g < 9; g++) {
        const y0 = row * plankH + r() * plankH;
        ctx.beginPath();
        ctx.moveTo(x, y0);
        for (let s = 0; s <= len; s += 40) ctx.lineTo(x + s, y0 + Math.sin(s / (60 + r() * 40) + g) * 3);
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(20,10,0,0.45)';
      ctx.fillRect(x, row * plankH, 2, plankH);
      x += len;
    }
    ctx.fillStyle = 'rgba(20,10,0,0.5)';
    ctx.fillRect(0, row * plankH, 1024, 2);
  }
  noise(ctx, 1024, 1024, 14, seed);
  return toTexture(c);
}

/** Ceramic tiles with grout. */
export function tileTexture(base: number, grout: number, seed = 3): CanvasTexture {
  const [c, ctx] = canvas(512, 512);
  const r = seeded(seed);
  ctx.fillStyle = hex(grout);
  ctx.fillRect(0, 0, 512, 512);
  for (let y = 0; y < 4; y++)
    for (let x = 0; x < 4; x++) {
      const k = 0.95 + r() * 0.08;
      const col = [(base >> 16) & 255, (base >> 8) & 255, base & 255].map((v) => Math.min(255, v * k));
      ctx.fillStyle = `rgb(${col.join(',')})`;
      ctx.fillRect(x * 128 + 3, y * 128 + 3, 122, 122);
      const g = ctx.createLinearGradient(x * 128, y * 128, x * 128 + 128, y * 128 + 128);
      g.addColorStop(0, 'rgba(255,255,255,0.18)');
      g.addColorStop(1, 'rgba(0,0,0,0.05)');
      ctx.fillStyle = g;
      ctx.fillRect(x * 128 + 3, y * 128 + 3, 122, 122);
    }
  noise(ctx, 512, 512, 10, seed);
  return toTexture(c);
}

/** Patterned rug with border. */
export function rugTexture(base: number, border: number, accent: number): CanvasTexture {
  const [c, ctx] = canvas(1024, 1024);
  ctx.fillStyle = hex(border);
  ctx.fillRect(0, 0, 1024, 1024);
  ctx.fillStyle = hex(base);
  ctx.fillRect(60, 60, 904, 904);
  ctx.strokeStyle = hex(accent);
  ctx.lineWidth = 10;
  ctx.strokeRect(90, 90, 844, 844);
  ctx.lineWidth = 4;
  ctx.strokeRect(120, 120, 784, 784);
  ctx.globalAlpha = 0.5;
  for (let i = 0; i < 6; i++) {
    ctx.beginPath();
    ctx.ellipse(512, 512, 80 + i * 60, 50 + i * 40, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  for (let i = 0; i < 1024; i += 16) {
    ctx.fillStyle = hex(accent);
    ctx.fillRect(i, 0, 8, 12);
    ctx.fillRect(i, 1012, 8, 12);
  }
  noise(ctx, 1024, 1024, 26, 9);
  return toTexture(c);
}

/** Keyboard key-cap pattern (top view). */
export function keyboardTexture(): CanvasTexture {
  const [c, ctx] = canvas(256, 80);
  ctx.fillStyle = '#1b1d22';
  ctx.fillRect(0, 0, 256, 80);
  ctx.fillStyle = '#3a3e47';
  for (let row = 0; row < 5; row++)
    for (let k = 0; k < 15; k++) {
      if (row === 4 && k > 3 && k < 11) continue;
      ctx.fillRect(4 + k * 16.5, 4 + row * 15, 14, 12);
    }
  ctx.fillRect(4 + 4 * 16.5, 64, 7 * 16.5 - 2, 12);
  return toTexture(c);
}

/** Daytime city view painted behind the windows: sky gradient, haze and skyline silhouettes. */
export function windowViewTexture(): CanvasTexture {
  const [c, ctx] = canvas(1024, 512);
  const r = seeded(21);
  const sky = ctx.createLinearGradient(0, 0, 0, 512);
  sky.addColorStop(0, '#4f9be0');
  sky.addColorStop(0.65, '#a9d3f5');
  sky.addColorStop(1, '#f4dcc0');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, 1024, 512);
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  for (let i = 0; i < 6; i++) {
    const x = r() * 1024;
    const y = 40 + r() * 140;
    for (let k = 0; k < 5; k++) {
      ctx.beginPath();
      ctx.ellipse(x + k * 28, y + Math.sin(k) * 8, 40, 16, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  for (const [shade, minH, maxH] of [['#8fa8c4', 120, 260], ['#5d7594', 160, 360]] as const) {
    let x = -20;
    while (x < 1024) {
      const w = 50 + r() * 90;
      const h = minH + r() * (maxH - minH);
      ctx.fillStyle = shade;
      ctx.fillRect(x, 512 - h, w, h);
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      for (let y = 512 - h + 10; y < 500; y += 16) for (let wx = x + 6; wx < x + w - 8; wx += 12) if (r() < 0.6) ctx.fillRect(wx, y, 6, 8);
      x += w + r() * 10;
    }
  }
  return toTexture(c);
}

/** Gold logo lettering with transparent background. */
export function logoTexture(text: string, sub: string | null, w = 2048, h = 512): CanvasTexture {
  const [c, ctx] = canvas(w, h);
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#ffe08a');
  g.addColorStop(0.5, '#f5a623');
  g.addColorStop(1, '#b8741a');
  ctx.fillStyle = g;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // Shrink the font if the text would overflow the canvas width.
  const fit = (size: number, weight: number, family: string, str: string) => {
    ctx.font = `${weight} ${size}px ${family}`;
    const k = Math.min(1, (w * 0.94) / Math.max(1, ctx.measureText(str).width));
    ctx.font = `${weight} ${size * k}px ${family}`;
  };
  fit(sub ? h * 0.5 : h * 0.7, 900, '"Arial Black", Arial, sans-serif', text);
  ctx.fillText(text, w / 2, sub ? h * 0.38 : h / 2);
  if (sub) {
    fit(h * 0.18, 700, 'Arial, sans-serif', sub);
    ctx.fillStyle = '#d9dee8';
    ctx.fillText(sub, w / 2, h * 0.82);
  }
  return toTexture(c);
}

/** Abstract framed artwork. */
export function artTexture(seed: number): CanvasTexture {
  const [c, ctx] = canvas(512, 384);
  const r = seeded(seed);
  ctx.fillStyle = '#f2ede4';
  ctx.fillRect(0, 0, 512, 384);
  const cols = ['#e76f51', '#2a9d8f', '#e9c46a', '#264653', '#f4a261'];
  for (let i = 0; i < 7; i++) {
    ctx.fillStyle = cols[Math.floor(r() * cols.length)];
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.arc(r() * 512, r() * 384, 30 + r() * 110, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  return toTexture(c);
}

// ---------------------------------------------------------------- zone finishes

const rgb = (c: number, k = 1) => `rgb(${[(c >> 16) & 255, (c >> 8) & 255, c & 255].map((v) => Math.min(255, Math.round(v * k))).join(',')})`;

/** Polished terrazzo: base cement with scattered stone chips and large 60 cm slabs. */
export function terrazzoTexture(base: number, chips: number[], seed = 11): CanvasTexture {
  const [c, ctx] = canvas(512, 512);
  const r = seeded(seed);
  ctx.fillStyle = hex(base);
  ctx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 1400; i++) {
    const size = r() < 0.08 ? 3 + r() * 5 : 0.8 + r() * 2.2;
    ctx.fillStyle = hex(chips[Math.floor(r() * chips.length)]);
    ctx.globalAlpha = 0.55 + r() * 0.45;
    ctx.beginPath();
    const x = r() * 512;
    const y = r() * 512;
    ctx.moveTo(x + size, y);
    for (let k = 1; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2 + r() * 0.6;
      ctx.lineTo(x + Math.cos(a) * size * (0.6 + r() * 0.5), y + Math.sin(a) * size * (0.6 + r() * 0.5));
    }
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.strokeStyle = 'rgba(0,0,0,0.12)';
  ctx.lineWidth = 1.5;
  for (let i = 0; i <= 512; i += 256) {
    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 512); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(512, i); ctx.stroke();
  }
  noise(ctx, 512, 512, 8, seed);
  return toTexture(c);
}

/**
 * Seamless axis-aligned herringbone parquet. Planks are W x 4W; one texture spans 8W in both axes
 * (lattice generated by (W, W) and (4W, -4W)), so every plank keeps one colour across tile seams.
 */
export function herringboneTexture(base: number, seed = 12): CanvasTexture {
  const S = 1024;
  const [c, ctx] = canvas(S, S);
  const W = S / 8;
  const L = 4 * W;
  ctx.fillStyle = rgb(base, 0.55);
  ctx.fillRect(0, 0, S, S);
  const plank = (x: number, y: number, w: number, h: number, id: number) => {
    const r = seeded(seed * 97 + id);
    const k = 0.86 + r() * 0.22;
    ctx.fillStyle = rgb(base, k);
    ctx.fillRect(x + 1.5, y + 1.5, w - 3, h - 3);
    // grain along the long axis
    const along = w > h;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x + 1.5, y + 1.5, w - 3, h - 3);
    ctx.clip();
    for (let i = 0; i < 9; i++) {
      ctx.strokeStyle = rgb(base, k * (0.78 + r() * 0.12));
      ctx.globalAlpha = 0.35 + r() * 0.35;
      ctx.lineWidth = 0.8 + r() * 1.6;
      const o = r() * (along ? h : w);
      const wob = (r() - 0.5) * 6;
      ctx.beginPath();
      if (along) {
        ctx.moveTo(x, y + o);
        ctx.bezierCurveTo(x + w * 0.33, y + o + wob, x + w * 0.66, y + o - wob, x + w, y + o);
      } else {
        ctx.moveTo(x + o, y);
        ctx.bezierCurveTo(x + o + wob, y + h * 0.33, x + o - wob, y + h * 0.66, x + o, y + h);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    // soft bevel: light top-left edge, dark bottom-right edge
    ctx.fillStyle = 'rgba(255,240,220,0.10)';
    ctx.fillRect(x + 1.5, y + 1.5, w - 3, 2);
    ctx.fillRect(x + 1.5, y + 1.5, 2, h - 3);
    ctx.fillStyle = 'rgba(0,0,0,0.16)';
    ctx.fillRect(x + 1.5, y + h - 3.5, w - 3, 2);
    ctx.fillRect(x + w - 3.5, y + 1.5, 2, h - 3);
    ctx.restore();
  };
  for (let m = -6; m <= 6; m++)
    for (let j = -14; j <= 14; j++) {
      // canonical plank id modulo the texture period: (j,m) ~ (j+4, m+1) ~ (j+4, m-1) => (j-4m) mod 8
      const jj = (((j - 4 * m) % 8) + 8) % 8;
      const ox = (j + 4 * m) * W;
      const oy = (j - 4 * m) * W;
      plank(ox, oy, L, W, jj * 2);
      plank(ox + L, oy + W - L, W, L, jj * 2 + 1);
    }
  noise(ctx, S, S, 8, seed);
  return toTexture(c);
}

/** Speckled rubber sport tiles. */
export function rubberTileTexture(base: number, speckles: number[], seed = 13): CanvasTexture {
  const [c, ctx] = canvas(512, 512);
  const r = seeded(seed);
  for (let ty = 0; ty < 2; ty++)
    for (let tx = 0; tx < 2; tx++) {
      ctx.fillStyle = rgb(base, 0.96 + r() * 0.08);
      ctx.fillRect(tx * 256, ty * 256, 256, 256);
    }
  for (let i = 0; i < 3500; i++) {
    ctx.fillStyle = hex(speckles[Math.floor(r() * speckles.length)]);
    ctx.globalAlpha = 0.5 + r() * 0.5;
    ctx.fillRect(r() * 512, r() * 512, 1 + r() * 2.5, 1 + r() * 2.5);
  }
  ctx.globalAlpha = 1;
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 2;
  for (const i of [0, 256, 512]) {
    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 512); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(512, i); ctx.stroke();
  }
  noise(ctx, 512, 512, 10, seed);
  return toTexture(c);
}

/** Raised access-floor panels (60 cm grid feel, perforated airflow tiles). */
export function raisedFloorTexture(): CanvasTexture {
  const [c, ctx] = canvas(512, 512);
  const r = seeded(14);
  for (let ty = 0; ty < 2; ty++)
    for (let tx = 0; tx < 2; tx++) {
      const x = tx * 256;
      const y = ty * 256;
      ctx.fillStyle = rgb(0x9aa1aa, 0.95 + r() * 0.08);
      ctx.fillRect(x, y, 256, 256);
      if ((tx + ty) % 2 === 1) {
        ctx.fillStyle = 'rgba(40,45,52,0.55)';
        for (let py = 24; py < 236; py += 14) for (let px = 24; px < 236; px += 14) ctx.fillRect(x + px, y + py, 6, 6);
      }
      ctx.strokeStyle = '#4b5059';
      ctx.lineWidth = 6;
      ctx.strokeRect(x + 3, y + 3, 250, 250);
      ctx.strokeStyle = 'rgba(255,255,255,0.25)';
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 8, y + 8, 240, 240);
    }
  noise(ctx, 512, 512, 10, 14);
  return toTexture(c);
}

/** White / dark marble with veins. */
export function marbleTexture(base: number, vein: number, seed = 15): CanvasTexture {
  const [c, ctx] = canvas(512, 512);
  const r = seeded(seed);
  ctx.fillStyle = hex(base);
  ctx.fillRect(0, 0, 512, 512);
  ctx.strokeStyle = hex(vein);
  for (let i = 0; i < 14; i++) {
    ctx.globalAlpha = 0.15 + r() * 0.35;
    ctx.lineWidth = 0.6 + r() * 2.4;
    ctx.beginPath();
    let x = r() * 512;
    let y = 0;
    ctx.moveTo(x, y);
    while (y < 512) {
      x += (r() - 0.45) * 40;
      y += 10 + r() * 30;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  noise(ctx, 512, 512, 6, seed);
  return toTexture(c);
}

/** Brushed stainless steel with fine horizontal streaks. */
export function brushedMetalTexture(base = 0xb8bec6): CanvasTexture {
  const [c, ctx] = canvas(256, 256);
  const r = seeded(16);
  ctx.fillStyle = hex(base);
  ctx.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y++) {
    ctx.fillStyle = r() < 0.5 ? `rgba(255,255,255,${r() * 0.12})` : `rgba(0,0,0,${r() * 0.1})`;
    ctx.fillRect(0, y, 256, 1);
  }
  return toTexture(c);
}

/** Woven fabric / felt. */
export function fabricTexture(base: number, seed = 17): CanvasTexture {
  const [c, ctx] = canvas(256, 256);
  ctx.fillStyle = hex(base);
  ctx.fillRect(0, 0, 256, 256);
  ctx.fillStyle = 'rgba(0,0,0,0.08)';
  for (let i = 0; i < 256; i += 4) {
    ctx.fillRect(i, 0, 1, 256);
    ctx.fillRect(0, i, 256, 1);
  }
  noise(ctx, 256, 256, 18, seed);
  return toTexture(c);
}

/** Generic sign / plaque: centred lines of text on a coloured plate. */
export function signTexture(
  lines: string[], o: { w?: number; h?: number; bg?: string; fg?: string; accent?: string; font?: string } = {},
): CanvasTexture {
  const w = o.w ?? 512;
  const h = o.h ?? 256;
  const [c, ctx] = canvas(w, h);
  ctx.fillStyle = o.bg ?? '#1d222b';
  ctx.fillRect(0, 0, w, h);
  if (o.accent) {
    ctx.fillStyle = o.accent;
    ctx.fillRect(0, h - h * 0.06, w, h * 0.06);
  }
  ctx.fillStyle = o.fg ?? '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const lh = h / (lines.length + 0.4);
  lines.forEach((t, i) => {
    ctx.font = `${i === 0 ? 800 : 600} ${lh * (i === 0 ? 0.62 : 0.42)}px ${o.font ?? 'Arial, sans-serif'}`;
    ctx.fillText(t, w / 2, lh * (i + 0.7));
  });
  return toTexture(c);
}

/** Cafeteria chalkboard menu. */
export function menuBoardTexture(): CanvasTexture {
  const [c, ctx] = canvas(1024, 320);
  const g = ctx.createLinearGradient(0, 0, 0, 320);
  g.addColorStop(0, '#24302b');
  g.addColorStop(1, '#1a2420');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 1024, 320);
  noise(ctx, 1024, 320, 14, 18);
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#f5c26b';
  ctx.font = '800 46px "Trebuchet MS", Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('IQX CANTEEN  ·  THỰC ĐƠN HÔM NAY', 512, 40);
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.fillRect(60, 72, 904, 2);
  const items: [string, string][] = [
    ['Phở bò tái', '45k'], ['Cơm tấm sườn', '40k'], ['Bún chả Hà Nội', '45k'], ['Bánh mì thịt', '25k'],
    ['Cà phê sữa đá', '20k'], ['Trà đào cam sả', '25k'], ['Sinh tố bơ', '30k'], ['Salad gà', '35k'],
  ];
  ctx.font = '600 30px "Trebuchet MS", Arial, sans-serif';
  items.forEach(([name, price], i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = 70 + col * 480;
    const y = 112 + row * 52;
    ctx.textAlign = 'left';
    ctx.fillStyle = '#f2efe6';
    ctx.fillText(name, x, y);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#9fe2bf';
    ctx.fillText(price, x + 400, y);
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(x + ctx.measureText(name).width + 250, y, 10, 2);
  });
  return toTexture(c);
}

/** Vending machine window: shelves of drinks or snacks behind glass. */
export function vendingTexture(kind: 'drinks' | 'snacks'): CanvasTexture {
  const [c, ctx] = canvas(256, 512);
  const r = seeded(kind === 'drinks' ? 19 : 20);
  const g = ctx.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0, '#dfe9f2');
  g.addColorStop(1, '#a9bccb');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 512);
  const palette = kind === 'drinks'
    ? ['#d62828', '#f77f00', '#2a9d8f', '#1d3557', '#e9c46a', '#06d6a0', '#ef476f']
    : ['#e63946', '#ffb703', '#8338ec', '#fb8500', '#3a86ff', '#2a9d8f', '#ffd166'];
  const rows = 6;
  for (let row = 0; row < rows; row++) {
    const y = 20 + row * 80;
    const col = palette[Math.floor(r() * palette.length)];
    const col2 = palette[Math.floor(r() * palette.length)];
    for (let i = 0; i < 5; i++) {
      const x = 14 + i * 46;
      ctx.fillStyle = i % 2 ? col : col2;
      if (kind === 'drinks') {
        const tall = row % 2 === 0;
        const bh = tall ? 58 : 44;
        ctx.fillRect(x + 6, y + 60 - bh, 26, bh);
        ctx.fillRect(x + 13, y + 60 - bh - 8, 12, 8);
        ctx.fillStyle = 'rgba(255,255,255,0.75)';
        ctx.fillRect(x + 6, y + 60 - bh * 0.6, 26, 8);
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.fillRect(x + 9, y + 60 - bh, 4, bh);
      } else {
        ctx.beginPath();
        ctx.moveTo(x + 4, y + 8);
        ctx.lineTo(x + 38, y + 8);
        ctx.lineTo(x + 36, y + 60);
        ctx.lineTo(x + 6, y + 60);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        ctx.beginPath();
        ctx.arc(x + 21, y + 32, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.fillRect(x + 4, y + 8, 34, 4);
      }
    }
    ctx.fillStyle = '#5e6b78';
    ctx.fillRect(4, y + 61, 248, 7);
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 5; i++) ctx.fillRect(18 + i * 46, y + 69, 20, 6);
  }
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.beginPath();
  ctx.moveTo(0, 0); ctx.lineTo(90, 0); ctx.lineTo(0, 200);
  ctx.fill();
  return toTexture(c);
}

/** Rack front: stacked servers, switches and patch panels. */
export function serverFaceTexture(): CanvasTexture {
  const [c, ctx] = canvas(256, 512);
  const r = seeded(22);
  ctx.fillStyle = '#0e1013';
  ctx.fillRect(0, 0, 256, 512);
  let y = 12;
  while (y < 500) {
    const u = r() < 0.3 ? 2 : 1;
    const h = u * 20;
    if (y + h > 500) break;
    const kind = r();
    ctx.fillStyle = kind < 0.2 ? '#2b3038' : kind < 0.35 ? '#1b3b5a' : '#23262c';
    ctx.fillRect(14, y, 228, h - 2);
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(14, y, 228, 2);
    if (kind < 0.2) {
      ctx.fillStyle = '#0a0b0d';
      for (let p = 0; p < 16; p++) ctx.fillRect(40 + p * 11, y + 6, 8, 7);
    } else {
      ctx.fillStyle = '#121418';
      for (let p = 0; p < u * 4; p++) ctx.fillRect(30 + (p % 4) * 30, y + 4 + Math.floor(p / 4) * 20, 26, 12);
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      for (let gx = 160; gx < 236; gx += 4) ctx.fillRect(gx, y + 3, 2, h - 8);
    }
    y += h + 1;
  }
  ctx.fillStyle = '#3a3f48';
  ctx.fillRect(0, 0, 12, 512);
  ctx.fillRect(244, 0, 12, 512);
  return toTexture(c);
}

/** Glass-door drinks fridge interior: shelves of bottles. */
export function fridgeTexture(): CanvasTexture {
  const [c, ctx] = canvas(256, 512);
  const r = seeded(23);
  ctx.fillStyle = '#e8f3ff';
  ctx.fillRect(0, 0, 256, 512);
  const cols = ['#2a9d8f', '#e76f51', '#e9c46a', '#3a86ff', '#ef476f', '#8ac926', '#ffffff'];
  for (let row = 0; row < 5; row++) {
    const y = 18 + row * 98;
    for (let i = 0; i < 7; i++) {
      const x = 12 + i * 34;
      const h = 60 + r() * 20;
      ctx.fillStyle = cols[Math.floor(r() * cols.length)];
      ctx.fillRect(x, y + 86 - h, 24, h);
      ctx.fillRect(x + 7, y + 86 - h - 10, 10, 10);
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.fillRect(x, y + 86 - h * 0.55, 24, 12);
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.fillRect(x + 3, y + 86 - h, 4, h);
    }
    ctx.fillStyle = '#aab8c6';
    ctx.fillRect(0, y + 86, 256, 6);
  }
  return toTexture(c);
}

/** Analogue clock dial (hands are separate meshes). */
export function clockFaceTexture(): CanvasTexture {
  const [c, ctx] = canvas(256, 256);
  ctx.fillStyle = '#f7f5ef';
  ctx.beginPath();
  ctx.arc(128, 128, 126, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#1d222b';
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * Math.PI * 2;
    const big = i % 5 === 0;
    ctx.save();
    ctx.translate(128 + Math.sin(a) * 108, 128 - Math.cos(a) * 108);
    ctx.rotate(a);
    ctx.fillRect(big ? -3 : -1, big ? -10 : -4, big ? 6 : 2, big ? 20 : 8);
    ctx.restore();
  }
  ctx.font = '700 18px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#f5a623';
  ctx.fillText('IQX', 128, 88);
  return toTexture(c);
}

/** Cafeteria floor: 2x2 large warm tiles with a small contrasting cabochon at the corners. */
export function checkerTileTexture(a: number, dot: number, b: number): CanvasTexture {
  const [c, ctx] = canvas(512, 512);
  const r = seeded(24);
  ctx.fillStyle = '#9d9282';
  ctx.fillRect(0, 0, 512, 512);
  for (let ty = 0; ty < 2; ty++)
    for (let tx = 0; tx < 2; tx++) {
      ctx.fillStyle = rgb((tx + ty) % 2 ? b : a, 0.97 + r() * 0.06);
      ctx.fillRect(tx * 256 + 2, ty * 256 + 2, 252, 252);
    }
  ctx.fillStyle = hex(dot);
  for (const [x, y] of [[0, 0], [256, 0], [0, 256], [256, 256], [512, 0], [0, 512], [512, 512], [256, 512], [512, 256]]) {
    ctx.beginPath();
    ctx.moveTo(x, y - 22); ctx.lineTo(x + 22, y); ctx.lineTo(x, y + 22); ctx.lineTo(x - 22, y);
    ctx.fill();
  }
  noise(ctx, 512, 512, 10, 24);
  return toTexture(c);
}
