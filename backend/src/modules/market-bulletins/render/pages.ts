import {
  CHART_SESSIONS_DESKTOP,
  CHART_SESSIONS_MOBILE,
  PAGE_SIZES,
  demoTradingUrl,
  type BulletinVariant,
  type SlotNumber,
} from '../bulletin.constants.js';
import { dm, dmy, longDate, nf, sg } from '../bulletin.format.js';
import {
  COMMENT_KEYS,
  type BulletinContent,
  type CommentKey,
  type Levels,
  type SlotPick,
  type SlotSnapshot,
  type VnIndexModel,
} from '../bulletin.types.js';
import { COL, Canvas, newPage, type PageDoc } from './canvas.js';
import { drawMiniChart, drawVnIndexChart } from './charts.js';
import { measure, nfc, wrapText } from './fonts.js';
import { drawRuns, type Run } from './runs.js';

export type BulletinRenderInput = {
  date: string;
  model: VnIndexModel;
  content: BulletinContent;
  slots: Readonly<Record<SlotNumber, SlotSnapshot | null>>;
};

export type RenderedBulletin = {
  variant: BulletinVariant;
  pages: PageDoc[];
  /** Ô nhận định tràn khung (spec §3.5 "Chữ tràn khung"). */
  overflow: CommentKey[];
};

const SLOT_NUMBERS: readonly SlotNumber[] = [1, 2, 3];
const TITLES: Readonly<Record<CommentKey, string>> = {
  trend: 'XU HƯỚNG',
  momentum: 'ĐỘNG LƯỢNG',
  liquidity: 'THANH KHOẢN',
};
const NO_PASS = 'Phiên này không có mã đạt.';
const NO_CHART = 'Không có mã đạt nên không có biểu đồ minh hoạ.';
const NOT_PUSHED_TABLE = 'Chưa đẩy kết quả phiên này từ Bộ lọc.';
const NOT_PUSHED_CHART = 'Chưa đẩy kết quả';

// ─────────────────────────── thành phần dùng chung ───────────────────────────

const changeColor = (value: number | null): string =>
  value === null ? COL.ink : value > 0 ? COL.up : value < 0 ? COL.dn : COL.flat;

function paragraphs(text: string): string[] {
  return nfc(text)
    .split(/\n+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

/** Khối "tiêu đề + chữ" của một ô nhận định: đo trước để biết chiều cao. */
type Block = { title: string; lines: string[][]; empty: boolean; height: number };

type BlockStyle = {
  size: number;
  lineHeight: number;
  paragraphGap: number;
  padX: number;
  padY: number;
  titleSize: number;
  titleGap: number;
};

const DESKTOP_BLOCK: BlockStyle = {
  size: 12.6,
  lineHeight: 12.6 * 1.56,
  paragraphGap: 5,
  padX: 13,
  padY: 11,
  titleSize: 13,
  titleGap: 7,
};
const MOBILE_BLOCK: BlockStyle = {
  size: 12.8,
  lineHeight: 12.8 * 1.55,
  paragraphGap: 5,
  padX: 11,
  padY: 10,
  titleSize: 12.5,
  titleGap: 6,
};

function measureBlock(title: string, text: string, width: number, style: BlockStyle): Block {
  const empty = !text.trim();
  const textWidth = width - 2 * style.padX - 2;
  const lines = empty
    ? [['Chưa nhập nhận xét.']]
    : paragraphs(text).map((paragraph) => wrapText(paragraph, textWidth, style.size, 400));
  const lineCount = lines.reduce((sum, paragraph) => sum + paragraph.length, 0);
  const textHeight =
    lineCount * style.lineHeight + Math.max(0, lines.length - 1) * style.paragraphGap;
  const height = 2 + 2 * style.padY + style.titleSize * 1.2 + style.titleGap + textHeight;
  return { title, lines, empty, height };
}

function drawSection(
  c: Canvas,
  x: number,
  y: number,
  w: number,
  h: number,
  block: Block,
  style: BlockStyle,
): void {
  c.rect(x + 0.5, y + 0.5, w - 1, h - 1, { fill: COL.soft2, stroke: COL.line, sw: 1, rx: 8 });
  drawHeading(c, x + style.padX + 1, y + 1 + style.padY, block.title, style.titleSize);
  let cursor = y + 1 + style.padY + style.titleSize * 1.2 + style.titleGap;
  block.lines.forEach((paragraph, index) => {
    if (index > 0) cursor += style.paragraphGap;
    for (const line of paragraph) {
      c.text(x + style.padX + 1, cursor + style.lineHeight / 2 + style.size * 0.35, line, {
        size: style.size,
        weight: block.empty ? 600 : 400,
        color: block.empty ? COL.dn : COL.ink,
      });
      cursor += style.lineHeight;
    }
  });
}

/** Tiêu đề khung: vạch trái 4 px màu navy, chữ 800 giãn 0,06em. */
function drawHeading(c: Canvas, x: number, top: number, title: string, size: number): void {
  const lineHeight = size * 1.2;
  c.rect(x, top, 4, lineHeight, { fill: COL.navy });
  c.text(x + 13, top + lineHeight * 0.5 + size * 0.35, title, {
    size,
    weight: 800,
    color: COL.navy,
    spacing: size * 0.06,
  });
}

type ScenarioBlock = { height: number; draw: (c: Canvas, x: number, y: number, w: number) => void };

/** Khung "KỊCH BẢN THAM KHẢO" (spec §1.2): chỉ có khi nhập ít nhất một mức. */
function scenarioBlock(
  levels: Levels,
  width: number,
  padX: number,
  padY: number,
  fontSize: number,
  titleSize: number,
): ScenarioBlock | null {
  const range = (a: number | null, b: number | null) =>
    [a, b]
      .filter((value): value is number => value !== null)
      .map((value) => nf(value, 0))
      .join(' · ');
  const resistance = range(levels.r1, levels.r2);
  const support = range(levels.s1, levels.s2);
  const positive = levels.pa !== null && levels.pt !== null;
  const negative = levels.na !== null && levels.nt !== null;
  if (!resistance && !support && !positive && !negative) return null;
  const lh = fontSize * 1.5;
  const rowCount = (resistance || support ? 1 : 0) + (positive ? 1 : 0) + (negative ? 1 : 0);
  const height =
    2 + 2 * padY + titleSize * 1.2 + 7 + rowCount * lh + (resistance || support ? 3 : 0);
  return {
    height,
    draw(c, x, y, w) {
      c.rect(x + 0.5, y + 0.5, w - 1, height - 1, {
        fill: COL.soft2,
        stroke: COL.line,
        sw: 1,
        rx: 8,
      });
      drawHeading(c, x + padX + 1, y + 1 + padY, 'KỊCH BẢN THAM KHẢO', titleSize);
      let cursor = y + 1 + padY + titleSize * 1.2 + 7;
      const baseline = (top: number) => top + lh / 2 + fontSize * 0.35;
      if (resistance || support) {
        let px = x + padX + 1;
        const group = (label: string, value: string, color: string) => {
          c.text(px, baseline(cursor), label, { size: fontSize, weight: 800, color });
          px += measure(label, fontSize, 800) + 5;
          c.text(px, baseline(cursor), value, { size: fontSize, weight: 700, color: COL.ink });
          px += measure(value, fontSize, 700) + 16;
        };
        if (resistance) group('Kháng cự', resistance, COL.dn);
        if (support) group('Hỗ trợ', support, COL.up);
        cursor += lh + 3;
      }
      const branch = (icon: 'triUp' | 'triDown', label: string, body: string, color: string) => {
        const runs: Run[] = [{ icon, color }, ` ${label}`];
        const used = drawRuns(c, x + padX + 1, baseline(cursor), runs, {
          size: fontSize,
          weight: 800,
          color,
        });
        c.text(x + padX + 1 + used + 4, baseline(cursor), body, {
          size: fontSize,
          weight: 500,
          color: COL.ink,
        });
        cursor += lh;
      };
      if (positive)
        branch(
          'triUp',
          'Tích cực:',
          `giữ trên ${nf(levels.pa, 0)}, hồi về ${nf(levels.pt, 0)}`,
          COL.up,
        );
      if (negative)
        branch('triDown', 'Tiêu cực:', `thủng ${nf(levels.na, 0)}, về ${nf(levels.nt, 0)}`, COL.dn);
    },
  };
}

/** Chân trang hai bên (bản máy tính): chữ trái xuống dòng, chữ phải không xuống dòng. */
function drawFooterDesktop(
  c: Canvas,
  page: { width: number; height: number },
  left: string,
  rightPrefix: string,
): void {
  const size = 10;
  const x0 = 22;
  const x1 = page.width - 22;
  const rightWidth = measure(rightPrefix, size, 500) + measure('iqx.vn', size, 800);
  const lines = wrapText(left, x1 - x0 - rightWidth - 16, size, 500);
  const blockHeight = 1 + 5 + lines.length * 12;
  const top = page.height - 8 - blockHeight;
  c.line(x0, top + 0.5, x1, top + 0.5, COL.line, 1);
  lines.forEach((line, index) =>
    c.text(x0, top + 6 + index * 12 + 9, line, { size, weight: 500, color: COL.ink2 }),
  );
  const y = top + 6 + 9;
  c.text(x1 - rightWidth, y, rightPrefix, { size, weight: 500, color: COL.ink2 });
  c.text(x1 - measure('iqx.vn', size, 800), y, 'iqx.vn', { size, weight: 800, color: COL.navy });
}

/** Chân trang bản điện thoại: hai khối chữ xếp dọc, cỡ 9 px. */
function drawFooterMobile(
  c: Canvas,
  page: { width: number; height: number },
  left: string,
  rightPrefix: string,
): void {
  const size = 9;
  const x0 = 13;
  const x1 = page.width - 13;
  const width = x1 - x0;
  const leftLines = left ? wrapText(left, width, size, 500) : [];
  const rightLines = wrapText(`${rightPrefix}iqx.vn`, width, size, 500);
  const total = leftLines.length + rightLines.length;
  const top = page.height - 8 - (1 + 5 + total * 11);
  c.line(x0, top + 0.5, x1, top + 0.5, COL.line, 1);
  let y = top + 6 + 8;
  for (const line of leftLines) {
    c.text(x0, y, line, { size, weight: 500, color: COL.ink2 });
    y += 11;
  }
  rightLines.forEach((line, index) => {
    if (index === rightLines.length - 1 && line.endsWith('iqx.vn')) {
      const prefix = line.slice(0, -'iqx.vn'.length);
      c.text(x0, y, prefix, { size, weight: 500, color: COL.ink2 });
      c.text(x0 + measure(prefix, size, 500), y, 'iqx.vn', { size, weight: 800, color: COL.navy });
    } else c.text(x0, y, line, { size, weight: 500, color: COL.ink2 });
    y += 11;
  });
}

function drawLogo(
  c: Canvas,
  x: number,
  y: number,
  size: number,
  fontSize: number,
  radius: number,
): void {
  c.rect(x, y, size, size, { fill: COL.navy, rx: radius });
  c.text(x + size / 2, y + size / 2 + fontSize * 0.35, 'IQX', {
    anchor: 'middle',
    size: fontSize,
    weight: 800,
    color: '#ffffff',
    spacing: fontSize * 0.02,
  });
}

const changeText = (model: VnIndexModel): string => `${sg(model.change)} (${sg(model.changePct)}%)`;

// ─────────────────────────── bản máy tính ───────────────────────────

type KpiCell = {
  label: string;
  value: Run[];
  valueSize: number;
  extra?: { text: string; color: string; size: number };
  small?: string;
};

function drawDesktopHeader(c: Canvas, input: BulletinRenderInput): void {
  const { model, date } = input;
  drawLogo(c, 22, 22, 46, 17, 9);
  c.text(80, 44, 'BẢN TIN THỊ TRƯỜNG', {
    size: 22,
    weight: 800,
    color: COL.navy,
    spacing: 22 * 0.02,
  });
  c.text(80, 62, `VN-Index · ${longDate(date)}`, { size: 12, weight: 500, color: COL.ink2 });
  const cells: KpiCell[] = [
    {
      label: 'VN-INDEX',
      value: [nf(model.close, 2)],
      valueSize: 17,
      extra: { text: changeText(model), color: changeColor(model.change), size: 12.5 },
    },
    { label: 'KHỐI LƯỢNG', value: [nf(model.volume / 1e6, 0)], valueSize: 17, small: ' triệu cp' },
  ];
  const stats = model.stats;
  if (stats) {
    cells.push({
      label: 'GIÁ TRỊ GIAO DỊCH',
      value: [nf(stats.value_bn, 0)],
      valueSize: 17,
      small: ' tỷ đồng',
    });
  }
  const cellWidth = (cell: KpiCell): number => {
    const label = measure(cell.label, 10, 700, 0.6);
    const value =
      measure(cell.value.join(''), cell.valueSize, 800) +
      (cell.small ? measure(cell.small, 11, 600) : 0) +
      (cell.extra ? measure(cell.extra.text, cell.extra.size, 700) + 4 : 0);
    return Math.max(label, value) + 22;
  };
  const breadthRuns = stats
    ? ([
        [`${nf(stats.advances, 0)} tăng`, COL.up],
        [`${nf(stats.unchanged, 0)} đứng`, COL.flat],
        [`${nf(stats.declines, 0)} giảm`, COL.dn],
      ] as const)
    : null;
  const breadthWidth = breadthRuns
    ? breadthRuns.reduce((sum, [text]) => sum + measure(text, 11.5, 700), 0) +
      2 * measure(' · ', 11.5, 700) +
      22
    : 0;
  const total = cells.reduce((sum, cell) => sum + cellWidth(cell), 0) + breadthWidth;
  let x = PAGE_SIZES.desktop.width - 22 - total;
  const drawDivider = (at: number) => c.line(at, 29, at, 69, COL.line, 1);
  cells.forEach((cell, index) => {
    if (index > 0) drawDivider(x);
    const left = x + 11;
    c.text(left, 38, cell.label, { size: 10, weight: 700, color: COL.ink2, spacing: 0.6 });
    const value = cell.value.join('');
    c.text(left, 58, value, { size: cell.valueSize, weight: 800, color: COL.navy });
    let cursor = left + measure(value, cell.valueSize, 800);
    if (cell.small) {
      c.text(cursor, 58, cell.small, { size: 11, weight: 600, color: COL.ink2 });
      cursor += measure(cell.small, 11, 600);
    }
    if (cell.extra)
      c.text(cursor + 4, 58, cell.extra.text, {
        size: cell.extra.size,
        weight: 700,
        color: cell.extra.color,
      });
    x += cellWidth(cell);
  });
  if (breadthRuns) {
    drawDivider(x);
    c.text(x + 11, 38, 'ĐỘ RỘNG', { size: 10, weight: 700, color: COL.ink2, spacing: 0.6 });
    let cursor = x + 11;
    breadthRuns.forEach(([text, color], index) => {
      if (index > 0) {
        c.text(cursor, 58, ' · ', { size: 11.5, weight: 700, color: COL.navy });
        cursor += measure(' · ', 11.5, 700);
      }
      c.text(cursor, 58, text, { size: 11.5, weight: 700, color });
      cursor += measure(text, 11.5, 700);
    });
  }
  c.line(22, 79, 1101, 79, COL.navy, 2);
}

type CommentLayout = {
  blocks: Block[];
  scenario: ScenarioBlock | null;
  heights: number[];
  overflow: CommentKey[];
};

function layoutComments(
  input: BulletinRenderInput,
  width: number,
  availableHeight: number,
  style: BlockStyle,
  gap: number,
  kbPad: [number, number],
  kbFont: number,
): CommentLayout {
  const blocks = COMMENT_KEYS.map((key) =>
    measureBlock(TITLES[key], input.content[key], width, style),
  );
  const scenario = scenarioBlock(
    input.content.levels,
    width,
    kbPad[0],
    kbPad[1],
    kbFont,
    style.titleSize,
  );
  const reserved = (scenario ? scenario.height + gap : 0) + gap * (blocks.length - 1);
  const free = availableHeight - reserved;
  const need = blocks.reduce((sum, block) => sum + block.height, 0);
  const overflow: CommentKey[] = [];
  let heights = blocks.map((block) => block.height);
  if (need <= free) {
    const extra = (free - need) / blocks.length;
    heights = blocks.map((block) => block.height + extra);
  } else {
    let longest = 0;
    blocks.forEach((block, index) => {
      if (block.height >= blocks[longest]!.height) longest = index;
    });
    overflow.push(COMMENT_KEYS[longest]!);
  }
  return { blocks, scenario, heights, overflow };
}

function pushLink(
  c: Canvas,
  symbol: string,
  x: number,
  baseline: number,
  size: number,
  weight: number,
): void {
  const width = measure(symbol, size, weight);
  c.link(x, baseline - size, width, size + 4, demoTradingUrl(symbol));
}

type TableStyle = {
  size: number;
  headSize: number;
  rowHeight: number;
  headHeight: number;
  padX: number;
  columns: [number, number, number, number];
};

function drawPicksTable(
  c: Canvas,
  x: number,
  y: number,
  picks: readonly SlotPick[],
  style: TableStyle,
  emptyMessage: string | null,
  emptyColor: string,
): number {
  const width = style.columns.reduce((sum, value) => sum + value, 0);
  c.rect(x, y, width, style.headHeight, { fill: COL.soft });
  c.line(x, y + style.headHeight - 0.5, x + width, y + style.headHeight - 0.5, COL.line, 1);
  const heads = ['Mã', 'Giá', '+/− %', 'GTGD hôm nay'];
  let colX = x;
  heads.forEach((head, index) => {
    const w = style.columns[index]!;
    const baseline = y + style.headHeight / 2 + style.headSize * 0.35;
    if (index === 0)
      c.text(colX + style.padX, baseline, head, {
        size: style.headSize,
        weight: 700,
        color: COL.navy,
      });
    else
      c.text(colX + w - style.padX, baseline, head, {
        size: style.headSize,
        weight: 700,
        color: COL.navy,
        anchor: 'end',
      });
    colX += w;
  });
  let cursor = y + style.headHeight;
  if (emptyMessage) {
    c.text(x + style.padX, cursor + 18, emptyMessage, {
      size: 12.4,
      weight: 600,
      color: emptyColor,
    });
    return cursor + 28;
  }
  for (const pick of picks) {
    const baseline = cursor + style.rowHeight / 2 + style.size * 0.35;
    colX = x;
    const cells: [string, string, number, boolean][] = [
      [pick.symbol, COL.navy, 800, false],
      [nf(pick.close, 1, 2), COL.ink, 400, true],
      [sg(pick.change_pct), changeColor(pick.change_pct), 400, true],
      [nf(pick.value_bn, 1), COL.ink, 400, true],
    ];
    cells.forEach(([text, color, weight, right], index) => {
      const w = style.columns[index]!;
      if (right)
        c.text(colX + w - style.padX, baseline, text, {
          size: style.size,
          weight,
          color,
          anchor: 'end',
        });
      else {
        c.text(colX + style.padX, baseline, text, { size: style.size, weight, color });
        pushLink(c, text, colX + style.padX, baseline, style.size, weight);
      }
      colX += w;
    });
    cursor += style.rowHeight;
    c.line(x, cursor - 0.5, x + width, cursor - 0.5, COL.grid, 1);
  }
  return cursor;
}

/** Danh sách điều kiện có ô vuông màu navy; thu cỡ chữ, rồi cắt bớt dòng khi không đủ chỗ. */
function drawConditions(
  c: Canvas,
  x: number,
  y: number,
  width: number,
  maxHeight: number,
  conditions: readonly string[],
  sizes: readonly number[],
  gap: number,
): number {
  const textWidth = width - 16;
  const layoutFor = (size: number) => {
    const lh = size * 1.36;
    const items = conditions.map((condition) => wrapText(condition, textWidth, size, 400));
    const height =
      items.reduce((sum, lines) => sum + lines.length * lh, 0) +
      gap * Math.max(0, items.length - 1);
    return { size, lh, items, height };
  };
  let chosen = layoutFor(sizes[0]!);
  for (const size of sizes) {
    chosen = layoutFor(size);
    if (chosen.height <= maxHeight) break;
  }
  let items = chosen.items;
  let hidden = 0;
  while (items.length > 1) {
    const height =
      items.reduce((sum, lines) => sum + lines.length * chosen.lh, 0) +
      gap * (items.length - 1) +
      (hidden ? chosen.lh + gap : 0);
    if (height <= maxHeight) break;
    items = items.slice(0, -1);
    hidden += 1;
  }
  let cursor = y;
  const draw = (lines: string[], marker: boolean) => {
    if (marker) c.rect(x, cursor + chosen.lh / 2 - 4.5 + 0.5, 9, 9, { fill: COL.navy, rx: 2 });
    lines.forEach((line, index) =>
      c.text(x + 16, cursor + (index + 0.5) * chosen.lh + chosen.size * 0.35, line, {
        size: chosen.size,
        weight: 400,
        color: COL.ink,
      }),
    );
    cursor += lines.length * chosen.lh + gap;
  };
  for (const lines of items) draw(lines, true);
  if (hidden) draw([`… và ${hidden} điều kiện khác`], false);
  return Math.max(0, cursor - y - gap);
}

function drawPlaceholder(
  c: Canvas,
  x: number,
  y: number,
  w: number,
  h: number,
  message: string,
  color: string,
  dash: string,
): void {
  c.rect(x + 0.5, y + 0.5, w - 1, h - 1, { stroke: color, sw: 1, dash, rx: 6 });
  const lines = wrapText(message, w - 28, 12, 600);
  lines.forEach((line, index) =>
    c.text(x + w / 2, y + h / 2 + (index - (lines.length - 1) / 2) * 15 + 4, line, {
      anchor: 'middle',
      size: 12,
      weight: 600,
      color: color === COL.line ? COL.ink2 : color,
    }),
  );
}

type SlotView = {
  slot: SlotNumber;
  name: string;
  conditions: string[];
  picks: SlotPick[];
  passed: number;
  chart: SlotSnapshot['chart'];
  state: 'pushed' | 'empty' | 'missing';
};

function slotView(input: BulletinRenderInput, slot: SlotNumber): SlotView {
  const snapshot = input.slots[slot];
  if (!snapshot || snapshot.trade_date !== input.date)
    return {
      slot,
      name: snapshot?.display_name ?? `Bộ lọc ${slot}`,
      conditions: snapshot?.conditions ?? [],
      picks: [],
      passed: 0,
      chart: null,
      state: 'missing',
    };
  return {
    slot,
    name: snapshot.display_name,
    conditions: snapshot.conditions,
    picks: [...snapshot.picks].sort((a, b) => (b.value_bn ?? -1) - (a.value_bn ?? -1)).slice(0, 10),
    passed: snapshot.passed_count,
    chart: snapshot.chart,
    state: snapshot.passed_count === 0 || snapshot.picks.length === 0 ? 'empty' : 'pushed',
  };
}

const captionOf = (view: SlotView, date: string): string =>
  `KẾT QUẢ PHIÊN ${dm(date)}${view.picks.length ? ` · ${view.picks.length} MÃ` : ''}`;

function renderDesktop(input: BulletinRenderInput): RenderedBulletin {
  const size = PAGE_SIZES.desktop;
  // Trang 1: VN-Index.
  const first = newPage(size.width, size.height);
  const c1 = first.canvas;
  drawDesktopHeader(c1, input);
  drawVnIndexChart(c1.at(22, 90), input.model, input.content.levels, {
    W: 742,
    H: 644,
    vis: CHART_SESSIONS_DESKTOP,
  });
  const layout = layoutComments(input, 321, 644, DESKTOP_BLOCK, 10, [13, 9], 12.4);
  let y = 90;
  layout.blocks.forEach((block, index) => {
    drawSection(c1, 780, y, 321, layout.heights[index]!, block, DESKTOP_BLOCK);
    y += layout.heights[index]! + 10;
  });
  layout.scenario?.draw(c1, 780, y, 321);
  drawFooterDesktop(
    c1,
    size,
    `Nguồn: Dữ liệu giá IQX · Dữ liệu chốt phiên ${dmy(input.date)} · Hỗ trợ, kháng cự và mũi tên nét đứt là kịch bản tham khảo, không phải dự báo.`,
    'Nội dung mang tính phân tích kỹ thuật, không phải khuyến nghị đầu tư · ',
  );

  // Trang 2: Bộ lọc cổ phiếu.
  const second = newPage(size.width, size.height);
  const c2 = second.canvas;
  c2.rect(18, 18, size.width - 36, 40, { fill: COL.navy, rx: 7 });
  c2.text(34, 44, 'BỘ LỌC CỔ PHIẾU', { size: 18, weight: 800, color: '#ffffff', spacing: 0.9 });
  c2.text(size.width - 34, 43, `Phiên ${dmy(input.date)}`, {
    anchor: 'end',
    size: 12.5,
    weight: 600,
    color: '#ffffff',
  });
  SLOT_NUMBERS.forEach((slot, index) => {
    const view = slotView(input, slot);
    const top = 67 + index * 229;
    c2.rect(18.5, top + 0.5, size.width - 37, 220, {
      fill: '#ffffff',
      stroke: COL.line,
      sw: 1,
      rx: 8,
    });
    // Cột điều kiện.
    const colX = 31;
    c2.text(colX, top + 21, `BỘ LỌC ${slot}`, {
      size: 10.5,
      weight: 800,
      color: COL.navy2,
      spacing: 0.63,
    });
    const titleLines = wrapText(view.name, 300, 16, 800).slice(0, 2);
    titleLines.forEach((line, i) =>
      c2.text(colX, top + 41 + i * 20.5, line, { size: 16, weight: 800, color: COL.navy }),
    );
    const listTop = top + 41 + (titleLines.length - 1) * 20.5 + 11;
    drawConditions(
      c2,
      colX,
      listTop,
      300,
      top + 212 - listTop,
      view.conditions,
      [12.2, 11.2, 10.4],
      4,
    );
    // Cột biểu đồ.
    const chartX = 347;
    const chartY = top + 9;
    if (view.chart && view.state === 'pushed')
      drawMiniChart(c2.at(chartX, chartY), view.chart, 440, 203, dm(input.date));
    else if (view.state === 'missing')
      drawPlaceholder(c2, chartX, chartY, 440, 203, NOT_PUSHED_CHART, COL.amber, '4 3');
    else drawPlaceholder(c2, chartX, chartY, 440, 203, NO_CHART, COL.line, '4 3');
    // Cột bảng.
    const tableX = 803;
    c2.text(tableX, top + 21, captionOf(view, input.date), {
      size: 10.5,
      weight: 800,
      color: COL.navy,
      spacing: 0.42,
    });
    const empty =
      view.state === 'missing' ? NOT_PUSHED_TABLE : view.state === 'empty' ? NO_PASS : null;
    drawPicksTable(
      c2,
      tableX,
      top + 28,
      view.picks,
      {
        size: 12,
        headSize: 11,
        rowHeight: 16.4,
        headHeight: 19,
        padX: 6,
        columns: [58, 62, 66, 105],
      },
      empty,
      view.state === 'missing' ? COL.amberText : COL.ink2,
    );
  });
  drawFooterDesktop(
    c2,
    size,
    `Giá: nghìn đồng · GTGD hôm nay: giá trị giao dịch phiên, tỷ đồng · Mã xếp theo GTGD hôm nay · Điều kiện lấy từ Bộ lọc IQX, xét sau đóng cửa phiên ${dmy(input.date)} · Biểu đồ: mã có GTGD lớn nhất trong kết quả (vòng tròn vàng: phiên ${dm(input.date)}).`,
    'Không phải khuyến nghị đầu tư · ',
  );
  return { variant: 'desktop', pages: [first.page, second.page], overflow: layout.overflow };
}

// ─────────────────────────── bản điện thoại ───────────────────────────

function drawMobileHead(c: Canvas, date: string): void {
  drawLogo(c, 13, 13, 34, 13, 7);
  c.text(56, 31, 'BẢN TIN THỊ TRƯỜNG', { size: 16, weight: 800, color: COL.navy, spacing: 0.32 });
  c.text(56, 45, longDate(date), { size: 11, weight: 600, color: COL.ink2 });
  c.line(13, 55, PAGE_SIZES.mobile.width - 13, 55, COL.navy, 2);
}

function renderMobile(input: BulletinRenderInput): RenderedBulletin {
  const size = PAGE_SIZES.mobile;
  const { model } = input;
  const pages: PageDoc[] = [];

  // Trang 1: số liệu và biểu đồ.
  const p1 = newPage(size.width, size.height);
  const c1 = p1.canvas;
  drawMobileHead(c1, input.date);
  const gridX = 13;
  const gridW = size.width - 26;
  const cellW = gridW / 2;
  const gridY = 63;
  const row1 = 59;
  const row2 = 44;
  c1.rect(gridX + 0.5, gridY + 0.5, gridW - 1, row1 + row2, { stroke: COL.line, sw: 1, rx: 7 });
  c1.line(gridX + cellW, gridY, gridX + cellW, gridY + row1 + row2, COL.line, 1);
  c1.line(gridX, gridY + row1, gridX + gridW, gridY + row1, COL.line, 1);
  const label = (x: number, y: number, text: string) =>
    c1.text(x, y, text, { size: 10, weight: 700, color: COL.ink2, spacing: 0.6 });
  label(gridX + 9, gridY + 18, 'VN-INDEX');
  c1.text(gridX + 9, gridY + 38, nf(model.close, 2), { size: 16, weight: 800, color: COL.navy });
  c1.text(gridX + 9, gridY + 53, changeText(model), {
    size: 12,
    weight: 700,
    color: changeColor(model.change),
  });
  label(gridX + cellW + 9, gridY + 18, 'KHỐI LƯỢNG');
  const volume = nf(model.volume / 1e6, 0);
  c1.text(gridX + cellW + 9, gridY + 38, volume, { size: 16, weight: 800, color: COL.navy });
  c1.text(gridX + cellW + 9 + measure(volume, 16, 800), gridY + 38, ' triệu cp', {
    size: 11,
    weight: 600,
    color: COL.ink2,
  });
  if (model.stats) {
    label(gridX + 9, gridY + row1 + 18, 'GIÁ TRỊ GD');
    const value = nf(model.stats.value_bn, 0);
    c1.text(gridX + 9, gridY + row1 + 38, value, { size: 16, weight: 800, color: COL.navy });
    c1.text(gridX + 9 + measure(value, 16, 800), gridY + row1 + 38, ' tỷ đồng', {
      size: 11,
      weight: 600,
      color: COL.ink2,
    });
    label(gridX + cellW + 9, gridY + row1 + 18, 'ĐỘ RỘNG');
    let cursor = gridX + cellW + 9;
    (
      [
        [`${nf(model.stats.advances, 0)} tăng`, COL.up],
        [`${nf(model.stats.unchanged, 0)} đứng`, COL.flat],
        [`${nf(model.stats.declines, 0)} giảm`, COL.dn],
      ] as const
    ).forEach(([text, color], index) => {
      if (index > 0) {
        c1.text(cursor, gridY + row1 + 36, ' · ', { size: 11, weight: 700, color: COL.navy });
        cursor += measure(' · ', 11, 700);
      }
      c1.text(cursor, gridY + row1 + 36, text, { size: 11, weight: 700, color });
      cursor += measure(text, 11, 700);
    });
  }
  drawVnIndexChart(c1.at(13, gridY + row1 + row2 + 4 + 4), input.model, input.content.levels, {
    W: 371,
    H: 452,
    vis: CHART_SESSIONS_MOBILE,
  });
  drawFooterMobile(
    c1,
    size,
    `Nguồn: Dữ liệu giá IQX · Chốt phiên ${dmy(input.date)} · Hỗ trợ, kháng cự và mũi tên nét đứt là kịch bản tham khảo, không phải dự báo.`,
    'Phân tích kỹ thuật, không phải khuyến nghị đầu tư · 1/5 · ',
  );
  pages.push(p1.page);

  // Trang 2: 3 nhận định + kịch bản.
  const p2 = newPage(size.width, size.height);
  const c2 = p2.canvas;
  drawMobileHead(c2, input.date);
  const blocks = COMMENT_KEYS.map((key) =>
    measureBlock(TITLES[key], input.content[key], 371, MOBILE_BLOCK),
  );
  const scenario = scenarioBlock(input.content.levels, 371, 11, 9, 12.4, MOBILE_BLOCK.titleSize);
  let y = 55 + 9;
  const overflow: CommentKey[] = [];
  blocks.forEach((block) => {
    drawSection(c2, 13, y, 371, block.height, block, MOBILE_BLOCK);
    y += block.height + 9;
  });
  scenario?.draw(c2, 13, y, 371);
  const bottom = y + (scenario?.height ?? -9);
  if (bottom > size.height - 42) {
    let longest = 0;
    blocks.forEach((block, index) => {
      if (block.height >= blocks[longest]!.height) longest = index;
    });
    overflow.push(COMMENT_KEYS[longest]!);
  }
  drawFooterMobile(
    c2,
    size,
    `Dữ liệu chốt phiên ${dmy(input.date)}`,
    'Phân tích kỹ thuật, không phải khuyến nghị đầu tư · 2/5 · ',
  );
  pages.push(p2.page);

  // Trang 3 đến 5: mỗi bộ lọc một trang.
  SLOT_NUMBERS.forEach((slot) => {
    const view = slotView(input, slot);
    const pg = newPage(size.width, size.height);
    const c = pg.canvas;
    c.rect(13, 13, size.width - 26, 30, { fill: COL.navy, rx: 7 });
    c.text(24, 32, 'BỘ LỌC CỔ PHIẾU', { size: 13, weight: 800, color: '#ffffff', spacing: 0.52 });
    c.text(size.width - 24, 31.5, `Phiên ${dm(input.date)}`, {
      anchor: 'end',
      size: 10.5,
      weight: 600,
      color: '#ffffff',
    });
    c.text(13, 61, `BỘ LỌC ${slot}`, { size: 10.5, weight: 800, color: COL.navy2, spacing: 0.63 });
    const titleLines = wrapText(view.name, 371, 16, 800).slice(0, 2);
    titleLines.forEach((line, i) =>
      c.text(13, 80 + i * 20.5, line, { size: 16, weight: 800, color: COL.navy }),
    );
    // Điều kiện nằm giữa tiêu đề và biểu đồ; bảng và biểu đồ có chiều cao cố định, điều kiện co lại lấy phần còn lại.
    const pushed = view.state === 'pushed' && view.chart !== null;
    const chartHeight = pushed ? 150 : 110;
    const tableHeight =
      15 + 22 + (view.state === 'pushed' ? Math.max(1, view.picks.length) * 19 : 30);
    const footerTop = size.height - 8 - (1 + 5 + 3 * 11);
    const condTop = 80 + (titleLines.length - 1) * 20.5 + 12;
    const condMax = Math.max(60, footerTop - 10 - tableHeight - 6 - chartHeight - 8 - condTop);
    const condUsed = drawConditions(
      c,
      13,
      condTop,
      371,
      condMax,
      view.conditions,
      [11.6, 10.8, 10],
      4,
    );
    const miniY = condTop + condUsed + 8;
    if (pushed) drawMiniChart(c.at(13, miniY), view.chart!, 371, 150, dm(input.date));
    else if (view.state === 'missing')
      drawPlaceholder(c, 13, miniY, 371, 110, NOT_PUSHED_CHART, COL.amber, '4 3');
    else drawPlaceholder(c, 13, miniY, 371, 110, NO_CHART, COL.line, '4 3');
    const afterChart = miniY + chartHeight + 6;
    c.text(13, afterChart + 11, captionOf(view, input.date), {
      size: 10.5,
      weight: 800,
      color: COL.navy,
      spacing: 0.42,
    });
    const empty =
      view.state === 'missing' ? NOT_PUSHED_TABLE : view.state === 'empty' ? NO_PASS : null;
    drawPicksTable(
      c,
      13,
      afterChart + 15,
      view.picks,
      {
        size: 12.5,
        headSize: 11,
        rowHeight: 19,
        headHeight: 22,
        padX: 5,
        columns: [75, 85, 85, 126],
      },
      empty,
      view.state === 'missing' ? COL.amberText : COL.ink2,
    );
    drawFooterMobile(
      c,
      size,
      'Giá: nghìn đồng · GTGD hôm nay: tỷ đồng · Biểu đồ: mã có GTGD lớn nhất',
      `Không phải khuyến nghị đầu tư · ${2 + slot}/5 · `,
    );
    pages.push(pg.page);
  });
  return { variant: 'mobile', pages, overflow };
}

/** Dựng toàn bộ trang của một bản (máy tính 2 trang, điện thoại 5 trang) từ cùng một đầu vào. */
export function renderBulletin(
  input: BulletinRenderInput,
  variant: BulletinVariant,
): RenderedBulletin {
  return variant === 'desktop' ? renderDesktop(input) : renderMobile(input);
}
