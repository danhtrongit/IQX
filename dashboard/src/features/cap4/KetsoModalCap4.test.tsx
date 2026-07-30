import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import React from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const { recordKetsoCap1Mutate, recordKetsoCap2Mutate, completeCap4TaskMutate } = vi.hoisted(
  () => ({
    recordKetsoCap1Mutate: vi.fn(),
    recordKetsoCap2Mutate: vi.fn(),
    completeCap4TaskMutate: vi.fn(),
  }),
)
// Mock every hook module this modal needs — same "mock the concrete hook file
// directly" pattern as `cap3/KetsoModalCap3.test.tsx` (no QueryClient needed).
vi.mock("@/features/cap1/hooks", () => ({
  useRecordKetso: () => ({ mutate: recordKetsoCap1Mutate }),
}))
vi.mock("@/features/cap2/hooks", () => ({
  useRecordKetsoCap2: () => ({ mutate: recordKetsoCap2Mutate }),
}))
vi.mock("./hooks", () => ({
  useCompleteCap4Task: () => ({ mutate: completeCap4TaskMutate }),
}))
vi.mock("@/features/auth", () => ({
  useAuth: () => ({ user: { id: "user-1" } }),
}))

import { KetsoModalCap4, type KetsoDataCap4 } from "./KetsoModalCap4"
import { readCap4TradeLog, type Cap4TradeRecord } from "./tradeLogCap4"
import type { Cap1Progress } from "@/features/cap1/types"
import type { Cap2Progress } from "@/features/cap2/types"

function cap1Progress(overrides: Partial<Cap1Progress> = {}): Cap1Progress {
  return {
    id: "p1",
    user_id: "u1",
    entered_at: "2026-01-01T00:00:00Z",
    da_xem_tour: true,
    task_1_done_at: "2026-01-01T00:00:00Z",
    task_2_done_at: "2026-01-01T00:00:00Z",
    task_3_done_at: "2026-01-01T00:00:00Z",
    task_4_done_at: "2026-01-01T00:00:00Z",
    task_5_done_at: "2026-01-01T00:00:00Z",
    task_6_done_at: "2026-01-01T00:00:00Z",
    so_ly_do_da_dung: 5,
    so_lenh_ly_do_ung_ho: 3,
    so_lan_xem_danh_muc: 3,
    so_lenh_thuc_chien: 48,
    graduated_at: "2026-01-05T00:00:00Z",
    time_to_graduate_hours: 40,
    ...overrides,
  }
}

function cap2Progress(overrides: Partial<Cap2Progress> = {}): Cap2Progress {
  return {
    id: "c2p1",
    user_id: "u1",
    entered_at: "2026-01-06T00:00:00Z",
    task_1_done_at: null,
    task_2_done_at: null,
    task_3_done_at: null,
    task_4_done_at: null,
    task_5_done_at: null,
    chuoi_current: 8,
    chuoi_record: 9,
    last_chuoi_reset_at: null,
    graduated_at: "2026-02-01T00:00:00Z",
    time_to_graduate_hours: 20,
    ...overrides,
  }
}

/**
 * Lệnh mẫu của mockup `iqx-cap4-ketso.html`: #48 · 200 VNM · +5.3% ·
 * +318,000 ₫ — user đọc 📰 Tin tức Ủng hộ trong khi AI đánh giá Ngược chiều.
 */
const data: KetsoDataCap4 = {
  n: 48,
  orderId: "order-48",
  symbol: "VNM",
  quantity: 200,
  entryPrice: 30_000,
  exitPrice: 31_590,
  vungMua: 30_000,
  lyDo: "tin_tuc",
  trangThaiLucDat: "ung_ho",
  buyDate: "2026-03-02",
  sellDate: "2026-03-10",
  phuongPhapSlTp: "ho_tro_khang_cu",
  catLo: 28_500,
  chotLoi: 32_500,
  flags: { order_id: "order-48" },
  khauVi: "can_bang",
  mucTuTin: 2,
  cachKhoiLuong: "linh_hoat",
  khoiLuong: 200,
  pctVon: 15,
  doc5Lop: {
    ky_thuat: "ok",
    dong_tien: "ok",
    noi_bo: "neu",
    tin_tuc: "ok",
    dinh_gia: "ok",
  },
  ai5Lop: {
    ky_thuat: "ok",
    dong_tien: "ok",
    noi_bo: "neu",
    tin_tuc: "bad",
    dinh_gia: "ok",
  },
}

beforeEach(() => {
  recordKetsoCap1Mutate.mockReset()
  recordKetsoCap2Mutate.mockReset()
  completeCap4TaskMutate.mockReset()
  window.localStorage.clear()
})

function renderModal(overrides: Partial<KetsoDataCap4> = {}, onClose = vi.fn()) {
  return render(
    <KetsoModalCap4
      data={{ ...data, ...overrides }}
      progress={cap1Progress()}
      trades={[]}
      cap2Progress={cap2Progress()}
      onClose={onClose}
    />,
  )
}

describe("KetsoModalCap4 — giữ nguyên mọi khối Cấp 1/2/3 (cộng dồn)", () => {
  it("renders nothing when data is null", () => {
    const { container } = render(
      <KetsoModalCap4
        data={null}
        progress={null}
        trades={[]}
        cap2Progress={null}
        onClose={vi.fn()}
      />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it("giữ bảng đối chiếu Kế hoạch/Thực tế của Cấp 1", async () => {
    renderModal()
    expect(screen.getByText("KẾT SỔ LỆNH · #48 · THỰC CHIẾN")).toBeInTheDocument()
    const doiChieu = within(screen.getByTestId("cap4-ketso-doichieu"))
    expect(doiChieu.getByText("Vùng mua")).toBeInTheDocument()
    expect(doiChieu.getByText("Giá ra · thuế bán 0,1%")).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText("+5.3%")).toBeInTheDocument(), { timeout: 2000 })
  })

  it("giữ khối CAM KẾT vs THỰC TẾ của Cấp 2", () => {
    renderModal()
    const camket = within(screen.getByTestId("cap2-ketso-camket"))
    expect(camket.getByText("Cắt lỗ")).toBeInTheDocument()
    expect(camket.getByText("28,500")).toBeInTheDocument()
    expect(camket.getByText("Chốt lời")).toBeInTheDocument()
    expect(camket.getByText("32,500")).toBeInTheDocument()
  })

  it("giữ khối QUẢN LÝ VỐN của Cấp 3", () => {
    renderModal()
    const block = within(screen.getByTestId("cap3-ketso-quanlyvon"))
    expect(block.getByText("QUẢN LÝ VỐN")).toBeInTheDocument()
    expect(block.getByText("Cân bằng (trần 20%)")).toBeInTheDocument()
    expect(block.getByText(/⭐⭐ Vừa/)).toBeInTheDocument()
    expect(block.getByText(/200 cp · 15.0% vốn/)).toBeInTheDocument()
  })

  it("giữ 3 dòng HỒ SƠ CỦA BẠN của Cấp 1", () => {
    renderModal()
    const profile = within(screen.getByTestId("cap4-ketso-profile"))
    expect(profile.getByText(/lệnh Thực chiến thứ 48/)).toBeInTheDocument()
  })
})

describe('KetsoModalCap4 — bảng "ĐỌC 5 LỚP — NHÌN LẠI" (mới ở Cấp 4)', () => {
  it("hiện đủ 5 lớp với 2 cột bạn đọc · AI đánh giá", () => {
    renderModal()
    const table = within(screen.getByTestId("cap4-ketso-doc5lop"))
    expect(table.getByText("Bạn đọc")).toBeInTheDocument()
    expect(table.getByText("AI đánh giá")).toBeInTheDocument()

    const kyThuat = within(screen.getByTestId("cap4-ketso-lr-ky_thuat"))
    expect(kyThuat.getByText(/🎯 Kỹ thuật/)).toBeInTheDocument()
    expect(kyThuat.getByTestId("cap4-ketso-lr-ky_thuat-ban").textContent).toBe("Ủng hộ")
    expect(kyThuat.getByTestId("cap4-ketso-lr-ky_thuat-ai").textContent).toBe("Ủng hộ")

    const tinTuc = within(screen.getByTestId("cap4-ketso-lr-tin_tuc"))
    expect(tinTuc.getByText(/📰 Tin tức/)).toBeInTheDocument()
    expect(tinTuc.getByTestId("cap4-ketso-lr-tin_tuc-ban").textContent).toBe("Ủng hộ")
    expect(tinTuc.getByTestId("cap4-ketso-lr-tin_tuc-ai").textContent).toBe("Ngược chiều")
  })

  it("chỉ lớp đọc KHÁC AI được nổi nền tím (data-diff)", () => {
    renderModal()
    expect(screen.getByTestId("cap4-ketso-lr-tin_tuc")).toHaveAttribute("data-diff", "true")
    for (const lop of ["ky_thuat", "dong_tien", "noi_bo", "dinh_gia"]) {
      expect(screen.getByTestId(`cap4-ketso-lr-${lop}`)).toHaveAttribute("data-diff", "false")
    }
  })

  it("dòng tổng nêu số lớp khác AI + điểm đồng thuận (§C12c)", () => {
    renderModal()
    const sum = screen.getByTestId("cap4-ketso-doc5lop-sum")
    // AI đánh giá Ủng hộ ở 3/5 lớp; user đọc khác AI 1 lớp; cùng góc nhìn 4 lớp.
    expect(sum.textContent).toMatch(/3\/5/)
    expect(sum.textContent).toMatch(/khác AI ở 1\/5/)
    expect(sum.textContent).toMatch(/4\/5/)
  })

  it("lệnh chưa lộ AI → cột AI ghi «—» và nói thẳng chưa có đối chiếu, không hàng tím", () => {
    renderModal({ ai5Lop: null })
    const table = within(screen.getByTestId("cap4-ketso-doc5lop"))
    expect(table.getByTestId("cap4-ketso-lr-tin_tuc-ai").textContent).toBe("—")
    expect(screen.getByTestId("cap4-ketso-lr-tin_tuc")).toHaveAttribute("data-diff", "false")
    expect(screen.getByTestId("cap4-ketso-doc5lop-sum").textContent).toMatch(
      /chưa có đối chiếu AI/i,
    )
  })

  it("lớp user không chấm → ô «—», không bị coi là khác AI", () => {
    renderModal({ doc5Lop: { ky_thuat: "ok", dong_tien: "ok" } })
    expect(screen.getByTestId("cap4-ketso-lr-tin_tuc-ban").textContent).toBe("—")
    expect(screen.getByTestId("cap4-ketso-lr-tin_tuc")).toHaveAttribute("data-diff", "false")
  })
})

describe("KetsoModalCap4 — 4 lớp coach cùng hiện", () => {
  it("NHÌN LẠI (C1) + KỶ LUẬT (C2) + TỰ TIN VS KẾT QUẢ (C3) + GÓC NHÌN KHÁC AI (C4)", () => {
    renderModal()
    expect(screen.getByText("NHÌN LẠI")).toBeInTheDocument()
    expect(screen.getByText("KỶ LUẬT")).toBeInTheDocument()
    expect(within(screen.getByTestId("cap3-ketso-coach")).getByText("TỰ TIN VS KẾT QUẢ"))
      .toBeInTheDocument()
    const cap4Coach = within(screen.getByTestId("cap4-ketso-coach"))
    expect(cap4Coach.getByText("NHÌN LẠI · GÓC NHÌN KHÁC AI")).toBeInTheDocument()
    expect(cap4Coach.getByText(/📰 Tin tức/)).toBeInTheDocument()
    expect(cap4Coach.getByText(/góc nhìn của bạn đúng/)).toBeInTheDocument()
  })

  it("khác AI + thua → «AI có lý», KHÔNG dùng chữ «sai»", () => {
    renderModal({ exitPrice: 28_740 })
    const body = screen.getByTestId("cap4-ketso-coach").textContent ?? ""
    expect(body).toMatch(/AI có lý/)
    expect(body).toMatch(/Xem lại cách bạn đọc lớp này/)
    expect(body).not.toMatch(/sai/i)
  })

  it("chưa lộ AI → coach nói thẳng chưa có đối chiếu, không bịa mức AI", () => {
    renderModal({ ai5Lop: null })
    const body = screen.getByTestId("cap4-ketso-coach").textContent ?? ""
    expect(body).toMatch(/chưa có đối chiếu AI/i)
    expect(body).not.toMatch(/AI đánh giá Ngược chiều/)
  })
})

describe("KetsoModalCap4 — đóng kết sổ", () => {
  it("post cam xúc Cấp 1 + cờ kỷ luật Cấp 2 + recompute nhiệm vụ ② Cấp 4, rồi đóng", () => {
    const onClose = vi.fn()
    renderModal({ flags: { order_id: "order-48", cham_SL_cat_dung_phien_ke: true } }, onClose)
    fireEvent.click(screen.getByText("Đóng kết sổ ✓"))
    expect(recordKetsoCap1Mutate).toHaveBeenCalledWith({ order_id: "order-48", cam_xuc: null })
    expect(recordKetsoCap2Mutate).toHaveBeenCalledWith({
      order_id: "order-48",
      cham_SL_cat_dung_phien_ke: true,
    })
    expect(completeCap4TaskMutate).toHaveBeenCalledWith(2)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it("ghi lệnh vào nhật ký Cấp 4 kèm đủ dữ liệu đọc-5-lớp cho khối ⑩/⑪", () => {
    renderModal()
    fireEvent.click(screen.getByText("Đóng kết sổ ✓"))
    const log = readCap4TradeLog("user-1")
    expect(log).toHaveLength(1)
    expect(log[0].orderId).toBe("order-48")
    expect(log[0].doc_5_lop).toEqual(data.doc5Lop)
    expect(log[0].ai_5_lop).toEqual(data.ai5Lop)
    // Đồng thuận = số lớp AI đánh giá Ủng hộ (3), khác AI = 1 lớp.
    expect(log[0].so_lop_dong_thuan).toBe(3)
    expect(log[0].so_lop_khac_ai).toBe(1)
    // Mọi trường Cấp 1/2/3 vẫn nguyên (khối cũ còn tính được).
    expect(log[0].mucTuTin).toBe(2)
    expect(log[0].khauVi).toBe("can_bang")
    expect(log[0].lyDo).toBe("tin_tuc")
    expect(log[0].pnlPct).toBeCloseTo(5.3, 1)
    expect(log[0].pnlVnd).toBe(318_000)
  })

  it("lệnh chưa lộ AI → 2 số đối chiếu ghi null (KHÔNG quy về 0 như BE)", () => {
    renderModal({ ai5Lop: null })
    fireEvent.click(screen.getByText("Đóng kết sổ ✓"))
    const [rec] = readCap4TradeLog("user-1")
    expect(rec.ai_5_lop).toBeNull()
    expect(rec.so_lop_dong_thuan).toBeNull()
    expect(rec.so_lop_khac_ai).toBeNull()
  })

  it("gọi onRecorded 1 lần với bản ghi Cấp 4 (siêu tập của Cấp 1/2/3)", () => {
    const onRecorded = vi.fn()
    render(
      <KetsoModalCap4
        data={data}
        progress={cap1Progress()}
        trades={[]}
        cap2Progress={cap2Progress()}
        onClose={vi.fn()}
        onRecorded={onRecorded}
      />,
    )
    fireEvent.click(screen.getByText("Đóng kết sổ ✓"))
    expect(onRecorded).toHaveBeenCalledTimes(1)
    const rec = onRecorded.mock.calls[0][0] as Cap4TradeRecord
    expect(rec.orderId).toBe("order-48")
    expect(rec.trangThaiLucDat).toBe("ung_ho")
    expect(rec.so_lop_khac_ai).toBe(1)
  })

  it("bấm đóng 2 lần không tạo 2 bản ghi (de-dupe theo orderId)", () => {
    renderModal()
    const btn = screen.getByText("Đóng kết sổ ✓")
    fireEvent.click(btn)
    fireEvent.click(btn)
    expect(readCap4TradeLog("user-1")).toHaveLength(1)
  })
})
