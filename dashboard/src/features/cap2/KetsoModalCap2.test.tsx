import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import React from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { expectRendersNothing, visibleText } from "@/__tests__/textGuards"

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
  useRecordKetso: () => ({ mutate: recordKetsoCap1Mutate, isPending: false }),
}))
vi.mock("./hooks", () => ({
  useRecordKetsoCap2: () => ({ mutate: recordKetsoCap2Mutate, isPending: false }),
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
    so_ly_do_da_dung: 5,
    so_lenh_ly_do_ung_ho: 3,
    so_lenh_thuc_chien: 10,
    graduated_at: "2026-01-05T00:00:00Z",
    time_to_graduate_hours: 40,
    ...overrides,
  }
}

function cap2Progress(overrides: Partial<Cap2Progress> = {}): Cap2Progress {
  return {
    id: "p2",
    user_id: "u1",
    entered_at: "2026-02-01T00:00:00Z",
    task_1_done_at: null,
    so_lenh_co_cl_tp: 6,
    so_lan_cat_lo_dung: 2,
    so_lan_chot_loi_dung: 1,
    so_lan_thuc_hien_dung: 3,
    chuoi_current: 4,
    chuoi_record: 7,
    so_lenh_7_ngay: 2,
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
  recordKetsoCap1Mutate.mockImplementation((_input, options) => options?.onSuccess?.())
  recordKetsoCap2Mutate.mockImplementation((_input, options) => options?.onSuccess?.())
})

describe("KetsoModalCap2", () => {
  it("renders nothing when data is null", () => {
    render(
      <KetsoModalCap2
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

  it("preserves Cấp 1's bảng đối chiếu Kế hoạch/Thực tế", async () => {
    render(
      <KetsoModalCap2
        data={cleanData}
        progress={cap1Progress()}
        trades={[]}
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
        onClose={vi.fn()}
      />,
    )
    // `toBeVisible` chứ không chỉ `toBeInTheDocument`: một cổng dựng lại bằng
    // `hidden`/`display:none` vẫn để element trong DOM.
    expect(screen.getByText(/TRƯỚC KHI BẤM BÁN/)).toBeVisible()
    expect(screen.getByText("😌 Bình tĩnh")).toBeVisible()
    fireEvent.click(screen.getByText("😔 Hối tiếc"))
    fireEvent.click(screen.getByText("Đóng kết sổ ✓"))
    expect(recordKetsoCap1Mutate).toHaveBeenCalledWith(
      {
        order_id: "order-8",
        cam_xuc: "hoi_tiec",
      },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    )
  })

  /**
   * ★ MOCKUP `iqx-cap2-ketso.html` vẽ ĐÚNG MỘT bảng đối chiếu 5 dòng — Lý do ·
   * Vùng mua · Cắt lỗ · Chốt lời · Thời gian giữ — dưới nhãn "Đối chiếu kế
   * hoạch với thực tế". Bản mirror của Cấp 2 làm rơi nhãn (Cấp 1 vẫn có) rồi
   * tách cắt lỗ/chốt lời ra một thẻ "CAM KẾT vs THỰC TẾ" thứ hai, thành 2 bảng
   * / 8 dòng. Founder nhìn sản phẩm thật thấy sai chính chỗ này.
   */
  it("★ mockup: ĐÚNG MỘT bảng đối chiếu 5 dòng, có nhãn khối", () => {
    render(
      <KetsoModalCap2
        data={cleanData}
        progress={cap1Progress()}
        trades={[]}
        onClose={vi.fn()}
      />,
    )
    expect(screen.getByText("Đối chiếu kế hoạch với thực tế")).toBeInTheDocument()

    const tables = screen.getAllByRole("table")
    expect(tables).toHaveLength(1)
    expect(screen.queryByTestId("cap2-ketso-camket")).not.toBeInTheDocument()
    expect(screen.queryByText("CAM KẾT vs THỰC TẾ")).not.toBeInTheDocument()

    const rows = within(tables[0]).getAllByRole("row")
    const labels = rows.slice(1).map((r) => within(r).getAllByRole("cell")[0].textContent)
    expect(labels).toEqual(["Lý do", "Vùng mua", "Cắt lỗ", "Chốt lời", "Thời gian giữ"])
  })

  it("★ mockup: cắt lỗ + chốt lời cam kết nằm TRONG bảng đối chiếu", () => {
    render(
      <KetsoModalCap2
        data={cleanData}
        progress={cap1Progress()}
        trades={[]}
        onClose={vi.fn()}
      />,
    )
    const doiChieu = within(screen.getByRole("table"))
    expect(doiChieu.getByText("Cắt lỗ")).toBeInTheDocument()
    expect(doiChieu.getByText("60,400")).toBeInTheDocument()
    expect(doiChieu.getByText("Chốt lời")).toBeInTheDocument()
    expect(doiChieu.getByText("65,800")).toBeInTheDocument()
  })

  /**
   * ★ MỘT ký hiệu tiền cho cả sản phẩm: mockup (và `cap0/DebriefModal`,
   * `cap1/Cap1PortfolioAnalysis`) dùng `đ` dính liền số — không phải `₫` cách
   * một dấu cách. Cấp 1 đã có bài canh này ở Phân tích danh mục; Cấp 2 chép
   * nhầm ` ₫` vào dòng dưới P&L.
   */
  it("★ dòng dưới P&L dùng «đ» dính số, không bao giờ « ₫»", () => {
    render(
      <KetsoModalCap2
        data={cleanData}
        progress={cap1Progress()}
        trades={[]}
        onClose={vi.fn()}
      />,
    )
    // Neo dương tính: dòng P&L THẬT có render (nếu không thì "không thấy ₫" chỉ
    // nghĩa là không có gì trên màn).
    expect(screen.getByText(/\+350,000đ/)).toBeInTheDocument()
    // ★★ `container.textContent` là "" — Arco `Modal` vẽ ra portal ngoài
    // container, nên bài này từng xanh dù nhồi "tổng 1,000 ₫" vào giữa modal.
    expect(visibleText()).not.toContain("₫")
  })

  /**
   * ★ Mockup Cấp 2 vẽ khối 4 nút cảm xúc cho một lệnh HOÀN TOÀN BÌNH THƯỜNG
   * (−2,6% · giữ 3 phiên). Cổng `isLenhCoChuyen` của Cấp 1 (lỗ >−7% · giữ >10
   * phiên · bán trong 1 phiên) giấu khối đó ⇒ mở kết sổ một lệnh thường không
   * bao giờ thấy. Cấp 2 hỏi cảm xúc ở MỌI lệnh.
   */
  it("★ mockup: khối cảm xúc hiện ở lệnh thường (không cần «có chuyện»)", () => {
    render(
      <KetsoModalCap2
        data={cleanData}
        progress={cap1Progress()}
        trades={[]}
        onClose={vi.fn()}
      />,
    )
    expect(screen.getByText(/TRƯỚC KHI BẤM BÁN/)).toBeInTheDocument()
    expect(screen.getByText("😌 Bình tĩnh")).toBeInTheDocument()
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
        onClose={vi.fn()}
      />,
    )
    expect(within(screen.getByRole("table")).getByText(/cắt đúng phiên/i)).toBeInTheDocument()
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
        onClose={vi.fn()}
      />,
    )
    // "2 phiên" một mình giờ mơ hồ (dòng "Thời gian giữ" cũng có) → khớp cả cụm.
    const scoped = within(screen.getByRole("table"))
    expect(scoped.getByText(/cắt trễ 2 phiên/i)).toBeInTheDocument()
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
        onClose={vi.fn()}
      />,
    )
    expect(within(screen.getByRole("table")).getByText(/hụt/i)).toBeInTheDocument()
  })

  it("shows the next discipline streak from the server-backed snapshot", () => {
    render(
      <KetsoModalCap2
        data={cleanData}
        progress={cap1Progress()}
        disciplineProgress={cap2Progress()}
        trades={[]}
        onClose={vi.fn()}
      />,
    )
    expect(screen.getByText(/Chuỗi \+1 → 5 lệnh liên tiếp không vi phạm/)).toBeInTheDocument()
  })

  it("shows the previous discipline streak when a violation resets it", () => {
    const data: KetsoDataCap2 = {
      ...cleanData,
      flags: { order_id: "order-8", cham_SL_khong_cat: true },
    }
    render(
      <KetsoModalCap2
        data={data}
        progress={cap1Progress()}
        disciplineProgress={cap2Progress()}
        trades={[]}
        onClose={vi.fn()}
      />,
    )
    expect(screen.getByTestId("cap2-ketso-coach")).toHaveTextContent(/cắt chậm/i)
    expect(screen.getByText(/Chuỗi reset về 0 · trước đó bạn có 4 lệnh liên tiếp/)).toBeInTheDocument()
  })

  it("offers a labeled reflection note for a violation and persists its trimmed value", () => {
    const data: KetsoDataCap2 = {
      ...cleanData,
      flags: { order_id: "order-8", nhoi_lenh_khi_lo: true },
    }
    render(
      <KetsoModalCap2 data={data} progress={cap1Progress()} trades={[]} onClose={vi.fn()} />,
    )
    fireEvent.change(screen.getByLabelText("✍ GHI CHÚ NHÌN LẠI"), {
      target: { value: "  Tôi sợ mất nên chờ hồi  " },
    })
    fireEvent.click(screen.getByText("Đóng kết sổ ✓"))
    expect(recordKetsoCap2Mutate).toHaveBeenCalledWith(
      expect.objectContaining({ ghi_chu_nhin_lai: "Tôi sợ mất nên chờ hồi" }),
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    )
  })

  it("renders the combined Cấp 1 + discipline Nhìn lại coach", () => {
    const data: KetsoDataCap2 = {
      ...cleanData,
      flags: { order_id: "order-8", cham_SL_khong_cat: true, giu_cham_SL_bao_nhieu_phien: 3 },
    }
    render(
      <KetsoModalCap2
        data={data}
        progress={cap1Progress()}
        trades={[]}
        onClose={vi.fn()}
      />,
    )
    expect(screen.getByTestId("cap2-ketso-coach")).toHaveTextContent("NHÌN LẠI · KỶ LUẬT")
    expect(screen.getByText("Đóng kết sổ ✓")).toBeEnabled()
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
        onClose={onClose}
      />,
    )
    fireEvent.click(screen.getByText("Đóng kết sổ ✓"))
    expect(recordKetsoCap1Mutate).toHaveBeenCalledWith(
      { order_id: "order-8", cam_xuc: null },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    )
    expect(recordKetsoCap2Mutate).toHaveBeenCalledWith(
      {
        order_id: "order-8",
        cham_SL_cat_dung_phien_ke: true,
        ghi_chu_nhin_lai: null,
      },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    )
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it("waits for the Cấp 1 write before posting Cấp 2 and closing", () => {
    recordKetsoCap1Mutate.mockImplementationOnce(() => undefined)
    const onClose = vi.fn()
    render(
      <KetsoModalCap2
        data={cleanData}
        progress={cap1Progress()}
        disciplineProgress={cap2Progress()}
        trades={[]}
        onClose={onClose}
      />,
    )

    fireEvent.click(screen.getByText("Đóng kết sổ ✓"))
    expect(recordKetsoCap2Mutate).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()

    const cap1Options = recordKetsoCap1Mutate.mock.calls[0][1]
    act(() => cap1Options.onSuccess())
    expect(recordKetsoCap2Mutate).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it("calls onRecorded once with the closed-trade record for the trade log", () => {
    const onRecorded = vi.fn()
    render(
      <KetsoModalCap2
        data={cleanData}
        progress={cap1Progress()}
        trades={[]}
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
