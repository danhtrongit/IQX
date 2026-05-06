// ─── Mock Data for IQX Market Dashboard ─────────────────
// Used as fallback when backend is unavailable

import type { SectorDataUI, SectorDailyFlowUI, MacroIndicatorUI } from "./types";

export const mockMarketOverview = {
  vnindex: { value: 1284.56, change: 12.34, changePercent: 0.97, volume: 892_450_000, value_traded: 18_543_000_000_000, advance: 245, decline: 187, unchanged: 68, ceiling: 12, floor: 5 },
  hnxindex: { value: 235.12, change: -1.23, changePercent: -0.52, volume: 145_230_000, value_traded: 2_341_000_000_000, advance: 66, decline: 76, unchanged: 56, ceiling: 6, floor: 4 },
  upcomindex: { value: 95.78, change: 0.45, changePercent: 0.47, volume: 67_890_000, value_traded: 890_000_000_000, advance: 116, decline: 107, unchanged: 112, ceiling: 22, floor: 23 },
  vn30: { value: 1352.45, change: 15.67, changePercent: 1.17, volume: 342_100_000, value_traded: 9_200_000_000_000, advance: 20, decline: 8, unchanged: 2, ceiling: 0, floor: 0 },
  marketBreadth: { advance: 245, decline: 187, unchanged: 68, ceiling: 12, floor: 5 },
};

export const mockForeignFlow = {
  buyValue: 1_245_600_000_000,
  sellValue: 1_039_200_000_000,
  netValue: 206_400_000_000,
  buyVolume: 45_670_000,
  sellVolume: 38_900_000,
  topBuy: [
    { symbol: 'FPT', value: 312_500_000_000, volume: 2_340_000 },
    { symbol: 'VNM', value: 145_300_000_000, volume: 1_890_000 },
    { symbol: 'VCB', value: 98_700_000_000, volume: 450_000 },
    { symbol: 'SSI', value: 88_100_000_000, volume: 3_450_000 },
    { symbol: 'MSN', value: 76_400_000_000, volume: 890_000 },
  ],
  topSell: [
    { symbol: 'VIC', value: 312_200_000_000, volume: 1_230_000 },
    { symbol: 'HPG', value: 186_700_000_000, volume: 890_000 },
    { symbol: 'VHM', value: 134_800_000_000, volume: 670_000 },
    { symbol: 'STB', value: 112_300_000_000, volume: 560_000 },
    { symbol: 'MBB', value: 89_200_000_000, volume: 780_000 },
  ],
};

export const mockProprietaryTrading = {
  buyValue: 612_300_000_000,
  sellValue: 325_800_000_000,
  netValue: 612_300_000_000,
  netSellValue: -325_800_000_000,
  topBuy: [
    { symbol: 'FPT', value: 152_600_000_000, volume: 1_200_000 },
    { symbol: 'MWG', value: 98_700_000_000, volume: 890_000 },
    { symbol: 'TCB', value: 78_400_000_000, volume: 1_100_000 },
    { symbol: 'VPB', value: 63_200_000_000, volume: 340_000 },
    { symbol: 'VNM', value: 52_100_000_000, volume: 280_000 },
  ],
  topSell: [
    { symbol: 'HPG', value: 98_300_000_000, volume: 2_100_000 },
    { symbol: 'VIC', value: 76_400_000_000, volume: 1_450_000 },
    { symbol: 'STB', value: 58_700_000_000, volume: 890_000 },
    { symbol: 'VHM', value: 51_600_000_000, volume: 1_200_000 },
    { symbol: 'MBB', value: 40_800_000_000, volume: 670_000 },
  ],
};

export const mockAIAnalysis = {
  market: [
    'VN-Index duy trì xu hướng tích cực khi dòng tiền cải thiện ở nhóm vốn hóa lớn.',
    'Khối ngoại giao dịch thận trọng nhưng áp lực bán không quá lớn.',
    'Thanh khoản thị trường tăng nhẹ cho thấy tâm lý nhà đầu tư ổn định hơn.',
    'Cần theo dõi vùng kháng cự ngắn hạn để xác nhận đà bứt phá.',
  ],
  sector: [
    'Nhóm Ngân hàng và Chứng khoán tiếp tục dẫn dắt thị trường nhờ kết quả kinh doanh tích cực và dòng tiền mạnh.',
    'Bất động sản phân hóa, thanh khoản cải thiện ở một số mã đầu ngành có thông tin hỗ trợ.',
    'Dòng tiền tập trung vào các ngành có thanh khoản cao như Ngân hàng, Chứng khoán, Bán lẻ.',
    'Nhóm Thép và Dầu khí vận động tích lũy, chờ động lực mới.',
  ],
};

export const mockNews = [
  {
    id: 1,
    title: 'NHNN điều chỉnh tăng trần tăng trưởng tín dụng năm 2025',
    source: 'Vietcap Research',
    time: '15m',
    category: 'macro' as const,
    isHot: true,
  },
  {
    id: 2,
    title: 'Nhiều dự án BĐS lớn được gỡ vướng pháp lý, nguồn cung cải thiện',
    source: 'Vietcap',
    time: '32m',
    category: 'company' as const,
    isHot: false,
  },
  {
    id: 3,
    title: 'Giá thép trong nước tiếp tục ổn định, nhu cầu phục hồi nhẹ',
    source: 'Vietcap Research',
    time: '1h',
    category: 'commodity' as const,
    isHot: false,
  },
  {
    id: 4,
    title: 'Xuất khẩu dệt may 4 tháng đầu năm tăng 9,2% so với cùng kỳ',
    source: 'Vietcap',
    time: '2h',
    category: 'earnings' as const,
    isHot: false,
  },
  {
    id: 5,
    title: 'FPT ký hợp tác chiến lược AI với tập đoàn công nghệ Nhật Bản',
    source: 'Vietcap Research',
    time: '3h',
    category: 'company' as const,
    isHot: true,
  },
];

export const mockMacroIndicators: MacroIndicatorUI[] = [
  { name: 'GDP Q1/2025', value: '6.93%', change: '+0.28%', trend: 'up' },
  { name: 'CPI T4/2025', value: '3.12%', change: '+0.15%', trend: 'up' },
  { name: 'PMI T4/2025', value: '50.3', change: '-0.4', trend: 'down' },
  { name: 'Tăng trưởng tín dụng', value: '3.45%', change: '+0.32%', trend: 'up' },
  { name: 'Xuất nhập khẩu T4/2025', value: '66.2 tỷ USD', change: '+4.21%', trend: 'up' },
];

export const mockCommodities = [
  { name: 'Dầu Brent', value: '81.42', unit: 'USD/thùng', change: '-0.85', changePercent: -1.03, trend: 'down' as const, icon: 'Droplets' as const },
  { name: 'Vàng', value: '2,380.50', unit: 'USD/oz', change: '+12.30', changePercent: 0.52, trend: 'up' as const, icon: 'Gem' as const },
  { name: 'Đồng', value: '9,832.00', unit: 'USD/tấn', change: '+110.00', changePercent: 1.12, trend: 'up' as const, icon: 'Droplets' as const },
  { name: 'Than đá', value: '113.45', unit: 'USD/tấn', change: '-0.89', changePercent: -0.78, trend: 'down' as const, icon: 'Droplets' as const },
  { name: 'Quặng sắt', value: '108.60', unit: 'USD/tấn', change: '+0.70', changePercent: 0.64, trend: 'up' as const, icon: 'Droplets' as const },
  { name: 'Lúa mì', value: '623.25', unit: 'USD/giạ', change: '-2.80', changePercent: -0.45, trend: 'down' as const, icon: 'Droplets' as const },
];

export const mockSectorData: SectorDataUI[] = [
  { code: 'bank', name: 'Ngân hàng', change: 1.68, volume: 210_432_000_000, marketCap: 1_245_000, totalValueVnd: 0, topStock: 'VCB', topChange: 2.1, advance: 23, decline: 3, label: 'Dẫn sóng' },
  { code: 'securities', name: 'Chứng khoán', change: 2.45, volume: 98_765_000_000, marketCap: 234_000, totalValueVnd: 0, topStock: 'SSI', topChange: 1.8, advance: 18, decline: 2, label: 'Hút tiền' },
  { code: 'realestate', name: 'Bất động sản', change: 0.85, volume: 76_321_000_000, marketCap: 567_000, totalValueVnd: 0, topStock: 'VHM', topChange: 3.4, advance: 32, decline: 12, label: 'Tích lũy' },
  { code: 'steel', name: 'Thép', change: 0.35, volume: 42_118_000_000, marketCap: 178_000, totalValueVnd: 0, topStock: 'HPG', topChange: -0.3, advance: 11, decline: 6, label: 'Hồi kỹ thuật' },
  { code: 'retail', name: 'Bán lẻ', change: 1.12, volume: 28_457_000_000, marketCap: 123_000, totalValueVnd: 0, topStock: 'MWG', topChange: 0.9, advance: 14, decline: 5, label: 'Tích lũy' },
  { code: 'energy', name: 'Dầu khí', change: -0.28, volume: 19_876_000_000, marketCap: 289_000, totalValueVnd: 0, topStock: 'GAS', topChange: -0.1, advance: 6, decline: 7, label: 'Suy yếu' },
];

export const mockSectorDailyFlow: SectorDailyFlowUI[] = [
  { date: 'Ngân hàng', volume: 210.4, performance: 1.68 },
  { date: 'Chứng khoán', volume: 98.8, performance: 2.45 },
  { date: 'Bất động sản', volume: 76.3, performance: 0.85 },
  { date: 'Thép', volume: 42.1, performance: 0.35 },
  { date: 'Bán lẻ', volume: 28.5, performance: 1.12 },
  { date: 'Dầu khí', volume: 19.9, performance: -0.28 },
];

export const mockLeadingStocks = [
  { symbol: 'VIC', name: 'Vingroup', price: 106_900, priceChange: 2_700, change: 2.59, volume: 3_200_000, contribution: 1.85 },
  { symbol: 'VCB', name: 'Vietcombank', price: 92_600, priceChange: 1_200, change: 1.31, volume: 4_560_000, contribution: 1.21 },
  { symbol: 'FPT', name: 'FPT Corp', price: 129_700, priceChange: 2_700, change: 2.12, volume: 2_100_000, contribution: 1.08 },
  { symbol: 'HPG', name: 'Hòa Phát', price: 26_850, priceChange: 550, change: 2.09, volume: 12_300_000, contribution: 0.66 },
  { symbol: 'SSI', name: 'SSI Securities', price: 24_200, priceChange: 700, change: 2.98, volume: 6_780_000, contribution: 0.55 },
  { symbol: 'MWG', name: 'Thế Giới Di Động', price: 64_100, priceChange: 1_300, change: 2.07, volume: 1_560_000, contribution: 0.42 },
];

export const mockInterbankRates = [
  { tenor: 'O/N', rate: 2.45, change: 0.05, sparkline: [2.35, 2.38, 2.42, 2.40, 2.43, 2.41, 2.45] },
  { tenor: '1W', rate: 2.78, change: 0.07, sparkline: [2.65, 2.68, 2.72, 2.70, 2.74, 2.75, 2.78] },
  { tenor: '2W', rate: 3.05, change: 0.06, sparkline: [2.95, 2.98, 3.00, 2.99, 3.02, 3.03, 3.05] },
  { tenor: '1M', rate: 3.45, change: 0.08, sparkline: [3.30, 3.33, 3.38, 3.36, 3.40, 3.42, 3.45] },
];

export const mockBondYields = [
  { tenor: '1Y', yield: 2.16, change: -0.02, prevWeek: 2.18 },
  { tenor: '3Y', yield: 2.34, change: 0.01, prevWeek: 2.32 },
  { tenor: '5Y', yield: 2.72, change: -0.03, prevWeek: 2.74 },
  { tenor: '10Y', yield: 3.05, change: 0.05, prevWeek: 3.00 },
  { tenor: '15Y', yield: 3.25, change: 0.03, prevWeek: 3.22 },
];

export const mockFXRates = [
  { currency: 'USD/VND', price: 25_230, change: 30, changePercent: 0.12, flag: '🇺🇸', sparkline: [25180, 25190, 25210, 25200, 25220, 25225, 25230] },
  { currency: 'EUR/VND', price: 28_250, change: -40, changePercent: -0.14, flag: '🇪🇺', sparkline: [28310, 28290, 28280, 28270, 28260, 28255, 28250] },
  { currency: 'JPY/VND', price: 162.35, change: 0.28, changePercent: 0.17, flag: '🇯🇵', sparkline: [161.90, 162.00, 162.10, 162.15, 162.20, 162.30, 162.35] },
  { currency: 'CNY/VND', price: 3_498, change: -6, changePercent: -0.17, flag: '🇨🇳', sparkline: [3510, 3508, 3505, 3502, 3500, 3499, 3498] },
];

// OHLCV mock for VNINDEX chart (60 days)
export const mockVNIndexOHLCV = Array.from({ length: 60 }, (_, i) => {
  const date = new Date(2026, 3, 22);
  date.setDate(date.getDate() - (60 - i));
  const base = 1240 + Math.sin(i / 5) * 30 + i * 0.7;
  return {
    time: Math.floor(date.getTime() / 1000),
    open: base + Math.random() * 10 - 5,
    high: base + Math.random() * 15 + 2,
    low: base - Math.random() * 15 - 2,
    close: base + Math.random() * 10 - 5,
    volume: 500_000_000 + Math.random() * 500_000_000,
  };
});
