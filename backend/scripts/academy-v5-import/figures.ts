import { tone as hexTone } from '../academy-v4-import/charts/tones.js';
import type { TextNormalizer } from '../academy-v4-import/inline.js';
import type { ChartModel, ChartTone } from '../../src/modules/academy/content/v5/schema.js';
import type { FigCall, RepData } from './source.js';

type Figure = Extract<ChartModel, { kind: 'figure' }>;
type Fundamental = Extract<ChartModel, { kind: 'fundamental' }>;

/** `FIG` colour keys of the mockup (`COL` in the page script) -> hex. */
const FIG_COLOURS: Readonly<Record<string, string>> = {
  up: '#2bb886',
  dn: '#e66767',
  bl: '#249bec',
  gd: '#dfb969',
  or: '#ff9f6e',
  pk: '#e879f9',
  s1: '#3987e5',
  s2: '#d95926',
  s3: '#199e70',
  tx: '#c9d6e4',
  pu: '#b99cff',
  wh: '#e7eff9',
};
/** Hex colours of the FIG palette that the v4 tone table does not know. */
const EXTRA_TONES: Readonly<Record<string, ChartTone>> = { '#b99cff': 'p4' };

/** Mockup colour (FIG key or hex) -> chart tone. */
export function figTone(c: unknown, where: string): ChartTone {
  if (typeof c !== 'string' || !c) throw new Error(`${where}: colour ${String(c)}`);
  const hex = (FIG_COLOURS[c] ?? c).toLowerCase();
  const extra = EXTRA_TONES[hex];
  if (extra) return extra;
  try {
    return hexTone(hex);
  } catch {
    throw new Error(`${where}: no chart tone for colour ${c}`);
  }
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isStr = (v: unknown): v is string => typeof v === 'string';

function known(o: Record<string, unknown>, keys: readonly string[], where: string): void {
  for (const k of Object.keys(o))
    if (!keys.includes(k)) throw new Error(`${where}: unknown option ${k}`);
}

/**
 * One `FIG.draw` call -> `figure` chart model. Defaults of the page script are made explicit where they change the
 * drawing (hbar bar colour `s1`, lines stripe colour `bl`); `null` options mean "absent".
 */
export function figureModel(norm: TextNormalizer, call: FigCall): Figure {
  const where = `FIG ${call.svgId}`;
  const o = call.opts;
  const txt = (v: unknown, what: string): string => {
    if (!isStr(v)) throw new Error(`${where}: ${what} is not text`);
    const s = norm.plain(v);
    if (!s) throw new Error(`${where}: empty ${what}`);
    return s;
  };
  const optTxt = (v: unknown, what: string): string | undefined =>
    v === null || v === undefined ? undefined : txt(v, what);
  const int = (v: unknown, what: string, fallback?: number): number => {
    if (v === undefined || v === null) {
      if (fallback === undefined) throw new Error(`${where}: ${what} missing`);
      return fallback;
    }
    if (!isNum(v) || !Number.isInteger(v)) throw new Error(`${where}: ${what} must be an integer`);
    return v;
  };
  const unit = (v: unknown): string =>
    v === undefined || v === null || v === '' ? '' : norm.text(String(v));
  const title = optTxt(o.title, 'title');

  switch (call.kind) {
    case 'formula': {
      known(o, ['items', 'ops', 'h', 'title'], where);
      if (title) throw new Error(`${where}: formula with a title`);
      const items = (o.items as Record<string, unknown>[]).map((it, i) => {
        known(it, ['t', 'v', 'c', 'n', 'hl', 'sz'], `${where} item ${i}`);
        const notes = ((it.n as unknown[] | undefined) ?? []).map((n) => txt(n, 'note'));
        return {
          t: txt(it.t, 'item title'),
          v: txt(String(it.v), 'item value'),
          tone: it.c === undefined || it.c === null ? figTone('tx', where) : figTone(it.c, where),
          ...(notes.length ? { notes } : {}),
          ...(it.hl ? { hl: true } : {}),
          ...(it.sz !== undefined && it.sz !== null ? { size: Number(it.sz) } : {}),
        };
      });
      // `→` between boxes becomes the `arrow` token (drawn by the renderer; arrow glyphs are banned in chart text).
      const ops = ((o.ops as unknown[] | undefined) ?? []).map((x) =>
        x === '→' ? 'arrow' : txt(x, 'operator'),
      );
      if (ops.length >= items.length)
        throw new Error(`${where}: ${ops.length} operators for ${items.length} boxes`);
      return { kind: 'figure', fig: 'formula', items, ops, height: int(o.h, 'h', 200) };
    }
    case 'hbar': {
      known(o, ['title', 'items', 'dec', 'unit', 'note', 'lw', 'rh', 'max'], where);
      const items = (o.items as unknown[][]).map(([l, v, c], i) => {
        if (!isNum(v)) throw new Error(`${where} item ${i}: value`);
        return { label: txt(l, 'label'), value: v, tone: figTone(c ?? 's1', where) };
      });
      const note = optTxt(o.note, 'note');
      return {
        kind: 'figure',
        fig: 'hbar',
        ...(title ? { title } : {}),
        items,
        decimals: int(o.dec, 'dec', 0),
        unit: unit(o.unit),
        ...(note ? { note } : {}),
        ...(o.lw !== undefined && o.lw !== null ? { label_width: int(o.lw, 'lw') } : {}),
        ...(o.rh !== undefined && o.rh !== null ? { row_height: int(o.rh, 'rh') } : {}),
        ...(isNum(o.max) ? { max: o.max } : {}),
      };
    }
    case 'stack': {
      known(o, ['title', 'parts', 'dec', 'unit', 'note'], where);
      const colours = new Map<string, string>();
      const parts = (o.parts as unknown[][]).map(([l, v, c], i) => {
        if (!isNum(v) || v < 0) throw new Error(`${where} part ${i}: value`);
        const t = figTone(c, where);
        const prev = colours.get(t);
        if (prev !== undefined && prev !== c)
          throw new Error(`${where}: colours ${prev} and ${String(c)} map to the same tone ${t}`);
        colours.set(t, String(c));
        return { label: txt(l, 'label'), value: v, tone: t };
      });
      const note = optTxt(o.note, 'note');
      return {
        kind: 'figure',
        fig: 'stack',
        ...(title ? { title } : {}),
        parts,
        decimals: int(o.dec, 'dec', 0),
        unit: unit(o.unit),
        ...(note ? { note } : {}),
      };
    }
    case 'wf': {
      known(o, ['title', 'items', 'dec', 'unit', 'h', 'colors'], where);
      const colors = (o.colors as unknown[] | undefined) ?? undefined;
      const items = (o.items as unknown[][]).map(([l, v, k], i) => {
        if (!isNum(v)) throw new Error(`${where} item ${i}: value`);
        if (k !== 'base' && k !== 'plus' && k !== 'minus' && k !== 'total')
          throw new Error(`${where} item ${i}: step ${String(k)}`);
        const c = colors?.[i];
        const step: 'base' | 'plus' | 'minus' | 'total' = k;
        return {
          label: txt(l, 'label'),
          value: v,
          step,
          ...(c ? { tone: figTone(c, where) } : {}),
        };
      });
      return {
        kind: 'figure',
        fig: 'wf',
        ...(title ? { title } : {}),
        items,
        decimals: int(o.dec, 'dec', 0),
        unit: unit(o.unit),
        height: int(o.h, 'h', 270),
      };
    }
    case 'lines': {
      known(o, ['title', 'rows'], where);
      const rows = (o.rows as unknown[][]).map(([a, b, c, col]) => {
        const code = optTxt(c === '' ? undefined : c, 'code');
        return {
          report: txt(a, 'report'),
          line: txt(b, 'line'),
          ...(code ? { code } : {}),
          tone: figTone(col ?? 'bl', where),
        };
      });
      return { kind: 'figure', fig: 'lines', ...(title ? { title } : {}), rows };
    }
    default:
      throw new Error(`${where}: unknown FIG kind ${call.kind}`);
  }
}

/** Decimals of the Dashboard formatter (`dec()` of the mockup), with `năm` at 1 (Dashboard v3 §9). */
export function decimalsOf(unit: string): number {
  if (unit === 'lần') return 2;
  if (unit === '%' || unit === 'điểm %' || unit === 'năm') return 1;
  return 0;
}

/** vi-VN number: `.` thousands, `,` decimals, real minus sign. Deterministic (no Intl). */
export function viNumber(v: number, decimals: number): string {
  const [int = '0', frac] = Math.abs(v).toFixed(decimals).split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const sign = v < 0 && Number(Math.abs(v).toFixed(decimals)) !== 0 ? '−' : '';
  return `${sign}${grouped}${frac ? `,${frac}` : ''}`;
}

const withUnit = (v: number, unit: string): string =>
  `${viNumber(v, decimalsOf(unit))}${unit === '%' ? '%' : unit ? ` ${unit}` : ''}`;

/**
 * REPD entry -> `fundamental` chart (the Dashboard chart object, stored with the lesson: spec v5 §2.4, §5.1). Kind F
 * stores its one series as `main: [{name, v}]`. `alt` = "<name>: <last value>" like the v4 representative charts.
 */
export function repModel(norm: TextNormalizer, key: string, d: RepData): Fundamental {
  const where = `REPD ${key}`;
  const allowed = ['name', 'kind', 'unit', 'labels', 'main', 'v', 'sub', 'ref', 'hero', 'mainUnit'];
  known(d as unknown as Record<string, unknown>, allowed, where);
  const series = (name: string, v: (number | null)[]) => ({ name: norm.plain(name), v: [...v] });
  let main: { name: string; v: (number | null)[] }[];
  if (d.kind === 'F') {
    if (d.main || !d.v) throw new Error(`${where}: kind F carries v only`);
    main = [series(d.name, d.v)];
  } else {
    if (!d.main || d.v) throw new Error(`${where}: kind ${d.kind} carries main only`);
    main = d.main.map((s) => series(s.name, s.v));
  }
  const chart: Fundamental['chart'] = {
    name: norm.plain(d.name),
    kind: d.kind as Fundamental['chart']['kind'],
    unit: norm.text(d.unit),
    labels: d.labels.map((l) => norm.plain(l)),
    main,
    ...(d.sub
      ? {
          sub: {
            unit: norm.text(d.sub.unit),
            type: d.sub.type,
            series: d.sub.series.map((s) => series(s.name, s.v)),
          },
        }
      : {}),
    ...(d.mainUnit !== undefined ? { mainUnit: norm.text(d.mainUnit) } : {}),
    ...(d.hero !== undefined ? { hero: d.hero } : {}),
    ...(d.ref !== undefined ? { ref: d.ref } : {}),
  };
  const head = d.hero ?? [...(main[0]?.v ?? [])].reverse().find((x): x is number => x !== null);
  if (head === undefined || head === null) throw new Error(`${where}: no value for the alt text`);
  return { kind: 'fundamental', chart, alt: `${chart.name}: ${withUnit(head, chart.unit)}` };
}
