import { render, screen } from "@testing-library/react"
import React from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * HARNESS (cùng lựa chọn đã ghi ở `Cap6PortfolioAnalysis.test.tsx`): mock đúng
 * tầng hook, KHÔNG dựng QueryClientProvider/AuthProvider.
 *
 * `Cap7PortfolioAnalysis` render `Cap6PortfolioAnalysis` bên trong (khối ①-⑮), và
 * chuỗi đó dùng `useThachThucCap6` (⑮), `useDanhSachDungNgoai` (⑬) và
 * `useVuKhiDiemMu` (⑨) — đều là auth-gated TanStack query. Mock 4 module hook cho
 * phép điều khiển mọi trạng thái query mà không có network.
 */
const { thachThuc } = vi.hoisted(() => ({
  thachThuc: { current: {} as Record<string, unknown> },
}))
vi.mock("./hooks", () => ({
  useThachThucCap7: () => thachThuc.current,
}))
vi.mock("@/features/cap6/hooks", () => ({
  useThachThucCap6: () => ({ data: undefined, isPending: true, isError: false }),
}))
vi.mock("@/features/cap5/hooks", () => ({
  useDanhSachDungNgoai: () => ({ data: undefined, isPending: true, isError: false }),
}))
vi.mock("@/features/cap4/hooks", () => ({
  useVuKhiDiemMu: () => ({ data: undefined, isPending: true, isError: false }),
}))

import { Cap7PortfolioAnalysis } from "./Cap7PortfolioAnalysis"
import type { Cap7TradeRecord } from "./tradeLogCap7"
import type { Cap7Progress, ThachThucCap7 } from "./types"
import type { Cap2DailyScoreRecord } from "@/features/cap2/portfolioAnalysisCap2"
import type { Cap2Progress } from "@/features/cap2/types"
import type { Cap3Progress } from "@/features/cap3/types"
import type { Cap4Progress } from "@/features/cap4/types"
import type { Cap5Progress } from "@/features/cap5/types"
import type { Cap6Progress } from "@/features/cap6/types"

const NOW = new Date("2026-07-31T12:00:00Z")
const CAM_TU = ["sai lầm", "vi phạm", "bị phạt", "không nên", "lẽ ra"]

/** Xem doc của `loiBuocToi` trong `portfolioAnalysisCap7.test.ts` — cùng lý do. */
function loiBuocToi(text: string): string {
  return text.toLowerCase().split("không bị phạt").join(" ")
}

let seq = 0

function trade(overrides: Partial<Cap7TradeRecord> = {}): Cap7TradeRecord {
  seq += 1
  return {
    orderId: `o${seq}`,
    lyDo: "dinh_gia",
    trangThaiLucDat: "ung_ho",
    pnlPct: 6,
    pnlVnd: 600_000,
    // Tăng NGHIÊM NGẶT theo `seq` — xem ghi chú cùng chỗ ở
    // `portfolioAnalysisCap7.test.ts`: xu hướng 2 nửa sắp theo thời gian đóng.
    closedAt: new Date(Date.UTC(2026, 6, 1) + seq * 3_600_000).toISOString(),
    chamSlKhongCat: false,
    chamTpGiuLamHut: false,
    banSomKhiLoNhe: false,
    nhoiLenhKhiLo: false,
    khauVi: "can_bang",
    mucTuTin: 3,
    cachKhoiLuong: "linh_hoat",
    khoiLuong: 1_000,
    pctVon: 20,
    doc_5_lop: { ky_thuat: "ok", dong_tien: "ok", noi_bo: "neu", tin_tuc: "neu", dinh_gia: "bad" },
    ai_5_lop: null,
    so_lop_dong_thuan: null,
    so_lop_khac_ai: null,
    o4: "dung_thang",
    verdictHe: "dung",
    verdictUser: "dung",
    kieuCoPhieu: "ngan_hang",
    lopQuyetDinh: "dinh_gia",
    khopGoiY: true,
    lucChiSo: 1.94,
    lucBand: "cau_ap_dao",
    lucDocUser: "manh",
    docLucDung: true,
    dienBienPct: 1.2,
    coCanhGiac: false,
    hanhViCo: null,
    ...overrides,
  }
}

function trades(n: number, overrides: Partial<Cap7TradeRecord> = {}): Cap7TradeRecord[] {
  return Array.from({ length: n }, () => trade(overrides))
}

/** Một lệnh có cờ, ở nhóm `hanhViCo`, với đúng một `dienBienPct`. */
function tradeCo(hanhVi: Cap7TradeRecord["hanhViCo"], dienBienPct: number | null) {
  return trade({ coCanhGiac: true, hanhViCo: hanhVi, dienBienPct })
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
    chuoi_current: 4,
    chuoi_record: 7,
    last_chuoi_reset_at: null,
    graduated_at: "2026-04-01T00:00:00Z",
    time_to_graduate_hours: 30,
  }
}

function cap3Progress(): Cap3Progress {
  return {
    id: "c3p",
    user_id: "u1",
    entered_at: "2026-04-02T00:00:00Z",
    khau_vi_da_dat: true,
    khau_vi: "can_bang",
    von_ban_dau: 100_000_000,
    task_1_done_at: null,
    task_2_done_at: null,
    task_3_done_at: null,
    so_lenh_cap3: 10,
    lai_pct_cap3: 4.5,
    diem_ky_luat_tb_cap3: 82,
    graduated_at: "2026-05-01T00:00:00Z",
    time_to_graduate_hours: 25,
  }
}

function cap4Progress(): Cap4Progress {
  return {
    id: "c4p",
    user_id: "u1",
    entered_at: "2026-05-02T00:00:00Z",
    task_1_done_at: null,
    task_2_done_at: null,
    task_3_done_at: null,
    so_lenh_doc_du_5lop: 12,
    vu_khi_lop: "dong_tien",
    diem_mu_lop: "tin_tuc",
    ty_le_thang_dong_thuan_cao: 60,
    graduated_at: "2026-06-01T00:00:00Z",
    time_to_graduate_hours: 30,
  }
}

function cap5Progress(): Cap5Progress {
  return {
    id: "c5p",
    user_id: "u1",
    entered_at: "2026-06-02T00:00:00Z",
    task_1_done_at: null,
    task_2_done_at: null,
    task_3_done_at: null,
    so_lenh_phan_loai: 22,
    so_lan_dung_ngoai_da_cham: 6,
    ty_le_quyet_dinh_dung: 72,
    graduated_at: "2026-07-01T00:00:00Z",
    time_to_graduate_hours: 40,
  }
}

function cap6Progress(): Cap6Progress {
  return {
    id: "c6p",
    user_id: "u1",
    entered_at: "2026-07-02T00:00:00Z",
    task_1_done_at: null,
    task_2_done_at: null,
    task_3_done_at: null,
    so_lenh_doi_chieu: 11,
    so_kieu_da_gap: 2,
    ty_le_thang_khop: 70,
    ty_le_thang_lech: 45,
    graduated_at: "2026-07-20T00:00:00Z",
    time_to_graduate_hours: 50,
  }
}

function cap7Progress(overrides: Partial<Cap7Progress> = {}): Cap7Progress {
  return {
    id: "c7p",
    user_id: "u1",
    entered_at: "2026-07-21T00:00:00Z",
    task_1_done_at: "2026-07-22T00:00:00Z",
    task_2_done_at: null,
    task_3_done_at: null,
    so_lenh_doc_luc: 1_240,
    so_lan_khong_duoi_theo_co: 4,
    ty_le_doc_luc_dung: 62,
    graduated_at: null,
    time_to_graduate_hours: null,
    trong_phien: true,
    so_lenh_da_cham: 8,
    so_lenh_chua_cham: 4,
    so_lan_gap_co: 7,
    so_lan_mua_duoi_theo: 3,
    so_phien_cham: 2,
    ...overrides,
  }
}

function thachThucData(overrides: Partial<ThachThucCap7> = {}): ThachThucCap7 {
  return {
    dat_ca_3: false,
    so_lenh_doc_luc: {
      ten: "Đọc lực cho ≥ 15 lệnh",
      gia_tri_hien_tai: 12,
      muc_tieu: 15,
      dat: false,
      du_du_lieu: true,
      giai_thich: "Đã đọc lực cho 12/15 lệnh mua.",
    },
    so_lan_khong_duoi_theo_co: {
      ten: "Không đuổi theo ≥ 3 cờ cảnh giác",
      gia_tri_hien_tai: 4,
      muc_tieu: 3,
      dat: true,
      du_du_lieu: true,
      giai_thich: "Gặp cờ 7 lần, chờ xác nhận 4/3 lần.",
    },
    ty_le_doc_luc_dung: {
      ten: "Tỷ lệ đọc lực đúng ≥ 55%",
      gia_tri_hien_tai: 62,
      muc_tieu: 55,
      dat: true,
      du_du_lieu: true,
      giai_thich: "GIẢI THÍCH CỦA HỆ THỐNG",
    },
    so_lenh_da_cham: 8,
    so_lenh_chua_cham: 4,
    so_lan_gap_co: 1_234,
    so_lan_mua_duoi_theo: 3,
    so_phien_cham: 2,
    ...overrides,
  }
}

const scores: Cap2DailyScoreRecord[] = []

function renderPanel(
  log: Cap7TradeRecord[],
  progress: Cap7Progress | null = cap7Progress(),
) {
  return render(
    <Cap7PortfolioAnalysis
      cap2Progress={cap2Progress()}
      cap3Progress={cap3Progress()}
      cap4Progress={cap4Progress()}
      cap5Progress={cap5Progress()}
      cap6Progress={cap6Progress()}
      cap7Progress={progress}
      trades={log}
      dailyScores={scores}
      now={NOW}
    />,
  )
}

beforeEach(() => {
  thachThuc.current = { data: thachThucData(), isPending: false, isError: false }
})

describe("Cap7PortfolioAnalysis — cộng dồn bằng DELEGATION", () => {
  it("render lại mọi khối Cấp 1-6 bằng chính component của Cấp 6", () => {
    renderPanel(trades(3))
    expect(screen.getByTestId("cap6-pa-khoi14")).toBeInTheDocument()
    expect(screen.getByTestId("cap6-pa-khoi15")).toBeInTheDocument()
    expect(screen.getByTestId("cap6-pa-khoi1")).toBeInTheDocument()
    // …và các khối của Cấp 5/4 bên dưới nó vẫn còn nguyên.
    expect(screen.getByTestId("cap5-pa-khoi12")).toBeInTheDocument()
    expect(screen.getByTestId("cap5-pa-khoi13")).toBeInTheDocument()
  })

  it("thẻ đầu trang Cấp 7 hiện số server, định dạng en-US", () => {
    renderPanel(trades(3))
    const khoi1 = screen.getByTestId("cap7-pa-khoi1")
    expect(khoi1.textContent).toContain("1,240")
    expect(khoi1.textContent).toContain("62%")
    // Mẫu số của tỷ lệ phải nói ra: 8 đã chấm, 4 chưa tới hạn chấm.
    expect(khoi1.textContent).toContain("8 lệnh đã chấm")
    expect(khoi1.textContent).toContain("4 lệnh chưa tới hạn chấm")
  })

  it("chưa vào Cấp 7 → nói thẳng chưa có hồ sơ, không in 0", () => {
    renderPanel(trades(3), null)
    expect(screen.getByTestId("cap7-pa-khoi1").textContent).toContain("Chưa có hồ sơ Cấp 7")
  })
})

describe("Cap7PortfolioAnalysis — khối ⑯ đọc lực có đúng không", () => {
  it("đủ dữ liệu → hiện tỷ lệ + câu 'lợi thế' nguyên văn spec §7", () => {
    renderPanel(trades(3))
    expect(screen.getByTestId("cap7-pa-khoi16-tyle").textContent).toContain("62%")
    expect(screen.getByTestId("cap7-pa-khoi16-phathien").textContent).toContain(
      "Đọc lực đang là lợi thế vào lệnh của bạn.",
    )
  })

  it("~50% → câu 'chưa ổn định' của spec, KHÔNG mắng", () => {
    thachThuc.current = {
      data: thachThucData({
        ty_le_doc_luc_dung: {
          ten: "t",
          gia_tri_hien_tai: 50,
          muc_tieu: 55,
          dat: false,
          du_du_lieu: true,
          giai_thich: "g",
        },
      }),
      isPending: false,
      isError: false,
    }
    renderPanel(trades(3))
    const khoi = screen.getByTestId("cap7-pa-khoi16")
    expect(khoi.textContent).toContain(
      "Đọc lực chưa ổn định — dùng làm tham khảo thời điểm, đừng làm lý do chính.",
    )
    for (const tu of CAM_TU) expect(loiBuocToi(khoi.textContent!)).not.toContain(tu)
  })

  it("<3 lệnh đã chấm → ẨN tỷ lệ, chỉ đếm, và nói còn thiếu bao nhiêu", () => {
    thachThuc.current = {
      data: thachThucData({
        so_lenh_da_cham: 1,
        so_lenh_chua_cham: 5,
        ty_le_doc_luc_dung: {
          ten: "t",
          gia_tri_hien_tai: 100,
          muc_tieu: 55,
          dat: false,
          du_du_lieu: false,
          giai_thich: "g",
        },
      }),
      isPending: false,
      isError: false,
    }
    renderPanel(trades(3))
    expect(screen.queryByTestId("cap7-pa-khoi16-tyle")).not.toBeInTheDocument()
    expect(screen.queryByTestId("cap7-pa-khoi16-phathien")).not.toBeInTheDocument()
    const note = screen.getByTestId("cap7-pa-khoi16-note").textContent!
    expect(note).toContain("2")
    // Lệnh chưa tới hạn chấm KHÔNG BAO GIỜ bị tính là đọc sai — phải nói ra.
    expect(note).toContain("không bị tính là đọc sai")
  })

  it("query lỗi → fail-closed: nói chưa lấy được, KHÔNG tự tính từ nhật ký", () => {
    thachThuc.current = { data: undefined, isPending: false, isError: true }
    renderPanel(trades(9))
    expect(screen.queryByTestId("cap7-pa-khoi16-tyle")).not.toBeInTheDocument()
    expect(screen.queryByTestId("cap7-pa-khoi16-phathien")).not.toBeInTheDocument()
    expect(screen.queryByTestId("cap7-pa-khoi16-xuhuong")).not.toBeInTheDocument()
    expect(screen.getByTestId("cap7-pa-khoi16-note").textContent).toContain("Chưa lấy được")
  })

  /**
   * ★ REGRESSION (fix wave FE-2). Header từng in `— 0 LỆNH ĐÃ CHẤM` ở CẢ nhánh
   * đang-tải lẫn nhánh lỗi, vì `soDaCham` của tầng compute là placeholder `0` khi
   * chưa có payload. Một người đã có 8 lệnh được chấm bị nói là 0.
   */
  it("query lỗi/đang tải → header KHÔNG in '0 LỆNH ĐÃ CHẤM'", () => {
    for (const state of [
      { data: undefined, isPending: false, isError: true },
      { data: undefined, isPending: true, isError: false },
    ]) {
      thachThuc.current = state
      const { unmount } = renderPanel(trades(9))
      const header = screen.getByTestId("cap7-pa-khoi16-header").textContent!
      expect(header).toContain("ĐỌC LỰC CÓ ĐÚNG KHÔNG")
      expect(header).not.toMatch(/LỆNH ĐÃ CHẤM/)
      expect(header).not.toMatch(/\d/)
      unmount()
    }
  })

  it("có số của server → header VẪN nêu số lệnh đã chấm (không bị cắt oan)", () => {
    renderPanel(trades(9))
    expect(screen.getByTestId("cap7-pa-khoi16-header").textContent).toContain(
      "8 LỆNH ĐÃ CHẤM",
    )
  })

  it("đang tải → nói đang tải, không hiện con số nào", () => {
    thachThuc.current = { data: undefined, isPending: true, isError: false }
    renderPanel(trades(9))
    expect(screen.getByTestId("cap7-pa-khoi16-loading")).toBeInTheDocument()
    expect(screen.queryByTestId("cap7-pa-khoi16-tyle")).not.toBeInTheDocument()
  })

  it("đủ 6 lệnh đã chấm → hiện xu hướng 2 nửa; nửa sau kém hơn nói thẳng", () => {
    renderPanel([...trades(3, { docLucDung: true }), ...trades(3, { docLucDung: false })])
    const xuHuong = screen.getByTestId("cap7-pa-khoi16-xuhuong").textContent!
    expect(xuHuong).toContain("100%")
    expect(xuHuong).toContain("0%")
    expect(xuHuong).toContain("−100")
  })

  it("<6 lệnh đã chấm → ẨN xu hướng, nói còn cần bao nhiêu", () => {
    renderPanel(trades(4))
    expect(screen.queryByTestId("cap7-pa-khoi16-xuhuong")).not.toBeInTheDocument()
    expect(screen.getByTestId("cap7-pa-khoi16-xuhuong-note").textContent).toContain("6")
  })

  it("giữ NGUYÊN VĂN câu giải thích của server (§C12c)", () => {
    renderPanel(trades(3))
    expect(screen.getByTestId("cap7-pa-khoi16-server").textContent).toBe(
      "GIẢI THÍCH CỦA HỆ THỐNG",
    )
  })
})

describe("Cap7PortfolioAnalysis — khối ⑰ kỷ luật cảnh giác", () => {
  it("3 con số của server luôn hiện, định dạng en-US", () => {
    renderPanel([])
    const counts = screen.getByTestId("cap7-pa-khoi17-counts").textContent!
    expect(counts).toContain("1,234")
    expect(counts).toContain("4")
    expect(counts).toContain("3")
  })

  it("đủ ≥3 lệnh mỗi nhóm → so 2 nhóm, % âm dùng dấu − (U+2212)", () => {
    renderPanel([
      ...Array.from({ length: 3 }, () => tradeCo("cho_xac_nhan", 3)),
      ...Array.from({ length: 3 }, () => tradeCo("mua_duoi_theo", -2)),
    ])
    const khoi = screen.getByTestId("cap7-pa-khoi17").textContent!
    expect(khoi).toContain("+3.0%")
    expect(khoi).toContain("−2.0%")
    expect(khoi).not.toContain("-2.0%")
    // Mỗi số phải nằm ĐÚNG ô của nhóm nó — đảo hai ô là đảo kết luận.
    expect(screen.getByTestId("cap7-pa-khoi17-nhom-cho").textContent).toContain("+3.0%")
    expect(screen.getByTestId("cap7-pa-khoi17-nhom-duoi").textContent).toContain("−2.0%")
    expect(screen.getByTestId("cap7-pa-khoi17-phathien").textContent).toContain(
      "chờ khớp thật đang vào giá tốt hơn",
    )
  })

  it("một nhóm <3 lệnh có diễn biến → KHÔNG kết luận, nói còn cần thêm", () => {
    renderPanel([
      ...Array.from({ length: 4 }, () => tradeCo("cho_xac_nhan", 2)),
      ...Array.from({ length: 2 }, () => tradeCo("mua_duoi_theo", -3)),
    ])
    expect(screen.queryByTestId("cap7-pa-khoi17-phathien")).not.toBeInTheDocument()
    const note = screen.getByTestId("cap7-pa-khoi17-note").textContent!
    expect(note).toContain("1")
    expect(note).toContain("3")
  })

  it("mua đuổi KHÔNG xấu hơn → nói thẳng, KHÔNG bênh cái cờ", () => {
    renderPanel([
      ...Array.from({ length: 3 }, () => tradeCo("cho_xac_nhan", -1)),
      ...Array.from({ length: 3 }, () => tradeCo("mua_duoi_theo", 4)),
    ])
    expect(screen.getByTestId("cap7-pa-khoi17-phathien").textContent).toContain(
      "mua đuổi chưa vào giá xấu hơn",
    )
  })

  it("query lỗi → fail-closed, không đắp bằng phép tính client", () => {
    thachThuc.current = { data: undefined, isPending: false, isError: true }
    renderPanel([
      ...Array.from({ length: 4 }, () => tradeCo("cho_xac_nhan", 2)),
      ...Array.from({ length: 4 }, () => tradeCo("mua_duoi_theo", -3)),
    ])
    expect(screen.queryByTestId("cap7-pa-khoi17-phathien")).not.toBeInTheDocument()
    expect(screen.getByTestId("cap7-pa-khoi17-note").textContent).toContain("Chưa lấy được")
  })

  /**
   * ★ REGRESSION (fix wave FE-2). Dòng 3 con số render VÔ ĐIỀU KIỆN, nên nhánh lỗi
   * in "Gặp cờ cảnh giác: 0 lần · chờ xác nhận: 0 lần · mua đuổi: 0 lần." NGAY TRÊN
   * câu "Chưa lấy được số lần gặp cờ từ hệ thống." — 3 con số 0 đó là placeholder
   * của tầng compute, không phải sự thật về người dùng.
   */
  it("query lỗi → KHÔNG in dòng '0 lần · 0 lần · 0 lần' bịa", () => {
    thachThuc.current = { data: undefined, isPending: false, isError: true }
    renderPanel([
      ...Array.from({ length: 4 }, () => tradeCo("cho_xac_nhan", 2)),
      ...Array.from({ length: 4 }, () => tradeCo("mua_duoi_theo", -3)),
    ])
    expect(screen.queryByTestId("cap7-pa-khoi17-counts")).not.toBeInTheDocument()
    const khoi = screen.getByTestId("cap7-pa-khoi17").textContent!
    expect(khoi).not.toContain("Gặp cờ cảnh giác:")
    expect(khoi).not.toMatch(/0 lần/)
    expect(khoi).toContain("Chưa lấy được số lần gặp cờ")
  })

  it("có số của server → dòng 3 con số VẪN hiện (không bị ẩn oan)", () => {
    renderPanel([])
    const counts = screen.getByTestId("cap7-pa-khoi17-counts").textContent!
    expect(counts).toContain("Gặp cờ cảnh giác: 1,234 lần")
  })

  it("KHÔNG BAO GIỜ gọi mua đuổi là lỗi, và KHÔNG hứa phát hiện lệnh giả", () => {
    const cases: Cap7TradeRecord[][] = [
      [],
      [
        ...Array.from({ length: 3 }, () => tradeCo("cho_xac_nhan", 3)),
        ...Array.from({ length: 3 }, () => tradeCo("mua_duoi_theo", -4)),
      ],
      [
        ...Array.from({ length: 3 }, () => tradeCo("cho_xac_nhan", -3)),
        ...Array.from({ length: 3 }, () => tradeCo("mua_duoi_theo", 4)),
      ],
    ]
    for (const log of cases) {
      const { unmount } = renderPanel(log)
      const text = screen.getByTestId("cap7-pa-khoi17").textContent!
      for (const tu of CAM_TU) expect(loiBuocToi(text)).not.toContain(tu)
      expect(text).not.toMatch(/phát hiện lệnh giả/i)
      unmount()
    }
  })

  it("kèm giải thích §C12c nói rõ mua đuổi không bị phạt", () => {
    renderPanel([])
    expect(screen.getByTestId("cap7-pa-khoi17-giaithich").textContent).toContain("không bị phạt")
  })
})
