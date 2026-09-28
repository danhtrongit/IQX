import { ServiceUnavailableException } from '@nestjs/common';

import {
  HUNT_FILTER_LABELS,
  type HuntBar,
  type HuntDataSource,
  type HuntFilter,
  type HuntFilterSpec,
  type HuntResult,
} from './cap5.types.js';

export const CAP5_HUNT_DATA_SOURCE = Symbol('CAP5_HUNT_DATA_SOURCE');
export const FLOOR_EXCHANGE = 'HOSE';
export const MIN_AVERAGE_VALUE_VND = 1_000_000_000;
export const MIN_PRICE_VND = 3_000;
export const AVERAGE_SESSIONS = 20;
export const REQUIRED_CANDLES = 21;
export const TOP_RESULTS = 10;
export const FLOW_SESSIONS = 5;
export const MIN_ACCUMULATION_SESSIONS = 3;

export const FILTER_SPECS: Record<HuntFilter, HuntFilterSpec> = {
  ngoai: {
    ma: 'ngoai',
    icon: '🌍',
    ten: HUNT_FILTER_LABELS.ngoai,
    mo_ta: 'Mã được khối ngoại mua ròng đều',
    dieu_kien: 'Mua ròng ít nhất 3/5 phiên và tổng mua ròng dương',
    xep_hang_theo: 'Tổng giá trị mua ròng',
    nguon_du_lieu: 'Mua/bán ròng khối ngoại theo phiên',
  },
  tudoanh: {
    ma: 'tudoanh',
    icon: '🏦',
    ten: HUNT_FILTER_LABELS.tudoanh,
    mo_ta: 'Mã được tự doanh mua ròng đều',
    dieu_kien: 'Mua ròng ít nhất 3/5 phiên và tổng mua ròng dương',
    xep_hang_theo: 'Tổng giá trị mua ròng',
    nguon_du_lieu: 'Mua/bán ròng tự doanh theo phiên',
  },
  kl: {
    ma: 'kl',
    icon: '📊',
    ten: HUNT_FILTER_LABELS.kl,
    mo_ta: 'Khối lượng phiên gần nhất tăng đột biến',
    dieu_kien: 'Khối lượng ≥ 2× trung bình 20 phiên',
    xep_hang_theo: 'Tỷ lệ khối lượng/TB20',
    nguon_du_lieu: 'Nến ngày 21 phiên (giá + khối lượng)',
  },
  dinh: {
    ma: 'dinh',
    icon: '🚀',
    ten: HUNT_FILTER_LABELS.dinh,
    mo_ta: 'Giá đóng cửa vượt đỉnh 20 phiên trước',
    dieu_kien: 'Giá đóng cửa > mức cao nhất 20 phiên trước',
    xep_hang_theo: '% vượt đỉnh',
    nguon_du_lieu: 'Nến ngày 21 phiên',
  },
  tang: {
    ma: 'tang',
    icon: '🔥',
    ten: HUNT_FILTER_LABELS.tang,
    mo_ta: 'Giá tăng mạnh cùng khối lượng cao',
    dieu_kien: 'Tăng ≥ 3% và khối lượng ≥ 1,5× TB20',
    xep_hang_theo: '% tăng giá',
    nguon_du_lieu: 'Nến ngày 21 phiên (giá + khối lượng)',
  },
};

export class UnconfiguredHuntDataSource implements HuntDataSource {
  private unavailable(): never {
    throw new ServiceUnavailableException({
      code: 'CAP5_HUNT_PROVIDER_UNAVAILABLE',
      message: 'Chưa cấu hình nguồn dữ liệu săn mã',
    });
  }
  dailyBars(): Promise<Map<string, HuntBar[]>> {
    return this.unavailable();
  }
  netFlow(): Promise<Map<string, number[]> | null> {
    return this.unavailable();
  }
  restrictedSymbols(): Promise<Set<string> | null> {
    return this.unavailable();
  }
}

const finite = (value: number | null | undefined): value is number =>
  typeof value === 'number' && Number.isFinite(value);
const pct = (now: number, before: number) => ((now - before) / before) * 100;
const fmtTimes = (value: number) => `${value.toFixed(1).replace('.', ',')}×`;
const fmtPct = (value: number) => `${value >= 0 ? '+' : ''}${value.toFixed(1).replace('.', ',')}%`;
const fmtBillions = (value: number) =>
  `${value >= 0 ? '+' : ''}${(value / 1e9).toFixed(1).replace('.', ',')} tỷ`;

export function floorConditions(statusApplied: boolean) {
  return [
    {
      ma: 'san',
      ten: 'Chỉ mã HOSE',
      ap_dung: true,
      giai_thich: 'Sàn niêm yết lấy từ bảng mã nội bộ.',
    },
    {
      ma: 'thanh_khoan',
      ten: 'Giá trị giao dịch TB ≥ 1 tỷ đồng/phiên',
      ap_dung: true,
      giai_thich: 'Trung bình GTGD 20 phiên gần nhất.',
    },
    { ma: 'gia', ten: 'Giá ≥ 3.000đ', ap_dung: true, giai_thich: 'Giá đóng cửa phiên gần nhất.' },
    {
      ma: 'canh_bao',
      ten: 'Loại mã diện cảnh báo / kiểm soát / hạn chế giao dịch',
      ap_dung: statusApplied,
      giai_thich: statusApplied
        ? 'Danh sách trạng thái hiện hành từ nguồn chính thức của HOSE.'
        : 'CHƯA lọc được: nguồn trạng thái HOSE không trả dữ liệu hợp lệ.',
    },
  ];
}

export class HuntEngine {
  constructor(public readonly source: HuntDataSource) {}

  unavailable(filter: HuntFilter, reason: string, universeCount: number): HuntResult {
    return {
      filter: FILTER_SPECS[filter],
      available: false,
      unavailableReason: reason,
      matchedCount: null,
      universeCount,
      evaluatedCount: null,
      floorRejectedCount: null,
      missingDataCount: null,
      complete: null,
      incompleteWarning: null,
      items: [],
    };
  }

  async probe(filter: HuntFilter, universe: readonly string[]): Promise<[boolean, string | null]> {
    if (universe.length === 0) return [false, 'Rổ mã HOSE đang rỗng — chưa lọc được.'];
    if (filter !== 'ngoai' && filter !== 'tudoanh') return [true, null];
    const flows = await this.source.netFlow(universe, filter, FLOW_SESSIONS);
    if (flows === null)
      return [false, 'Nguồn mua ròng theo từng phiên không trả dữ liệu lúc này — chưa lọc được.'];
    const usable = universe.some((symbol) => (flows.get(symbol)?.length ?? 0) >= FLOW_SESSIONS);
    return usable
      ? [true, null]
      : [
          false,
          `Nguồn dòng tiền không trả đủ chuỗi ${FLOW_SESSIONS} phiên cho bất kỳ mã nào trong rổ.`,
        ];
  }

  async run(filter: HuntFilter, universe: readonly string[]): Promise<HuntResult> {
    return filter === 'ngoai' || filter === 'tudoanh'
      ? this.runFlow(filter, universe)
      : this.runBars(filter, universe);
  }

  private floorPass(bars: HuntBar[]): boolean | null {
    if (bars.length < REQUIRED_CANDLES) return null;
    const latest = bars.at(-1);
    if (!latest || !finite(latest.close) || latest.close <= 0) return null;
    const values = bars.slice(-AVERAGE_SESSIONS).map((bar) => bar.gtgdVnd);
    if (values.length < AVERAGE_SESSIONS || values.some((value) => !finite(value))) return null;
    const avg = values.reduce<number>((sum, value) => sum + (value ?? 0), 0) / values.length;
    return latest.close >= MIN_PRICE_VND && avg >= MIN_AVERAGE_VALUE_VND;
  }

  private volumeAverage(bars: HuntBar[]): number | null {
    const previous = bars.slice(-REQUIRED_CANDLES, -1).map((bar) => bar.volume);
    if (previous.length < AVERAGE_SESSIONS || previous.some((value) => !finite(value))) return null;
    const average = previous.reduce((sum, value) => sum + value, 0) / previous.length;
    return average > 0 ? average : null;
  }

  private evaluate(filter: HuntFilter, bars: HuntBar[]): [number, string] | null {
    const latest = bars.at(-1);
    const previous = bars.at(-2);
    if (!latest || !previous) return null;
    if (filter === 'kl') {
      const average = this.volumeAverage(bars);
      if (!average) return null;
      const times = latest.volume / average;
      return times >= 2 ? [times, `KL ${fmtTimes(times)} TB20 phiên`] : null;
    }
    if (filter === 'dinh') {
      const closes = bars.slice(-REQUIRED_CANDLES, -1).map((bar) => bar.close);
      if (closes.length < AVERAGE_SESSIONS || closes.some((value) => !finite(value))) return null;
      const peak = Math.max(...closes);
      if (peak <= 0 || latest.close <= peak) return null;
      const above = pct(latest.close, peak);
      return [above, `Vượt đỉnh 20 phiên ${fmtPct(above)}`];
    }
    const average = this.volumeAverage(bars);
    if (!average || previous.close <= 0) return null;
    const change = pct(latest.close, previous.close);
    const times = latest.volume / average;
    return change >= 3 && times >= 1.5
      ? [change, `${fmtPct(change)} · KL ${fmtTimes(times)} TB20 phiên`]
      : null;
  }

  private async runBars(filter: HuntFilter, universe: readonly string[]): Promise<HuntResult> {
    const map = await this.source.dailyBars(universe, REQUIRED_CANDLES);
    const hits: Array<[number, string, string, number, number | null]> = [];
    let missing = 0,
      rejected = 0,
      evaluated = 0;
    for (const symbol of universe) {
      const bars = map.get(symbol);
      if (!bars) {
        missing += 1;
        continue;
      }
      const pass = this.floorPass(bars);
      if (pass === null) {
        missing += 1;
        continue;
      }
      if (!pass) {
        rejected += 1;
        continue;
      }
      evaluated += 1;
      const match = this.evaluate(filter, bars);
      const latest = bars.at(-1),
        previous = bars.at(-2);
      if (!match || !latest) continue;
      hits.push([
        match[0],
        symbol,
        match[1],
        latest.close,
        previous && previous.close > 0 ? pct(latest.close, previous.close) : null,
      ]);
    }
    if (missing === universe.length)
      return this.unavailable(
        filter,
        `Không lấy được đủ ${REQUIRED_CANDLES} nến cho bất kỳ mã nào trong rổ ${universe.length} mã.`,
        universe.length,
      );
    return this.result(filter, universe.length, evaluated, rejected, missing, hits);
  }

  private async runFlow(
    filter: 'ngoai' | 'tudoanh',
    universe: readonly string[],
  ): Promise<HuntResult> {
    const flows = await this.source.netFlow(universe, filter, FLOW_SESSIONS);
    if (flows === null)
      return this.unavailable(
        filter,
        'Nguồn mua ròng theo từng phiên không trả dữ liệu lúc này.',
        universe.length,
      );
    if (!universe.some((symbol) => (flows.get(symbol)?.length ?? 0) >= FLOW_SESSIONS))
      return this.unavailable(
        filter,
        `Nguồn dòng tiền không trả đủ chuỗi ${FLOW_SESSIONS} phiên.`,
        universe.length,
      );
    const barsMap = await this.source.dailyBars(universe, REQUIRED_CANDLES);
    const hits: Array<[number, string, string, number, number | null]> = [];
    let missing = 0,
      rejected = 0,
      evaluated = 0;
    for (const symbol of universe) {
      const bars = barsMap.get(symbol),
        series = flows.get(symbol);
      if (!bars || !series || series.length < FLOW_SESSIONS) {
        missing += 1;
        continue;
      }
      const pass = this.floorPass(bars);
      if (pass === null) {
        missing += 1;
        continue;
      }
      if (!pass) {
        rejected += 1;
        continue;
      }
      evaluated += 1;
      const recent = series.slice(-FLOW_SESSIONS);
      const positive = recent.filter((value) => value > 0).length;
      const total = recent.reduce((sum, value) => sum + value, 0);
      const latest = bars.at(-1),
        previous = bars.at(-2);
      if (positive < MIN_ACCUMULATION_SESSIONS || total <= 0 || !latest) continue;
      hits.push([
        total,
        symbol,
        `${fmtBillions(total)} ròng · ${positive}/${FLOW_SESSIONS} phiên`,
        latest.close,
        previous && previous.close > 0 ? pct(latest.close, previous.close) : null,
      ]);
    }
    if (missing === universe.length)
      return this.unavailable(
        filter,
        'Không lấy được đủ nến ngày để áp dụng lọc sàn.',
        universe.length,
      );
    return this.result(filter, universe.length, evaluated, rejected, missing, hits);
  }

  private result(
    filter: HuntFilter,
    universeCount: number,
    evaluated: number,
    rejected: number,
    missing: number,
    hits: Array<[number, string, string, number, number | null]>,
  ): HuntResult {
    hits.sort((a, b) => b[0] - a[0] || a[1].localeCompare(b[1]));
    return {
      filter: FILTER_SPECS[filter],
      available: true,
      unavailableReason: null,
      matchedCount: hits.length,
      universeCount,
      evaluatedCount: evaluated,
      floorRejectedCount: rejected,
      missingDataCount: missing,
      complete: missing === 0,
      incompleteWarning:
        missing === 0
          ? null
          : `Đã bỏ qua ${missing}/${universeCount} mã vì thiếu dữ liệu; danh sách có thể còn sót mã thoả điều kiện.`,
      items: hits.slice(0, TOP_RESULTS).map(([rank, symbol, signal, price, change], index) => ({
        hang: index + 1,
        symbol,
        gia_vnd: Math.round(price),
        pct_thay_doi: change === null ? null : Math.round(change * 100) / 100,
        tin_hieu: signal,
        gia_tri_xep_hang: Math.round(rank * 10_000) / 10_000,
      })),
    };
  }
}
