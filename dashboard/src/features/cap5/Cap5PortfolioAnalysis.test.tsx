import { render, screen, within } from "@testing-library/react"
import React from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * HARNESS (documented choice) — mock 2 hook query, KHÔNG dựng
 * QueryClientProvider/AuthProvider.
 *
 * `Cap5PortfolioAnalysis` render `Cap4PortfolioAnalysis` bên trong, và component
 * đó gọi `useVuKhiDiemMu()` (auth-gated TanStack query). Thay vì bọc provider
 * thật rồi phụ thuộc vào việc query bị `enabled: false`, test mock đúng 2 module
 * hook — cùng cách `Cap4PortfolioAnalysis.test.tsx` mock `./hooks` của nó, và
 * cùng tiền lệ `vi.mock("@/features/cap1/hooks", …)` ở cap0. Nhờ vậy test điều
 * khiển được cả 3 trạng thái query của khối ⑬ (pending / error / có dữ liệu) mà
 * không có network, không cần provider. Các component Cấp 1-3 là thuần trình bày
 * (không hook nào) nên không cần mock gì thêm.
 */
vi.mock("@/features/cap4/hooks", () => ({
  useVuKhiDiemMu: () => ({ data: undefined, isPending: true, isError: false }),
}))

/**
 * ★★ Khối ⑫ giờ đọc `GET /cap5/phan-tich` (hook `useCap5PhanTich`), KHÔNG đọc
 * nhật ký `trades` per-browser nữa — xem docstring `portfolioAnalysisCap5.ts`.
 * `phanTichQuery` cho test điều khiển đủ 3 trạng thái: đang tải / lỗi / có số.
 */
const { phanTichQuery } = vi.hoisted(() => ({
  phanTichQuery: { current: {} as Record<string, unknown> },
}))
vi.mock("./hooks", () => ({
  useCap5PhanTich: () => phanTichQuery.current,
}))

import { Cap5PortfolioAnalysis } from "./Cap5PortfolioAnalysis"
import type { Cap5TradeRecord } from "./tradeLogCap5"
import type { Cap5PhanTich, Cap5Progress, HuntFilter, Khoi12 } from "./types"
import type { Cap2DailyScoreRecord } from "@/features/cap2/portfolioAnalysisCap2"
import type { Cap2Progress } from "@/features/cap2/types"
import type { Cap3Progress } from "@/features/cap3/types"
import type { Cap4Progress } from "@/features/cap4/types"

const NOW = new Date("2026-07-31T12:00:00Z")

let seq = 0

function trade(overrides: Partial<Cap5TradeRecord> = {}): Cap5TradeRecord {
  seq += 1
  return {
    orderId: `o${seq}`,
    lyDo: "dong_tien",
    trangThaiLucDat: "ung_ho",
    pnlPct: 4,
    pnlVnd: 400_000,
    closedAt: "2026-07-25T10:00:00Z",
    chamSlKhongCat: false,
    chamTpGiuLamHut: false,
    banSomKhiLoNhe: false,
    nhoiLenhKhiLo: false,
    khauVi: "can_bang",
    mucTuTin: 3,
    cachKhoiLuong: "linh_hoat",
    khoiLuong: 1_000,
    pctVon: 20,
    doc_5_lop: { ky_thuat: "ok", dong_tien: "ok", noi_bo: "ok", tin_tuc: "ok", dinh_gia: "ok" },
    ai_5_lop: { ky_thuat: "ok", dong_tien: "ok", noi_bo: "ok", tin_tuc: "ok", dinh_gia: "ok" },
    so_lop_dong_thuan: 5,
    so_lop_khac_ai: 0,
    huntFilter: "ngoai",
    huntSoPhienCho: 2,
    huntSoLopLucVao: 4,
    ...overrides,
  }
}

/**
 * `n` lệnh đã đóng, ĐỀU săn từ `filter`, trong đó `thang` lệnh lãi.
 * ★ Chỉ đổi MỘT biến mỗi lần gọi — repo này đã nhiều lần bị đột biến lọt qua vì
 * fixture đổi hai thứ cùng lúc.
 */
function lenhSan(
  filter: HuntFilter,
  n: number,
  thang: number,
  extra: Partial<Cap5TradeRecord> = {},
): Cap5TradeRecord[] {
  return Array.from({ length: n }, (_, i) =>
    trade({
      huntFilter: filter,
      pnlPct: i < thang ? 6 : -4,
      pnlVnd: i < thang ? 600_000 : -400_000,
      ...extra,
    }),
  )
}

function cap2Progress(): Cap2Progress {
  return {
    id: "c2p",
    user_id: "u1",
    entered_at: "2026-03-01T00:00:00Z",
    task_1_done_at: null,
    task_2_done_at: null,
    so_lenh_co_cl_tp: 0,
    so_lan_cat_lo_dung: 0,
    so_lan_chot_loi_dung: 0,
    so_lan_thuc_hien_dung: 0,
    graduated_at: "2026-05-02T00:00:00Z",
    time_to_graduate_hours: 12,
  }
}

function cap3Progress(): Cap3Progress {
  return {
    id: "c3p",
    user_id: "u1",
    entered_at: "2026-05-03T00:00:00Z",
    khau_vi_da_dat: true,
    khau_vi: "can_bang",
    von_ban_dau: 100_000_000,
    task_1_done_at: null,
    task_2_done_at: null,
    task_3_done_at: null,
    so_lenh_cap3: 0,
    lai_pct_cap3: 0,
    diem_ky_luat_tb_cap3: 0,
    graduated_at: "2026-06-01T00:00:00Z",
    time_to_graduate_hours: 20,
  }
}

function cap4Progress(): Cap4Progress {
  return {
    id: "c4p",
    user_id: "u1",
    entered_at: "2026-06-02T00:00:00Z",
    task_1_done_at: null,
    so_lenh_doc_du_5lop: 22,
    vu_khi_lop: "dong_tien",
    diem_mu_lop: "tin_tuc",
    graduated_at: "2026-07-01T00:00:00Z",
    time_to_graduate_hours: 30,
  }
}

function cap5Progress(overrides: Partial<Cap5Progress> = {}): Cap5Progress {
  return {
    id: "c5p",
    user_id: "u1",
    entered_at: "2026-07-02T00:00:00Z",
    task_1_done_at: "2026-07-03T00:00:00Z",
    task_2_done_at: null,
    so_ma_da_san: 34,
    so_ma_mua_tu_watchlist: 14,
    so_ma_cho_du_lop: 19,
    muc_tieu_so_ma_san: 10,
    muc_tieu_so_ma_mua: 5,
    da_xem_tour_sanma: true,
    best_filter: "ngoai",
    best_filter_ten: "Khối ngoại gom",
    graduated_at: null,
    time_to_graduate_hours: null,
    ...overrides,
  }
}

const TEN_BO_LOC: Record<HuntFilter, string> = {
  ngoai: "Khối ngoại gom",
  tudoanh: "Tự doanh gom",
  kl: "Khối lượng đột biến",
  dinh: "Vượt đỉnh 20 phiên",
  tang: "Tăng mạnh + KL cao",
}

/** Một dòng khối ⑫ đúng hình dạng WIRE (`Khoi12ItemOut`). */
function k12Item(
  ma: HuntFilter,
  soLenh: number,
  soThang: number,
  overrides: Partial<Khoi12["items"][number]> = {},
): Khoi12["items"][number] {
  const duMau = soLenh >= 3
  return {
    ma,
    ten: TEN_BO_LOC[ma],
    so_lenh: soLenh,
    so_lenh_thang: soThang,
    ty_le_thang: duMau ? Math.round((soThang / soLenh) * 100) : null,
    du_mau: duMau,
    nhan: null,
    canh_bao: null,
    giai_thich: "",
    ...overrides,
  }
}

function phanTich(
  items: Khoi12["items"],
  overrides: Partial<Khoi12> = {},
): Cap5PhanTich {
  return {
    khoi_12: {
      items,
      best_filter: null,
      so_lenh_toi_thieu: 3,
      so_lenh_khong_tu_san: 0,
      du_de_ket_luan: items.some((i) => i.du_mau),
      giai_thich: "Chỉ tính các lệnh ĐÃ ĐÓNG có nguồn săn.",
      ...overrides,
    },
    khoi_13: {
      so_ma_da_san: 0,
      so_ma_cho_du_lop: null,
      so_ma_vao_lenh: 0,
      giai_thich: "",
      loi_ket: "",
    },
  }
}

/** Mặc định mỗi bài: máy chủ ĐÃ trả khối ⑫ rỗng (chưa lệnh săn nào). */
beforeEach(() => {
  phanTichQuery.current = { data: phanTich([]), isPending: false, isError: false }
})

function renderPage(
  trades: Cap5TradeRecord[],
  dailyScores: Cap2DailyScoreRecord[] = [],
  cap5: Cap5Progress | null = cap5Progress(),
) {
  return render(
    <Cap5PortfolioAnalysis
      trades={trades}
      dailyScores={dailyScores}
      cap2Progress={cap2Progress()}
      cap3Progress={cap3Progress()}
      cap4Progress={cap4Progress()}
      cap5Progress={cap5}
      now={NOW}
    />,
  )
}

describe("Cap5PortfolioAnalysis — giữ MỌI khối Cấp 1-4 (cộng dồn)", () => {
  it("render lại nguyên các khối của Cap4PortfolioAnalysis (và Cấp 1-3 bên trong)", () => {
    // ≥5 lệnh: khối ② của Cấp 2 chỉ hiện khi đủ mẫu (dưới đó nó là khối "hidden").
    renderPage(
      [...lenhSan("ngoai", 4, 4), ...lenhSan("kl", 2, 0, { chamSlKhongCat: true })],
      [{ ngay: "2026-07-28", diem: 88, xepLoai: "xanh" }],
    )
    // Cấp 2 / Cấp 1
    expect(screen.getByTestId("cap2-pa-khoi1")).toBeInTheDocument()
    expect(screen.getByTestId("cap2-pa-khoi2")).toBeInTheDocument()
    expect(screen.getByTestId("cap2-pa-khoi3")).toBeInTheDocument()
    expect(screen.getByTestId("cap2-pa-khoi4")).toBeInTheDocument()
    // ★ Cấp 2 mô hình 2 nhiệm vụ chỉ còn 4 khối — «Điểm kỷ luật 30 ngày»,
    // «Phân loại vi phạm theo tuần» và «Phát hiện từ ghi chú» đã bỏ hẳn.
    expect(screen.queryByTestId("cap2-pa-khoi5")).not.toBeInTheDocument()
    expect(screen.queryByTestId("cap2-pa-khoi6")).not.toBeInTheDocument()
    expect(screen.queryByTestId("cap2-pa-khoi7")).not.toBeInTheDocument()
    // Cấp 3
    expect(screen.getByTestId("cap3-pa-khoi1")).toBeInTheDocument()
    expect(screen.getByTestId("cap3-pa-khoi5")).toBeInTheDocument()
    expect(screen.getByTestId("cap3-pa-khoi6")).toBeInTheDocument()
    // Cấp 4
    expect(screen.getByTestId("cap4-pa-khoi1")).toBeInTheDocument()
    expect(screen.getByTestId("cap4-pa-khoi9")).toBeInTheDocument()
    expect(screen.getByTestId("cap4-pa-khoi10")).toBeInTheDocument()
    expect(screen.getByTestId("cap4-pa-khoi11")).toBeInTheDocument()
  })

  it("khối ① Cấp 5 nêu số mã đã săn / đã mua + bộ lọc mạnh nhất (số của server)", () => {
    renderPage([])
    const khoi1 = within(screen.getByTestId("cap5-pa-khoi1"))
    expect(khoi1.getByText(/Cấp 5 «Lão luyện»/)).toBeInTheDocument()
    expect(khoi1.getByText(/Đã săn 34\/10 mã/)).toBeInTheDocument()
    expect(khoi1.getByText(/đã mua 14\/5 mã/)).toBeInTheDocument()
    expect(screen.getByTestId("cap5-pa-khoi1-best")).toHaveTextContent("«Khối ngoại gom»")
  })

  it("★ mẫu số nhiệm vụ đọc từ SERVER, không hard-code (cùng nguồn với Hành trình)", () => {
    renderPage([], [], cap5Progress({ muc_tieu_so_ma_san: 12, muc_tieu_so_ma_mua: 7 }))
    const khoi1 = within(screen.getByTestId("cap5-pa-khoi1"))
    expect(khoi1.getByText(/Đã săn 34\/12 mã/)).toBeInTheDocument()
    expect(khoi1.getByText(/đã mua 14\/7 mã/)).toBeInTheDocument()
  })

  it("★ `best_filter` null → nói chưa đủ dữ liệu, KHÔNG bịa một bộ lọc", () => {
    renderPage([], [], cap5Progress({ best_filter: null, best_filter_ten: null }))
    const best = screen.getByTestId("cap5-pa-khoi1-best")
    expect(best).toHaveTextContent("chưa đủ dữ liệu để chốt")
    expect(best).not.toHaveTextContent("Khối ngoại gom")
  })

  it("chưa vào Cấp 5 → nói rõ chưa có dữ liệu, không bịa số 0", () => {
    renderPage([], [], null)
    expect(
      within(screen.getByTestId("cap5-pa-khoi1")).getByText(/Chưa có hồ sơ Cấp 5/),
    ).toBeInTheDocument()
  })
})


/* ══════════════════════════════════════════════════════════════════════════
   KHỐI ⑫ — BỘ LỌC NÀO MANG LẠI MÃ THẮNG NHIỀU NHẤT (spec §9)
   ══════════════════════════════════════════════════════════════════════════ */
describe("Cap5PortfolioAnalysis — ⑫ bộ lọc nào ra mã thắng nhiều nhất (SERVER)", () => {
  it("có tiêu đề + nhãn «mới ở Cấp 5»", () => {
    renderPage([])
    expect(screen.getByTestId("cap5-pa-khoi12-header")).toHaveTextContent(
      "BỘ LỌC NÀO MANG LẠI MÃ THẮNG NHIỀU NHẤT",
    )
    expect(within(screen.getByTestId("cap5-pa-khoi12")).getByText("mới ở Cấp 5")).toBeInTheDocument()
  })

  /**
   * ★★★ B1 — MÂU THUẪN TRÊN CÙNG MỘT MÀN.
   *
   * Khối ① đọc server (`best_filter` = «Khối lượng đột biến»). Nếu khối ⑫ còn
   * đọc nhật ký localStorage thì trên một thiết bị khác — nơi nhật ký RỖNG — nó
   * nói "Chưa có lệnh nào đóng từ mã bạn săn được" cách khối ① đúng ba dòng.
   * Bài này dựng chính xác kịch bản đó: `trades` RỖNG, server CÓ 6 lệnh «kl».
   */
  it("★★★ nhật ký client rỗng nhưng server có số ⇒ ⑫ nói theo SERVER (không mâu thuẫn khối ①)", () => {
    phanTichQuery.current = {
      data: phanTich([k12Item("kl", 6, 4)]),
      isPending: false,
      isError: false,
    }
    renderPage([], [], cap5Progress({ best_filter: "kl", best_filter_ten: "Khối lượng đột biến" }))
    expect(screen.getByTestId("cap5-pa-khoi1-best")).toHaveTextContent("«Khối lượng đột biến»")
    expect(screen.getByTestId("cap5-pa-khoi12-pct-kl")).toHaveTextContent("67%")
    expect(screen.queryByTestId("cap5-pa-khoi12-chuadu")).not.toBeInTheDocument()
    expect(screen.queryByTestId("cap5-pa-khoi12-chualayduoc")).not.toBeInTheDocument()
  })

  /**
   * ★★★ Chiều ngược lại: nhật ký client ĐẦY nhưng server nói chưa có lệnh săn
   * nào. Con số duy nhất được phép hiện là của server.
   */
  it("★★★ nhật ký client đầy nhưng server nói rỗng ⇒ ⑫ KHÔNG vẽ dòng nào", () => {
    renderPage([...lenhSan("ngoai", 6, 5)])
    expect(screen.queryByTestId("cap5-pa-khoi12-rows")).not.toBeInTheDocument()
    expect(screen.queryByTestId("cap5-pa-khoi12-pct-ngoai")).not.toBeInTheDocument()
    expect(screen.getByTestId("cap5-pa-khoi12-chuadu")).toHaveTextContent(
      "Chưa có lệnh nào đóng từ mã bạn săn được",
    )
  })

  it("★ query LỖI ⇒ nói thẳng chưa lấy được, KHÔNG vu cho user là chưa đóng lệnh nào", () => {
    phanTichQuery.current = { data: undefined, isPending: false, isError: true }
    renderPage([...lenhSan("ngoai", 6, 5)])
    const box = screen.getByTestId("cap5-pa-khoi12-chualayduoc")
    expect(box).toHaveTextContent("Chưa lấy được số liệu bộ lọc từ máy chủ")
    expect(box).toHaveAttribute("data-dangtai", "false")
    expect(screen.queryByTestId("cap5-pa-khoi12-chuadu")).not.toBeInTheDocument()
    expect(screen.queryByTestId("cap5-pa-khoi12-rows")).not.toBeInTheDocument()
  })

  it("★ đang tải ⇒ câu chờ, không con số nào", () => {
    phanTichQuery.current = { data: undefined, isPending: true, isError: false }
    renderPage([])
    const box = screen.getByTestId("cap5-pa-khoi12-chualayduoc")
    expect(box).toHaveTextContent("Đang lấy số liệu bộ lọc")
    expect(box).toHaveAttribute("data-dangtai", "true")
  })

  it("một thanh cho mỗi bộ lọc, sắp giảm dần theo tỷ lệ thắng", () => {
    phanTichQuery.current = {
      data: phanTich([k12Item("ngoai", 4, 3), k12Item("dinh", 3, 2), k12Item("kl", 4, 1)]),
      isPending: false,
      isError: false,
    }
    renderPage([])
    const rows = screen.getByTestId("cap5-pa-khoi12-rows")
    const order = [...rows.querySelectorAll("[data-testid^='cap5-pa-khoi12-row-']")].map((el) =>
      el.getAttribute("data-testid"),
    )
    expect(order).toEqual([
      "cap5-pa-khoi12-row-ngoai",
      "cap5-pa-khoi12-row-dinh",
      "cap5-pa-khoi12-row-kl",
    ])
    expect(screen.getByTestId("cap5-pa-khoi12-pct-ngoai")).toHaveTextContent("75%")
    expect(screen.getByTestId("cap5-pa-khoi12-pct-kl")).toHaveTextContent("25%")
  })

  it("bộ lọc cao nhất được gọi «hợp với bạn nhất»", () => {
    phanTichQuery.current = {
      data: phanTich([k12Item("ngoai", 4, 3), k12Item("dinh", 3, 2)]),
      isPending: false,
      isError: false,
    }
    renderPage([])
    expect(screen.getByTestId("cap5-pa-khoi12-phathien")).toHaveTextContent("hợp với bạn nhất")
  })

  it("bộ lọc thấp nhất dưới ngưỡng kém → cảnh báo riêng cho bộ lọc đó", () => {
    phanTichQuery.current = {
      data: phanTich([k12Item("ngoai", 4, 3), k12Item("kl", 4, 1)]),
      isPending: false,
      isError: false,
    }
    renderPage([])
    const pat = screen.getByTestId("cap5-pa-khoi12-phathien")
    expect(pat).toHaveTextContent("«Khối lượng đột biến» chỉ 25%")
    expect(pat).toHaveTextContent("sóng ngắn")
  })

  /* ── LUẬT SỐ 1: dưới ngưỡng mẫu ─────────────────────────────────────────── */
  it("★ dưới 3 lệnh/bộ lọc → KHÔNG suy tỷ lệ, nói rõ còn thiếu bao nhiêu lệnh", () => {
    phanTichQuery.current = {
      data: phanTich([k12Item("ngoai", 2, 2)]),
      isPending: false,
      isError: false,
    }
    renderPage([])
    const note = screen.getByTestId("cap5-pa-khoi12-chuadu")
    expect(note).toHaveTextContent("Mới có 2 lệnh đã đóng từ săn mã")
    expect(note).toHaveTextContent("còn thiếu 1 lệnh")
    // …và tuyệt đối không in ra một tỷ lệ nào cho bộ lọc chưa đủ mẫu.
    expect(screen.getByTestId("cap5-pa-khoi12-pct-ngoai")).not.toHaveTextContent("%")
    expect(screen.queryByTestId("cap5-pa-khoi12-phathien")).not.toBeInTheDocument()
  })

  it("★ ngưỡng mẫu in ra là ngưỡng của SERVER, không phải hằng số FE", () => {
    phanTichQuery.current = {
      data: phanTich([k12Item("ngoai", 4, 4, { du_mau: false, ty_le_thang: null })], {
        so_lenh_toi_thieu: 6,
        du_de_ket_luan: false,
      }),
      isPending: false,
      isError: false,
    }
    renderPage([])
    expect(screen.getByTestId("cap5-pa-khoi12-row-ngoai")).toHaveTextContent("4/6")
  })

  it("★ chưa lệnh nào từ săn mã → nói thẳng, KHÔNG hiện 0%", () => {
    renderPage([])
    const note = screen.getByTestId("cap5-pa-khoi12-chuadu")
    expect(note).toHaveTextContent("Chưa có lệnh nào đóng từ mã bạn săn được")
    // ★ Không một thanh bộ lọc nào được vẽ ⇒ không có chỗ nào in «0%» như thể đã
    // đo. (Chuỗi "0%" vẫn xuất hiện trong câu giải thích luật đếm "đóng ngang
    // giá 0% KHÔNG tính là thắng" — nên phải khoanh vào vùng thanh, không quét
    // cả khối.)
    expect(screen.queryByTestId("cap5-pa-khoi12-rows")).not.toBeInTheDocument()
    expect(screen.queryByTestId("cap5-pa-khoi12-pct-ngoai")).not.toBeInTheDocument()
  })

  it("★ lệnh KHÔNG đến từ săn mã được đếm RIÊNG, không gán vào bộ lọc nào", () => {
    phanTichQuery.current = {
      data: phanTich([k12Item("ngoai", 3, 2)], { so_lenh_khong_tu_san: 2 }),
      isPending: false,
      isError: false,
    }
    renderPage([])
    expect(screen.getByTestId("cap5-pa-khoi12-khongsan")).toHaveTextContent(
      "2 lệnh đã đóng KHÔNG đến từ săn mã",
    )
    // 3 lệnh săn → tỷ lệ tính trên 3, KHÔNG trên 5.
    expect(screen.getByTestId("cap5-pa-khoi12-pct-ngoai")).toHaveTextContent("67%")
  })

  it("★ đủ mẫu ở một bộ lọc KHÔNG làm bộ lọc chưa đủ mẫu bị suy ra tỷ lệ", () => {
    phanTichQuery.current = {
      data: phanTich([k12Item("ngoai", 3, 3), k12Item("tudoanh", 1, 0)]),
      isPending: false,
      isError: false,
    }
    renderPage([])
    expect(screen.getByTestId("cap5-pa-khoi12-pct-ngoai")).toHaveTextContent("100%")
    expect(screen.getByTestId("cap5-pa-khoi12-pct-tudoanh")).not.toHaveTextContent("%")
  })

  it("★ câu giải thích §C12c là câu của SERVER, nguyên văn", () => {
    phanTichQuery.current = {
      data: phanTich([k12Item("ngoai", 3, 3)], { giai_thich: "CÂU CỦA MÁY CHỦ VỀ CÁCH ĐẾM" }),
      isPending: false,
      isError: false,
    }
    renderPage([])
    expect(screen.getByTestId("cap5-pa-khoi12-giaithich")).toHaveTextContent(
      "CÂU CỦA MÁY CHỦ VỀ CÁCH ĐẾM",
    )
  })
})

/* ══════════════════════════════════════════════════════════════════════════
   KHỐI ⑬ — KỶ LUẬT SĂN MÃ (phễu 3 tầng, spec §9)
   ══════════════════════════════════════════════════════════════════════════ */
describe("Cap5PortfolioAnalysis — ⑬ kỷ luật săn mã (phễu)", () => {
  it("3 tầng phễu đúng thứ tự, đọc số từ hồ sơ Cấp 5", () => {
    renderPage([])
    const funnel = screen.getByTestId("cap5-pa-khoi13-funnel")
    expect(funnel).toHaveTextContent("Mã đã săn (đưa vào Watchlist)")
    // ★ Nhãn KHÔNG còn là "Chờ đến khi ≥4/5 lớp": hệ không lưu lược sử điểm đồng
    // thuận nên nó chỉ biết mã ĐANG ở mức nào (xem `portfolioAnalysisCap5.ts`).
    expect(funnel).toHaveTextContent("Đang ở ≥4/5 lớp ủng hộ")
    expect(funnel).not.toHaveTextContent("Chờ đến khi")
    expect(funnel).toHaveTextContent("Thực sự vào lệnh")
    expect(screen.getByTestId("cap5-pa-khoi13-tang-1")).toHaveTextContent("34")
    expect(screen.getByTestId("cap5-pa-khoi13-tang-2")).toHaveTextContent("19")
    expect(screen.getByTestId("cap5-pa-khoi13-tang-3")).toHaveTextContent("14")
  })

  /**
   * ★★★ B8 — CẬN DƯỚI KHÔNG ĐƯỢC IN NHƯ SỐ CHẮC CHẮN.
   *
   * Fixture mặc định (`so_ma_da_san: 34`, `so_ma_cho_du_lop: 19`) KHÔNG kèm mẫu
   * số ⇒ hệ chỉ biết "ít nhất 19", nên phễu phải ghi «≥ 19» + một dòng nói rõ vì
   * sao. In "19" trơn là khẳng định về những mã chưa ai chấm.
   */
  it("★★★ tầng giữa là cận dưới ⇒ in «≥ 19» + nói rõ mẫu số", () => {
    renderPage([], [], cap5Progress({ so_ma_da_cham_diem: 22 }))
    expect(screen.getByTestId("cap5-pa-khoi13-tang-2-v")).toHaveTextContent("≥ 19")
    expect(screen.getByTestId("cap5-pa-khoi13-tang-2-v")).toHaveAttribute("data-canduoi", "true")
    expect(screen.getByTestId("cap5-pa-khoi13-canduoi")).toHaveTextContent(
      "hệ chỉ chấm được điểm đồng thuận cho 22/34 mã",
    )
  })

  it("★ mẫu số thiếu hẳn trên wire ⇒ VẪN là cận dưới, nói thẳng là chưa biết mẫu số", () => {
    renderPage([])
    expect(screen.getByTestId("cap5-pa-khoi13-tang-2")).toHaveTextContent("≥ 19")
    expect(screen.getByTestId("cap5-pa-khoi13-canduoi")).toHaveTextContent(
      "chưa cho biết đã chấm được điểm cho bao nhiêu mã",
    )
  })

  it("★ server khẳng định đã chấm hết ⇒ in số TRƠN, không có dòng cận dưới", () => {
    renderPage(
      [],
      [],
      cap5Progress({ so_ma_da_cham_diem: 34, so_ma_cho_du_lop_day_du: true }),
    )
    const v = screen.getByTestId("cap5-pa-khoi13-tang-2-v")
    expect(v).toHaveTextContent("19")
    expect(v.textContent).not.toContain("≥")
    expect(v).toHaveAttribute("data-canduoi", "false")
    expect(screen.queryByTestId("cap5-pa-khoi13-canduoi")).not.toBeInTheDocument()
  })

  it("phát hiện đúng câu mẫu spec khi user THẬT SỰ có sàng lọc", () => {
    renderPage([])
    const pat = screen.getByTestId("cap5-pa-khoi13-phathien")
    expect(pat).toHaveTextContent("Bạn săn 34 mã nhưng chỉ vào 14")
    expect(pat).toHaveTextContent("kỷ luật của thợ săn")
  })

  it("★ mua HẾT số mã săn → KHÔNG khen «biết chờ», nói thẳng điều ngược lại", () => {
    renderPage([], [], cap5Progress({ so_ma_da_san: 12, so_ma_mua_tu_watchlist: 12 }))
    const pat = screen.getByTestId("cap5-pa-khoi13-phathien")
    expect(pat).toHaveTextContent("chưa loại mã nào")
    expect(pat).not.toHaveTextContent("kỷ luật của thợ săn")
  })

  it("★ tầng giữa chưa đo được → hiện «—» kèm GIẢI THÍCH, không phải 0", () => {
    renderPage([], [], cap5Progress({ so_ma_cho_du_lop: null }))
    const tang2 = screen.getByTestId("cap5-pa-khoi13-tang-2")
    expect(tang2).toHaveTextContent("—")
    expect(tang2).not.toHaveTextContent("0")
    expect(screen.getByTestId("cap5-pa-khoi13-chuadolop")).toHaveTextContent(
      "Tầng giữa chưa đo được",
    )
  })

  it("★ chưa săn mã nào → mời đi săn, KHÔNG in tỷ lệ vào lệnh", () => {
    renderPage([], [], cap5Progress({ so_ma_da_san: 0, so_ma_mua_tu_watchlist: 0 }))
    expect(screen.getByTestId("cap5-pa-khoi13-chuadu")).toHaveTextContent("Bạn chưa săn mã nào")
    expect(screen.queryByTestId("cap5-pa-khoi13-phathien")).not.toBeInTheDocument()
  })

  it("★ chưa vào Cấp 5 → phễu nói chưa đọc được số liệu, không bịa 0", () => {
    renderPage([], [], null)
    expect(screen.getByTestId("cap5-pa-khoi13-chuadu")).toHaveTextContent(
      "Chưa đọc được số liệu săn mã",
    )
    expect(screen.getByTestId("cap5-pa-khoi13-tang-1")).toHaveTextContent("—")
  })
})

describe("Cap5PortfolioAnalysis — Cấp 5 CŨ không mọc lại", () => {
  it("★ không còn ma trận 4 ô / nhật ký đứng ngoài", () => {
    const { container } = renderPage([...lenhSan("ngoai", 3, 2)])
    for (const tu of ["đứng ngoài", "Đứng ngoài", "Né đúng", "Né hụt", "sai_thang", "4 ô"]) {
      expect(container.textContent).not.toContain(tu)
    }
  })
})
