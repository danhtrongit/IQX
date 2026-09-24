type Json = Record<string, unknown>;
type Fragment = {
  type: 'text' | 'number' | 'highlight' | 'emphasis';
  content: string;
  variant?: string;
};

const LEVELS: Record<string, Record<string, number>> = {
  L1: { 'Rất yếu': 1, Yếu: 2, 'Trung bình': 3, Mạnh: 4, 'Rất mạnh': 5 },
  L2: { 'Rất yếu': 1, Yếu: 2, 'Bình thường': 3, Mạnh: 4, 'Rất mạnh': 5 },
  L3: { 'Cảnh báo mạnh': 1, 'Cảnh báo nhẹ': 2, 'Trung tính': 3, 'Hỗ trợ nhẹ': 4, 'Hỗ trợ mạnh': 5 },
  L4: { 'Cảnh báo mạnh': 1, 'Cảnh báo nhẹ': 2, 'Trung tính': 3, 'Hỗ trợ nhẹ': 4, 'Hỗ trợ mạnh': 5 },
  L5: { 'Rất tiêu cực': 1, 'Tiêu cực': 2, 'Trung tính': 3, 'Tích cực': 4, 'Rất tích cực': 5 },
};
const NAMES: Record<string, string> = {
  L1: 'Xu hướng',
  L2: 'Thanh khoản',
  L3: 'Dòng tiền',
  L4: 'Nội bộ',
  L5: 'Tin tức',
};
const FIELDS: Record<string, readonly [string, string][]> = {
  L1: [
    ['xu_huong', 'Xu hướng'],
    ['statusLabel', 'Trạng thái'],
    ['ho_tro', 'Hỗ trợ'],
    ['khang_cu', 'Kháng cự'],
    ['da_gia', 'Đà giá'],
  ],
  L2: [
    ['thanh_khoan', 'Thanh khoản'],
    ['cung_cau', 'Cung–Cầu'],
    ['tac_dong', 'Tác động'],
  ],
  L3: [
    ['khoi_ngoai', 'Khối ngoại'],
    ['tu_doanh', 'Tự doanh'],
    ['statusLabel', 'Tác động'],
  ],
  L4: [
    ['noi_bo', 'Nội bộ'],
    ['khoi_luong_tong', 'Khối lượng tổng'],
    ['statusLabel', 'Tác động'],
  ],
  L5: [
    ['tong_quan', 'Tổng quan'],
    ['tac_dong', 'Tác động'],
  ],
};
const TAG = /\[(bull|bear|warn|info|num|gold|hl)\]([\s\S]*?)\[\/\1\]/g;
const RESIDUAL = /\[\/?(?:bull|bear|warn|info|num|gold|hl)\]/g;

/** Parse model markup into the fragment arrays consumed by the stock UI. */
export function parseInsightFragments(value: unknown): Fragment[] {
  if (typeof value !== 'string' || !value) return [];
  const fragments: Fragment[] = [];
  const addPlain = (part: string) => {
    const content = part.replace(RESIDUAL, '');
    if (content) fragments.push({ type: 'text', content });
  };
  let end = 0;
  for (const match of value.matchAll(TAG)) {
    addPlain(value.slice(end, match.index));
    const content = (match[2] ?? '').replace(RESIDUAL, '');
    const tag = match[1];
    if (tag === 'num') fragments.push({ type: 'number', content });
    else if (tag === 'gold' || tag === 'hl') fragments.push({ type: 'highlight', content });
    else fragments.push({ type: 'emphasis', content, variant: tag });
    end = match.index + match[0].length;
  }
  addPlain(value.slice(end));
  return fragments;
}

function object(value: unknown): Json {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Json) : {};
}
function rows(value: unknown): Json[] {
  const list = Array.isArray(value) ? value : object(value).data;
  return Array.isArray(list) ? list.map(object).filter((row) => Object.keys(row).length > 0) : [];
}
function pick(row: Json, keys: string[]): unknown {
  for (const key of keys) if (row[key] !== null && row[key] !== undefined) return row[key];
  return null;
}
function rawInput(payload: Json): Json {
  if (Object.keys(object(payload.rawInput)).length) return object(payload.rawInput);
  const board = rows(payload.price_board)[0] ?? {};
  const ohlcv = rows(payload.ohlcv_30).map((row) => ({
    date: pick(row, ['tradingDate', 'date', 'time', 't']),
    open: pick(row, ['open', 'o']),
    high: pick(row, ['high', 'h']),
    low: pick(row, ['low', 'l']),
    close: pick(row, ['close', 'c']),
    volume: pick(row, ['volume', 'v']),
  }));
  const history = rows(payload.trading_history)
    .slice(0, 10)
    .map((row) => ({
      date: pick(row, ['trading_date', 'tradingDate', 'date']),
      totalVolume: pick(row, ['totalVolume', 'total_volume', 'total_buy_trade_volume']),
    }));
  const flow = (value: unknown) =>
    rows(value)
      .slice(0, 10)
      .map((row) => ({
        date: pick(row, ['tradingDate', 'trading_date', 'date']),
        totalNetVolume: pick(row, [
          'totalNetVolume',
          'total_net_volume',
          'netVolume',
          'net_volume',
        ]),
      }));
  return {
    trend: { realtime: Object.keys(board).length ? board : null, ohlcv, computed: {} },
    liquidity: { latest: history[0] ?? null, avg30: null, history },
    moneyFlow: { foreign: flow(payload.foreign_trade), proprietary: flow(payload.proprietary) },
    insider: { transactions: [] },
    news: { items: rows(payload.news), tickerScore: null },
  };
}
function string(value: unknown): string {
  return typeof value === 'string' ? value : '';
}
function diff(value: unknown, first: boolean): Json {
  const content = string(value);
  return {
    text: parseInsightFragments(content),
    hasChange: !first && !!content.trim() && !/ổn định|lần đầu/i.test(content),
    isFirstAnalysis: first,
  };
}
function newsItems(value: unknown, material: boolean): Json[] {
  if (!Array.isArray(value)) return [];
  return value.map(object).map((item) => ({
    title: string(item.tieu_de),
    tag: string(item.tag),
    ...(material && item.tac_dong_ngan ? { subtitle: string(item.tac_dong_ngan) } : {}),
  }));
}
function layerCard(key: string, raw: Json, first: boolean): Json {
  const statusLabel = string(raw.statusLabel);
  const fields = (FIELDS[key] ?? []).flatMap(([source, label]) =>
    raw[source] ? [{ label, value: parseInsightFragments(raw[source]) }] : [],
  );
  if (key === 'L5') {
    const material = newsItems(raw.tin_material, true);
    const filler = newsItems(raw.tin_filler, false);
    if (material.length)
      fields.splice(1, 0, {
        label: 'Tin trọng yếu',
        value: parseInsightFragments(
          material
            .map(
              (item) => `${item.title} [${item.tag}]${item.subtitle ? ` — ${item.subtitle}` : ''}`,
            )
            .join('; '),
        ),
      });
    if (filler.length)
      fields.splice(material.length ? 2 : 1, 0, {
        label: 'Tin phụ',
        value: parseInsightFragments(
          filler.map((item) => `${item.title} [${item.tag}]`).join('; '),
        ),
      });
  }
  return {
    layerNum: key,
    layerName: NAMES[key],
    statusLabel,
    statusLevel: LEVELS[key]?.[statusLabel],
    fields,
    diff: diff(raw.diff, first),
    ...(key === 'L5'
      ? {
          news: {
            material: newsItems(raw.tin_material, true),
            filler: newsItems(raw.tin_filler, false),
          },
        }
      : {}),
  };
}
function briefingVariant(trend: string, status: string): string {
  const level = LEVELS.L1?.[status] ?? 3;
  if (trend.includes('Giảm')) return 'bear';
  if (trend.includes('Tăng') && level >= 4) return 'bull';
  if (trend.includes('Đi ngang') && level <= 2) return 'warn';
  return level <= 2 ? 'bear' : 'neutral';
}

export function buildInsightResponse(
  raw: Json,
  payload: Json,
  header: Json,
  updatedAt: string,
  first: boolean,
): Json {
  const l6 = object(raw.L6);
  const observations = object(l6.observations);
  const trend = string(l6.trend);
  const status = string(l6.status);
  return {
    symbol: payload.symbol,
    updatedAt,
    header,
    briefing: {
      updatedAt,
      trend,
      status,
      statusVariant: briefingVariant(trend, status),
      timeframe: string(l6.timeframe),
      narrative: parseInsightFragments(l6.narrative),
      diff: diff(l6.diff, first),
      observations: Object.fromEntries(
        ['liquidity', 'moneyFlow', 'insider', 'news', 'supportResistance'].map((key) => [
          key,
          parseInsightFragments(observations[key]),
        ]),
      ),
      watchLevels: Array.isArray(l6.watchLevels) ? l6.watchLevels : [],
      recommendation: l6.recommendation,
    },
    layers: Object.fromEntries(
      ['L1', 'L2', 'L3', 'L4', 'L5'].map((key) => [key, layerCard(key, object(raw[key]), first)]),
    ),
    rawInput: rawInput(payload),
  };
}
