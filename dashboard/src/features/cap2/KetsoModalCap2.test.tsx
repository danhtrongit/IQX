import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import React from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const { recordKetsoCap1Mutate, recordKetsoCap2Mutate } = vi.hoisted(() => ({
  recordKetsoCap1Mutate: vi.fn(),
  recordKetsoCap2Mutate: vi.fn(),
}))
// Mock BOTH hook modules this component needs — same "mock ./hooks directly"
// pattern as `cap1/KetsoModalCap1.test.tsx` (no QueryClient/http-client setup
// needed). Cấp 1's `useRecordKetso` is mocked via the concrete-file path
// (`@/features/cap1/hooks`, NOT the `@/features/cap1` barrel) — mirrors the
// established anti-cycle convention documented in
// `cap0/GraduationModal.tsx`/`cap0/graduation.test.tsx`.
vi.mock("@/features/cap1/hooks", () => ({
  useRecordKetso: () => ({ mutate: recordKetsoCap1Mutate }),
}))
vi.mock("./hooks", () => ({
  useRecordKetsoCap2: () => ({ mutate: recordKetsoCap2Mutate }),
}))

import { KetsoModalCap2, type KetsoDataCap2 } from "./KetsoModalCap2"
import type { Cap1Progress } from "@/features/cap1/types"
import type { Cap1TradeRecord } from "@/features/cap1/tradeLog"
import type { Cap2Progress } from "./types"

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
    so_lenh_thuc_chien: 10,
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
    chuoi_current: 4,
    chuoi_record: 6,
    last_chuoi_reset_at: null,
    graduated_at: null,
    time_to_graduate_hours: null,
    ...overrides,
  }
}

// Cắt lỗ cam kết tại 60.400 chạm và cắt ĐÚNG phiên; chốt lời cam kết 65.800
// KHÔNG bị vi phạm gì — a fully clean, "cách đặt tốt" order.
const cleanData: KetsoDataCap2 = {
  n: 8,
  orderId: "order-8",
  symbol: "VNM",
  quantity: 100,
  entryPrice: 62_400,
  exitPrice: 65_900,
  vungMua: 62_000,
  lyDo: "dong_tien",
  trangThaiLucDat: "ung_ho",
  buyDate: "2026-03-02", // Mon
  sellDate: "2026-03-04", // Wed
  phuongPhapSlTp: "ho_tro_khang_cu",
  catLo: 60_400,
  chotLoi: 65_800,
  flags: { order_id: "order-8" },
}

beforeEach(() => {
  recordKetsoCap1Mutate.mockReset()
  recordKetsoCap2Mutate.mockReset()
})

describe("KetsoModalCap2", () => {
  it("renders nothing when data is null", () => {
    const { container } = render(
      <KetsoModalCap2
        data={null}
        progress={null}
        trades={[]}
        cap2Progress={null}
        onClose={vi.fn()}
      />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it("preserves Cấp 1's bảng đối chiếu Kế hoạch/Thực tế", async () => {
    render(
      <KetsoModalCap2
        data={cleanData}
        progress={cap1Progress()}
        trades={[]}
        cap2Progress={cap2Progress()}
        onClose={vi.fn()}
      />,
    )
    expect(screen.getByText("KẾT SỔ LỆNH · #8 · THỰC CHIẾN")).toBeInTheDocument()
    const tables = screen.getAllByRole("table")
    const doiChieu = within(tables[0])
    expect(doiChieu.getByText("Lý do")).toBeInTheDocument()
    expect(doiChieu.getByText(/💰 Dòng tiền/)).toBeInTheDocument()
    expect(doiChieu.getByText("Vùng mua")).toBeInTheDocument()
    expect(doiChieu.getByText("62,000")).toBeInTheDocument()
    expect(doiChieu.getByText("62,400")).toBeInTheDocument()

    await waitFor(() => expect(screen.getByText("+5.6%")).toBeInTheDocument(), { timeout: 2000 })
  })

  it("preserves Cấp 1's 3-line HỒ SƠ CỦA BẠN block", () => {
    render(
      <KetsoModalCap2
        data={cleanData}
        progress={cap1Progress()}
        trades={[]}
        cap2Progress={cap2Progress()}
        onClose={vi.fn()}
      />,
    )
    expect(screen.getByText(/HỒ SƠ CỦA BẠN/)).toBeInTheDocument()
  })

  it('preserves Cấp 1\'s Khối cảm xúc for a "có chuyện" lệnh (lỗ >−7%)', () => {
    const bigLoss: KetsoDataCap2 = { ...cleanData, exitPrice: 55_000 }
    render(
      <KetsoModalCap2
        data={bigLoss}
        progress={cap1Progress()}
        trades={[]}
        cap2Progress={cap2Progress()}
        onClose={vi.fn()}
      />,
    )
    expect(screen.getByText(/TRƯỚC KHI BẤM BÁN/)).toBeInTheDocument()
    expect(screen.getByText("😌 Bình tĩnh")).toBeInTheDocument()
  })

  it("renders the CAM KẾT vs THỰC TẾ block with cắt lỗ + chốt lời rows", () => {
    render(
      <KetsoModalCap2
        data={cleanData}
        progress={cap1Progress()}
        trades={[]}
        cap2Progress={cap2Progress()}
        onClose={vi.fn()}
      />,
    )
    const block = screen.getByTestId("cap2-ketso-camket")
    const scoped = within(block)
    expect(scoped.getByText(/CAM KẾT.*THỰC TẾ/i)).toBeInTheDocument()
    expect(scoped.getByText("Cắt lỗ")).toBeInTheDocument()
    expect(scoped.getByText("60,400")).toBeInTheDocument()
    expect(scoped.getByText("Chốt lời")).toBeInTheDocument()
    expect(scoped.getByText("65,800")).toBeInTheDocument()
  })

  it("cắt lỗ đúng phiên: shows a ✅ đúng-phiên description in THỰC TẾ", () => {
    const data: KetsoDataCap2 = {
      ...cleanData,
      flags: { order_id: "order-8", cham_SL_cat_dung_phien_ke: true },
    }
    render(
      <KetsoModalCap2
        data={data}
        progress={cap1Progress()}
        trades={[]}
        cap2Progress={cap2Progress()}
        onClose={vi.fn()}
      />,
    )
    const block = screen.getByTestId("cap2-ketso-camket")
    expect(within(block).getByText(/cắt đúng phiên/i)).toBeInTheDocument()
  })

  it("cắt lỗ chậm: shows a ⚠ cắt-trễ description with số phiên giữ", () => {
    const data: KetsoDataCap2 = {
      ...cleanData,
      exitPrice: 59_000,
      flags: { order_id: "order-8", cham_SL_khong_cat: true, giu_cham_SL_bao_nhieu_phien: 2 },
    }
    render(
      <KetsoModalCap2
        data={data}
        progress={cap1Progress()}
        trades={[]}
        cap2Progress={cap2Progress()}
        onClose={vi.fn()}
      />,
    )
    const block = screen.getByTestId("cap2-ketso-camket")
    const scoped = within(block)
    expect(scoped.getByText(/cắt trễ/i)).toBeInTheDocument()
    expect(scoped.getByText(/2 phiên/)).toBeInTheDocument()
  })

  it("chốt lời hụt: shows a ⚠ hụt-lời description in THỰC TẾ", () => {
    const data: KetsoDataCap2 = {
      ...cleanData,
      flags: { order_id: "order-8", cham_TP_giu_lam_hut: true },
    }
    render(
      <KetsoModalCap2
        data={data}
        progress={cap1Progress()}
        trades={[]}
        cap2Progress={cap2Progress()}
        onClose={vi.fn()}
      />,
    )
    const block = screen.getByTestId("cap2-ketso-camket")
    expect(within(block).getByText(/hụt/i)).toBeInTheDocument()
  })

  it('shows "giữ chuỗi" impact line when the order has no vi phạm', () => {
    render(
      <KetsoModalCap2
        data={cleanData}
        progress={cap1Progress()}
        trades={[]}
        cap2Progress={cap2Progress({ chuoi_current: 4 })}
        onClose={vi.fn()}
      />,
    )
    expect(screen.getByText(/giữ chuỗi/i)).toBeInTheDocument()
    expect(screen.getByText(/5 lệnh liên tiếp/)).toBeInTheDocument()
  })

  it('shows "làm đứt chuỗi" impact line when the order has a vi phạm', () => {
    const data: KetsoDataCap2 = {
      ...cleanData,
      flags: { order_id: "order-8", cham_SL_khong_cat: true },
    }
    render(
      <KetsoModalCap2
        data={data}
        progress={cap1Progress()}
        trades={[]}
        cap2Progress={cap2Progress({ chuoi_current: 4 })}
        onClose={vi.fn()}
      />,
    )
    expect(screen.getByText(/làm đứt chuỗi/i)).toBeInTheDocument()
  })

  it("renders BOTH the Cấp 1 grid coach text and the Cấp 2 discipline coach text", () => {
    const data: KetsoDataCap2 = {
      ...cleanData,
      flags: { order_id: "order-8", cham_SL_khong_cat: true, giu_cham_SL_bao_nhieu_phien: 3 },
    }
    render(
      <KetsoModalCap2
        data={data}
        progress={cap1Progress()}
        trades={[]}
        cap2Progress={cap2Progress()}
        onClose={vi.fn()}
      />,
    )
    // Cấp 1 layer ("NHÌN LẠI") — template A/B (lãi, this order is a loss here
    // so it's C/D) verbatim phrase from `coachTemplateCap1`.
    expect(screen.getByText("NHÌN LẠI")).toBeInTheDocument()
    // Cấp 2 layer — new "KỶ LUẬT" tag + cắt-lỗ-chậm nhắc text.
    expect(screen.getByText("KỶ LUẬT")).toBeInTheDocument()
    expect(screen.getByText(/cắt chậm/i)).toBeInTheDocument()
  })

  it('"Đóng kết sổ ✓" posts BOTH Cấp 1\'s cam_xúc AND Cấp 2\'s discipline flags, then closes', () => {
    const data: KetsoDataCap2 = {
      ...cleanData,
      flags: { order_id: "order-8", cham_SL_cat_dung_phien_ke: true },
    }
    const onClose = vi.fn()
    render(
      <KetsoModalCap2
        data={data}
        progress={cap1Progress()}
        trades={[]}
        cap2Progress={cap2Progress()}
        onClose={onClose}
      />,
    )
    fireEvent.click(screen.getByText("Đóng kết sổ ✓"))
    expect(recordKetsoCap1Mutate).toHaveBeenCalledWith({ order_id: "order-8", cam_xuc: null })
    expect(recordKetsoCap2Mutate).toHaveBeenCalledWith({
      order_id: "order-8",
      cham_SL_cat_dung_phien_ke: true,
    })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it("calls onRecorded once with the closed-trade record for the trade log", () => {
    const onRecorded = vi.fn()
    render(
      <KetsoModalCap2
        data={cleanData}
        progress={cap1Progress()}
        trades={[]}
        cap2Progress={cap2Progress()}
        onClose={vi.fn()}
        onRecorded={onRecorded}
      />,
    )
    fireEvent.click(screen.getByText("Đóng kết sổ ✓"))
    expect(onRecorded).toHaveBeenCalledTimes(1)
    const record = onRecorded.mock.calls[0][0] as Cap1TradeRecord
    expect(record.orderId).toBe("order-8")
    expect(record.lyDo).toBe("dong_tien")
  })
})
