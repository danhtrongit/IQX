import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import React from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const { recordKetsoMutate, markTaskMutate, cap1Active } = vi.hoisted(() => ({
  recordKetsoMutate: vi.fn(),
  markTaskMutate: vi.fn(),
  // Mutable: cái cổng `isCap1Active` phải kiểm được ở CẢ hai trạng thái.
  cap1Active: { value: true },
}))
// `KetsoModalCap1` needs `useRecordKetso` + `useCompleteCap1Task` — mock
// `./hooks` directly (same pattern as `cap0/debrief.test.tsx`) so no
// QueryClient/http-client setup is needed for this file.
vi.mock("./hooks", () => ({
  useRecordKetso: () => ({ mutate: recordKetsoMutate }),
  useCompleteCap1Task: () => ({ mutate: markTaskMutate }),
}))
vi.mock("./Cap1Context", () => ({
  useCap1Events: () => ({ isCap1Active: cap1Active.value }),
}))

import { KetsoModalCap1, type KetsoDataCap1 } from "./KetsoModalCap1"
import type { Cap1Progress } from "./types"
import type { Cap1TradeRecord } from "./tradeLog"

function progress(overrides: Partial<Cap1Progress> = {}): Cap1Progress {
  return {
    id: "p1",
    user_id: "u1",
    entered_at: "2026-01-01T00:00:00Z",
    da_xem_tour: true,
    task_1_done_at: "2026-01-01T00:00:00Z",
    task_2_done_at: null,
    task_3_done_at: null,
    task_4_done_at: null,
    task_5_done_at: null,
    so_ly_do_da_dung: 1,
    so_lenh_ly_do_ung_ho: 0,
    so_lenh_thuc_chien: 6,
    graduated_at: null,
    time_to_graduate_hours: null,
    ...overrides,
  }
}

const cleanWin: KetsoDataCap1 = {
  n: 7,
  orderId: "order-7",
  symbol: "VNM",
  quantity: 100,
  entryPrice: 61_800,
  exitPrice: 63_000,
  vungMua: 61_500,
  lyDo: "dong_tien",
  trangThaiLucDat: "ung_ho",
  // 2026-03-02 (Mon) → 2026-03-04 (Wed): 2 trading sessions, 2 calendar days.
  buyDate: "2026-03-02",
  sellDate: "2026-03-04",
}

beforeEach(() => {
  recordKetsoMutate.mockReset()
  markTaskMutate.mockReset()
  cap1Active.value = true
})

describe("KetsoModalCap1", () => {
  it("renders nothing when data is null", () => {
    const { container } = render(
      <KetsoModalCap1 data={null} progress={null} trades={[]} onClose={vi.fn()} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it("renders the header tag, subline, and bảng đối chiếu Kế hoạch/Thực tế", async () => {
    render(<KetsoModalCap1 data={cleanWin} progress={progress()} trades={[]} onClose={vi.fn()} />)

    expect(screen.getByText("KẾT SỔ LỆNH · #7 · THỰC CHIẾN")).toBeInTheDocument()
    expect(screen.getByText(/MUA 100 VNM → BÁN/)).toBeInTheDocument()
    expect(screen.getByText(/Giữ 2 phiên/)).toBeInTheDocument()

    // The lý-do label and the "✅ Ủng hộ" verdict also appear in the coach block
    // + "HỒ SƠ CỦA BẠN" lines (spec §6 quotes both VERBATIM in template A), so
    // scope these two to the bảng đối chiếu instead of the whole document.
    const doiChieu = within(screen.getByRole("table"))
    expect(screen.getByText("Đối chiếu kế hoạch với thực tế")).toBeInTheDocument()
    expect(screen.getByText("Lý do")).toBeInTheDocument()
    expect(doiChieu.getByText(/💰 Dòng tiền/)).toBeInTheDocument()
    expect(screen.getByText("Trạng thái lớp lúc đặt")).toBeInTheDocument()
    expect(doiChieu.getByText(/✅ Ủng hộ/)).toBeInTheDocument()
    expect(screen.getByText("Vùng mua")).toBeInTheDocument()
    expect(screen.getByText("61,500")).toBeInTheDocument()
    expect(screen.getByText("61,800")).toBeInTheDocument()
    expect(screen.getByText("Giá ra · thuế")).toBeInTheDocument()
    expect(screen.getByText("Thời gian giữ")).toBeInTheDocument()
    expect(doiChieu.getByText("2 phiên")).toBeInTheDocument()

    await waitFor(() => expect(screen.getByText("+1.9%")).toBeInTheDocument(), { timeout: 2000 })
  })

  it("spans Lý do + Trạng thái across both Kế hoạch/Thực tế columns (no bogus «—»)", () => {
    render(<KetsoModalCap1 data={cleanWin} progress={progress()} trades={[]} onClose={vi.fn()} />)
    const doiChieu = within(screen.getByRole("table"))
    expect(doiChieu.getByText(/💰 Dòng tiền/)).toHaveAttribute("colspan", "2")
    expect(doiChieu.getByText(/✅ Ủng hộ/)).toHaveAttribute("colspan", "2")
  })

  it("shows Thời gian giữ in phiên only (no calendar-day suffix)", () => {
    render(<KetsoModalCap1 data={cleanWin} progress={progress()} trades={[]} onClose={vi.fn()} />)
    expect(screen.queryByText(/\d+ ngày/)).not.toBeInTheDocument()
  })

  it('does NOT show Khối cảm xúc for a "bình thường" lệnh (không có chuyện)', () => {
    render(<KetsoModalCap1 data={cleanWin} progress={progress()} trades={[]} onClose={vi.fn()} />)
    expect(screen.queryByText(/TRƯỚC KHI BẤM BÁN/)).not.toBeInTheDocument()
  })

  it('shows Khối cảm xúc (4 lựa chọn) for a "có chuyện" lệnh — lỗ >−7%', () => {
    const bigLoss: KetsoDataCap1 = {
      ...cleanWin,
      exitPrice: 55_000, // (55000-61800)/61800 ≈ −11% < −7%
    }
    render(<KetsoModalCap1 data={bigLoss} progress={progress()} trades={[]} onClose={vi.fn()} />)
    expect(screen.getByText(/TRƯỚC KHI BẤM BÁN/)).toBeInTheDocument()
    expect(screen.getByText("😌 Bình tĩnh")).toBeInTheDocument()
    expect(screen.getByText("😰 Sợ")).toBeInTheDocument()
    expect(screen.getByText("😔 Hối tiếc")).toBeInTheDocument()
    expect(screen.getByText("🤔 Không rõ")).toBeInTheDocument()
  })

  it('shows Khối cảm xúc for a "có chuyện" lệnh — giữ >10 phiên', () => {
    const heldTooLong: KetsoDataCap1 = {
      ...cleanWin,
      buyDate: "2026-02-02", // Mon
      sellDate: "2026-02-20", // Fri, 3 weeks later → >10 trading sessions
    }
    render(<KetsoModalCap1 data={heldTooLong} progress={progress()} trades={[]} onClose={vi.fn()} />)
    expect(screen.getByText(/TRƯỚC KHI BẤM BÁN/)).toBeInTheDocument()
  })

  it('shows Khối cảm xúc for a "có chuyện" lệnh — bán <1 phiên (same-day)', () => {
    const soldSameDay: KetsoDataCap1 = { ...cleanWin, buyDate: "2026-03-02", sellDate: "2026-03-02" }
    render(<KetsoModalCap1 data={soldSameDay} progress={progress()} trades={[]} onClose={vi.fn()} />)
    expect(screen.getByText(/TRƯỚC KHI BẤM BÁN/)).toBeInTheDocument()
  })

  it("selecting a cảm xúc button highlights it and is carried into the final Đóng kết sổ call", () => {
    const bigLoss: KetsoDataCap1 = { ...cleanWin, exitPrice: 55_000 }
    const onClose = vi.fn()
    render(<KetsoModalCap1 data={bigLoss} progress={progress()} trades={[]} onClose={onClose} />)
    fireEvent.click(screen.getByText("😰 Sợ"))
    fireEvent.click(screen.getByText("Đóng kết sổ ✓"))
    expect(recordKetsoMutate).toHaveBeenCalledWith({ order_id: "order-7", cam_xuc: "so" })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('"Đóng kết sổ ✓" without picking an emotion posts cam_xuc: null and calls onClose', () => {
    const onClose = vi.fn()
    render(<KetsoModalCap1 data={cleanWin} progress={progress()} trades={[]} onClose={onClose} />)
    fireEvent.click(screen.getByText("Đóng kết sổ ✓"))
    expect(recordKetsoMutate).toHaveBeenCalledWith({ order_id: "order-7", cam_xuc: null })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  // ── ★★ Chốt sổ xong PHẢI kích hoạt lại phép tính của server ★★ ─────────────
  // `Cap1Service.record_ketso` KHÔNG gọi `_recompute_counters` (chỉ
  // `record_kehoach` và `mark_task` gọi), trong khi `so_lenh_thuc_chien` đếm cả
  // lệnh BÁN đã khớp. Không có cú ping này thì nhiệm vụ ⑤ «10 lệnh Thực chiến»
  // trễ MỘT lệnh bán: người bán lệnh thứ 10 vẫn thấy 9/10 và màn tốt nghiệp
  // không mở ra cho tới khi họ tình cờ đặt thêm một lệnh MUA nữa.
  // `PATCH /cap1/task` giờ là recompute thuần (task_no 1-5 đều được) — đúng
  // cách `KetsoModalCap6` đã dùng cho nhiệm vụ ② của nó.
  it("★ closing the Kết sổ fires exactly ONE recompute PATCH /cap1/task", () => {
    render(<KetsoModalCap1 data={cleanWin} progress={progress()} trades={[]} onClose={vi.fn()} />)
    fireEvent.click(screen.getByText("Đóng kết sổ ✓"))
    expect(markTaskMutate).toHaveBeenCalledTimes(1)
    // ⑤ là nhiệm vụ cần tính lại — con số nào cũng chạy, nhưng gửi đúng cái
    // đang lệch thì log server đọc mới có nghĩa.
    expect(markTaskMutate).toHaveBeenCalledWith(5)
  })

  it("★ the recompute comes AFTER the Kết sổ itself is posted", () => {
    const order: string[] = []
    recordKetsoMutate.mockImplementation(() => order.push("ketso"))
    markTaskMutate.mockImplementation(() => order.push("recompute"))
    render(<KetsoModalCap1 data={cleanWin} progress={progress()} trades={[]} onClose={vi.fn()} />)
    fireEvent.click(screen.getByText("Đóng kết sổ ✓"))
    expect(order).toEqual(["ketso", "recompute"])
  })

  it("★ opening and closing does NOT recompute before the user actually closes", () => {
    render(<KetsoModalCap1 data={cleanWin} progress={progress()} trades={[]} onClose={vi.fn()} />)
    expect(markTaskMutate).not.toHaveBeenCalled()
  })

  it("★ does not recompute outside Cấp 1 (isCap1Active false)", () => {
    cap1Active.value = false
    render(<KetsoModalCap1 data={cleanWin} progress={progress()} trades={[]} onClose={vi.fn()} />)
    fireEvent.click(screen.getByText("Đóng kết sổ ✓"))
    expect(markTaskMutate).not.toHaveBeenCalled()
    // ...nhưng bản thân Kết sổ vẫn được ghi, và modal vẫn đóng được.
    expect(recordKetsoMutate).toHaveBeenCalledTimes(1)
  })

  // ── Coach template selection (spec §6 A-F) ────────────────────────────────
  it("picks coach template A — lãi, trạng thái lúc đặt ✅ Ủng hộ", () => {
    render(<KetsoModalCap1 data={cleanWin} progress={progress()} trades={[]} onClose={vi.fn()} />)
    expect(screen.getByText("NHÌN LẠI")).toBeInTheDocument()
    expect(screen.getByText(/Ghi lại như mẫu chuẩn/)).toBeInTheDocument()
  })

  it("picks coach template D — lỗ, trạng thái lúc đặt ❌ Ngược chiều", () => {
    const lossData: KetsoDataCap1 = {
      ...cleanWin,
      exitPrice: 60_000,
      trangThaiLucDat: "nguoc_chieu",
    }
    render(<KetsoModalCap1 data={lossData} progress={progress()} trades={[]} onClose={vi.fn()} />)
    expect(screen.getByText(/thị trường thường đúng/)).toBeInTheDocument()
  })

  it("picks coach template E — giữ quá lâu (>10 phiên) regardless of trạng thái/pnl", () => {
    const heldTooLong: KetsoDataCap1 = {
      ...cleanWin,
      buyDate: "2026-02-02",
      sellDate: "2026-02-20",
    }
    render(<KetsoModalCap1 data={heldTooLong} progress={progress()} trades={[]} onClose={vi.fn()} />)
    expect(screen.getByText(/Bạn giữ lệnh \d+ phiên/)).toBeInTheDocument()
  })

  it("renders the 3-line HỒ SƠ CỦA BẠN block", () => {
    render(
      <KetsoModalCap1
        data={cleanWin}
        progress={progress({ so_lenh_thuc_chien: 7 })}
        trades={[]}
        onClose={vi.fn()}
      />,
    )
    expect(screen.getByText(/HỒ SƠ CỦA BẠN/)).toBeInTheDocument()
    expect(screen.getByText(/thứ 7\/10/)).toBeInTheDocument()
  })
})
