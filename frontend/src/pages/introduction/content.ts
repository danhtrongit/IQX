/**
 * Content for the IQX introduction page (`/`).
 *
 * Every figure here is either a verified capability of the running system or an
 * explicitly labelled illustration. Sources for the verified numbers:
 *
 * - 6 AI layers ............ `backend-v2/src/modules/ai/prompt_templates/ai-insight.md`
 *                            (L1 xu hướng, L2 thanh khoản, L3 dòng tiền, L4 nội bộ,
 *                            L5 tin tức, L6 briefing tổng hợp) and `ai.mapper.ts`.
 * - 38 indicators .......... `backend-v2/src/modules/ta/catalog.ts`, `backend/app/services/ta/`.
 * - 10 alert presets ....... `backend-v2/src/modules/alerts/alerts.service.ts`.
 * - 10-minute alert scan ... `ALERT_SCAN_INTERVAL_MINUTES` default in `backend-v2/src/config/env.ts`.
 * - 3 briefings per day .... premarket 07:15, midday 11:30, EOD 16:30 (env defaults).
 * - 7 journey levels ....... Cấp 0 «Nhập môn» → Cấp 6 «Bậc thầy» (`cap0..cap6` routes,
 *                            `frontend-v2/src/pages/demo-trading/journey/journey-state.ts`).
 * - 100,000,000 VND ........ `journey-stage.tsx` copy of the seeded virtual account.
 * - Data sources ........... `backend-v2/src/modules/market-data/sources/*`.
 * - Premium gating ......... `PremiumGuard` on ai/backtest/alerts/portfolio-manager
 *                            and `POST /virtual-trading/account/activate`.
 * - 7-day trial ............ `TRIAL_PLAN_CODE = 'TRIAL_7D'`, granted in `users.service.ts`.
 *
 * The three worked examples (analysis, briefing, backtest, fundamentals) come from
 * the legacy landing sample set and stay labelled «Ví dụ minh hoạ · phiên 19/06/2026».
 */

import {
  Activity,
  CandlestickChart,
  ChartColumn,
  Coins,
  FileText,
  Landmark,
  Newspaper,
  PenLine,
  ScanSearch,
  Star,
  TrendingUp,
  UserRound,
  type LucideIcon,
} from "lucide-react"

import { LEVELS } from "@/pages/demo-trading/journey/journey-state"

/**
 * Internal destinations. Route registration belongs to the app shell, so these
 * are the only place the page hard-codes a path.
 */
export const LINKS = {
  demo: "/demo-trading",
  market: "/demo-trading?content=ai-analysis",
  lessons: "/bai-hoc",
  premium: "/nang-cap",
} as const

/* ── Hero ───────────────────────────────────────────────────────────────── */

export const HERO = {
  eyebrow: "Nền tảng phân tích và luyện tập chứng khoán Việt Nam",
  title: "Hiểu thị trường trước khi xuống tiền.",
  lead: "Đọc thị trường Việt Nam với AI. Rèn quyết định bằng vốn mô phỏng trước khi đầu tư thật.",
  primaryCta: "Tạo tài khoản miễn phí",
  primaryCtaMember: "Vào Demo Trading",
  secondaryCta: "Xem phân tích mẫu",
} as const

/* ── Verified scale ─────────────────────────────────────────────────────── */

export type Metric = { value: string; unit?: string; label: string }

export const METRICS: readonly Metric[] = [
  { value: "6", label: "lớp phân tích AI cho mỗi mã" },
  { value: "38", label: "chỉ báo kỹ thuật tính sẵn" },
  { value: "3", label: "bản nhận định mỗi phiên" },
  { value: "10", label: "tín hiệu cảnh báo dựng sẵn" },
  { value: "7", label: "cấp độ luyện tập mô phỏng" },
  { value: "100", unit: "triệu đồng", label: "vốn mô phỏng ban đầu" },
]

/* ── AI analysis: six layers ────────────────────────────────────────────── */

export type LayerId = "L1" | "L2" | "L3" | "L4" | "L5" | "L6"

export type LayerDef = {
  id: LayerId
  name: string
  reads: string
  Icon: LucideIcon
}

export const AI_LAYERS: readonly LayerDef[] = [
  {
    id: "L1",
    name: "Xu hướng",
    reads: "Giá so với đường trung bình, trạng thái xu hướng, vùng hỗ trợ và kháng cự, đà giá.",
    Icon: TrendingUp,
  },
  {
    id: "L2",
    name: "Thanh khoản",
    reads: "Khối lượng khớp so với trung bình 30 phiên, cung cầu trên sổ lệnh, mức độ dễ khớp lệnh.",
    Icon: ChartColumn,
  },
  {
    id: "L3",
    name: "Dòng tiền",
    reads: "Khối ngoại và tự doanh đang mua hay bán ròng, kéo dài bao nhiêu phiên.",
    Icon: Coins,
  },
  {
    id: "L4",
    name: "Nội bộ",
    reads: "Giao dịch của lãnh đạo và cổ đông lớn: ai mua, ai bán, khối lượng bao nhiêu.",
    Icon: UserRound,
  },
  {
    id: "L5",
    name: "Tin tức",
    reads: "Tin trọng yếu và tin nền của doanh nghiệp, kèm mức tác động ngắn hạn tới giá.",
    Icon: Newspaper,
  },
  {
    id: "L6",
    name: "Tổng hợp",
    reads: "Năm lớp trên được viết lại thành một bản briefing tiếng Việt, kết bằng một gợi ý mềm.",
    Icon: FileText,
  },
]

export type Tone = "up" | "down" | "warn" | "flat"

export type SampleLayer = { id: LayerId; verdict: string; tone: Tone; note: string }

export type SampleAnalysis = {
  ticker: string
  sector: string
  conclusion: string
  conclusionTone: Tone
  brief: string
  layers: readonly SampleLayer[]
}

export const SAMPLE_ANALYSES: readonly SampleAnalysis[] = [
  {
    ticker: "VCB",
    sector: "Ngân hàng · VN30",
    conclusion: "Quan sát thêm",
    conclusionTone: "warn",
    brief:
      "Khối ngoại bán mạnh phiên thứ ba liên tiếp khiến VCB khó bứt phá quanh 61,600. Tin phát hành trái phiếu và lãnh đạo mua thêm giữ tâm lý ổn định, nhưng chưa đủ lấn át áp lực bán. Vùng 61,600 đến 61,900 sẽ quyết định hướng đi.",
    layers: [
      { id: "L1", verdict: "Yếu", tone: "warn", note: "Giá dưới MA20, động lượng suy yếu, chưa thủng hỗ trợ 61,600." },
      { id: "L2", verdict: "Dưới trung bình", tone: "warn", note: "Khớp 15.6 triệu cổ phiếu, thấp hơn trung bình 30 phiên." },
      { id: "L3", verdict: "Cảnh báo nhẹ", tone: "down", note: "Khối ngoại bán ròng 3 phiên; tự doanh mua nhẹ không đủ bù." },
      { id: "L4", verdict: "Tích cực", tone: "up", note: "Chuỗi mua từ Hội đồng quản trị và Phó Tổng giám đốc trong 14 ngày." },
      { id: "L5", verdict: "Trung lập", tone: "flat", note: "Phát hành trái phiếu và tài chính số củng cố định giá dài hạn." },
      { id: "L6", verdict: "Quan sát thêm", tone: "warn", note: "Cân bằng giữa nội bộ tích cực và dòng tiền ngoại tiêu cực." },
    ],
  },
  {
    ticker: "FPT",
    sector: "Công nghệ · VN30",
    conclusion: "Nên giảm bớt",
    conclusionTone: "down",
    brief:
      "Khối ngoại bán ròng 501 tỷ tạo áp lực thoái vốn rõ rệt lên nhóm công nghệ. Giá đánh mất MA20 với thanh khoản tăng, tín hiệu phân phối ngắn hạn. Cần dòng tiền nội hấp thụ trước khi cân nhắc vị thế mới.",
    layers: [
      { id: "L1", verdict: "Giảm", tone: "down", note: "Mất MA20, MACD cắt xuống, xu hướng ngắn hạn nghiêng bán." },
      { id: "L2", verdict: "Cao bất thường", tone: "warn", note: "Khối lượng tăng vọt trong phiên giảm, dấu hiệu phân phối." },
      { id: "L3", verdict: "Tiêu cực", tone: "down", note: "Khối ngoại bán ròng 501 tỷ, dẫn đầu nhóm xả công nghệ." },
      { id: "L4", verdict: "Trung lập", tone: "flat", note: "Không ghi nhận giao dịch nội bộ đáng chú ý trong 30 ngày." },
      { id: "L5", verdict: "Trung lập", tone: "flat", note: "Không có tin trọng yếu mới tác động trực tiếp tới giá." },
      { id: "L6", verdict: "Nên giảm bớt", tone: "down", note: "Kỹ thuật và dòng tiền cùng tiêu cực, ưu tiên quản trị rủi ro." },
    ],
  },
  {
    ticker: "HPG",
    sector: "Thép · VN30",
    conclusion: "Có thể mua thử",
    conclusionTone: "up",
    brief:
      "HPG lấy lại MA20 với thanh khoản trên trung bình, dẫn dắt nhóm chu kỳ. Tự doanh quay lại mua ròng sau chuỗi bán, dòng tiền cải thiện. Giữ trên 27,500 mở ra dư địa hồi về vùng 29,000.",
    layers: [
      { id: "L1", verdict: "Cải thiện", tone: "up", note: "Vượt lại MA20, động lượng dương, cấu trúc hồi phục." },
      { id: "L2", verdict: "Trên trung bình", tone: "up", note: "Dòng tiền tham gia tốt trong nhịp tăng, xác nhận xu hướng." },
      { id: "L3", verdict: "Tích cực", tone: "up", note: "Tự doanh mua ròng trở lại, khối ngoại giảm cường độ bán." },
      { id: "L4", verdict: "Trung lập", tone: "flat", note: "Không có giao dịch nội bộ bất thường trong kỳ." },
      { id: "L5", verdict: "Tích cực", tone: "up", note: "Kỳ vọng giá thép phục hồi theo chu kỳ đầu tư công." },
      { id: "L6", verdict: "Có thể mua thử", tone: "up", note: "Đa lớp đồng thuận tích cực, canh vùng hỗ trợ để vào." },
    ],
  },
]

/* ── Daily market briefing (illustrative session) ───────────────────────── */

export const BRIEFING = {
  session: "Phiên minh hoạ 19/06/2026 · 15:00 · đã đóng cửa",
  headline: "Bề mặt chỉ giảm 0.32%, nhưng bên dưới là một phiên rút tiền âm thầm.",
  sub: "Cổ phiếu vừa và nhỏ lao dốc, dòng tiền lớn cùng chiều bán.",
  pulse: [
    { label: "VN-Index", value: "1,824.53", delta: "−5.94 · −0.32%", tone: "down" as Tone },
    { label: "Độ rộng", value: "81 tăng · 203 giảm", delta: "62 mã đứng giá", tone: "flat" as Tone },
    { label: "Khối ngoại", value: "−1,868 tỷ", delta: "bán ròng phiên thứ 3", tone: "down" as Tone },
    { label: "Thanh khoản", value: "18,804 tỷ", delta: "tương đương MA20", tone: "flat" as Tone },
  ],
  read: "VN-Index giảm nhẹ nhưng khối ngoại bán ròng phiên thứ ba và độ rộng xấu đi. Bề mặt êm, bên dưới là phiên phân phối. Vùng 1,815 là ranh giới cho phiên sau.",
  scenarios: [
    { condition: "Giữ trên 1,815 · khối ngoại bán dưới 800 tỷ", outcome: "tích lũy, hồi về 1,830", tone: "up" as Tone },
    { condition: "Mất 1,815 · khối ngoại bán trên 1,000 tỷ", outcome: "kiểm định vùng 1,795 đến 1,800", tone: "down" as Tone },
  ],
  /** Foreign net flow, 15 sessions (tỷ đồng). */
  foreign: [0.7, -0.8, -0.2, 1.4, 0.1, -0.3, -1.3, -2.6, 0.4, -0.5, -0.6, -1.8, -0.9, -1.2, -1.87],
  caption: "Ví dụ minh hoạ · phiên 19/06/2026. Mỗi phiên, hệ thống viết lại bản nhận định từ dữ liệu của chính phiên đó.",
} as const

/* ── Strategy Lab + alerts ──────────────────────────────────────────────── */

export const BACKTEST = {
  /** Equity series, base 100, shared scale across both lines. */
  strategy: [100, 103, 101, 108, 114, 111, 119, 126, 122, 131, 140, 138, 149, 158, 166],
  index: [100, 101, 100, 103, 105, 104, 107, 109, 108, 111, 113, 112, 115, 117, 118],
  kpis: [
    { label: "Lợi nhuận", value: "+66%", tone: "up" as Tone },
    { label: "So VN-Index", value: "+48%", tone: "up" as Tone },
    { label: "Sharpe (95%)", value: "1.84", tone: "flat" as Tone },
    { label: "Sụt giảm lớn nhất", value: "−11.2%", tone: "down" as Tone },
  ],
  caption: "Ví dụ minh hoạ · 15 phiên, base 100. Kết quả quá khứ không đảm bảo cho kết quả tương lai.",
} as const

export const ALERT_SAMPLE = {
  signal: "Mua · vượt MA20 kèm dòng tiền dương",
  ticker: "HPG",
  detail: "Giá 27,850 (+1.64%) vượt MA20 với khối lượng trên trung bình. Tự doanh mua ròng.",
  time: "10:42 · 19/06",
} as const

export const ALERT_FACTS: readonly string[] = [
  "10 tín hiệu dựng sẵn, hoặc tự ghép điều kiện từ 38 chỉ báo.",
  "Quét lại mỗi 10 phút và chỉ gửi khi tín hiệu thực sự xuất hiện.",
  "Liên kết tài khoản Telegram một lần, tín hiệu về thẳng cuộc trò chuyện.",
]

/* ── Fundamentals ───────────────────────────────────────────────────────── */

export const DUPONT: readonly { label: string; value: string }[] = [
  { label: "Biên lợi nhuận ròng", value: "21.4%" },
  { label: "Vòng quay tài sản", value: "0.18×" },
  { label: "Đòn bẩy tài chính", value: "6.3×" },
  { label: "ROE", value: "24.3%" },
]

export const FORENSIC: readonly { label: string; value: string; state: string; tone: Tone }[] = [
  { label: "Altman Z-Score", value: "3.12", state: "An toàn", tone: "up" },
  { label: "Piotroski F-Score", value: "7 / 9", state: "Khỏe", tone: "up" },
  { label: "Beneish M-Score", value: "−2.61", state: "Khó thao túng", tone: "up" },
]

export const VALUATION = {
  low: 52,
  high: 78,
  price: 61.7,
  bands: [
    { label: "Dải P/E", lo: 55, hi: 72 },
    { label: "RIM", lo: 58, hi: 74 },
    { label: "Giá sàn theo sổ sách", lo: 52, hi: 63 },
  ],
} as const

/* ── Demo trading: levels, companion ────────────────────────────────────── */

export type JourneyLevel = { index: number; name: string; skill: string; tasks: number }

export const JOURNEY_LEVELS: readonly JourneyLevel[] = LEVELS.map((level, index) => ({
  index,
  name: level.name,
  skill: level.skill,
  tasks: level.tasks.length,
}))

export const COMPANIONS: readonly { id: string; name: string; trait: string; image: string }[] = [
  { id: "bach_ho", name: "Bạch Hổ", trait: "Quan sát cấu trúc giá và xu hướng.", image: "/brand/mascot-bach-ho.webp" },
  { id: "thanh_long", name: "Thanh Long", trait: "Theo dõi sự dịch chuyển của dòng vốn.", image: "/brand/mascot-thanh-long.webp" },
  { id: "loc_huou", name: "Lộc Hươu", trait: "Đọc thông tin công khai từ doanh nghiệp.", image: "/brand/mascot-loc-huou.webp" },
  { id: "phung_hoang", name: "Phụng Hoàng", trait: "Đọc tin tức và bối cảnh mới.", image: "/brand/mascot-phung-hoang.webp" },
  { id: "kim_quy", name: "Kim Quy", trait: "Tìm hiểu giá trị doanh nghiệp.", image: "/brand/mascot-kim-quy.webp" },
]

export const EGG_IMAGE = "/brand/egg-level-0.webp"

/* ── Lessons ────────────────────────────────────────────────────────────── */

export const LESSONS: readonly string[] = [
  "Khóa học chia theo chủ đề và cấp độ; một số khóa mở cho mọi tài khoản, số khác dành cho Premium.",
  "Mỗi bài là video, PDF hoặc bài đọc, kèm mô tả nội dung.",
  "Tiến độ và vị trí đang xem được lưu lại cho từng bài.",
]

/* ── Toolkit ────────────────────────────────────────────────────────────── */

export type Tool = {
  name: string
  description: string
  /** Short verified capability line, rendered in mono. */
  proof: string
  Icon: LucideIcon
  tier: "free" | "premium"
  /** Cells with a tinted surface so the grid is not eight identical cards. */
  tint?: boolean
}

export const TOOLS: readonly Tool[] = [
  {
    name: "Bảng giá realtime",
    description: "Giá, khớp lệnh và sổ lệnh cập nhật trong phiên, lọc theo nhóm VN30, HNX, UPCOM hoặc danh sách theo dõi.",
    proof: "DNSE · sổ lệnh theo từng mã",
    Icon: Activity,
    tier: "free",
    tint: true,
  },
  {
    name: "Biểu đồ và bản vẽ",
    description: "Vẽ trực tiếp trên biểu đồ; bản vẽ lưu theo tài khoản và giữ nguyên giữa các phiên.",
    proof: "Bản vẽ lưu theo mã",
    Icon: PenLine,
    tier: "free",
  },
  {
    name: "Săn mã",
    description: "Lọc theo khối ngoại gom, tự doanh gom, khối lượng đột biến, vượt đỉnh 20 phiên, tăng mạnh.",
    proof: "5 bộ lọc dựng sẵn",
    Icon: ScanSearch,
    tier: "free",
    tint: true,
  },
  {
    name: "Tin tức và sự kiện",
    description: "Tin doanh nghiệp, thị trường và vĩ mô tổng hợp từ các nguồn RSS trong nước.",
    proof: "RSS · tin theo mã",
    Icon: Newspaper,
    tier: "free",
  },
  {
    name: "Mẫu hình nến và mẫu giá",
    description: "Nhận diện mẫu hình nến TA-Lib và mẫu hình giá kinh điển trên từng mã.",
    proof: "TA-Lib · mẫu hình giá",
    Icon: CandlestickChart,
    tier: "premium",
    tint: true,
  },
  {
    name: "Tổng quan thị trường",
    description: "Chỉ số, độ rộng, thanh khoản và dòng tiền theo ngành cho từng phiên.",
    proof: "Chỉ số · độ rộng · ngành",
    Icon: Landmark,
    tier: "free",
  },
  {
    name: "Danh sách theo dõi",
    description: "Lưu mã cần theo dõi, sắp xếp lại thứ tự và mở lại đúng ngữ cảnh phân tích.",
    proof: "Sắp xếp lại thứ tự",
    Icon: Star,
    tier: "free",
  },
]

/* ── Data trust ─────────────────────────────────────────────────────────── */

export const SOURCES: readonly string[] = [
  "Vietcap",
  "KBS",
  "VNDirect",
  "DNSE",
  "FMarket",
  "MSN",
  "Binance",
  "Yahoo",
  "SJC",
  "RSS tin tức",
]

export const PRINCIPLES: readonly { title: string; body: string }[] = [
  {
    title: "Giá đã điều chỉnh",
    body: "Chỉ báo được tính trên giá đã điều chỉnh, để cổ tức và chia tách không tạo ra tín hiệu giả.",
  },
  {
    title: "Tính ở phía máy chủ",
    body: "Chỉ báo, điểm số và dải định giá đều được tính trên máy chủ rồi mới trả về giao diện.",
  },
  {
    title: "Không khuyến nghị tuyệt đối",
    body: "AI nêu nhận định và gợi ý mềm, không ra lệnh mua bán thay bạn.",
  },
]

/* ── Premium ────────────────────────────────────────────────────────────── */

export type Tier = {
  name: string
  price: string
  period: string
  note: string
  features: readonly string[]
  highlight?: boolean
}

export const TIERS: readonly Tier[] = [
  {
    name: "Miễn phí",
    price: "0đ",
    period: "trọn đời",
    note: "Đủ để theo dõi thị trường mỗi ngày.",
    features: [
      "Ba bản nhận định thị trường mỗi phiên",
      "Bảng giá realtime, biểu đồ và bản vẽ",
      "Báo cáo tài chính: DuPont, chỉ số gian lận, dải định giá",
      "Danh sách theo dõi và săn mã",
    ],
  },
  {
    name: "Premium",
    price: "7 ngày",
    period: "tặng khi đăng ký",
    note: "Mở toàn bộ công cụ phân tích trong thời gian dùng thử.",
    highlight: true,
    features: [
      "AI phân tích sáu lớp cho mọi mã",
      "Strategy Lab: backtest có T+2, cắt lỗ, chốt lời",
      "Cảnh báo Telegram và mẫu hình AI",
      "Phân tích danh mục",
      "Tài khoản giao dịch mô phỏng",
    ],
  },
]

export const PRICING_NOTE =
  "Tài khoản mới được tặng 7 ngày Premium ngay khi đăng ký, không cần thanh toán. Xem giá các gói dài hạn ở trang nâng cấp."

/* ── FAQ ────────────────────────────────────────────────────────────────── */

export const FAQS: readonly { question: string; answer: string }[] = [
  {
    question: "AI phân tích cổ phiếu hoạt động như thế nào?",
    answer:
      "Hệ thống đọc năm lớp dữ liệu của mã: xu hướng, thanh khoản, dòng tiền khối ngoại và tự doanh, giao dịch nội bộ, tin tức. Lớp thứ sáu viết lại toàn bộ thành một bản briefing tiếng Việt kèm gợi ý mềm.",
  },
  {
    question: "Tôi chưa có kinh nghiệm đầu tư thì bắt đầu từ đâu?",
    answer:
      "Bắt đầu ở Demo Trading: tài khoản mô phỏng 100 triệu đồng và bảy cấp độ, đi từ một vòng mua bán đầu tiên đến xử lý mâu thuẫn giữa các lớp thông tin. Tiến bộ được xác nhận từ hành động thực tế, không phải từ lãi lỗ.",
  },
  {
    question: "IQX lấy dữ liệu từ đâu?",
    answer:
      "Dữ liệu được hợp nhất từ nhiều nguồn trong và ngoài nước như Vietcap, KBS, VNDirect, DNSE, FMarket, MSN, Binance, Yahoo, SJC và các bản tin RSS, rồi tính trên giá đã điều chỉnh.",
  },
  {
    question: "Tín hiệu của IQX có đảm bảo lãi không?",
    answer:
      "Không. IQX không đưa ra khuyến nghị đầu tư tuyệt đối. Hệ thống cung cấp dữ liệu và công cụ để bạn ra quyết định có cơ sở hơn; các ví dụ và kết quả mô phỏng trên trang này không đảm bảo cho kết quả thực tế.",
  },
  {
    question: "Cảnh báo được gửi ở đâu?",
    answer:
      "Qua Telegram. Bạn liên kết tài khoản Telegram với IQX một lần, chọn tín hiệu muốn theo dõi trong danh sách dựng sẵn hoặc tự ghép điều kiện, và hệ thống quét lại mỗi 10 phút.",
  },
  {
    question: "Dùng thử Premium như thế nào?",
    answer:
      "Tài khoản mới được tặng 7 ngày Premium ngay khi đăng ký, không cần thanh toán. Hết thời gian dùng thử, tài khoản trở về gói Miễn phí và bạn có thể nâng cấp bất cứ lúc nào.",
  },
]

/* ── Closing ────────────────────────────────────────────────────────────── */

export const CLOSING = {
  title: "Bắt đầu từ dữ liệu.",
  lead: "Tạo tài khoản để mở bảng giá, nhận định thị trường và lộ trình luyện tập bằng vốn mô phỏng.",
  note: "IQX cung cấp công cụ phân tích và nội dung giáo dục, không phải khuyến nghị đầu tư. Ví dụ và kết quả mô phỏng trên trang không đảm bảo cho kết quả thực tế.",
} as const

export const CLOSING_LINKS: readonly { to: string; label: string; description: string }[] = [
  { to: LINKS.demo, label: "Demo Trading", description: "Luyện tập với vốn mô phỏng" },
  { to: LINKS.market, label: "Thị trường", description: "Bảng giá, chỉ số và nhận định" },
  { to: LINKS.lessons, label: "Bài học", description: "Khóa học và bài đọc nền tảng" },
  { to: LINKS.premium, label: "Nâng cấp", description: "Các gói Premium và thanh toán" },
]
