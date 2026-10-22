import type {
  CrossField,
  Draft,
  IndicatorConfig,
  Registry,
  RegistryField,
  RegistryIndicator,
  Rule,
  Operand,
  Side,
  SideConfig,
  SharedConfig,
} from './types';

/** The 16 indicators in the learning catalogue (web strategy/shared/indicators.ts). */
export const CATALOG_IDS = [
  'rsi', 'macd', 'ma', 'bollinger', 'volume', 'ema', 'ma_cross', 'dmi',
  'stochastic', 'cci', 'obv', 'mfi', 'cmf', 'donchian', 'roc', 'williams_r',
] as const;

export function isCatalogIndicator(id: string): boolean {
  return (CATALOG_IDS as readonly string[]).includes(id);
}

export const CHAPTER_TITLES: Record<number, string> = {
  4: 'Phương pháp kỹ thuật',
  6: 'Chỉ báo xu hướng',
  7: 'Chỉ báo động lượng và dòng tiền',
};

export const LOCKED_MESSAGE = 'Đạt bài kiểm tra của bài học chỉ báo này để bật.';
export const CONFLICT_MESSAGE = 'Cấu hình đã được lưu ở tab hoặc thiết bị khác.';

const EPS = 1e-6;
const FALLBACK_CROSS: Record<string, CrossField[]> = {
  macd: [{ left: 'fast', op: '<', right: 'slow' }],
  ma_cross: [{ left: 'fast', op: '<', right: 'slow' }],
};

/** Wire conversion. The web never applies `api_scale` (every registry field is 1), so values pass through. */
export function paramToWire(value: number, _field?: Pick<RegistryField, 'api_scale'>): number {
  return value;
}
export function paramFromWire(value: number, _field?: Pick<RegistryField, 'api_scale'>): number {
  return value;
}

export function fieldFor(ind: RegistryIndicator, side: Side, field: RegistryField): RegistryField {
  const o = ind[side].field_overrides?.[field.key];
  return o ? { ...field, ...o } : field;
}

export function parseParamText(text: string): number | null {
  const t = text.trim().replace(',', '.');
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** Vietnamese validation message for one param, or null when valid. */
export function paramError(field: RegistryField, value: number | null): string | null {
  const name = field.label;
  if (value === null) return `${name}: nhập một số hợp lệ.`;
  if (field.type === 'integer' && !Number.isInteger(value)) return `${name}: phải là số nguyên.`;
  if (value < field.min || value > field.max) return `${name}: từ ${field.min} đến ${field.max}.`;
  if (field.step > 0) {
    const steps = (value - field.min) / field.step;
    if (Math.abs(steps - Math.round(steps)) * field.step > EPS) return `${name}: theo bước ${field.step}.`;
  }
  return null;
}

export function crossFieldErrors(ind: RegistryIndicator, params: Record<string, number | null>): string[] {
  const list = ind.validation?.cross_fields?.length ? ind.validation.cross_fields : (FALLBACK_CROSS[ind.id] ?? []);
  const label = (k: string) => ind.fields.find((f) => f.key === k)?.label ?? k;
  const errs: string[] = [];
  for (const c of list) {
    const a = params[c.left];
    const b = params[c.right];
    if (a == null || b == null) continue;
    const ok = c.op === '<' ? a < b : c.op === '<=' ? a <= b : c.op === '>' ? a > b : a >= b;
    if (!ok) errs.push(`${label(c.left)} phải ${c.op === '<' ? 'nhỏ hơn' : c.op === '>' ? 'lớn hơn' : c.op} ${label(c.right)}.`);
  }
  return errs;
}

export function sideOf(cfg: IndicatorConfig | undefined, side: Side): SideConfig | undefined {
  return cfg?.[side];
}

/** A side is "used" only if master and the side are both on. */
export function isSideUsed(cfg: IndicatorConfig | undefined, side: Side): boolean {
  return !!cfg && cfg.master_enabled && !!cfg[side]?.enabled;
}

export function usedCount(config: Draft | Record<string, IndicatorConfig>, side: Side): number {
  return Object.keys(config).filter((id) => isCatalogIndicator(id) && isSideUsed(config[id], side)).length;
}

export function hasBuyCondition(shared: SharedConfig | null | undefined): boolean {
  return !!shared && usedCount(shared.config.indicators, 'buy') > 0;
}

function cloneSide(s: SideConfig): SideConfig {
  return { enabled: s.enabled, params: { ...s.params }, rules: s.rules.map((r) => ({ ...r, lhs: { ...r.lhs }, rhs: { ...r.rhs } })) };
}
export function cloneIndicator(c: IndicatorConfig): IndicatorConfig {
  return { master_enabled: c.master_enabled, buy: cloneSide(c.buy), sell: cloneSide(c.sell) };
}

/** Saved config merged over registry defaults so every catalogue indicator has a draft entry. */
export function draftFromSaved(registry: Registry, saved: SharedConfig): Draft {
  const out: Draft = {};
  for (const ind of registry.indicators) {
    if (!isCatalogIndicator(ind.id)) continue;
    const s = saved.config.indicators[ind.id];
    out[ind.id] = s
      ? cloneIndicator(s)
      : {
          master_enabled: false,
          buy: cloneSide({ enabled: false, params: ind.buy.params, rules: ind.buy.rules }),
          sell: cloneSide({ enabled: false, params: ind.sell.params, rules: ind.sell.rules }),
        };
  }
  return out;
}

export function isIndicatorDirty(a: IndicatorConfig | undefined, b: IndicatorConfig | undefined): boolean {
  return JSON.stringify(a ?? null) !== JSON.stringify(b ?? null);
}

export function dirtyIds(draft: Draft, base: Draft): string[] {
  return Object.keys(draft).filter((id) => isIndicatorDirty(draft[id], base[id]));
}

/** master = (buy||sell enabled) ? (activate || saved master) : false  (web buildIndicatorConfig). */
export function buildIndicatorConfig(saved: IndicatorConfig | undefined, draft: IndicatorConfig, activate = false): IndicatorConfig {
  const any = draft.buy.enabled || draft.sell.enabled;
  return {
    master_enabled: any ? activate || !!saved?.master_enabled || draft.master_enabled : false,
    buy: cloneSide(draft.buy),
    sell: cloneSide(draft.sell),
  };
}

export type PatchBody = {
  expected_revision: number;
  idempotency_key: string;
  indicators: Record<string, { master_enabled: boolean; buy: SideConfig; sell: SideConfig }>;
};

/** PATCH /strategy/shared-config body for the dirty indicators only. */
export function buildPatch(
  registry: Registry | null | undefined,
  saved: SharedConfig,
  draft: Draft,
  base: Draft,
  idempotencyKey: string,
): PatchBody {
  const indicators: PatchBody['indicators'] = {};
  for (const id of dirtyIds(draft, base)) {
    const built = buildIndicatorConfig(saved.config.indicators[id], draft[id]);
    const ind = registry?.indicators.find((i) => i.id === id);
    const wireSide = (s: SideConfig): SideConfig => {
      const params: Record<string, number> = {};
      for (const [k, v] of Object.entries(s.params)) params[k] = paramToWire(v, ind?.fields.find((f) => f.key === k));
      return { enabled: s.enabled, params, rules: s.rules };
    };
    indicators[id] = { master_enabled: built.master_enabled, buy: wireSide(built.buy), sell: wireSide(built.sell) };
  }
  return { expected_revision: saved.saved_revision, idempotency_key: idempotencyKey, indicators };
}

/** After a 409: keep what the user changed, follow the new saved config for the rest. */
export function rebaseDraft(draft: Draft, oldBase: Draft, newBase: Draft): Draft {
  const out: Draft = {};
  for (const id of Object.keys(newBase)) {
    out[id] = draft[id] && isIndicatorDirty(draft[id], oldBase[id]) ? draft[id] : cloneIndicator(newBase[id]);
  }
  return out;
}

export function withMaster(cfg: IndicatorConfig, on: boolean): IndicatorConfig {
  return { ...cloneIndicator(cfg), master_enabled: on };
}
export function withSideEnabled(cfg: IndicatorConfig, side: Side, enabled: boolean): IndicatorConfig {
  const next = cloneIndicator(cfg);
  next[side].enabled = enabled;
  if (enabled) next.master_enabled = true;
  else if (!next.buy.enabled && !next.sell.enabled) next.master_enabled = false;
  return next;
}
export function withParam(cfg: IndicatorConfig, side: Side, key: string, value: number): IndicatorConfig {
  const next = cloneIndicator(cfg);
  next[side].params[key] = value;
  return next;
}
export function withOp(cfg: IndicatorConfig, side: Side, ruleId: string, op: string): IndicatorConfig {
  const next = cloneIndicator(cfg);
  next[side].rules = next[side].rules.map((r) => (r.id === ruleId ? { ...r, op } : r));
  return next;
}

function operandLabel(o: Operand, ind: RegistryIndicator, side: Side): string {
  if (o.kind === 'param') {
    const f = ind.fields.find((x) => x.key === o.key);
    return f ? (ind[side].field_overrides?.[f.key]?.label ?? f.label) : (o.key ?? '—');
  }
  if (o.kind === 'const' || o.kind === 'number') return String(o.value ?? '—');
  const base = o.key && o.key !== 'value' ? `${ind.name} ${o.key}` : ind.name;
  if (o.offset === -1) return `${base} (phiên trước)`;
  if (o.offset != null && o.offset < -1) return `${base} (${-o.offset} phiên trước)`;
  return `${base} (hiện tại)`;
}

export function ruleLine(rule: Rule, ind: RegistryIndicator, side: Side): string {
  return `${operandLabel(rule.lhs, ind, side)} ${rule.op} ${operandLabel(rule.rhs, ind, side)}`;
}

/** Group catalogue indicators by chapter (ascending), keeping registry order within a chapter. */
export function groupByChapter(inds: RegistryIndicator[]): { chapter: number; title: string; items: RegistryIndicator[] }[] {
  const map = new Map<number, RegistryIndicator[]>();
  for (const i of inds) {
    if (!isCatalogIndicator(i.id)) continue;
    const c = i.chapter ?? 0;
    map.set(c, [...(map.get(c) ?? []), i]);
  }
  return [...map.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([chapter, items]) => ({ chapter, title: CHAPTER_TITLES[chapter] ?? `Chương ${chapter}`, items }));
}

export function isLearned(ind: RegistryIndicator, saved: SharedConfig | undefined): boolean {
  return !!ind.learned || !!saved?.granted_indicators?.includes(ind.id);
}
