// ─── Adapters: API response → UI shapes ─────────────────
// Each adapter maps raw backend data to the shape expected by panel components.
// Defensive: handles missing/null fields gracefully.

import type {
  ApiMarketIndex,
  ApiOHLCV,
  ApiForeignTopData,
  ApiProprietaryTopData,
  ApiIndexImpactData,
  ApiNewsItem,
  ApiAINewsItem,
  ApiAIDashboardResponse,
  ApiAIIndustryResponse,
  ApiMacroGDPItem,
  ApiMacroEconomyItem,
  ApiSectorInfoItem,
  ApiSectorRankingItem,
  ApiSectorAllocationItem,
  ApiIndustryRef,
  MarketOverviewUI,
  MarketIndexUI,
  ForeignFlowUI,
  ProprietaryTradingUI,
  LeadingStockUI,
  NewsItemUI,
  OHLCVBar,
  MacroIndicatorUI,
  SectorDataUI,
  SectorDailyFlowUI,
  AIAnalysisUI,
  CommodityUI,
  InterbankRateUI,
  FXRateUI,
} from "./types";

// ─── Market Index ────────────────────────────────────────

function toMarketIndexUI(item: ApiMarketIndex): MarketIndexUI {
  return {
    value: item.price ?? 0,
    change: item.change ?? 0,
    changePercent: item.change_percent ?? 0,
    volume: item.total_shares ?? 0,
    value_traded: (item.total_value_million_vnd ?? 0) * 1_000_000,
    advance: item.total_stock_increase ?? 0,
    decline: item.total_stock_decline ?? 0,
    unchanged: item.total_stock_no_change ?? 0,
    ceiling: item.total_stock_ceiling ?? 0,
    floor: item.total_stock_floor ?? 0,
  };
}

function findIndex(data: ApiMarketIndex[], symbol: string): ApiMarketIndex | undefined {
  return data.find((d) => d.symbol?.toUpperCase() === symbol.toUpperCase());
}

export function adaptMarketOverview(data: ApiMarketIndex[]): MarketOverviewUI {
  const vnindex = findIndex(data, "VNINDEX");
  const hnx = findIndex(data, "HNXIndex") ?? findIndex(data, "HNXINDEX");
  const upcom = findIndex(data, "HNXUpcomIndex") ?? findIndex(data, "UPCOMINDEX");
  // VN30 may not be in market-index endpoint, fallback to empty
  const vn30 = findIndex(data, "VN30");

  const vni = vnindex ? toMarketIndexUI(vnindex) : fallbackIndex();
  const hni = hnx ? toMarketIndexUI(hnx) : fallbackIndex();
  const upi = upcom ? toMarketIndexUI(upcom) : fallbackIndex();
  const v30 = vn30 ? toMarketIndexUI(vn30) : fallbackIndex();

  // Aggregate breadth from VNINDEX (HSX)
  return {
    vnindex: vni,
    hnxindex: hni,
    upcomindex: upi,
    vn30: v30,
    marketBreadth: {
      advance: vni.advance,
      decline: vni.decline,
      unchanged: vni.unchanged,
      ceiling: vni.ceiling,
      floor: vni.floor,
    },
  };
}

function fallbackIndex(): MarketIndexUI {
  return { value: 0, change: 0, changePercent: 0, volume: 0, value_traded: 0, advance: 0, decline: 0, unchanged: 0, ceiling: 0, floor: 0 };
}

// ─── OHLCV ──────────────────────────────────────────────

export function adaptOHLCV(data: ApiOHLCV[]): OHLCVBar[] {
  return data.map((bar) => ({
    time: bar.time ?? 0,
    open: bar.open ?? 0,
    high: bar.high ?? 0,
    low: bar.low ?? 0,
    close: bar.close ?? 0,
    volume: bar.volume ?? 0,
  }));
}

// ─── Foreign Flow Top ────────────────────────────────────

export function adaptForeignFlow(data: ApiForeignTopData): ForeignFlowUI {
  const topBuy = (data.net_buy ?? []).slice(0, 10).map((i) => ({
    symbol: i.symbol,
    value: Math.abs(i.net_value_vnd ?? 0),
    volume: Math.abs(i.buy_value_vnd ?? 0),
  }));
  const topSell = (data.net_sell ?? []).slice(0, 10).map((i) => ({
    symbol: i.symbol,
    value: Math.abs(i.net_value_vnd ?? 0),
    volume: Math.abs(i.sell_value_vnd ?? 0),
  }));

  const totalBuy = data.total_net_buy_vnd ?? 0;
  const totalSell = Math.abs(data.total_net_sell_vnd ?? 0);

  return {
    buyValue: totalBuy,
    sellValue: totalSell,
    netValue: totalBuy - totalSell,
    buyVolume: 0,
    sellVolume: 0,
    topBuy,
    topSell,
  };
}

// ─── Proprietary Top ─────────────────────────────────────

export function adaptProprietaryTrading(data: ApiProprietaryTopData): ProprietaryTradingUI {
  const topBuy = (data.buy ?? []).slice(0, 10).map((i) => ({
    symbol: i.ticker,
    value: Math.abs(i.total_value_vnd ?? 0),
    volume: i.total_volume ?? 0,
  }));
  const topSell = (data.sell ?? []).slice(0, 10).map((i) => ({
    symbol: i.ticker,
    value: Math.abs(i.total_value_vnd ?? 0),
    volume: i.total_volume ?? 0,
  }));

  const buyTotal = topBuy.reduce((s, i) => s + i.value, 0);
  const sellTotal = topSell.reduce((s, i) => s + i.value, 0);

  return {
    buyValue: buyTotal,
    sellValue: sellTotal,
    netValue: buyTotal,
    netSellValue: -sellTotal,
    topBuy,
    topSell,
  };
}

// ─── Index Impact → Leading Stocks ───────────────────────

export function adaptLeadingStocks(data: ApiIndexImpactData): LeadingStockUI[] {
  const combined = [
    ...(data.top_up ?? []).map((i) => ({ ...i, direction: "up" as const })),
    ...(data.top_down ?? []).map((i) => ({ ...i, direction: "down" as const })),
  ];

  // Sort by absolute impact descending
  combined.sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact));

  return combined.slice(0, 20).map((item) => {
    const priceChange = (item.match_price ?? 0) - (item.ref_price ?? 0);
    const changePct = item.ref_price ? (priceChange / item.ref_price) * 100 : 0;
    return {
      symbol: item.symbol,
      name: item.company_name ?? item.symbol,
      price: item.match_price ?? 0,
      priceChange,
      change: changePct,
      volume: 0,
      contribution: item.impact ?? 0,
    };
  });
}

// ─── News (RSS) ─────────────────────────────────────────

function timeSince(pubDate: string): string {
  try {
    const d = new Date(pubDate);
    const diff = Date.now() - d.getTime();
    const mins = Math.floor(diff / 60_000);
    if (mins < 1) return "mới";
    if (mins < 60) return `${mins}m`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h`;
    return `${Math.floor(hours / 24)}d`;
  } catch {
    return "";
  }
}

function inferCategory(item: ApiNewsItem): NewsItemUI["category"] {
  const text = (item.title + " " + item.description).toLowerCase();
  if (text.includes("ngân hàng") || text.includes("lãi suất") || text.includes("tín dụng") || text.includes("gdp") || text.includes("cpi"))
    return "macro";
  if (text.includes("cổ phiếu") || text.includes("chứng khoán") || text.includes("lợi nhuận") || text.includes("doanh thu"))
    return "earnings";
  if (text.includes("dầu") || text.includes("vàng") || text.includes("thép") || text.includes("than"))
    return "commodity";
  return "company";
}

export function adaptNews(data: ApiNewsItem[]): NewsItemUI[] {
  return data.slice(0, 15).map((item, idx) => ({
    id: idx + 1,
    title: item.title ?? "",
    source: item.site ?? "unknown",
    time: timeSince(item.pub_date ?? ""),
    category: inferCategory(item),
    isHot: idx < 2,
    link: item.link,
  }));
}

// ─── AI News (paginated) ─────────────────────────────────

function inferCategoryFromIndustry(industry: string): NewsItemUI["category"] {
  const text = industry.toLowerCase();
  if (text.includes("ngân hàng") || text.includes("tài chính") || text.includes("bảo hiểm"))
    return "macro";
  if (text.includes("dầu") || text.includes("khí") || text.includes("hóa chất") || text.includes("khoáng"))
    return "commodity";
  if (text.includes("chứng khoán") || text.includes("quỹ"))
    return "earnings";
  return "company";
}

export function adaptAINews(data: ApiAINewsItem[]): NewsItemUI[] {
  const categoryLabels: Record<string, string> = {
    macro: "Vĩ mô",
    earnings: "KQKD",
    company: "Doanh nghiệp",
    analysis: "Phân tích",
    commodity: "Hàng hóa",
  };

  // Rename verbose upstream labels to concise display names
  const labelRenames: Record<string, string> = {
    "Diễn biến Thị trường": "Chứng khoán",
    "Chứng khoán Thế giới": "Thế giới",
  };

  return data.map((item, idx) => {
    // Badge priority: topic_name → industry (non-OTHER) → ticker → category label
    const topicName = item.topic_name || undefined;
    const rawIndustry = item.industry && item.industry !== "OTHER" ? item.industry : undefined;
    const ticker = item.ticker || undefined;
    const category = inferCategoryFromIndustry(item.industry ?? "");
    const rawBadge = topicName || rawIndustry || ticker || categoryLabels[category] || category;
    const badgeLabel = labelRenames[rawBadge] ?? rawBadge;

    return {
      id: idx + 1,
      title: item.title ?? "",
      source: item.source_name ?? item.source ?? "unknown",
      time: timeSince(item.update_date?.replace(" ", "T") + "+07:00"),
      category,
      isHot: (item.score ?? 0) >= 9,
      link: item.source_link,
      sentiment: item.sentiment,
      badgeLabel,
    };
  });
}

// ─── AI Analysis (Dashboard / Industry) ──────────────────

export function adaptAIAnalysis(data: ApiAIDashboardResponse | ApiAIIndustryResponse): AIAnalysisUI {
  const text = data.analysis ?? "";
  if (!text.trim()) return { bullets: [] };

  // Step 1: split by newlines / bullet / numbered list
  let lines = text
    .split(/\n+/)
    .map((line: string) => line.replace(/^\d+\.\s*/, "").replace(/^[-•*]\s*/, "").trim())
    .filter((line: string) => line.length > 0);

  // Step 2: if only one long paragraph, split by Vietnamese sentence delimiters
  if (lines.length === 1 && lines[0].length > 80) {
    lines = lines[0]
      .split(/(?<=[.!?;])\s+/)
      .map((s: string) => s.trim())
      .filter((s: string) => s.length > 0);
  }

  return { bullets: lines };
}

// ─── Macro GDP → MacroIndicatorUI ────────────────────────

export function adaptMacroGDP(data: ApiMacroGDPItem[]): MacroIndicatorUI[] {
  // Find the most recent "Tăng trưởng thực của GDP" > "Tổng GDP" entry
  const gdpGrowthItems = data.filter(
    (d) => d.group_name === "Tăng trưởng thực của GDP" && d.name === "Tổng GDP",
  );
  // Sort by time ascending for sparkline (oldest first)
  gdpGrowthItems.sort((a, b) => {
    if (a.year !== b.year) return a.year - b.year;
    return a.report_data_id - b.report_data_id;
  });

  const indicators: MacroIndicatorUI[] = [];

  // Latest GDP growth
  if (gdpGrowthItems.length >= 2) {
    const latest = gdpGrowthItems[gdpGrowthItems.length - 1];
    const prev = gdpGrowthItems[gdpGrowthItems.length - 2];
    const diff = latest.value - prev.value;
    const sparkline = gdpGrowthItems.map((d) => d.value);
    indicators.push({
      name: "GDP",
      subtitle: latest.report_time,
      value: `${latest.value}%`,
      change: `${diff >= 0 ? "+" : ""}${diff.toFixed(2)}%`,
      trend: diff >= 0 ? "up" : "down",
      sparkline: sparkline.length >= 2 ? sparkline : undefined,
    });
  }

  // Industry growth
  const industryGrowth = data.filter(
    (d) => d.group_name === "Tăng trưởng thực của GDP" && d.name === "Công nghiệp",
  );
  industryGrowth.sort((a, b) => a.report_data_id - b.report_data_id);
  if (industryGrowth.length >= 2) {
    const latest = industryGrowth[industryGrowth.length - 1];
    const prev = industryGrowth[industryGrowth.length - 2];
    const diff = latest.value - prev.value;
    const sparkline = industryGrowth.map((d) => d.value);
    indicators.push({
      name: "SX Công nghiệp",
      subtitle: latest.report_time,
      value: `${latest.value}%`,
      change: `${diff >= 0 ? "+" : ""}${diff.toFixed(2)}%`,
      trend: diff >= 0 ? "up" : "down",
      sparkline: sparkline.length >= 2 ? sparkline : undefined,
    });
  }

  // Service growth
  const serviceGrowth = data.filter(
    (d) => d.group_name === "Tăng trưởng thực của GDP" && d.name === "Dịch vụ",
  );
  serviceGrowth.sort((a, b) => a.report_data_id - b.report_data_id);
  if (serviceGrowth.length >= 2) {
    const latest = serviceGrowth[serviceGrowth.length - 1];
    const prev = serviceGrowth[serviceGrowth.length - 2];
    const diff = latest.value - prev.value;
    const sparkline = serviceGrowth.map((d) => d.value);
    indicators.push({
      name: "Dịch vụ",
      subtitle: latest.report_time,
      value: `${latest.value}%`,
      change: `${diff >= 0 ? "+" : ""}${diff.toFixed(2)}%`,
      trend: diff >= 0 ? "up" : "down",
      sparkline: sparkline.length >= 2 ? sparkline : undefined,
    });
  }

  // Agriculture growth
  const agriGrowth = data.filter(
    (d) => d.group_name === "Tăng trưởng thực của GDP" && d.name === "Nông nghiệp",
  );
  agriGrowth.sort((a, b) => a.report_data_id - b.report_data_id);
  if (agriGrowth.length >= 2) {
    const latest = agriGrowth[agriGrowth.length - 1];
    const prev = agriGrowth[agriGrowth.length - 2];
    const diff = latest.value - prev.value;
    const sparkline = agriGrowth.map((d) => d.value);
    indicators.push({
      name: "Nông nghiệp",
      subtitle: latest.report_time,
      value: `${latest.value}%`,
      change: `${diff >= 0 ? "+" : ""}${diff.toFixed(2)}%`,
      trend: diff >= 0 ? "up" : "down",
      sparkline: sparkline.length >= 2 ? sparkline : undefined,
    });
  }

  // Nominal GDP
  const nomGDP = data.filter(
    (d) => d.group_name === "Giá trị GDP hiện hành" && d.name === "GDP danh nghĩa",
  );
  nomGDP.sort((a, b) => a.report_data_id - b.report_data_id);
  if (nomGDP.length >= 1) {
    const latest = nomGDP[nomGDP.length - 1];
    const formatted = (latest.value / 1_000).toFixed(0);
    const sparkline = nomGDP.map((d) => d.value);
    indicators.push({
      name: "GDP Danh nghĩa",
      subtitle: latest.report_time,
      value: `${formatted} nghìn tỷ`,
      change: "",
      trend: "up",
      sparkline: sparkline.length >= 2 ? sparkline : undefined,
    });
  }

  return indicators.slice(0, 6);
}

// ─── Sector Information → SectorDataUI ───────────────────

export function adaptSectorData(
  sectors: ApiSectorInfoItem[],
  industryMap: Map<string, string>,
  ranking?: ApiSectorRankingItem[],
  allocation?: ApiSectorAllocationItem[],
): SectorDataUI[] {
  // Build ranking map: icb_code -> { latestScore, trend }
  const rankMap = new Map<string, { score: number; trend?: string }>();
  if (ranking) {
    for (const item of ranking) {
      const latest = item.values?.[0];
      if (latest) {
        rankMap.set(item.icb_code, {
          score: latest.value,
          trend: latest.sector_trend,
        });
      }
    }
  }

  // Build allocation map: icb_code -> total_value_vnd
  const allocMap = new Map<string, number>();
  if (allocation) {
    for (const item of allocation) {
      if (item.icb_code && item.total_value_vnd != null) {
        allocMap.set(String(item.icb_code), item.total_value_vnd);
      }
    }
  }

  return sectors
    .map((s) => {
      const name = industryMap.get(s.icb_code) ?? s.icb_code;
      const change1m = (s.percent_price_change_1m ?? 0) * 100;
      const change1w = (s.percent_price_change_1w ?? 0) * 100;
      const marketCap = s.market_cap ?? 0;
      const totalValueVnd = allocMap.get(s.icb_code) ?? 0;

      // Determine label using ranking score + trend if available
      const rank = rankMap.get(s.icb_code);
      let label = "Tích lũy";
      if (rank) {
        const { score, trend } = rank;
        if (score >= 60 && trend === "UP") label = "Dẫn sóng";
        else if (score >= 50 && trend === "UP") label = "Hút tiền";
        else if (score < 30) label = "Suy yếu";
        else if (score < 40 && trend === "DOWN") label = "Phân phối";
        else if (trend === "DOWN" && change1w > 0) label = "Hồi kỹ thuật";
        else if (score >= 40 && score < 50) label = "Tích lũy";
        else if (score >= 50) label = "Hút tiền";
      } else {
        if (change1m > 5) label = "Dẫn sóng";
        else if (change1m > 2) label = "Hút tiền";
        else if (change1m < -3) label = "Suy yếu";
        else if (change1m < -1) label = "Phân phối";
        else if (change1w > 0 && change1m < 0) label = "Hồi kỹ thuật";
      }

      return {
        code: s.icb_code,
        name,
        change: change1w,
        volume: marketCap,
        marketCap: Math.round(marketCap / 1e9),
        totalValueVnd,
        topStock: "",
        topChange: 0,
        advance: 0,
        decline: 0,
        label,
      };
    })
    .sort((a, b) => (b.totalValueVnd || b.volume) - (a.totalValueVnd || a.volume));
}

// ─── Sector Info → SectorDailyFlowUI (for chart) ────────

export function adaptSectorDailyFlow(
  sectors: ApiSectorInfoItem[],
  industryMap: Map<string, string>,
  allocation?: ApiSectorAllocationItem[],
): SectorDailyFlowUI[] {
  // Build allocation map
  const allocMap = new Map<string, number>();
  if (allocation) {
    for (const item of allocation) {
      if (item.icb_code && item.total_value_vnd != null) {
        allocMap.set(String(item.icb_code), item.total_value_vnd);
      }
    }
  }

  return sectors
    .map((s) => {
      const name = industryMap.get(s.icb_code) ?? s.icb_code;
      const totalValueVnd = allocMap.get(s.icb_code) ?? 0;
      const gtgdTrillion = totalValueVnd / 1e12;
      const performance = (s.percent_price_change_1w ?? 0) * 100;
      const perfHistory = s.last_20_day_index?.length >= 2 ? s.last_20_day_index : undefined;
      return {
        date: name,
        volume: Math.round(gtgdTrillion * 100) / 100,
        performance: Math.round(performance * 100) / 100,
        perfHistory,
        totalValueVnd,
      };
    })
    .sort((a, b) => (b.totalValueVnd ?? 0) - (a.totalValueVnd ?? 0))
    .slice(0, 5);
}

// ─── Industry Reference → Map<icb_code, icb_name> ───────

export function buildIndustryMap(data: ApiIndustryRef[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const item of data) {
    if (item.level === 1 || item.level === 2) {
      map.set(item.icb_code, item.icb_name);
    }
  }
  return map;
}

// ─── Commodity OHLCV → CommodityUI ──────────────────────

const COMMODITY_UNITS: Record<string, string> = {
  gold_global: "USD/oz",
  oil_crude: "USD/thùng",
  gas_natural: "USD/MMBtu",
  iron_ore: "USD/tấn",
  steel_hrc: "USD/tấn",
  corn: "USD/giạ",
};

export function adaptCommodityFromOHLCV(
  code: string,
  name: string,
  data: ApiOHLCV[],
): CommodityUI | null {
  if (!data || data.length < 2) return null;
  // Data is sorted by time ascending; take last 2
  const latest = data[data.length - 1];
  const prev = data[data.length - 2];
  const close = latest.close;
  const prevClose = prev.close;
  if (close == null || prevClose == null || prevClose === 0) return null;

  const change = close - prevClose;
  const changePercent = (change / prevClose) * 100;

  // Build sparkline from last N close prices
  const sparkline = data.slice(-20).map((b) => b.close).filter((v) => v != null);

  return {
    code,
    name,
    value: close >= 100 ? close.toLocaleString("en-US", { maximumFractionDigits: 1 }) : close.toFixed(2),
    unit: COMMODITY_UNITS[code] ?? "USD",
    change: `${change >= 0 ? "+" : ""}${change.toFixed(2)}`,
    changePercent,
    trend: change >= 0 ? "up" : "down",
    sparkline: sparkline.length >= 2 ? sparkline : undefined,
  };
}

// ─── Interbank Rates → InterbankRateUI[] ─────────────────

const TENOR_MAP: Record<string, string> = {
  "Qua đêm": "O/N",
  " 1 tuần ": "1W",
  " 2 tuần ": "2W",
  " 1 tháng ": "1M",
  " 3 tháng  ": "3M",
  " 6 tháng  ": "6M",
};

const TENOR_ORDER = ["O/N", "1W", "2W", "1M", "3M", "6M"];

/** Parse "/Date(1776877200000)/" → epoch ms */
function parseMsDate(dayStr: string): number {
  const m = dayStr.match(/\/(\d+)\//); // /Date(12345)/
  return m ? Number(m[1]) : 0;
}

export function adaptInterbankRates(
  data: ApiMacroEconomyItem[],
): InterbankRateUI[] {
  // Filter only interbank rate group
  const rateItems = data.filter(
    (d) =>
      d.group_name === "Lãi suất bình quân liên ngân hàng (%/năm)" &&
      d.value != null,
  );

  // Group by tenor name → sorted by date desc
  const byTenor = new Map<string, { date: number; value: number }[]>();
  for (const item of rateItems) {
    const tenorLabel = TENOR_MAP[item.name];
    if (!tenorLabel) continue;
    const dateMs = parseMsDate(item.day);
    if (!byTenor.has(tenorLabel)) byTenor.set(tenorLabel, []);
    byTenor.get(tenorLabel)!.push({ date: dateMs, value: item.value! });
  }

  const result: InterbankRateUI[] = [];
  for (const tenor of TENOR_ORDER) {
    const entries = byTenor.get(tenor);
    if (!entries || entries.length === 0) continue;
    // Sort by date descending
    entries.sort((a, b) => b.date - a.date);
    const latest = entries[0].value;
    const prev = entries.length >= 2 ? entries[1].value : latest;
    // Sparkline: last 7 days, oldest first
    const sparkline = entries
      .slice(0, 7)
      .reverse()
      .map((e) => e.value);

    result.push({
      tenor,
      rate: latest,
      change: +(latest - prev).toFixed(4),
      sparkline,
    });
  }

  return result;
}

// ─── Exchange Rate → FXRateUI[] ──────────────────────────

export function adaptFXRates(
  data: ApiMacroEconomyItem[],
): FXRateUI[] {
  // Filter "Tỷ giá trung tâm" with unit USD/VNĐ
  const usdItems = data.filter(
    (d) =>
      d.name.includes("Tỷ giá trung tâm") &&
      d.unit === "USD/VNĐ" &&
      d.value != null,
  );

  if (usdItems.length === 0) return [];

  // Sort by date descending
  usdItems.sort((a, b) => parseMsDate(b.day) - parseMsDate(a.day));

  const latest = usdItems[0].value!;
  const prev = usdItems.length >= 2 ? usdItems[1].value! : latest;
  const change = latest - prev;
  const changePercent = prev !== 0 ? (change / prev) * 100 : 0;

  // Sparkline: last 7 days, oldest first
  const sparkline = usdItems
    .slice(0, 7)
    .reverse()
    .map((e) => e.value!);

  return [
    {
      currency: "USD/VND",
      price: latest,
      change,
      changePercent,
      flag: "🇺🇸",
      sparkline,
      isLive: true,
    },
  ];
}

// ─── Expanded Macro Indicators ──────────────────────────
/**
 * Helper: extract a single-series indicator from filtered items.
 * Items must already be filtered to ONE category/name.
 */
function buildIndicator(
  items: ApiMacroGDPItem[],
  label: string,
  opts: {
    /** If true, value is in VND (tỷ), format as "X nghìn tỷ". Otherwise treat as % */
    isVnd?: boolean;
    /** If true, change is computed as percentage change: (latest-prev)/prev*100 */
    pctChange?: boolean;
  } = {},
): MacroIndicatorUI | null {
  if (items.length === 0) return null;
  // Sort ascending by report_data_id (oldest → newest)
  const sorted = [...items].sort((a, b) => a.report_data_id - b.report_data_id);

  const latest = sorted[sorted.length - 1];
  const prev = sorted.length >= 2 ? sorted[sorted.length - 2] : undefined;
  const sparkline = sorted.map((d) => d.value);

  // Format value
  let formattedValue: string;
  if (opts.isVnd) {
    // Values are in tỷ VND → show as "X nghìn tỷ" if large
    if (latest.value >= 1000) {
      formattedValue = `${(latest.value / 1000).toFixed(1)} nghìn tỷ`;
    } else {
      formattedValue = `${latest.value.toFixed(1)} tỷ`;
    }
  } else {
    formattedValue = `${latest.value}%`;
  }

  // Format change
  let formattedChange = "";
  let trend: "up" | "down" = "up";
  if (prev) {
    if (opts.pctChange || opts.isVnd) {
      // Percentage change: (latest - prev) / prev * 100
      const pct = prev.value !== 0 ? ((latest.value - prev.value) / Math.abs(prev.value)) * 100 : 0;
      formattedChange = `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`;
      trend = pct >= 0 ? "up" : "down";
    } else {
      // Absolute diff (for % indicators like GDP, CPI)
      const diff = latest.value - prev.value;
      formattedChange = `${diff >= 0 ? "+" : ""}${diff.toFixed(2)}%`;
      trend = diff >= 0 ? "up" : "down";
    }
  }

  return {
    name: label,
    subtitle: latest.report_time,
    value: formattedValue,
    change: formattedChange,
    trend,
    sparkline: sparkline.length >= 2 ? sparkline : undefined,
  };
}

export function adaptMacroFromMultiple(
  results: { key: string; data: ApiMacroGDPItem[] }[],
): MacroIndicatorUI[] {
  const indicators: MacroIndicatorUI[] = [];

  for (const { key, data } of results) {
    if (!data || data.length === 0) continue;

    let result: MacroIndicatorUI | null = null;

    switch (key) {
      case "gdp": {
        // Filter to single series: "Tăng trưởng thực của GDP" → "Tổng GDP"
        const series = data.filter(
          (d) => d.group_name === "Tăng trưởng thực của GDP" && d.name === "Tổng GDP",
        );
        result = buildIndicator(series, "GDP");
        break;
      }
      case "cpi": {
        // Prefer YoY CPI: "So sánh với cùng kỳ năm trước"
        let series = data.filter((d) => d.name === "So sánh với cùng kỳ năm trước");
        // Fallback: any item with "CPI" in name
        if (series.length < 2) {
          series = data.filter((d) => d.name === "CPI" || d.name?.includes("CPI"));
        }
        result = buildIndicator(series, "CPI");
        break;
      }
      case "fdi": {
        // Filter to "Giải ngân" (disbursed FDI) — single series
        let series = data.filter((d) => d.name === "Giải ngân");
        // Fallback: "Thực hiện"
        if (series.length === 0) {
          series = data.filter((d) => d.name?.includes("Thực hiện"));
        }
        result = buildIndicator(series, "FDI giải ngân", { isVnd: false, pctChange: true });
        // FDI values are in triệu USD → format specially
        if (series.length >= 1) {
          const sorted = [...series].sort((a, b) => a.report_data_id - b.report_data_id);
          const latest = sorted[sorted.length - 1];
          const prev = sorted.length >= 2 ? sorted[sorted.length - 2] : undefined;
          const sparkline = sorted.map((d) => d.value);
          const pct = prev && prev.value !== 0
            ? ((latest.value - prev.value) / Math.abs(prev.value)) * 100
            : 0;
          result = {
            name: "FDI giải ngân",
            subtitle: latest.report_time,
            value: `${(latest.value / 1000).toFixed(1)} tỷ USD`,
            change: prev ? `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%` : "",
            trend: pct >= 0 ? "up" : "down",
            sparkline: sparkline.length >= 2 ? sparkline : undefined,
          };
        }
        break;
      }
      case "industrial_production": {
        // Filter to "Toàn ngành công nghiệp" for the aggregate growth rate
        let series = data.filter(
          (d) => d.name === "Toàn ngành công nghiệp",
        );
        // Fallback: filter by group "Tăng trưởng" if available
        if (series.length < 2) {
          series = data.filter(
            (d) => d.group_name?.includes("Tăng trưởng") && d.name === "Toàn ngành công nghiệp",
          );
        }
        // Last fallback: just take the first name that appears consistently
        if (series.length < 2) {
          series = data.filter((d) => d.name === data[0]?.name);
        }
        result = buildIndicator(series, "SX Công nghiệp");
        break;
      }
      case "export_import": {
        // Filter to a single series: "Tổng trị giá xuất khẩu"
        let series = data.filter((d) => d.name === "Tổng trị giá xuất khẩu");
        if (series.length >= 1) {
          // Values in triệu USD
          const sorted = [...series].sort((a, b) => a.report_data_id - b.report_data_id);
          const latest = sorted[sorted.length - 1];
          const prev = sorted.length >= 2 ? sorted[sorted.length - 2] : undefined;
          const sparkline = sorted.map((d) => d.value);
          const pct = prev && prev.value !== 0
            ? ((latest.value - prev.value) / Math.abs(prev.value)) * 100
            : 0;
          result = {
            name: "Xuất khẩu",
            subtitle: latest.report_time,
            value: `${(latest.value / 1000).toFixed(1)} tỷ USD`,
            change: prev ? `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%` : "",
            trend: pct >= 0 ? "up" : "down",
            sparkline: sparkline.length >= 2 ? sparkline : undefined,
          };
        }
        // Fallback: take first available name as single series
        if (!result && data.length >= 1) {
          const firstName = data[0].name;
          series = data.filter((d) => d.name === firstName);
          const sorted = [...series].sort((a, b) => a.report_data_id - b.report_data_id);
          const latest = sorted[sorted.length - 1];
          const prev = sorted.length >= 2 ? sorted[sorted.length - 2] : undefined;
          const sparkline = sorted.map((d) => d.value);
          const pct = prev && prev.value !== 0
            ? ((latest.value - prev.value) / Math.abs(prev.value)) * 100
            : 0;
          result = {
            name: "XNK",
            subtitle: latest.report_time,
            value: `${(latest.value / 1000).toFixed(1)} tỷ USD`,
            change: prev ? `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%` : "",
            trend: pct >= 0 ? "up" : "down",
            sparkline: sparkline.length >= 2 ? sparkline : undefined,
          };
        }
        break;
      }
      case "retail": {
        // Filter to "TỔNG SỐ:" for aggregate retail & services total
        // Unit is "Tỷ VNĐ", NOT percent!
        let series = data.filter((d) => d.name === "TỔNG SỐ:");
        // Fallback: "Bán lẻ hàng hóa"
        if (series.length < 2) {
          series = data.filter((d) => d.name === "Bán lẻ hàng hóa");
        }
        result = buildIndicator(series, "Tổng bán lẻ", { isVnd: true, pctChange: true });
        break;
      }
    }

    if (result) {
      indicators.push(result);
    }
  }

  return indicators.slice(0, 6);
}
