import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import React from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { expectRendersNothing } from "@/__tests__/textGuards"

const { recordKetsoCap1Mutate, recordKetsoCap2Mutate, completeTaskMutate } = vi.hoisted(() => ({
  recordKetsoCap1Mutate: vi.fn(),
  recordKetsoCap2Mutate: vi.fn(),
  completeTaskMutate: vi.fn(),
}))
// Mock every hook module this modal needs — same "mock the concrete hook file
// directly" pattern as `cap1/KetsoModalCap1.test.tsx` /
// `cap2/KetsoModalCap2.test.tsx` (no QueryClient/http-client setup needed).
vi.mock("@/features/cap1/hooks", () => ({
  useRecordKetso: () => ({ mutate: recordKetsoCap1Mutate }),
}))
vi.mock("@/features/cap2/hooks", () => ({
  useRecordKetsoCap2: () => ({ mutate: recordKetsoCap2Mutate }),
}))
vi.mock("./hooks", () => ({
  useCompleteCap3Task: () => ({ mutate: completeTaskMutate }),
}))
vi.mock("@/features/auth", () => ({
  useAuth: () => ({ user: { id: "user-1" } }),
}))

import { KetsoModalCap3, type KetsoDataCap3 } from "./KetsoModalCap3"
import { readCap3TradeLog, type Cap3TradeRecord } from "./tradeLogCap3"
import type { Cap1Progress } from "@/features/cap1/types"

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
    so_ly_do_da_dung: 5,
    so_lenh_ly_do_ung_ho: 3,
    so_lenh_thuc_chien: 34,
    graduated_at: "2026-01-05T00:00:00Z",
    time_to_graduate_hours: 40,
    ...overrides,
  }
}

/** Lệnh mẫu của mockup `iqx-cap3-ketso.html`: VNM, 200 cp, ⭐⭐ Vừa, 15% vốn. */
const data: KetsoDataCap3 = {
  n: 34,
  orderId: "order-34",
  symbol: "VNM",
  quantity: 200,
  entryPrice: 62_400,
  exitPrice: 66_200,
  vungMua: 62_400,
  lyDo: "dong_tien",
  trangThaiLucDat: "ung_ho",
  buyDate: "2026-03-02",
  sellDate: "2026-03-10",
  phuongPhapSlTp: "ho_tro_khang_cu",
  catLo: 60_700,
  chotLoi: 65_800,
  flags: { order_id: "order-34" },
  khauVi: "can_bang",
  mucTuTin: 2,
  cachKhoiLuong: "linh_hoat",
  khoiLuong: 200,
  pctVon: 15,
}

beforeEach(() => {
  recordKetsoCap1Mutate.mockReset()
  recordKetsoCap2Mutate.mockReset()
  completeTaskMutate.mockReset()
  window.localStorage.clear()
})

function renderModal(overrides: Partial<KetsoDataCap3> = {}, onClose = vi.fn()) {
  return render(
    <KetsoModalCap3
      data={{ ...data, ...overrides }}
      progress={cap1Progress()}
      trades={[]}
      onClose={onClose}
    />,
  )
}

describe("KetsoModalCap3 — giữ nguyên mọi thứ Cấp 1/Cấp 2 render", () => {
  it("renders nothing when data is null", () => {
    render(
      <KetsoModalCap3
        data={null}
        progress={null}
        trades={[]}
        onClose={vi.fn()}
      />,
    )
    // ★★ KHÔNG dùng `expect(container).toBeEmptyDOMElement()`: component này chỉ
    // gồm một Arco `Modal` → portal ở `document.body`, nên `container` rỗng BẤT
    // KỂ nó trả `null` hay trả một modal đầy chữ (đã chứng minh bằng đột biến).
    expectRendersNothing()
  })

  it("giữ bảng đối chiếu Kế hoạch/Thực tế của Cấp 1", async () => {
    renderModal()
    expect(screen.getByText("KẾT SỔ LỆNH · #34 · THỰC CHIẾN")).toBeInTheDocument()
    const doiChieu = within(screen.getByTestId("cap3-ketso-doichieu"))
    expect(doiChieu.getByText("Lý do")).toBeInTheDocument()
    expect(doiChieu.getByText(/💰 Dòng tiền/)).toBeInTheDocument()
    expect(doiChieu.getByText("Vùng mua")).toBeInTheDocument()
    // Ô "Giá ra · thuế bán 0,1%" trộn nhiều text node (giá + thuế) nên khớp
    // theo nhãn hàng + ô thời gian giữ, tránh chuỗi số trùng nhiều nơi.
    expect(doiChieu.getByText("Giá ra · thuế bán 0,1%")).toBeInTheDocument()
    expect(doiChieu.getByText("6 phiên · 8 ngày")).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText("+6.1%")).toBeInTheDocument(), { timeout: 2000 })
  })

  it("giữ khối CAM KẾT vs THỰC TẾ (cắt lỗ/chốt lời) của Cấp 2", () => {
    renderModal()
    const camket = within(screen.getByTestId("cap2-ketso-camket"))
    expect(camket.getByText("Cắt lỗ")).toBeInTheDocument()
    expect(camket.getByText("60,700")).toBeInTheDocument()
    expect(camket.getByText("Chốt lời")).toBeInTheDocument()
    expect(camket.getByText("65,800")).toBeInTheDocument()
  })

  // ★ "Chuỗi kỷ luật" KHÔNG còn là khái niệm của sản phẩm: Cấp 2 đã gỡ nó khỏi
  // Hành trình lẫn Phân tích và migration `8f1a5c7d2e64` đã DROP
  // `chuoi_current`/`chuoi_record`/`last_chuoi_reset_at` khỏi `cap2_progress`,
  // nên không nguồn nào cấp số cho dòng này nữa (mockup `iqx-cap3-ketso.html`
  // cũng không vẽ nó). Kết sổ phải im lặng chứ KHÔNG được bịa "1 lệnh liên tiếp".
  it("★ KHÔNG còn dòng tác động chuỗi kỷ luật (số bịa)", () => {
    renderModal()
    expect(screen.queryByText(/chuỗi kỷ luật/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/lệnh liên tiếp/i)).not.toBeInTheDocument()
  })

  it("★ lệnh vi phạm cũng không có dòng chuỗi kỷ luật", () => {
    renderModal({ flags: { ...data.flags, cham_SL_khong_cat: true } })
    expect(screen.queryByText(/chuỗi/i)).not.toBeInTheDocument()
  })

  it("giữ 3 dòng HỒ SƠ CỦA BẠN của Cấp 1", () => {
    renderModal()
    const profile = within(screen.getByTestId("cap3-ketso-profile"))
    expect(profile.getByText(/lệnh Thực chiến thứ 34/)).toBeInTheDocument()
  })

  it('giữ Khối cảm xúc cho lệnh "có chuyện"', () => {
    renderModal({ exitPrice: 55_000 })
    expect(screen.getByText(/TRƯỚC KHI BẤM BÁN/)).toBeInTheDocument()
    expect(screen.getByText("😌 Bình tĩnh")).toBeInTheDocument()
  })
})

describe("KetsoModalCap3 — khối QUẢN LÝ VỐN (mới ở Cấp 3)", () => {
  it("hiện khẩu vị lúc đặt · mức tự tin · cách tính · KL + %vốn thực tế", () => {
    renderModal()
    const block = within(screen.getByTestId("cap3-ketso-quanlyvon"))
    expect(block.getByText("QUẢN LÝ VỐN")).toBeInTheDocument()
    expect(block.getByText("mới ở Cấp 3")).toBeInTheDocument()
    expect(block.getByText("Khẩu vị rủi ro")).toBeInTheDocument()
    expect(block.getByText("Cân bằng (trần 20%)")).toBeInTheDocument()
    expect(block.getByText("Mức tự tin")).toBeInTheDocument()
    expect(block.getByText(/⭐⭐ Vừa/)).toBeInTheDocument()
    expect(block.getByText("Cách tính KL")).toBeInTheDocument()
    expect(block.getByText(/Khẩu vị × tự tin/)).toBeInTheDocument()
    expect(block.getByText("Khối lượng")).toBeInTheDocument()
    // KL + %vốn thực tế + số tiền (§C12c — con số đến từ đâu)
    expect(block.getByText(/200 cp · 15.0% vốn/)).toBeInTheDocument()
    expect(block.getByText(/12,480,000/)).toBeInTheDocument()
  })

  it("mức tự tin ⭐⭐⭐ Cao + cách kỷ luật hiện đúng nhãn", () => {
    renderModal({ mucTuTin: 3, cachKhoiLuong: "ky_luat", khauVi: "tan_cong" })
    const block = within(screen.getByTestId("cap3-ketso-quanlyvon"))
    expect(block.getByText(/⭐⭐⭐ Cao/)).toBeInTheDocument()
    expect(block.getByText("Tấn công (trần 30%)")).toBeInTheDocument()
    expect(block.getByText(/Chia đều theo khẩu vị/)).toBeInTheDocument()
  })
})

describe("KetsoModalCap3 — 3 lớp coach cùng hiện", () => {
  it("NHÌN LẠI (Cấp 1) + KỶ LUẬT (Cấp 2) + TỰ TIN VS KẾT QUẢ (Cấp 3)", () => {
    renderModal()
    expect(screen.getByText("NHÌN LẠI")).toBeInTheDocument()
    expect(screen.getByText("KỶ LUẬT")).toBeInTheDocument()
    const cap3Coach = within(screen.getByTestId("cap3-ketso-coach"))
    expect(cap3Coach.getByText("TỰ TIN VS KẾT QUẢ")).toBeInTheDocument()
    expect(cap3Coach.getByText(/⭐⭐ Vừa và thắng/)).toBeInTheDocument()
  })

  it("tự tin ⭐⭐⭐ Cao + thua → nhắc chưa vội kết luận, trỏ Cấp 4", () => {
    renderModal({ mucTuTin: 3, exitPrice: 58_000 })
    const cap3Coach = within(screen.getByTestId("cap3-ketso-coach"))
    expect(cap3Coach.getByText(/Chưa vội kết luận/)).toBeInTheDocument()
    expect(cap3Coach.getByText(/Cấp 4/)).toBeInTheDocument()
  })

  it("tự tin ⭐ Thấp + thua → nhắc phòng thủ đã cứu", () => {
    renderModal({ mucTuTin: 1, exitPrice: 58_000, khoiLuong: 100, pctVon: 6 })
    const cap3Coach = within(screen.getByTestId("cap3-ketso-coach"))
    expect(cap3Coach.getByText(/Phòng thủ đã cứu bạn/)).toBeInTheDocument()
  })
})

describe("KetsoModalCap3 — đóng kết sổ", () => {
  it("post cam xúc Cấp 1 + cờ kỷ luật Cấp 2 + recompute nhiệm vụ Cấp 3, rồi đóng", () => {
    const onClose = vi.fn()
    renderModal({ flags: { order_id: "order-34", cham_SL_cat_dung_phien_ke: true } }, onClose)
    fireEvent.click(screen.getByText("Đóng kết sổ ✓"))
    expect(recordKetsoCap1Mutate).toHaveBeenCalledWith({ order_id: "order-34", cam_xuc: null })
    expect(recordKetsoCap2Mutate).toHaveBeenCalledWith({
      order_id: "order-34",
      cham_SL_cat_dung_phien_ke: true,
    })
    expect(completeTaskMutate).toHaveBeenCalledWith(2)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it("ghi lệnh vào nhật ký Cấp 3 kèm đủ dữ liệu quản lý vốn cho khối ⑦/⑧", () => {
    renderModal()
    fireEvent.click(screen.getByText("Đóng kết sổ ✓"))
    const log = readCap3TradeLog("user-1")
    expect(log).toHaveLength(1)
    expect(log[0].orderId).toBe("order-34")
    expect(log[0].mucTuTin).toBe(2)
    expect(log[0].cachKhoiLuong).toBe("linh_hoat")
    expect(log[0].khoiLuong).toBe(200)
    expect(log[0].pctVon).toBe(15)
    expect(log[0].khauVi).toBe("can_bang")
    expect(log[0].lyDo).toBe("dong_tien")
    expect(log[0].pnlPct).toBeCloseTo(6.089, 2)
  })

  it("gọi onRecorded 1 lần với bản ghi Cấp 3 (dùng được cho cả nhật ký Cấp 1/2)", () => {
    const onRecorded = vi.fn()
    render(
      <KetsoModalCap3
        data={data}
        progress={cap1Progress()}
        trades={[]}
        onClose={vi.fn()}
        onRecorded={onRecorded}
      />,
    )
    fireEvent.click(screen.getByText("Đóng kết sổ ✓"))
    expect(onRecorded).toHaveBeenCalledTimes(1)
    const rec = onRecorded.mock.calls[0][0] as Cap3TradeRecord
    expect(rec.orderId).toBe("order-34")
    expect(rec.trangThaiLucDat).toBe("ung_ho")
    expect(rec.chamSlKhongCat).toBe(false)
    expect(rec.mucTuTin).toBe(2)
  })
})
