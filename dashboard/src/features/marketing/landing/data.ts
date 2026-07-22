/* ============================================================
   IQX Landing — static showcase data.
   All numbers are the verified production figures from the build
   brief (do NOT invent user counts / AUM / "stocks analyzed today").
   Illustrative session: 19/06/2026.
   ============================================================ */

export type Tone = "up" | "down" | "warn" | "flat"

/* ── hero credibility metrics (count-up) ── */
export const HERO_METRICS: { value: number; suffix?: string; prefix?: string; label: string }[] = [
  { value: 2048, prefix: "~", label: "mã cổ phiếu phủ sóng" },
  { value: 38, label: "chỉ báo kỹ thuật" },
  { value: 17, label: "nguồn dữ liệu tích hợp" },
  { value: 6, label: "lớp phân tích AI" },
]

/* ── §1 AI Insight live demo: per-ticker teaser ── */
export interface InsightLayer {
  id: string
  name: string
  verdict: string
  tone: Tone
  note: string
}

export interface DemoStock {
  ticker: string
  sector: string
  price: string
  change: string
  tone: Tone
  trend: string
  status: string
  statusTone: Tone
  horizon: string
  /** L6 synthesis — the one soft recommendation phrase. */
  recommendation: string
  /** editorial briefing paragraph (plain prose). */
  brief: string
  /** the six layers; first (L1) is shown free, the rest gated. */
  layers: InsightLayer[]
}

export const DEMO_STOCKS: DemoStock[] = [
  {
    ticker: "VCB",
    sector: "Ngân hàng · VN30",
    price: "61,700",
    change: "+0.16%",
    tone: "up",
    trend: "Đi ngang",
    status: "Yếu",
    statusTone: "warn",
    horizon: "trung hạn 1–2 tuần",
    recommendation: "Quan sát thêm",
    brief:
      "Khối ngoại bán mạnh phiên thứ 3 liên tiếp khiến VCB khó bứt phá quanh 61,600. Tin phát hành trái phiếu và lãnh đạo mua thêm giữ tâm lý ổn định, nhưng chưa đủ lấn át áp lực bán. Vùng 61,600–61,900 sẽ quyết định hướng đi.",
    layers: [
      { id: "L1", name: "Xu hướng", verdict: "Yếu", tone: "warn", note: "Giá dưới MA20, động lượng suy yếu; chưa thủng hỗ trợ 61,600." },
      { id: "L2", name: "Thanh khoản", verdict: "Dưới trung bình", tone: "warn", note: "Khớp 15.6 triệu cp, thấp hơn trung bình 30 phiên." },
      { id: "L3", name: "Dòng tiền", verdict: "Cảnh báo nhẹ", tone: "down", note: "Khối ngoại bán ròng 3 phiên (−4.9 triệu cp); tự doanh mua nhẹ không đủ bù." },
      { id: "L4", name: "Nội bộ", verdict: "Tích cực", tone: "up", note: "Chuỗi mua từ HĐQT và Phó TGĐ trong 14 ngày, hỗ trợ tâm lý." },
      { id: "L5", name: "Tin tức", verdict: "Trung lập", tone: "flat", note: "Phát hành trái phiếu và tài chính số củng cố định giá dài hạn." },
      { id: "L6", name: "Tổng hợp", verdict: "Quan sát thêm", tone: "warn", note: "Cân bằng giữa nội bộ tích cực và dòng tiền ngoại tiêu cực." },
    ],
  },
  {
    ticker: "FPT",
    sector: "Công nghệ · VN30",
    price: "126,400",
    change: "−0.71%",
    tone: "down",
    trend: "Giảm ngắn hạn",
    status: "Áp lực",
    statusTone: "down",
    horizon: "trung hạn 1–2 tuần",
    recommendation: "Nên giảm bớt",
    brief:
      "Khối ngoại bán ròng 501 tỷ tạo áp lực thoái vốn rõ rệt lên nhóm công nghệ. Giá đánh mất MA20 với thanh khoản tăng — tín hiệu phân phối ngắn hạn. Cần dòng tiền nội hấp thụ trước khi cân nhắc vị thế mới.",
    layers: [
      { id: "L1", name: "Xu hướng", verdict: "Giảm", tone: "down", note: "Mất MA20, MACD cắt xuống; xu hướng ngắn hạn nghiêng bán." },
      { id: "L2", name: "Thanh khoản", verdict: "Cao bất thường", tone: "warn", note: "Khối lượng tăng vọt trong phiên giảm — dấu hiệu phân phối." },
      { id: "L3", name: "Dòng tiền", verdict: "Tiêu cực", tone: "down", note: "Khối ngoại bán ròng 501 tỷ, dẫn đầu nhóm xả công nghệ." },
      { id: "L4", name: "Nội bộ", verdict: "Trung lập", tone: "flat", note: "Không ghi nhận giao dịch nội bộ đáng chú ý 30 ngày." },
      { id: "L5", name: "Tin tức", verdict: "Trung lập", tone: "flat", note: "Không có tin material mới tác động trực tiếp tới giá." },
      { id: "L6", name: "Tổng hợp", verdict: "Nên giảm bớt", tone: "down", note: "Kỹ thuật và dòng tiền cùng tiêu cực; ưu tiên quản trị rủi ro." },
    ],
  },
  {
    ticker: "HPG",
    sector: "Thép · VN30",
    price: "27,850",
    change: "+1.64%",
    tone: "up",
    trend: "Hồi phục",
    status: "Cải thiện",
    statusTone: "up",
    horizon: "trung hạn 1–2 tuần",
    recommendation: "Có thể mua thử",
    brief:
      "HPG lấy lại MA20 với thanh khoản trên trung bình, dẫn dắt nhóm cyclical. Tự doanh quay lại mua ròng sau chuỗi bán, dòng tiền cải thiện. Giữ trên 27,500 mở ra dư địa hồi về vùng 29,000.",
    layers: [
      { id: "L1", name: "Xu hướng", verdict: "Cải thiện", tone: "up", note: "Vượt lại MA20, động lượng dương; cấu trúc hồi phục." },
      { id: "L2", name: "Thanh khoản", verdict: "Trên trung bình", tone: "up", note: "Dòng tiền tham gia tốt trong nhịp tăng, xác nhận xu hướng." },
      { id: "L3", name: "Dòng tiền", verdict: "Tích cực", tone: "up", note: "Tự doanh mua ròng trở lại; khối ngoại giảm cường độ bán." },
      { id: "L4", name: "Nội bộ", verdict: "Trung lập", tone: "flat", note: "Không có giao dịch nội bộ bất thường trong kỳ." },
      { id: "L5", name: "Tin tức", verdict: "Tích cực", tone: "up", note: "Kỳ vọng giá thép phục hồi theo chu kỳ đầu tư công." },
      { id: "L6", name: "Tổng hợp", verdict: "Có thể mua thử", tone: "up", note: "Đa lớp đồng thuận tích cực; canh vùng hỗ trợ để vào." },
    ],
  },
]

/* ── §2 daily market briefing snapshot ── */
export const MARKET = {
  date: "19/06/2026",
  time: "15:00",
  status: "Đã đóng cửa",
  verdict: "Rút tiền ngầm",
  verdictTone: "down" as Tone,
  headline: "Bề mặt chỉ −0.32%, nhưng bên dưới là một phiên rút tiền âm thầm.",
  sub: "Cổ phiếu vừa và nhỏ lao dốc · dòng tiền lớn cùng chiều bán",
  pulse: [
    { k: "VN-Index", v: "1,824.53", d: "−5.94 · −0.32%", tone: "down" as Tone },
    { k: "Độ rộng", v: "81 · 203", d: "1:2.5 · 62 đứng", tone: "flat" as Tone },
    { k: "Khối ngoại", v: "−1,868 tỷ", d: "bán ròng phiên 3", tone: "down" as Tone },
    { k: "Thanh khoản", v: "18,804 tỷ", d: "tương đương MA20", tone: "flat" as Tone },
  ],
  read: "VN-Index giảm nhẹ nhưng khối ngoại bán ròng phiên thứ 3 và độ rộng xấu đi — bề mặt êm, bên dưới là phiên phân phối. Vùng 1,815 là ranh giới cho phiên sau.",
  breadth: { up: 81, flat: 62, down: 203 },
  /* foreign net flow, 15 sessions (tỷ đồng) */
  foreign: [0.7, -0.8, -0.2, 1.4, 0.1, -0.3, -1.3, -2.6, 0.4, -0.5, -0.6, -1.8, -0.9, -1.2, -1.87],
  scenarios: [
    { cond: "Giữ trên 1,815 · KN bán < 800 tỷ", out: "tích lũy, hồi về 1,830", tone: "up" as Tone },
    { cond: "Mất 1,815 · KN bán > 1,000 tỷ", out: "test vùng 1,795–1,800", tone: "down" as Tone },
  ],
}

/* ── §3 features bento ── */
export interface Feature {
  id: string
  name: string
  tagline: string
  proof: string
  tier: "free" | "premium"
  icon: string // emoji glyph
}

export const FEATURES: Feature[] = [
  {
    id: "ai-insight",
    name: "AI Phân tích cổ phiếu",
    tagline: "Gõ một mã — nhận bài phân tích 6 lớp dễ đọc trong vài giây.",
    proof: "L1 Xu hướng · L2 Thanh khoản · L3 Dòng tiền · L4 Nội bộ · L5 Tin tức · L6 Tổng hợp",
    tier: "premium",
    icon: "◆",
  },
  {
    id: "market-daily",
    name: "Nhận định thị trường hằng ngày",
    tagline: "Bản tổng kết phiên + kịch bản phiên sau, viết sẵn mỗi chiều.",
    proof: "Tự sinh sau ATC T2–T6 · phân loại 5 kiểu phiên · có watchlist",
    tier: "free",
    icon: "◈",
  },
  {
    id: "backtest",
    name: "Strategy Lab — Backtester",
    tagline: "Kiểm chứng chiến lược trên dữ liệu lịch sử trước khi bỏ tiền thật.",
    proof: "38 yếu tố · mô phỏng T+2 · Sharpe (95% CI) · max DD · so với VN-Index",
    tier: "premium",
    icon: "▲",
  },
  {
    id: "alerts",
    name: "Cảnh báo qua Telegram",
    tagline: "Tín hiệu mua/bán gửi thẳng vào Telegram — khỏi dán mắt vào bảng điện.",
    proof: "10 tín hiệu preset · quét intraday ~10 phút/lần · @IQX_Alert_BOT",
    tier: "premium",
    icon: "◎",
  },
  {
    id: "bctc",
    name: "Phân tích Báo cáo Tài chính",
    tagline: "Đọc sức khỏe doanh nghiệp mà không cần tự bóc tách BCTC.",
    proof: "DuPont 5 bước · ROE/ROA/NIM tự tính · cầu nối NI→CFO→FCF",
    tier: "free",
    icon: "▣",
  },
  {
    id: "forensic",
    name: "Bộ chỉ số gian lận",
    tagline: "Ba thước đo phát hiện rủi ro chất lượng lợi nhuận trong một thẻ.",
    proof: "Altman Z-Score · Piotroski F (9 tiêu chí) · Beneish M-Score",
    tier: "premium",
    icon: "⬡",
  },
  {
    id: "valuation",
    name: "Định giá Football Field",
    tagline: "Cổ phiếu đang đắt hay rẻ so với vùng giá hợp lý — có marker giá realtime.",
    proof: "P/E band · RIM · Book floor · Justified P/B cho ngân hàng",
    tier: "premium",
    icon: "▥",
  },
  {
    id: "board",
    name: "Bảng giá realtime",
    tagline: "Giá và khớp lệnh cập nhật theo thời gian thực, kiểu iBoard.",
    proof: "DNSE WebSocket · orderbook L2 · tab VN30/HNX/UPCOM/ETF",
    tier: "free",
    icon: "▦",
  },
  {
    id: "chart",
    name: "Biểu đồ TradingView",
    tagline: "Vẽ phân tích một lần, giữ nguyên qua mọi phiên và thiết bị.",
    proof: "TradingView Charting Library · bản vẽ lưu per-user, đồng bộ thiết bị",
    tier: "free",
    icon: "◍",
  },
]

/* ── §4 how-it-works scrolly beats ── */
export const HOW_BEATS = [
  {
    n: "01",
    key: "Dữ liệu",
    title: "Thu thập dữ liệu đa nguồn",
    body: "IQX hợp nhất 17 nguồn dữ liệu và tính 38 chỉ báo kỹ thuật từ giá đã điều chỉnh — nền tảng định lượng cho mọi phân tích.",
    stat: "17 nguồn · 38 chỉ báo",
  },
  {
    n: "02",
    key: "Mô hình",
    title: "Phân tích qua 6 lớp",
    body: "Mỗi mã được bóc tách theo 6 lớp độc lập: xu hướng, thanh khoản, dòng tiền, nội bộ, tin tức và tổng hợp — mỗi lớp chấm theo thang 5 điểm.",
    stat: "6 lớp · thang 5 điểm",
  },
  {
    n: "03",
    key: "Kết luận",
    title: "Một kết luận dễ đọc",
    body: "Thay vì tín hiệu hộp đen, IQX viết một bản briefing tiếng Việt và một gợi ý mềm — giúp bạn nắm thông tin để tự quyết định.",
    stat: "Bằng tiếng Việt",
  },
]

/* ── §5 backtest equity curve (base-100) ── */
export const EQUITY = {
  strategy: [100, 103, 101, 108, 114, 111, 119, 126, 122, 131, 140, 138, 149, 158, 166],
  index: [100, 101, 100, 103, 105, 104, 107, 109, 108, 111, 113, 112, 115, 117, 118],
  kpis: [
    { k: "Lợi nhuận", v: "+66%", tone: "up" as Tone },
    { k: "So với VN-Index", v: "+48%", tone: "up" as Tone },
    { k: "Sharpe (95% CI)", v: "1.84", tone: "flat" as Tone },
    { k: "Max Drawdown", v: "−11.2%", tone: "down" as Tone },
  ],
}

export const ALERT_SAMPLE = {
  bot: "@IQX_Alert_BOT",
  signal: "MUA · Vượt MA20 + dòng tiền dương",
  ticker: "HPG",
  detail: "Giá 27,850 (+1.64%) vượt MA20 với khối lượng trên trung bình. Tự doanh mua ròng.",
  time: "10:42 · 19/06",
}

/* ── §6 research depth ── */
export const DUPONT = [
  { k: "Biên lợi nhuận ròng", v: "21.4%" },
  { k: "Vòng quay tài sản", v: "0.18×" },
  { k: "Đòn bẩy tài chính", v: "6.3×" },
  { k: "ROE", v: "24.3%", accent: true },
]

export const TRINITY = [
  { k: "Altman Z-Score", v: "3.12", state: "An toàn", tone: "up" as Tone },
  { k: "Piotroski F-Score", v: "7 / 9", state: "Khỏe", tone: "up" as Tone },
  { k: "Beneish M-Score", v: "−2.61", state: "Khó thao túng", tone: "up" as Tone },
]

export const FOOTBALL = {
  low: 52,
  high: 78,
  fairLow: 60,
  fairHigh: 70,
  price: 61.7,
  bands: [
    { k: "P/E band", lo: 55, hi: 72 },
    { k: "RIM", lo: 58, hi: 74 },
    { k: "Book floor", lo: 52, hi: 63 },
  ],
}

/* ── §7 credibility wall ── */
export const STATS = [
  { value: 2048, prefix: "~", label: "mã cổ phiếu" },
  { value: 38, label: "chỉ báo kỹ thuật" },
  { value: 17, label: "nguồn dữ liệu" },
  { value: 10, label: "tín hiệu cảnh báo" },
  { value: 6, label: "lớp phân tích AI" },
]

export const SOURCES = [
  "VCI", "VND", "KBS", "DNSE", "FMARKET", "MSN", "TradingView", "BINANCE", "RSS",
]

/* ── §8 pricing ── */
export interface Plan {
  id: string
  name: string
  price: string
  period: string
  note: string
  highlight?: boolean
  badge?: string
  features: string[]
  cta: string
}

export const PLANS: Plan[] = [
  {
    id: "free",
    name: "Miễn phí",
    price: "0₫",
    period: "trọn đời",
    note: "Đủ để bắt đầu đọc thị trường mỗi ngày.",
    features: [
      "Nhận định thị trường hằng ngày",
      "Bảng giá realtime + biểu đồ TradingView",
      "BCTC cơ bản · DuPont · dòng tiền",
      "Tra cứu ~2048 mã & watchlist",
    ],
    cta: "Tạo tài khoản miễn phí",
  },
  {
    id: "trial",
    name: "Premium",
    price: "7 ngày",
    period: "dùng thử miễn phí",
    note: "Mở toàn bộ công cụ cao cấp, không cần thẻ.",
    highlight: true,
    badge: "Phổ biến",
    features: [
      "Mọi thứ ở gói Miễn phí",
      "AI Phân tích 6 lớp cho mọi mã",
      "Strategy Lab — Backtester đầy đủ",
      "Cảnh báo qua Telegram (@IQX_Alert_BOT)",
      "Bộ chỉ số gian lận + Định giá",
    ],
    cta: "Bắt đầu 7 ngày miễn phí",
  },
  {
    id: "pro",
    name: "Premium dài hạn",
    price: "1 / 6 / 12",
    period: "tháng",
    note: "Tiết kiệm hơn khi gắn bó lâu dài.",
    features: [
      "Toàn bộ tính năng Premium",
      "Đồng bộ chiến lược & cảnh báo",
      "Ưu tiên dữ liệu & hỗ trợ",
      "Cập nhật tính năng mới sớm nhất",
    ],
    cta: "Xem các gói",
  },
]

export const NAV_LINKS = [
  { href: "#demo", label: "Phân tích AI" },
  { href: "#thi-truong", label: "Thị trường" },
  { href: "#tinh-nang", label: "Tính năng" },
  { href: "#chien-luoc", label: "Chiến lược" },
  { href: "#gia", label: "Bảng giá" },
]
