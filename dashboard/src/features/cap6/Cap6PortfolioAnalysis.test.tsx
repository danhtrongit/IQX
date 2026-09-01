import { fireEvent, render, screen, within } from "@testing-library/react"
import React from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { visibleText } from "@/__tests__/textGuards"

/**
 * Phân tích danh mục Cấp 6 «Bậc thầy» — khối ① (phần Cấp 6 thêm) + ⑭ + ⑮
 * (spec §9, mockup `iqx-cap6-phantich-danhmuc.html`).
 *
 * HARNESS (cùng lựa chọn đã ghi ở `Cap5PortfolioAnalysis.test.tsx`): mock đúng
 * tầng hook, KHÔNG dựng QueryClientProvider/AuthProvider.
 *
 * ★ Ba bất biến file này canh:
 *   1. ⑭⑮ ĐỌC SERVER (`GET /cap6/phan-tich`) — không tính lại ở client. Query
 *      lỗi thì nói thẳng chưa có số, KHÔNG đắp bằng phép tính localStorage.
 *   2. `null` KHÔNG BAO GIỜ được vẽ thành 0 (luật số 7): `kl_tb_pct_von = null`
 *      là "chưa có lệnh nào", `ty_le_thang_pct = null` là "chưa đủ dữ liệu",
 *      `khop = null` là "chưa xét được" — KHÔNG phải "lệch".
 *   3. Lãi được phép hiện Ở ĐÂY (spec §11) nhưng phải kèm câu nói rõ nó KHÔNG
 *      phải điều kiện lên cấp.
 */
const { phanTich } = vi.hoisted(() => ({
  phanTich: { current: {} as Record<string, unknown> },
}))
vi.mock("./hooks", () => ({
  usePhanTichCap6: () => phanTich.current,
}))
vi.mock("@/features/cap4/hooks", () => ({
  useVuKhiDiemMu: () => ({ data: undefined, isPending: true, isError: false }),
}))
vi.mock("@/features/cap5/hooks", () => ({
  useCap5PhanTich: () => ({ data: undefined, isPending: true, isError: false }),
}))

import { Cap6PortfolioAnalysis } from "./Cap6PortfolioAnalysis"
import type { Cap6TradeRecord } from "./tradeLogCap6"
import type { Cap6Progress } from "./types"
import type { PhanTichCap6 } from "./mauThuanTypes"
import type { Cap2DailyScoreRecord } from "@/features/cap2/portfolioAnalysisCap2"
import type { Cap2Progress } from "@/features/cap2/types"
import type { Cap3Progress } from "@/features/cap3/types"
import type { Cap4Progress } from "@/features/cap4/types"
import type { Cap5Progress } from "@/features/cap5/types"

const NOW = new Date("2026-07-31T12:00:00Z")

const cap2Progress: Cap2Progress = {
  id: "c2p",
  user_id: "u1",
  entered_at: "2026-03-01T00:00:00Z",
  task_1_done_at: null,
  so_lenh_co_cl_tp: 0,
  so_lan_cat_lo_dung: 0,
  so_lan_chot_loi_dung: 0,
  so_lan_thuc_hien_dung: 0,
  graduated_at: "2026-04-01T00:00:00Z",
  time_to_graduate_hours: 30,
}

const cap3Progress: Cap3Progress = {
  id: "c3p",
  user_id: "u1",
  entered_at: "2026-04-02T00:00:00Z",
  khau_vi_da_dat: true,
  khau_vi: "can_bang",
  von_ban_dau: 100_000_000,
  task_1_done_at: null,
  task_2_done_at: null,
  so_lenh_quan_ly_von: 0,
  muc_tu_tin_da_dung: [],
  so_muc_tu_tin_da_dung: 0,
  so_lenh_cap3: 10,
  lai_pct_cap3: 4.5,
  diem_ky_luat_tb_cap3: 82,
  graduated_at: "2026-05-01T00:00:00Z",
  time_to_graduate_hours: 25,
}

const cap4Progress: Cap4Progress = {
  id: "c4p",
  user_id: "u1",
  entered_at: "2026-05-02T00:00:00Z",
  task_1_done_at: null,
  so_lenh_doc_du_5lop: 12,
  vu_khi_lop: "dong_tien",
  diem_mu_lop: "tin_tuc",
  graduated_at: "2026-06-01T00:00:00Z",
  time_to_graduate_hours: 30,
}

const cap5Progress: Cap5Progress = {
  id: "c5p",
  user_id: "u1",
  entered_at: "2026-06-02T00:00:00Z",
  task_1_done_at: null,
  task_2_done_at: null,
  so_ma_da_san: 10,
  so_ma_mua_tu_watchlist: 5,
  // `null` = mẻ chấm 5 lớp chưa chạy — KHÔNG phải 0 mã đủ lớp.
  so_ma_cho_du_lop: null,
  best_filter: null,
  graduated_at: "2026-07-01T00:00:00Z",
  time_to_graduate_hours: 40,
}

/** ★ Mốc 7/5 — KHÁC mặc định 3/2, để bài kiểm phân biệt "đọc server" với hằng số. */
function progress(over: Partial<Cap6Progress> = {}): Cap6Progress {
  return {
    entered_at: "2026-07-20T00:00:00Z",
    so_lan_xu_ly_nhat_quan: 4,
    so_lan_xu_ly_veto_nhat_quan: 2,
    muc_tieu_nhat_quan: 7,
    muc_tieu_veto: 5,
    tong_lai_lenh_cap6_pct: 6.4,
    da_xem_tour_mauthuan: true,
    graduated_at: null,
    ...over,
  }
}

/** Bản mockup `iqx-cap6-phantich-danhmuc.html`. */
const PHAN_TICH: PhanTichCap6 = {
  khoi_14: {
    rows: [
      { muc: "nhe", so_lenh: 8, kl_tb_pct_von: 24, khop: true },
      { muc: "ngai", so_lenh: 6, kl_tb_pct_von: 21, khop: true },
      { muc: "nghiem", so_lenh: 4, kl_tb_pct_von: 27, khop: false },
    ],
    du_mau: true,
    nhan_xet:
      'Khi bạn đọc mâu thuẫn "nghiêm trọng", đáng lẽ phải mua ít nhất — nhưng bạn lại mua nhiều nhất (27% vốn). Đây là bẫy "đắn đo trong đầu nhưng tay vẫn mua lớn".',
  },
  khoi_15: {
    rows: [
      { muc: "nhe", so_lenh: 8, ty_le_thang_pct: 62, du_mau: true },
      { muc: "ngai", so_lenh: 6, ty_le_thang_pct: 50, du_mau: true },
      { muc: "nghiem", so_lenh: 4, ty_le_thang_pct: 25, du_mau: true },
    ],
    so_lan_nghiem_khong_mua: 5,
    nhan_xet:
      'Bản năng đọc mâu thuẫn của bạn khá chuẩn: khi thấy "nhẹ" thì thắng 62%, thấy "nghiêm trọng" mà vào thì chỉ 25%.',
  },
}

function loaded(data: PhanTichCap6) {
  return { data, isPending: false, isError: false }
}

function renderPa(over: { cap6Progress?: Cap6Progress | null; trades?: Cap6TradeRecord[] } = {}) {
  const dailyScores: Cap2DailyScoreRecord[] = []
  return render(
    <Cap6PortfolioAnalysis
      cap2Progress={cap2Progress}
      cap3Progress={cap3Progress}
      cap4Progress={cap4Progress}
      cap5Progress={cap5Progress}
      cap6Progress={over.cap6Progress === undefined ? progress() : over.cap6Progress}
      trades={over.trades ?? []}
      dailyScores={dailyScores}
      now={NOW}
    />,
  )
}

beforeEach(() => {
  phanTich.current = loaded(PHAN_TICH)
})

describe("Cap6PortfolioAnalysis — khối ① phần Cấp 6 thêm", () => {
  it("hai con số HÀNH VI kèm mốc SERVER (7/5, không phải 3/2)", () => {
    renderPa()
    const hv = screen.getByTestId("cap6-pa-khoi1-hanhvi")
    expect(hv).toHaveTextContent("nhất quán 4/7 lần")
    expect(hv).toHaveTextContent("phủ quyết rất xấu 2/5 lần")
  })

  it("lãi ĐƯỢC hiện ở đây (spec §11) nhưng kèm câu nói rõ KHÔNG phải cổng", () => {
    renderPa()
    expect(screen.getByTestId("cap6-pa-khoi1-lai")).toHaveTextContent("6%")
    expect(screen.getByTestId("cap6-pa-khoi1")).toHaveTextContent(
      "KHÔNG phải điều kiện lên cấp",
    )
  })

  it("★ lãi null → «chưa đủ dữ liệu», KHÔNG vẽ thành 0%", () => {
    renderPa({ cap6Progress: progress({ tong_lai_lenh_cap6_pct: null }) })
    const lai = screen.getByTestId("cap6-pa-khoi1-lai")
    expect(lai).toHaveTextContent("chưa đủ dữ liệu")
    expect(lai.textContent).not.toContain("0%")
  })

  it("lãi = 0 là một KẾT QUẢ THẬT, in ra 0%", () => {
    renderPa({ cap6Progress: progress({ tong_lai_lenh_cap6_pct: 0 }) })
    const lai = screen.getByTestId("cap6-pa-khoi1-lai")
    expect(lai).toHaveTextContent("0%")
    expect(lai.textContent).not.toContain("chưa đủ dữ liệu")
  })

  it("chưa có hồ sơ Cấp 6 → nói thẳng, không số bịa", () => {
    renderPa({ cap6Progress: null })
    expect(screen.getByTestId("cap6-pa-khoi1")).toHaveTextContent("Chưa có hồ sơ Cấp 6")
    expect(screen.queryByTestId("cap6-pa-khoi1-hanhvi")).toBeNull()
  })

  it("tên cấp là «Bậc thầy», không còn «Đối chiếu»", () => {
    renderPa()
    expect(screen.getByTestId("cap6-pa-khoi1")).toHaveTextContent("Cấp 6 «Bậc thầy»")
    expect(screen.getByTestId("cap6-pa-khoi1").textContent).not.toContain("Đối chiếu")
  })
})

describe("Cap6PortfolioAnalysis — khối ⑭ nhận định vs hành động (spec §9)", () => {
  it("ba hàng theo đúng ba mức, khối lượng TB + cờ khớp", () => {
    renderPa()
    const table = screen.getByTestId("cap6-pa-khoi14-table")
    const nhe = within(table).getByTestId("cap6-pa-khoi14-row-nhe")
    expect(nhe).toHaveTextContent("🟢 Mâu thuẫn nhẹ")
    expect(nhe).toHaveTextContent("24% vốn")
    expect(nhe).toHaveTextContent("✓ hợp lý")
    const nghiem = within(table).getByTestId("cap6-pa-khoi14-row-nghiem")
    expect(nghiem).toHaveTextContent("27% vốn")
    expect(nghiem).toHaveTextContent("✗ lệch")
  })

  it("nhận xét của server in NGUYÊN VĂN (§C12c)", () => {
    renderPa()
    expect(screen.getByTestId("cap6-pa-khoi14-nhanxet")).toHaveTextContent(
      "đắn đo trong đầu nhưng tay vẫn mua lớn",
    )
  })

  it("★ khop = null → «chưa xét được», TUYỆT ĐỐI không phải «lệch»", () => {
    phanTich.current = loaded({
      ...PHAN_TICH,
      khoi_14: {
        ...PHAN_TICH.khoi_14,
        rows: [{ muc: "nghiem", so_lenh: 1, kl_tb_pct_von: 30, khop: null }],
      },
    })
    renderPa()
    const row = screen.getByTestId("cap6-pa-khoi14-row-nghiem")
    expect(row).toHaveTextContent("chưa xét được")
    expect(row.textContent).not.toContain("lệch")
  })

  it("★ kl_tb_pct_von = null → «chưa có lệnh nào», không vẽ 0% vốn", () => {
    phanTich.current = loaded({
      ...PHAN_TICH,
      khoi_14: {
        ...PHAN_TICH.khoi_14,
        rows: [{ muc: "chua_ro", so_lenh: 0, kl_tb_pct_von: null, khop: null }],
      },
    })
    renderPa()
    const row = screen.getByTestId("cap6-pa-khoi14-row-chua_ro")
    expect(row).toHaveTextContent("chưa có lệnh nào")
    expect(row.textContent).not.toContain("0% vốn")
  })

  it("du_mau = false → nói thẳng chưa đủ lệnh để kết luận", () => {
    phanTich.current = loaded({
      ...PHAN_TICH,
      khoi_14: { ...PHAN_TICH.khoi_14, du_mau: false },
    })
    renderPa()
    expect(screen.getByTestId("cap6-pa-khoi14-chuadumau")).toHaveTextContent(
      "Chưa đủ lệnh để kết luận",
    )
  })

  it("★ KHÔNG soi cắt lỗ (spec §4.3) — câu giải thích nói rõ điều đó", () => {
    renderPa()
    const gt = screen.getByTestId("cap6-pa-khoi14-giaithich")
    expect(gt).toHaveTextContent("Chỉ soi khối lượng và mức tự tin")
    expect(gt).toHaveTextContent("KHÔNG soi cắt lỗ")
  })

  it("★ query lỗi → nói thẳng chưa có số, KHÔNG bảng nào, KHÔNG số bịa", () => {
    phanTich.current = { data: undefined, isPending: false, isError: true }
    renderPa()
    expect(screen.getByTestId("cap6-pa-khoi14-error")).toHaveTextContent("Chưa lấy được")
    expect(screen.queryByTestId("cap6-pa-khoi14-table")).toBeNull()
    expect(screen.queryByTestId("cap6-pa-khoi14-nhanxet")).toBeNull()
  })

  it("đang tải → một câu đang tải, không khẳng định gì", () => {
    phanTich.current = { data: undefined, isPending: true, isError: false }
    renderPa()
    expect(screen.getByTestId("cap6-pa-khoi14-loading")).toBeInTheDocument()
    expect(screen.queryByTestId("cap6-pa-khoi14-table")).toBeNull()
  })
})

describe("Cap6PortfolioAnalysis — khối ⑮ kết quả theo mức nhận định (spec §9)", () => {
  it("ba hàng «→ vẫn vào» + dòng «Nghiêm trọng → không mua: N lần»", () => {
    renderPa()
    const table = screen.getByTestId("cap6-pa-khoi15-table")
    expect(within(table).getByTestId("cap6-pa-khoi15-row-nhe")).toHaveTextContent("62%")
    expect(within(table).getByTestId("cap6-pa-khoi15-row-nghiem")).toHaveTextContent("25%")
    const khongMua = within(table).getByTestId("cap6-pa-khoi15-row-khongmua")
    expect(khongMua).toHaveTextContent("🛑 Nghiêm trọng → không mua")
    expect(khongMua).toHaveTextContent("5")
    expect(khongMua).toHaveTextContent("đứng ngoài")
  })

  it("0 lần đứng ngoài in ra 0 — đó là một sự thật, không phải thiếu dữ liệu", () => {
    phanTich.current = loaded({
      ...PHAN_TICH,
      khoi_15: { ...PHAN_TICH.khoi_15, so_lan_nghiem_khong_mua: 0 },
    })
    renderPa()
    expect(screen.getByTestId("cap6-pa-khoi15-row-khongmua")).toHaveTextContent("0")
  })

  it("★ du_mau = false → «chưa đủ dữ liệu», KHÔNG vẽ tỷ lệ thành 0%", () => {
    phanTich.current = loaded({
      ...PHAN_TICH,
      khoi_15: {
        ...PHAN_TICH.khoi_15,
        rows: [{ muc: "nghiem", so_lenh: 1, ty_le_thang_pct: null, du_mau: false }],
      },
    })
    renderPa()
    const row = screen.getByTestId("cap6-pa-khoi15-row-nghiem")
    expect(row).toHaveTextContent("chưa đủ dữ liệu")
    expect(row.textContent).not.toContain("0%")
  })

  it("tỷ lệ thắng 0% (đủ mẫu) là KẾT QUẢ THẬT, vẫn in 0%", () => {
    phanTich.current = loaded({
      ...PHAN_TICH,
      khoi_15: {
        ...PHAN_TICH.khoi_15,
        rows: [{ muc: "nghiem", so_lenh: 5, ty_le_thang_pct: 0, du_mau: true }],
      },
    })
    renderPa()
    const row = screen.getByTestId("cap6-pa-khoi15-row-nghiem")
    expect(row).toHaveTextContent("0%")
    expect(row.textContent).not.toContain("chưa đủ dữ liệu")
  })

  it("nhận xét của server in NGUYÊN VĂN", () => {
    renderPa()
    expect(screen.getByTestId("cap6-pa-khoi15-nhanxet")).toHaveTextContent(
      "Bản năng đọc mâu thuẫn của bạn khá chuẩn",
    )
  })

  /**
   * ★★★ HAI CON SỐ LỆCH NHAU LÀ ĐÚNG, VÀ PHẢI CÓ CÂU GIẢI THÍCH (§C12c).
   *
   * Cổng tốt nghiệp gộp nhiều lần bấm «Không mua» trên CÙNG mã trong CÙNG phiên
   * thành MỘT lần (backend đã vá đúng lỗ này); khối ⑮ thì đếm THÔ mọi lần bấm.
   * Cả hai con số nằm trên cùng một màn, nên màn phải tự nói vì sao chúng lệch.
   */
  it("★ nói rõ vì sao số «không mua» ở đây có thể lớn hơn số ở khối ①", () => {
    renderPa()
    const gt = screen.getByTestId("cap6-pa-khoi15-giaithich")
    expect(gt).toHaveTextContent("đếm THÔ mọi lần")
    expect(gt).toHaveTextContent("CÙNG một mã trong CÙNG một phiên thành một lần")
    expect(gt).toHaveTextContent("Hai con số lệch nhau là đúng")
  })

  it("★ KHÔNG hứa IQX theo dõi giá mã sau khi đứng ngoài (spec §13)", () => {
    renderPa()
    // Neo dương tính: khối ⑮ THẬT SỰ đã render.
    expect(screen.getByTestId("cap6-pa-khoi15-table")).toBeInTheDocument()
    const text = visibleText()
    // Chuỗi cấm là LỜI HỨA, không phải phủ định của nó ("KHÔNG theo dõi giá mã
    // sau đó" là câu ĐÚNG và phải còn đó — bài dưới cùng canh chính câu ấy).
    for (const tu of [
      "IQX sẽ theo dõi giá",
      "IQX theo dõi giá mã sau",
      "bạn đã đúng hay sai",
      "mã đó đã tăng",
    ]) {
      expect(text).not.toContain(tu)
    }
    expect(screen.getByTestId("cap6-pa-khoi15-giaithich")).toHaveTextContent(
      "KHÔNG theo dõi giá mã sau đó",
    )
  })

  it("★ đứng ngoài KHÔNG bị gọi là điểm trừ", () => {
    renderPa()
    expect(screen.getByTestId("cap6-pa-khoi15-giaithich")).toHaveTextContent(
      "không phải điểm trừ",
    )
  })

  it("★ query lỗi → nói thẳng chưa có số, không bảng", () => {
    phanTich.current = { data: undefined, isPending: false, isError: true }
    renderPa()
    expect(screen.getByTestId("cap6-pa-khoi15-error")).toHaveTextContent("Chưa lấy được")
    expect(screen.queryByTestId("cap6-pa-khoi15-table")).toBeNull()
  })
})

describe("Cap6PortfolioAnalysis — chồng khối Cấp 1-5 THU GỌN nhưng CÒN NGUYÊN", () => {
  it("mặc định gấp lại (mockup `.collapsed`), một cú bấm là mở đủ", () => {
    renderPa()
    expect(screen.queryByTestId("cap6-pa-kethua")).not.toBeInTheDocument()
    expect(screen.getByTestId("cap6-pa-kethua-toggle")).toHaveTextContent(
      "Lý do · Kỷ luật · Vũ khí/điểm mù · Đồng thuận · Bộ lọc săn · Phễu kỷ luật",
    )
    fireEvent.click(screen.getByTestId("cap6-pa-kethua-toggle"))
    // Một khối bất kỳ của cấp dưới — chứng minh chuỗi kế thừa còn nguyên.
    expect(screen.getByTestId("cap5-pa-khoi13")).toBeInTheDocument()
    fireEvent.click(screen.getByTestId("cap6-pa-kethua-toggle"))
    expect(screen.queryByTestId("cap5-pa-khoi13")).not.toBeInTheDocument()
  })

  it("★ ba khối của CHÍNH Cấp 6 nằm NGOÀI phần gấp", () => {
    renderPa()
    expect(screen.getByTestId("cap6-pa-khoi1")).toBeInTheDocument()
    expect(screen.getByTestId("cap6-pa-khoi14")).toBeInTheDocument()
    expect(screen.getByTestId("cap6-pa-khoi15")).toBeInTheDocument()
  })
})
