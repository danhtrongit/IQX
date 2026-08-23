import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor } from "@testing-library/react"
import React from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * ════════════════════════════════════════════════════════════════════════════
 * HÀNG RÀO: panel Đặt lệnh Cấp 0→5 phải khớp mockup — ĐỌC THẲNG FILE MOCKUP
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Nguồn sự thật là SÁU file `demo-trading/LEVEL N/iqx-capN-datlenh.html`, đọc
 * bằng `node:fs` ngay trong bài (cùng lối `dau-truong/capPagesNoEscape.test.ts`
 * và `cap0/capDarkIsland.test.ts` đọc văn bản nguồn). Không chép danh sách nhãn
 * vào đây: sửa mockup là bài này tự nói theo — đó là toàn bộ điểm của nó.
 *
 * ── Bài này canh cái gì ──────────────────────────────────────────────────────
 *  1. MỌI nhãn cấu trúc mockup vẽ đều CÓ MẶT trong panel ở đúng cấp đó.
 *  2. Chúng xuất hiện ĐÚNG THỨ TỰ mockup vẽ.
 * Không canh khoảng cách, màu, hay việc panel có in THÊM gì (panel thật có
 * những dòng spec đòi mà mockup không vẽ — Giá trị/Tổng, «Đã chấm 0/5 lớp»,
 * dòng provenance §C12c — chúng vô hại với hai câu hỏi trên).
 *
 * ── Bài này KHÔNG canh được cái gì, và vì sao ────────────────────────────────
 * `vitest.config` chạy `css: false` ⇒ jsdom KHÔNG BAO GIỜ thấy một luật nào
 * trong `order-panel.css`/`cap0.css`. Mọi `toHaveStyle` ở đây sẽ xanh vô điều
 * kiện, nên KHÔNG có assert màu/kích thước nào. Việc gắn đúng class là việc của
 * `TradingPanel.mockupStyle.test.tsx`; ở đây chỉ có cấu trúc + câu chữ.
 *
 * ── Neo dương tính ──────────────────────────────────────────────────────────
 * Nếu regex trích mockup hỏng và trả danh sách rỗng thì vòng lặp assert sẽ xanh
 * vô điều kiện. Vì vậy mỗi cấp có một `expect(nhan.length).toBeGreaterThanOrEqual(...)`
 * TRƯỚC vòng lặp, với ngưỡng đếm tay từ chính mockup.
 *
 * ── Mở rộng cho Cấp 6/7/8 ───────────────────────────────────────────────────
 * Thêm một dòng vào `CAU_HINH_CAP` (cờ cấp nào bật) là xong — phần trích mockup
 * và phần assert không cần đụng tới. CỐ Ý chưa thêm Cấp 6/7 ở đây: hai cấp đó
 * đang được dựng song song ở nhánh khác.
 */

/* ═══════════════════════════════════════════════════════════════════════════
   PHẦN 1 — Đọc mockup
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * `demo-trading/` nằm NGOÀI `dashboard/` (và ngoài git — nó là bộ spec/mockup
 * của founder, không phải mã nguồn). Đi ngược lên từ chính file này cho tới thư
 * mục nào có `demo-trading/LEVEL 0/iqx-cap0-datlenh.html` — cách đó đúng cho cả
 * hai bố cục thật: checkout chính (`IQX/dashboard/…`) và git worktree
 * (`IQX/.claude/worktrees/<id>/dashboard/…`, phải trèo qua `.claude`).
 */
function coMockup(thu: string): boolean {
  return fs.existsSync(path.join(thu, "LEVEL 0", "iqx-cap0-datlenh.html"))
}

/**
 * ★★ HAI NGUỒN, ƯU TIÊN BẢN SỐNG CỦA FOUNDER.
 *
 *   1. `demo-trading/` cạnh repo — nơi founder thả mockup mới. KHÔNG nằm trong
 *      git (`.gitignore` chặn mọi thứ ở gốc rồi allow-list bốn thư mục ứng
 *      dụng), nên chỉ có trên máy đang làm việc. Ưu tiên nó để founder sửa
 *      mockup là bài canh nói theo NGAY, không phải nhớ đồng bộ thủ công.
 *   2. `dashboard/docs/mockups/` — bản vendor, CÓ trong git. Nhờ nó bài canh
 *      chạy được trên clone sạch và trên CI. Không có bước này thì hàng rào
 *      "khớp mockup 100%" chỉ tồn tại trên đúng một cái máy.
 *
 * Bài `vendor không được trôi khỏi bản sống` bên dưới giữ hai bản bằng nhau, nên
 * việc ưu tiên (1) không thể âm thầm làm (2) lạc hậu.
 */
function timThuMucMockup(): string | null {
  let dir = path.dirname(fileURLToPath(import.meta.url))
  for (let i = 0; i < 12; i++) {
    const song = path.join(dir, "demo-trading")
    if (coMockup(song)) return song
    const vendor = path.join(dir, "dashboard", "docs", "mockups")
    if (coMockup(vendor)) return vendor
    const cha = path.dirname(dir)
    if (cha === dir) break
    dir = cha
  }
  // Bản vendor nằm ngay trong `dashboard/` nên đường đi ngược ở trên có thể
  // vượt qua nó khi chạy từ trong `dashboard/`; thử thẳng một lần nữa.
  const trongDashboard = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
    "..",
    "..",
    "docs",
    "mockups",
  )
  return coMockup(trongDashboard) ? trongDashboard : null
}

const THU_MUC_MOCKUP = timThuMucMockup()

/** Bản sống của founder, nếu máy này có — để đối chiếu với bản vendor. */
function timBanSong(): string | null {
  let dir = path.dirname(fileURLToPath(import.meta.url))
  for (let i = 0; i < 12; i++) {
    const thu = path.join(dir, "demo-trading")
    if (coMockup(thu)) return thu
    const cha = path.dirname(dir)
    if (cha === dir) break
    dir = cha
  }
  return null
}

const BAN_SONG = timBanSong()
const BAN_VENDOR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  "docs",
  "mockups",
)

function docMockup(cap: number): string {
  return fs.readFileSync(
    path.join(THU_MUC_MOCKUP as string, `LEVEL ${cap}`, `iqx-cap${cap}-datlenh.html`),
    "utf8",
  )
}

/**
 * Bỏ nguyên một khối `<div class="...">…</div>` (đếm thẻ để ăn cả cây con).
 * Dùng để loại các khối mà mockup đổ DỮ LIỆU MẪU vào — xem `KHOI_BO_QUA`.
 */
function boKhoi(html: string, ten: string): string {
  const mo = new RegExp(`<div[^>]*class="(?:[^"]*\\s)?${ten}(?:\\s[^"]*)?"[^>]*>`, "g")
  let out = html
  for (;;) {
    mo.lastIndex = 0
    const m = mo.exec(out)
    if (!m) return out
    let i = m.index + m[0].length
    let sau = 1
    while (sau > 0 && i < out.length) {
      const mo2 = out.indexOf("<div", i)
      const dong = out.indexOf("</div>", i)
      if (dong === -1) return out.slice(0, m.index)
      if (mo2 !== -1 && mo2 < dong) {
        sau++
        i = mo2 + 4
      } else {
        sau--
        i = dong + 6
      }
    }
    out = out.slice(0, m.index) + out.slice(i)
  }
}

/**
 * Những khối mockup đổ DỮ LIỆU MẪU của một mã/một phiên cụ thể vào. Chúng bị bỏ
 * NGUYÊN KHỐI thay vì liệt kê từng dòng, để mockup sửa nội dung bên trong cũng
 * không làm hàng rào giả đỏ:
 *
 *  · `tt`        — thẻ AI Thanh tra. Chỉ hiện SAU khi user chọn 1 lý do, và
 *                  toàn bộ nội dung mockup vẽ là một lớp mẫu ("Dòng tiền — L3 ·
 *                  mua ròng 4/5 phiên · +180 tỷ"). Vị trí của thẻ (kẹp giữa ①
 *                  và ②) được canh riêng ở cuối file này; nội dung là việc của
 *                  `cap1/AiThanhTra.test.tsx`.
 *  · `rl-detail` — thân từng lớp ở Cấp 4/5, gồm cả dòng «So với phiên trước: …».
 *                  Đó là payload L1–L5 lấy từ API theo mã và theo phiên; trong
 *                  bài này API trả rỗng nên khối tự xuống trạng thái suy giảm.
 *                  `cap4/Doc5LopBlock.test.tsx` canh riêng dòng đó
 *                  (`cap4-diff-*`) với dữ liệu thật.
 *  · `row`       — các dòng số trong thẻ Cắt lỗ/Chốt lời (Hỗ trợ/Kháng cự/Biên
 *                  độ/Hệ số + hai mốc giá). Chỉ hiện khi tính được từ L1/OHLCV;
 *                  thiếu dữ liệu thì thẻ in lý do thiếu — một trạng thái hợp lệ.
 */
const KHOI_BO_QUA = ["tt", "rl-detail", "row"] as const

function thanMockup(html: string): string {
  let than = html.slice(html.indexOf("<body>"), html.indexOf("</body>"))
  than = than.replace(/<script[\s\S]*?<\/script>/g, "")
  for (const ten of KHOI_BO_QUA) than = boKhoi(than, ten)
  return than
}

function cacNodeChu(html: string): string[] {
  return html
    .split(/<[^>]*>/)
    .map((s) => s.replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim())
    .filter(Boolean)
}

/**
 * Chuỗi KHÔNG phải nhãn giao diện mà là SỐ LIỆU MẪU: bỏ hết ký tự không phải
 * chữ cái rồi xem còn lại gì. `62.400` → ``, `+0,6%` → ``, `9.360đ` → `đ`,
 * `+180 tỷ` → `tỷ`, `≈ 200` → ``, `2× / 4×` → ``, `60.400 (−3,2%)` → ``,
 * `★`/`🎯`/`⭐⭐` → `` (emoji và ký hiệu không thuộc \p{L}).
 *
 * ★ Hệ quả CỐ Ý: ba nhãn sao `⭐/⭐⭐/⭐⭐⭐` của Cấp 3 cũng rơi khỏi danh sách.
 * Cấu trúc của hàng đó đã được ba chữ Thấp/Vừa/Cao giữ, và ⭐ là hình chứ không
 * phải câu chữ. `cap3/QuanLyVonBlock.test.tsx` canh riêng ba nút đó.
 */
function laSoLieu(t: string): boolean {
  const chu = t.replace(/[^\p{L}]/gu, "")
  return chu === "" || chu === "đ" || chu === "tỷ"
}

/**
 * Loại trừ theo TỪNG CHUỖI — mỗi mục kèm lý do. Không có mục nào ở đây là "cấu
 * trúc chưa làm được"; tất cả đều là dữ liệu mẫu hoặc thứ không thuộc panel.
 */
const LOAI_TRU: { chuoi: string; vi_sao: string }[] = [
  {
    chuoi: "SÂN TẬP · T+0",
    vi_sao:
      "Badge chế độ do VỎ TRANG cấp vẽ (`cap0/ModeBadge` trong `Cap0TradingPage`), không phải panel. Mockup ghép cả trang vào một cột 360px. `Cap0TradingPage.test.tsx` canh riêng badge này.",
  },
  {
    chuoi: "THỰC CHIẾN",
    vi_sao:
      "Cùng lý do với badge Cấp 0 — do vỏ trang cấp vẽ chứ không phải panel; `Cap{1..8}TradingPage.test.tsx` và `JourneyPanelCap*.test.tsx` canh riêng nó.",
  },
  {
    chuoi: "Công ty Cổ phần Sữa Việt Nam · HOSE",
    vi_sao:
      "Tên công ty + sàn là DỮ LIỆU của mã (từ `useSymbolInfo`/`usePrice`), không phải nhãn. Panel có dòng `.op-sub` này, chỉ là chữ trong đó do server quyết.",
  },
  {
    chuoi: "VNM",
    vi_sao:
      "Mã mẫu. Panel in mã đang xem — `symbol-context` quyết. (Câu «Vì sao bạn chọn VNM?» thì GIỮ, vì bài này mock đúng mã VNM nên chuỗi khớp nguyên văn.)",
  },
  {
    chuoi: "LO — Giới hạn",
    vi_sao:
      "Một trong hai lựa chọn của dropdown Loại lệnh. Arco `Select` chỉ render lựa chọn ĐANG chọn (phần còn lại nằm trong portal, chỉ dựng khi mở) — canh ở đây sẽ đòi panel in cả hai cùng lúc. Cả hai chuỗi được canh riêng ở bài «dropdown Loại lệnh» cuối file, có mở dropdown hẳn hoi.",
  },
  {
    chuoi: "MP — Thị trường",
    vi_sao:
      "Lựa chọn còn lại của cùng dropdown đó — cùng lý do với `LO — Giới hạn`: Arco chỉ render một lựa chọn tại một thời điểm, nên cả hai được canh ở bài mở dropdown cuối file.",
  },
  {
    chuoi: "15% vốn (20% × 75%)",
    vi_sao:
      "Con số mẫu của thẻ «Theo khẩu vị × tự tin»: %vốn thay đổi theo khẩu vị × mức tự tin × giá. Panel tính live; phép tính đó là việc của `cap3/khoiLuong.test.ts`.",
  },
  {
    chuoi: "20% vốn (đúng mức trần)",
    vi_sao: "Như trên, cho thẻ «Chia đều theo khẩu vị».",
  },
  {
    chuoi: "Xu hướng:",
    vi_sao:
      "Nhãn của dòng dữ liệu lớp Kỹ thuật (mockup Cấp 4 tách nó thành node riêng vì có `<b>` chen giữa). Nội dung lớp là payload API — cùng lý do với khối `rl-detail`.",
  },
  {
    chuoi: "· Trạng thái:",
    vi_sao: "Như trên — mảnh của cùng dòng dữ liệu lớp Kỹ thuật.",
  },
  {
    chuoi: "Tăng",
    vi_sao:
      "Giá trị mẫu của dòng trên — xu hướng của VNM tại đúng phiên founder vẽ mockup; panel lấy từ payload L1 của mã đang xem.",
  },
  {
    chuoi: "Mạnh",
    vi_sao:
      "Giá trị mẫu của trạng thái lớp Kỹ thuật — cùng lý do: dữ liệu theo mã và theo phiên, không phải chữ cố định của giao diện.",
  },
]

/**
 * Hai chỗ panel CỐ Ý viết khác mockup — chuẩn hoá tại đây thay vì bỏ qua, để
 * phần còn lại của chuỗi vẫn bị canh từng chữ.
 */
const CHUAN_HOA: { tu: string; thanh: string; vi_sao: string }[] = [
  {
    tu: "chọn 1 trong 6 lớp",
    thanh: "chọn 1 trong 5 lớp",
    vi_sao:
      "Mockup Cấp 1/2/3 viết «6» nhưng vẽ đúng NĂM `.reason`, và `LY_DO_OPTIONS` cũng năm. Con số 6 là lỗi chính tả của mockup — đẻ lớp thứ sáu cho khớp chữ là bịa ra một nguồn dữ liệu không tồn tại.",
  },
  {
    tu: "(0,15%)",
    thanh: "(0.15%)",
    vi_sao:
      "Lệ số của dự án: số định dạng en-US toàn app (chỉ ngày tháng là vi-VN) — mockup viết dấu phẩy thập phân kiểu vi-VN.",
  },
]

/** Danh sách nhãn cấu trúc của một cấp, theo đúng thứ tự mockup vẽ. */
function nhanCauTruc(cap: number): string[] {
  const bo = new Set(LOAI_TRU.map((x) => x.chuoi))
  return cacNodeChu(thanMockup(docMockup(cap)))
    .filter((t) => !laSoLieu(t) && !bo.has(t))
    .map((t) => {
      let s = t
      for (const c of CHUAN_HOA) s = s.split(c.tu).join(c.thanh)
      return s
    })
}

/* ═══════════════════════════════════════════════════════════════════════════
   PHẦN 2 — Dựng panel ở từng cấp
   ═══════════════════════════════════════════════════════════════════════════ */

vi.mock("@/shared/contexts/symbol-context", () => ({
  useSymbol: () => ({ symbol: "VNM", setSymbol: vi.fn() }),
}))

const priceData = {
  symbol: "VNM",
  exchange: "HOSE",
  closePrice: 62.4,
  referencePrice: 62,
  ceilingPrice: 66.4,
  floorPrice: 57.6,
  priceChange: 0.4,
  percentChange: 0.6,
  totalVolume: 1,
  totalValue: 1,
  foreignBuy: 0,
  foreignSell: 0,
  bid: [{ price: 62, volume: 100 }],
  ask: [{ price: 62.4, volume: 200 }],
}
vi.mock("@/features/market-data", () => ({
  usePrice: () => ({ data: priceData, isLoading: false }),
}))

vi.mock("./hooks", () => ({
  useAccount: () => ({ data: { balance: 250_000_000, pnl: 0, pnlPercent: 0, winRate: 0 } }),
  usePortfolio: () => ({ data: { positions: [] } }),
  usePlaceOrder: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useActivateAccount: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))
vi.mock("@/features/auth", () => ({
  useAuth: () => ({ isAuthenticated: true, setShowAuthModal: vi.fn() }),
}))
vi.mock("@/features/premium", () => ({
  usePremiumStatus: () => ({ isPremium: true, isLoading: false }),
}))
vi.mock("@/features/watchlist", () => ({
  useWatchlistToggle: () => ({ isWatched: () => false, toggle: vi.fn(), isPending: false }),
  useSymbolInfo: () => ({ data: { shortName: "Công ty Cổ phần Sữa Việt Nam" } }),
}))
vi.mock("react-router", () => ({ useNavigate: () => vi.fn() }))
vi.mock("@arco-design/web-react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@arco-design/web-react")>()
  return {
    ...actual,
    Message: { ...actual.Message, success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() },
  }
})

const get = vi.fn()
const post = vi.fn()
const patch = vi.fn()
vi.mock("@/shared/http/client", () => ({
  api: {
    get: (...a: unknown[]) => get(...a),
    post: (...a: unknown[]) => post(...a),
    patch: (...a: unknown[]) => patch(...a),
  },
  unwrap: <T,>(r: T) => r,
}))

/* ── Cờ cấp: chỉ các hook BUS + progress bị mock. Mọi KHỐI (PlanFormCap1,
      SlTpBlock, QuanLyVonBlock, Doc5LopBlock) là hàng THẬT — bài này canh chính
      câu chữ chúng in ra, nên mock chúng là tự vô hiệu hoá bài. ── */
let coCap0 = false
let coCap1 = false
let coCap2 = false
let coCap3 = false
let coCap4 = false
let coCap5 = false

/** Cấp 0 CHƯA xong nhiệm vụ ⑤ → ô Giá + dropdown Loại lệnh còn ẩn (spec §8). */
const cap0Progress = {
  id: "11111111-1111-1111-1111-111111111111",
  user_id: "22222222-2222-2222-2222-222222222222",
  entered_at: "2026-08-01T00:00:00Z",
  virtual_balance_init: 250_000_000,
  task_1_done_at: null,
  task_2_done_at: null,
  task_3_done_at: null,
  task_4_done_at: null,
  task4_debrief_done: false,
  graduated_at: null,
  time_to_graduate_hours: null,
}

vi.mock("@/features/cap0", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/cap0")>()
  return {
    ...actual,
    useCap0Events: () => ({
      isCap0Active: coCap0,
      requireReasonBeforeOrder: false,
      onReasonPicked: vi.fn(),
      onOrderFilled: vi.fn(),
      onStarToggled: vi.fn(),
      registerHandlers: vi.fn(),
    }),
    useCap0Progress: () => ({ data: coCap0 ? cap0Progress : undefined }),
    useRecordCap0Kehoach: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  }
})

vi.mock("@/features/cap1", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/cap1")>()
  return {
    ...actual,
    useCap1Events: () => ({
      isCap1Active: coCap1,
      onLyDoPicked: vi.fn(),
      onOrderFilled: vi.fn(),
      onDocChiTietClicked: vi.fn(),
      registerHandlers: vi.fn(),
    }),
    useRecordKehoach: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  }
})

vi.mock("@/features/cap2", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/cap2")>()
  return {
    ...actual,
    useCap2Events: () => ({
      isCap2Active: coCap2,
      onSlTpPicked: vi.fn(),
      onOrderFilled: vi.fn(),
      registerHandlers: vi.fn(),
    }),
    useRecordKehoachCap2: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  }
})

vi.mock("@/features/cap3", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/cap3")>()
  return {
    ...actual,
    useCap3Events: () => ({
      isCap3Active: coCap3,
      onKhauViPicked: vi.fn(),
      onOrderFilled: vi.fn(),
      registerHandlers: vi.fn(),
    }),
    useCap3Progress: () => ({
      data: coCap3 ? { khau_vi: "can_bang", von_ban_dau: 100_000_000 } : undefined,
    }),
    useSetKhauVi: () => ({ mutate: vi.fn(), isPending: false }),
    useRecordKehoachCap3: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  }
})

vi.mock("@/features/cap4", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/cap4")>()
  return {
    ...actual,
    useCap4Events: () => ({
      isCap4Active: coCap4,
      onLopRated: vi.fn(),
      onOrderFilled: vi.fn(),
      registerHandlers: vi.fn(),
    }),
    useRecordKehoachCap4: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  }
})

vi.mock("@/features/cap5", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/cap5")>()
  return {
    ...actual,
    useCap5Events: () => ({
      isCap5Active: coCap5,
      onOrderFilled: vi.fn(),
      registerHandlers: vi.fn(),
    }),
  }
})

import { TradingPanel } from "./TradingPanel"

/**
 * Cấp N nào bật cờ nào. Một phiên Cấp 3 cũng là một phiên Cấp 1 + Cấp 2 (các
 * `Cap*Provider` lồng nhau đúng như trang cấp mount) — đúng lý do mockup Cấp 3
 * vẫn vẽ cả Form Kế hoạch lẫn khối Cắt lỗ/Chốt lời.
 *
 * `toiThieu` = số nhãn cấu trúc ĐẾM TAY từ mockup, dùng làm neo dương tính: nếu
 * phần trích hỏng và trả về ít hơn thế thì bài đỏ NGAY, thay vì lặp qua một
 * danh sách rỗng rồi xanh.
 */
const CAU_HINH_CAP: { cap: number; bat: () => void; toiThieu: number }[] = [
  {
    cap: 0,
    bat: () => {
      coCap0 = true
    },
    toiThieu: 16,
  },
  {
    cap: 1,
    bat: () => {
      coCap1 = true
    },
    toiThieu: 23,
  },
  {
    cap: 2,
    bat: () => {
      coCap1 = true
      coCap2 = true
    },
    toiThieu: 29,
  },
  {
    cap: 3,
    bat: () => {
      coCap1 = true
      coCap2 = true
      coCap3 = true
    },
    toiThieu: 46,
  },
  {
    cap: 4,
    bat: () => {
      coCap1 = true
      coCap2 = true
      coCap3 = true
      coCap4 = true
    },
    toiThieu: 62,
  },
  {
    cap: 5,
    bat: () => {
      coCap1 = true
      coCap2 = true
      coCap3 = true
      coCap4 = true
      coCap5 = true
    },
    toiThieu: 62,
  },
]

function dungPanel() {
  get.mockReturnValue({ json: () => Promise.resolve(null) })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <TradingPanel />
    </QueryClientProvider>,
  )
}

/** Chỉ đọc chữ TRONG thẻ panel — sổ lệnh bid/ask (mở từ Cấp 2) là thẻ riêng
 *  nằm ngoài, và mockup không vẽ nó. */
function chuTrongPanel(container: HTMLElement): string {
  const panel = container.querySelector(".op-panel")
  expect(panel, "không tìm thấy thẻ `.op-panel` — panel chưa mặc áo mockup?").not.toBeNull()
  return (panel as HTMLElement).textContent ?? ""
}

beforeEach(() => {
  get.mockReset()
  post.mockReset()
  patch.mockReset()
  coCap0 = false
  coCap1 = false
  coCap2 = false
  coCap3 = false
  coCap4 = false
  coCap5 = false
})

/* ═══════════════════════════════════════════════════════════════════════════
   PHẦN 3 — Bài canh
   ═══════════════════════════════════════════════════════════════════════════ */

const CO_MOCKUP = THU_MUC_MOCKUP != null

describe("Panel Đặt lệnh — khớp mockup `iqx-capN-datlenh.html` (Cấp 0→5)", () => {
  it.runIf(!CO_MOCKUP)(
    "KHÔNG chạy được: không tìm thấy `demo-trading/` cạnh repo",
    () => {
      // `demo-trading/` là bộ mockup của founder, KHÔNG nằm trong git. Ở máy
      // nào không có nó thì hàng rào này không có nguồn sự thật để đọc — và một
      // bài canh không có nguồn thì phải nói ra, không được im lặng xanh.
      expect.fail(
        "Không thấy `demo-trading/LEVEL 0/iqx-cap0-datlenh.html` khi đi ngược từ " +
          `${path.dirname(fileURLToPath(import.meta.url))}. ` +
          "Checkout bộ mockup cạnh repo rồi chạy lại.",
      )
    },
  )

  for (const { cap, bat, toiThieu } of CAU_HINH_CAP) {
    it.runIf(CO_MOCKUP)(`★ Cấp ${cap}: có ĐỦ nhãn mockup vẽ, và ĐÚNG THỨ TỰ`, async () => {
      const nhan = nhanCauTruc(cap)
      // Neo dương tính — xem docstring đầu file.
      expect(nhan.length, `trích mockup Cấp ${cap} hỏng`).toBeGreaterThanOrEqual(toiThieu)
      expect(nhan[0]).toBe("MUA")
      expect(nhan[nhan.length - 1]).toBe("ĐẶT LỆNH MUA")

      bat()
      const { container } = dungPanel()
      await waitFor(() => expect(screen.getByText("ĐẶT LỆNH MUA")).toBeInTheDocument())
      const chu = chuTrongPanel(container)

      // Quét MỘT LƯỢT theo con trỏ: vừa canh "có mặt" vừa canh "đúng thứ tự",
      // và nhãn lặp lại (5 lần «Bạn đọc lớp này là:», 4 lần «Chọn cách này») tự
      // được tiêu thụ lần lượt.
      let contro = 0
      let truoc = ""
      for (const t of nhan) {
        const i = chu.indexOf(t, contro)
        expect(
          i,
          i === -1 && chu.includes(t)
            ? `Cấp ${cap}: «${t}» CÓ trong panel nhưng SAI THỨ TỰ — mockup đặt nó sau «${truoc}»`
            : `Cấp ${cap}: panel THIẾU nhãn mockup «${t}» (mockup đặt nó sau «${truoc}»)`,
        ).toBeGreaterThanOrEqual(0)
        contro = i + t.length
        truoc = t
      }
    })
  }

  /**
   * Cấp 0 KHÔNG có «Loại lệnh» và KHÔNG có ô «Giá» — và đó KHÔNG phải mockup vẽ
   * thiếu. Spec Cấp 0 §8 xếp chúng vào nhóm «ẨN THEO CẤP»: *"Ô Giá + dropdown
   * loại lệnh → ẨN ở nhiệm vụ ①, mở ở nhiệm vụ ⑤"*. Vậy `iqx-cap0-datlenh.html`
   * vẽ trạng thái TRƯỚC nhiệm vụ ⑤, và panel làm đúng thế (`hidePriceAndType`
   * bám `cap0Visibility().priceField`). Sau nhiệm vụ ⑤ hai thứ đó hiện ra —
   * trạng thái mockup KHÔNG vẽ, nên hàng rào này không nói gì về nó;
   * `TradingPanel.cap0HideByLevel.test.tsx` canh cả hai chiều.
   */
  it.runIf(CO_MOCKUP)(
    "★ Cấp 0 (trước nhiệm vụ ⑤): không «Loại lệnh», không ô «Giá» — đúng cả mockup lẫn spec §8",
    async () => {
      // Neo dương tính: mockup Cấp 0 THẬT SỰ không có hai chữ đó...
      const nhan0 = nhanCauTruc(0)
      expect(nhan0).not.toContain("Loại lệnh")
      expect(nhan0).not.toContain("Giá")
      // ...còn mockup Cấp 1 thì có — nên phép so ở trên không phải vô nghĩa.
      expect(nhanCauTruc(1)).toContain("Loại lệnh")
      expect(nhanCauTruc(1)).toContain("Giá")

      coCap0 = true
      const { container } = dungPanel()
      await waitFor(() => expect(screen.getByText("KẾ HOẠCH")).toBeInTheDocument())
      const chu = chuTrongPanel(container)
      expect(chu).not.toContain("Loại lệnh")
      expect(chu).not.toContain("MP — Thị trường")
    },
  )

  /**
   * Dropdown Loại lệnh: mockup viết hai lựa chọn là `LO — Giới hạn` và
   * `MP — Thị trường`, LO đứng trước. Arco `Select` chỉ render lựa chọn đang
   * chọn nên hai chuỗi này bị loại khỏi phép quét thứ tự ở trên — canh tại đây
   * bằng cách MỞ dropdown thật.
   *
   * ★ Arco đẩy danh sách option vào portal ở `document.body`, KHÔNG nằm trong
   * `container` — nên phải đọc `document.body` (cùng cái bẫy
   * `cap5/GraduationModalCap5.test.tsx:143-153` ghi lại). Có neo dương tính
   * `getByText` để một portal rỗng không thành xanh vô điều kiện.
   */
  it.runIf(CO_MOCKUP)("★ dropdown «Loại lệnh»: đúng hai chuỗi mockup, LO đứng trước MP", async () => {
    const mockup = docMockup(1)
    // Nguồn sự thật: đọc thẳng hai `<option>` của mockup, không chép tay.
    const options = [...mockup.matchAll(/<option>([^<]+)<\/option>/g)].map((m) => m[1])
    expect(options, "không trích được <option> nào từ mockup Cấp 1").toHaveLength(2)

    coCap1 = true
    dungPanel()
    await waitFor(() => expect(screen.getByText("Loại lệnh")).toBeInTheDocument())

    // Mở dropdown — option nằm trong portal ở `document.body`.
    const view = document.querySelector(".arco-select-view") as HTMLElement
    expect(view, "không thấy Arco Select của ô Loại lệnh").not.toBeNull()
    view.click()

    await waitFor(() => expect(screen.getByText(options[0])).toBeInTheDocument())
    const chuBody = document.body.textContent ?? ""
    for (const o of options) expect(chuBody).toContain(o)
    expect(
      chuBody.indexOf(options[0]),
      "mockup xếp LO trước MP — panel đang xếp ngược",
    ).toBeLessThan(chuBody.lastIndexOf(options[1]))
  })

  /**
   * Vị trí của AI Thanh tra: mockup kẹp thẻ `.tt` GIỮA `1. Lý do mua` và
   * `2. Vùng mua`, bên trong thẻ `.plan`. Khối `tt` bị bỏ khỏi phép quét chung
   * (nội dung là dữ liệu mẫu của một lớp), nên VỊ TRÍ của nó được canh riêng ở
   * đây — bằng chính thứ tự ba nhãn trong mockup.
   */
  it.runIf(CO_MOCKUP)("★ Cấp 1: AI Thanh tra nằm GIỮA mục ① và mục ②, đúng chỗ mockup vẽ", async () => {
    const than = docMockup(1).slice(docMockup(1).indexOf("<body>"))
    const iLyDo = than.indexOf("1. Lý do mua")
    const iTt = than.indexOf('class="tt"')
    const iVungMua = than.indexOf("2. Vùng mua")
    expect(iLyDo, "mockup Cấp 1 đổi mất mục ①?").toBeGreaterThan(0)
    expect(iTt, "mockup Cấp 1 đổi mất thẻ `.tt`?").toBeGreaterThan(iLyDo)
    expect(iVungMua).toBeGreaterThan(iTt)

    coCap1 = true
    const { container } = dungPanel()
    // Chọn lý do «Kỹ thuật» → AI Thanh tra hiện (nó chỉ hiện sau khi chọn).
    await waitFor(() => expect(screen.getByText("Kỹ thuật")).toBeInTheDocument())
    screen.getByText("Kỹ thuật").click()
    await waitFor(() => expect(screen.getByText(/AI Thanh tra/)).toBeInTheDocument())

    const chu = chuTrongPanel(container)
    const a = chu.indexOf("1. Lý do mua")
    const b = chu.indexOf("AI Thanh tra")
    const c = chu.indexOf("2. Vùng mua")
    expect(a).toBeGreaterThanOrEqual(0)
    expect(b, "AI Thanh tra phải nằm SAU mục ①").toBeGreaterThan(a)
    expect(c, "AI Thanh tra phải nằm TRƯỚC mục ② (mockup kẹp nó ở giữa)").toBeGreaterThan(b)
  })

  /**
   * Danh sách loại trừ là chỗ dễ lạm dụng nhất của cả file: thêm một chuỗi vào
   * đó là im được một lỗi thật. Bài này bắt mỗi mục phải có lý do viết ra, và
   * bắt mọi chuỗi bị loại phải THẬT SỰ có trong ít nhất một mockup — một mục đã
   * hết tác dụng (mockup đổi chữ) thì phải bị dọn, không được nằm lại làm bùa.
   */
  it.runIf(CO_MOCKUP)("★ mọi mục loại trừ đều có lý do, và đều còn thật trong mockup", () => {
    const tatCa = [0, 1, 2, 3, 4, 5].map((n) => docMockup(n)).join("\n")
    expect(LOAI_TRU.length).toBeGreaterThan(0)
    for (const { chuoi, vi_sao } of LOAI_TRU) {
      expect(vi_sao.length, `mục loại trừ «${chuoi}» không có lý do`).toBeGreaterThan(40)
      expect(tatCa, `«${chuoi}» không còn trong mockup nào — dọn khỏi danh sách loại trừ`).toContain(
        chuoi,
      )
    }
    for (const { tu, vi_sao } of CHUAN_HOA) {
      expect(vi_sao.length, `mục chuẩn hoá «${tu}» không có lý do`).toBeGreaterThan(40)
      expect(tatCa, `«${tu}» không còn trong mockup nào — dọn khỏi danh sách chuẩn hoá`).toContain(
        tu,
      )
    }
  })

  /** Cấp 5 dùng lại y nguyên panel Cấp 4 — chính tiêu đề file mockup Cấp 5 nói
   *  thế ("(như Cấp 4)"), và hai file chỉ khác đúng dòng `<title>`. */
  it.runIf(CO_MOCKUP)("★ mockup Cấp 5 = mockup Cấp 4, chỉ khác dòng <title>", () => {
    const bo = (s: string) => s.replace(/<title>[\s\S]*?<\/title>/, "")
    expect(bo(docMockup(5))).toBe(bo(docMockup(4)))
  })
})

/**
 * ★★ BẢN VENDOR KHÔNG ĐƯỢC TRÔI KHỎI BẢN SỐNG ★★
 *
 * Bộ tìm ở trên ưu tiên `demo-trading/` của founder. Điều đó tốt — sửa mockup là
 * bài canh nói theo ngay — nhưng nó cũng có nghĩa: trên máy có `demo-trading/`,
 * bản vendor trong git KHÔNG BAO GIỜ được đọc, nên nó có thể lạc hậu hàng tháng
 * mà mọi bài vẫn xanh. Rồi trên CI (chỉ có bản vendor) hàng rào lại canh theo
 * một mockup cũ, tức canh nhầm thứ.
 *
 * Bài này đóng đúng lỗ đó. Chỉ chạy khi máy có CẢ HAI bản.
 */
describe("Mockup vendor trong git phải khớp bản sống của founder", () => {
  const chayDuoc = BAN_SONG != null && BAN_SONG !== BAN_VENDOR && coMockup(BAN_VENDOR)

  it.skipIf(!chayDuoc)("★★ 8 file `iqx-capN-datlenh.html` giống hệt nhau từng byte", () => {
    const lech: string[] = []
    for (let cap = 0; cap <= 7; cap++) {
      const ten = path.join(`LEVEL ${cap}`, `iqx-cap${cap}-datlenh.html`)
      const a = path.join(BAN_SONG as string, ten)
      const b = path.join(BAN_VENDOR, ten)
      if (!fs.existsSync(b)) {
        lech.push(`${ten}: THIẾU trong bản vendor`)
        continue
      }
      if (fs.readFileSync(a, "utf8") !== fs.readFileSync(b, "utf8")) {
        lech.push(`${ten}: KHÁC bản sống`)
      }
    }
    expect(
      lech,
      "Bản vendor đã lạc hậu. Đồng bộ lại:\n" +
        '  for n in 0 1 2 3 4 5 6 7; do cp "demo-trading/LEVEL $n/iqx-cap$n-datlenh.html" ' +
        '"dashboard/docs/mockups/LEVEL $n/"; done\n' +
        lech.join("\n"),
    ).toEqual([])
  })

  it.skipIf(!chayDuoc)("neo dương tính: bài trên thật sự đọc được cả hai bản", () => {
    expect(coMockup(BAN_SONG as string)).toBe(true)
    expect(coMockup(BAN_VENDOR)).toBe(true)
  })
})
