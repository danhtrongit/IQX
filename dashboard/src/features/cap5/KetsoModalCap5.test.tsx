import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import React from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * Kết sổ Cấp 5 = Kết sổ Cấp 4 nguyên vẹn + khối phân loại 4 ô + lớp coach thứ 5,
 * và nút `Đóng kết sổ ✓` trở thành CỔNG (spec §4).
 *
 * `PhanLoai4O` KHÔNG bị mock — cổng phải đúng với khối thật (kể cả lúc user đảo
 * verdict rồi chưa ghi lý do, tức "bỏ chốt"). Chỉ mock tầng hook + `Message`.
 */
const {
  recordKetsoCap1Async,
  recordKetsoCap2Mutate,
  recordKetsoCap5Async,
  verdictQuery,
  messageError,
} = vi.hoisted(() => ({
  recordKetsoCap1Async: vi.fn(),
  recordKetsoCap2Mutate: vi.fn(),
  recordKetsoCap5Async: vi.fn(),
  verdictQuery: { current: {} as Record<string, unknown> },
  messageError: vi.fn(),
}))

vi.mock("@/features/cap1/hooks", () => ({
  useRecordKetso: () => ({ mutate: vi.fn(), mutateAsync: recordKetsoCap1Async }),
}))
vi.mock("@/features/cap2/hooks", () => ({
  useRecordKetsoCap2: () => ({ mutate: recordKetsoCap2Mutate }),
}))
vi.mock("./hooks", () => ({
  useVerdictGoiY: () => verdictQuery.current,
  useRecordKetsoCap5: () => ({ mutateAsync: recordKetsoCap5Async, isPending: false }),
}))
vi.mock("@/features/auth", () => ({
  useAuth: () => ({ user: { id: "user-1" } }),
}))
vi.mock("@/shared/http/client", () => ({
  getErrorMessage: (_err: unknown, fallback: string) => Promise.resolve(fallback),
}))
vi.mock("@arco-design/web-react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@arco-design/web-react")>()
  return {
    ...actual,
    Message: { ...actual.Message, error: messageError, success: vi.fn() },
  }
})

import { KetsoModalCap5, type KetsoDataCap5 } from "./KetsoModalCap5"
import { readCap5TradeLog, type Cap5TradeRecord } from "./tradeLogCap5"
import type { VerdictGoiY } from "./types"
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
    so_lenh_thuc_chien: 61,
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
 * Cùng lệnh mẫu của Kết sổ Cấp 4 (#61 · 200 VNM · +5.3% · +318,000 ₫, user đọc
 * 📰 Tin tức Ủng hộ trong khi AI đánh giá Ngược chiều) — để test này chứng minh
 * MỌI khối Cấp 1/2/3/4 vẫn còn nguyên.
 */
const data: KetsoDataCap5 = {
  n: 61,
  orderId: "order-61",
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
  flags: { order_id: "order-61" },
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

/** Verdict hệ + provenance: 1 tín hiệu ĐẠT, 1 TRƯỢT, 1 CHƯA RÕ. */
function goiY(overrides: Partial<VerdictGoiY> = {}): VerdictGoiY {
  return {
    order_id: "order-61",
    verdict: "sai",
    giai_thich: "Có chạm ngưỡng cắt lỗ mà lệnh vẫn được giữ thêm.",
    signals: [
      {
        ma: "co_so",
        ten: "Cơ sở khi đặt lệnh",
        dat: true,
        giai_thich: "4/5 lớp bạn đọc là Ủng hộ lúc đặt",
      },
      {
        ma: "ky_luat_thoat",
        ten: "Kỷ luật thoát lệnh",
        dat: false,
        giai_thich: "Giá chạm cắt lỗ mà lệnh vẫn giữ thêm 3 phiên",
      },
      {
        ma: "khoi_luong_khop",
        ten: "Khối lượng khớp mức tự tin",
        dat: null,
        giai_thich: "Lệnh này không ghi mức tự tin nên chưa chấm được",
      },
    ],
    pnl_pct: 5.3,
    thang: true,
    o_4_du_kien: "sai_thang",
    ...overrides,
  }
}

function renderModal(
  overrides: Partial<KetsoDataCap5> = {},
  props: { onClose?: () => void; onRecorded?: (r: Cap5TradeRecord) => void } = {},
) {
  return render(
    <KetsoModalCap5
      data={{ ...data, ...overrides }}
      progress={cap1Progress()}
      trades={[]}
      cap2Progress={cap2Progress()}
      onClose={props.onClose ?? vi.fn()}
      onRecorded={props.onRecorded}
    />,
  )
}

function closeButton(): HTMLElement {
  return screen.getByTestId("cap5-ketso-close")
}

/** `true` khi `a` đứng TRƯỚC `b` trong cây DOM. */
function precedes(a: Element, b: Element): boolean {
  return Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)
}

beforeEach(() => {
  recordKetsoCap1Async.mockReset()
  recordKetsoCap1Async.mockResolvedValue({ id: "ks1" })
  recordKetsoCap2Mutate.mockReset()
  recordKetsoCap5Async.mockReset()
  recordKetsoCap5Async.mockResolvedValue({
    id: "k5-1",
    order_id: "order-61",
    pnl_pct: 5.3,
    verdict_he: "sai",
    verdict_user: "sai",
    verdict_provenance: null,
    o_4: "sai_thang",
    ly_do_sua: null,
  })
  messageError.mockReset()
  verdictQuery.current = { data: goiY(), isPending: false, isError: false }
  window.localStorage.clear()
})

describe("KetsoModalCap5 — giữ nguyên mọi khối Cấp 1/2/3/4 (cộng dồn)", () => {
  it("renders nothing when data is null", () => {
    const { container } = render(
      <KetsoModalCap5
        data={null}
        progress={null}
        trades={[]}
        cap2Progress={null}
        onClose={vi.fn()}
      />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it("giữ tag header + %lãi lỗ count-up + bảng đối chiếu của Cấp 1", async () => {
    renderModal()
    expect(screen.getByText("KẾT SỔ LỆNH · #61 · THỰC CHIẾN")).toBeInTheDocument()
    const doiChieu = within(screen.getByTestId("cap5-ketso-doichieu"))
    expect(doiChieu.getByText("Vùng mua")).toBeInTheDocument()
    expect(doiChieu.getByText("Giá ra · thuế bán 0,1%")).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText("+5.3%")).toBeInTheDocument(), { timeout: 2000 })
  })

  it("giữ khối CAM KẾT vs THỰC TẾ (Cấp 2) + QUẢN LÝ VỐN (Cấp 3)", () => {
    renderModal()
    const camket = within(screen.getByTestId("cap2-ketso-camket"))
    expect(camket.getByText("Cắt lỗ")).toBeInTheDocument()
    expect(camket.getByText("28,500")).toBeInTheDocument()
    expect(camket.getByText("32,500")).toBeInTheDocument()

    const von = within(screen.getByTestId("cap3-ketso-quanlyvon"))
    expect(von.getByText("QUẢN LÝ VỐN")).toBeInTheDocument()
    expect(von.getByText("Cân bằng (trần 20%)")).toBeInTheDocument()
    expect(von.getByText(/200 cp · 15.0% vốn/)).toBeInTheDocument()
  })

  it("giữ bảng ĐỌC 5 LỚP — NHÌN LẠI (Cấp 4) kèm hàng lệch AI", () => {
    renderModal()
    const table = within(screen.getByTestId("cap4-ketso-doc5lop"))
    expect(table.getByText("Bạn đọc")).toBeInTheDocument()
    expect(table.getByText("AI đánh giá")).toBeInTheDocument()
    expect(screen.getByTestId("cap4-ketso-lr-tin_tuc")).toHaveAttribute("data-diff", "true")
    expect(screen.getByTestId("cap4-ketso-lr-ky_thuat")).toHaveAttribute("data-diff", "false")
  })

  it("giữ 3 dòng HỒ SƠ CỦA BẠN (Cấp 1)", () => {
    renderModal()
    expect(
      within(screen.getByTestId("cap5-ketso-profile")).getByText(/lệnh Thực chiến thứ 61/),
    ).toBeInTheDocument()
  })

  it("giữ đủ 4 lớp coach Cấp 1-4", () => {
    renderModal()
    expect(screen.getByText("NHÌN LẠI")).toBeInTheDocument()
    expect(screen.getByText("KỶ LUẬT")).toBeInTheDocument()
    expect(
      within(screen.getByTestId("cap3-ketso-coach")).getByText("TỰ TIN VS KẾT QUẢ"),
    ).toBeInTheDocument()
    expect(
      within(screen.getByTestId("cap4-ketso-coach")).getByText("NHÌN LẠI · GÓC NHÌN KHÁC AI"),
    ).toBeInTheDocument()
  })
})

describe("KetsoModalCap5 — khối phân loại 4 ô đặt DƯỚI khối kế thừa, TRÊN coach", () => {
  it("render PhanLoai4O với đúng lệnh này", () => {
    renderModal()
    expect(screen.getByTestId("cap5-phanloai")).toBeInTheDocument()
    expect(screen.getByTestId("cap5-phanloai-verdict-he").textContent).toMatch(/QUYẾT ĐỊNH SAI/)
    // Provenance hiện nguyên văn (§C12c) — kể cả tín hiệu CHƯA RÕ.
    expect(screen.getByTestId("cap5-phanloai-mark-khoi_luong_khop").textContent).toBe("⚪")
  })

  it("đứng SAU bảng Đọc 5 lớp và TRƯỚC lớp coach đầu tiên", () => {
    renderModal()
    const doc5Lop = screen.getByTestId("cap4-ketso-doc5lop")
    const phanLoai = screen.getByTestId("cap5-phanloai")
    const coach1 = screen.getByText("NHÌN LẠI")
    expect(precedes(doc5Lop, phanLoai)).toBe(true)
    expect(precedes(phanLoai, coach1)).toBe(true)
  })
})

describe("KetsoModalCap5 — «Đóng kết sổ ✓» là CỔNG (spec §4)", () => {
  it("bị khoá khi chưa chốt verdict", () => {
    renderModal()
    expect(closeButton()).toBeDisabled()
  })

  it("bị khoá khi verdict đang tải (fail-closed)", () => {
    verdictQuery.current = { data: undefined, isPending: true, isError: false }
    renderModal()
    expect(closeButton()).toBeDisabled()
  })

  it("bị khoá khi không lấy được verdict (fail-closed)", () => {
    verdictQuery.current = { data: undefined, isPending: false, isError: true }
    renderModal()
    expect(screen.getByTestId("cap5-phanloai-error")).toBeInTheDocument()
    expect(closeButton()).toBeDisabled()
  })

  it("mở ra khi user đồng ý verdict hệ", () => {
    renderModal()
    fireEvent.click(screen.getByTestId("cap5-phanloai-dong-y"))
    expect(closeButton()).not.toBeDisabled()
  })

  it("KHOÁ LẠI khi user đảo verdict mà chưa ghi lý do, mở lại khi có lý do", () => {
    renderModal()
    fireEvent.click(screen.getByTestId("cap5-phanloai-dong-y"))
    expect(closeButton()).not.toBeDisabled()

    fireEvent.click(screen.getByTestId("cap5-phanloai-khac"))
    expect(closeButton()).toBeDisabled()

    fireEvent.change(screen.getByTestId("cap5-phanloai-reason-input"), {
      target: { value: "   " },
    })
    expect(closeButton()).toBeDisabled()

    fireEvent.change(screen.getByTestId("cap5-phanloai-reason-input"), {
      target: { value: "tôi vào theo tin đồn, dù lớp ủng hộ" },
    })
    expect(closeButton()).not.toBeDisabled()
  })

  it("bấm nút lúc còn khoá không post gì", () => {
    renderModal()
    fireEvent.click(closeButton())
    expect(recordKetsoCap5Async).not.toHaveBeenCalled()
    expect(recordKetsoCap1Async).not.toHaveBeenCalled()
  })
})

describe("KetsoModalCap5 — đóng kết sổ: POST /cap5/ketso + đủ việc của Cấp 4", () => {
  it("post verdict đã chốt rồi làm tiếp đúng chuỗi Cấp 4, rồi đóng", async () => {
    const onClose = vi.fn()
    renderModal(
      { flags: { order_id: "order-61", cham_SL_khong_cat: true } },
      { onClose },
    )
    fireEvent.click(screen.getByTestId("cap5-phanloai-dong-y"))
    fireEvent.click(closeButton())

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
    expect(recordKetsoCap5Async).toHaveBeenCalledWith({
      order_id: "order-61",
      verdict_user: "sai",
      ly_do_sua: null,
    })
    // Cấp 4's own close actions — cảm xúc Cấp 1 + 7 cờ kỷ luật Cấp 2.
    expect(recordKetsoCap1Async).toHaveBeenCalledWith({ order_id: "order-61", cam_xuc: null })
    expect(recordKetsoCap2Mutate).toHaveBeenCalledWith({
      order_id: "order-61",
      cham_SL_khong_cat: true,
    })
  })

  it("gửi lý do sửa khi user đảo verdict hệ", async () => {
    renderModal()
    fireEvent.click(screen.getByTestId("cap5-phanloai-khac"))
    fireEvent.change(screen.getByTestId("cap5-phanloai-reason-input"), {
      target: { value: "tôi vào theo tin đồn, dù lớp ủng hộ" },
    })
    fireEvent.click(closeButton())

    await waitFor(() => expect(recordKetsoCap5Async).toHaveBeenCalledTimes(1))
    expect(recordKetsoCap5Async).toHaveBeenCalledWith({
      order_id: "order-61",
      verdict_user: "dung",
      ly_do_sua: "tôi vào theo tin đồn, dù lớp ủng hộ",
    })
  })

  it("ghi nhật ký Cấp 5 kèm ô 4 + 2 verdict, giữ đủ dữ liệu Cấp 1-4", async () => {
    renderModal()
    fireEvent.click(screen.getByTestId("cap5-phanloai-dong-y"))
    fireEvent.click(closeButton())

    await waitFor(() => expect(readCap5TradeLog("user-1")).toHaveLength(1))
    const [rec] = readCap5TradeLog("user-1")
    expect(rec.orderId).toBe("order-61")
    expect(rec.o4).toBe("sai_thang")
    expect(rec.verdictHe).toBe("sai")
    expect(rec.verdictUser).toBe("sai")
    // Mọi trường Cấp 1/2/3/4 vẫn nguyên (khối ①-⑪ còn tính được từ chính log này).
    expect(rec.lyDo).toBe("tin_tuc")
    expect(rec.mucTuTin).toBe(2)
    expect(rec.khauVi).toBe("can_bang")
    expect(rec.doc_5_lop).toEqual(data.doc5Lop)
    expect(rec.ai_5_lop).toEqual(data.ai5Lop)
    expect(rec.so_lop_dong_thuan).toBe(3)
    expect(rec.so_lop_khac_ai).toBe(1)
    expect(rec.pnlPct).toBeCloseTo(5.3, 1)
    expect(rec.pnlVnd).toBe(318_000)
  })

  it("thiếu o_4 trong response → suy ra bằng deriveO4, KHÔNG để trống", async () => {
    recordKetsoCap5Async.mockResolvedValue({})
    renderModal()
    fireEvent.click(screen.getByTestId("cap5-phanloai-dong-y"))
    fireEvent.click(closeButton())

    await waitFor(() => expect(readCap5TradeLog("user-1")).toHaveLength(1))
    const [rec] = readCap5TradeLog("user-1")
    expect(rec.o4).toBe("sai_thang")
    expect(rec.verdictHe).toBe("sai")
    expect(rec.verdictUser).toBe("sai")
  })

  it("gọi onRecorded 1 lần với bản ghi Cấp 5 (siêu tập Cấp 1-4)", async () => {
    const onRecorded = vi.fn()
    renderModal({}, { onRecorded })
    fireEvent.click(screen.getByTestId("cap5-phanloai-dong-y"))
    fireEvent.click(closeButton())

    await waitFor(() => expect(onRecorded).toHaveBeenCalledTimes(1))
    const rec = onRecorded.mock.calls[0][0] as Cap5TradeRecord
    expect(rec.orderId).toBe("order-61")
    expect(rec.o4).toBe("sai_thang")
    expect(rec.so_lop_khac_ai).toBe(1)
  })

  it("POST lỗi → báo lỗi, modal còn mở, KHÔNG mất phân loại của user", async () => {
    recordKetsoCap5Async.mockRejectedValueOnce(new Error("boom"))
    const onClose = vi.fn()
    const onRecorded = vi.fn()
    renderModal({}, { onClose, onRecorded })
    fireEvent.click(screen.getByTestId("cap5-phanloai-dong-y"))
    fireEvent.click(closeButton())

    await waitFor(() => expect(messageError).toHaveBeenCalledTimes(1))
    expect(onClose).not.toHaveBeenCalled()
    expect(onRecorded).not.toHaveBeenCalled()
    expect(readCap5TradeLog("user-1")).toHaveLength(0)
    // Verdict user đã chốt vẫn còn đó — bấm lại được ngay.
    expect(screen.getByTestId("cap5-phanloai")).toBeInTheDocument()
    expect(closeButton()).not.toBeDisabled()
  })

  it("bấm đóng 2 lần không tạo 2 bản ghi và không post 2 lần", async () => {
    renderModal()
    fireEvent.click(screen.getByTestId("cap5-phanloai-dong-y"))
    fireEvent.click(closeButton())
    fireEvent.click(closeButton())

    await waitFor(() => expect(readCap5TradeLog("user-1")).toHaveLength(1))
    expect(recordKetsoCap5Async).toHaveBeenCalledTimes(1)
  })
})

describe("KetsoModalCap5 — lớp coach thứ 5 «quyết định vs kết quả» (spec §4)", () => {
  it("chưa chốt verdict → chưa có đoạn coach Cấp 5 (không bịa ô)", () => {
    renderModal()
    expect(screen.queryByTestId("cap5-ketso-coach")).not.toBeInTheDocument()
  })

  it("ô Sai-Thắng: hiện như CẢNH BÁO + in đậm 2 cụm phản trực giác", () => {
    renderModal()
    fireEvent.click(screen.getByTestId("cap5-phanloai-dong-y"))

    const coach = screen.getByTestId("cap5-ketso-coach")
    expect(coach.className).toMatch(/cap5-coach--canhbao/)
    expect(coach.textContent).toMatch(/Sai · Thắng/)
    const body = within(coach)
    expect(body.getByText("ô nguy hiểm nhất").tagName).toBe("STRONG")
    expect(body.getByText("may mắn, không phải năng lực").tagName).toBe("STRONG")
    // Vi phạm lấy TỪ provenance (tín hiệu trượt), không bịa.
    expect(coach.textContent).toMatch(/không tôn trọng ngưỡng cắt lỗ/)
    // Tín hiệu CHƯA RÕ không bao giờ bị kể thành vi phạm.
    expect(coach.textContent).not.toMatch(/mua quá trần khẩu vị/)
  })

  it("ô Đúng-Thắng: KHÔNG dùng style cảnh báo", () => {
    verdictQuery.current = {
      data: goiY({ verdict: "dung", o_4_du_kien: "dung_thang" }),
      isPending: false,
      isError: false,
    }
    renderModal()
    fireEvent.click(screen.getByTestId("cap5-phanloai-dong-y"))

    const coach = screen.getByTestId("cap5-ketso-coach")
    expect(coach.className).not.toMatch(/cap5-coach--canhbao/)
    expect(coach.textContent).toMatch(/Đúng · Thắng/)
    expect(within(coach).getByText("Chuẩn mực").tagName).toBe("STRONG")
  })

  it("ô Đúng-Thua: nói rõ «không phải lỗi của bạn», không cảnh báo", () => {
    verdictQuery.current = {
      data: goiY({ verdict: "dung", pnl_pct: -4.2, thang: false, o_4_du_kien: "dung_thua" }),
      isPending: false,
      isError: false,
    }
    renderModal({ exitPrice: 28_740 })
    fireEvent.click(screen.getByTestId("cap5-phanloai-dong-y"))

    const coach = screen.getByTestId("cap5-ketso-coach")
    expect(coach.className).not.toMatch(/cap5-coach--canhbao/)
    expect(coach.textContent).toMatch(/Đúng · Thua/)
    expect(within(coach).getByText("không phải lỗi của bạn").tagName).toBe("STRONG")
  })

  it("user đảo verdict → ô tính theo verdict CỦA USER, không theo hệ", () => {
    renderModal()
    fireEvent.click(screen.getByTestId("cap5-phanloai-khac"))
    fireEvent.change(screen.getByTestId("cap5-phanloai-reason-input"), {
      target: { value: "tôi có cơ sở rõ ràng, hệ chưa ghi được" },
    })

    const coach = screen.getByTestId("cap5-ketso-coach")
    // Hệ gợi ý "sai" + lệnh lãi → Sai-Thắng; user chốt "đúng" → Đúng-Thắng.
    expect(coach.textContent).toMatch(/Đúng · Thắng/)
    expect(coach.className).not.toMatch(/cap5-coach--canhbao/)
  })

  it("bỏ chốt → đoạn coach Cấp 5 biến mất (không giữ ô cũ)", () => {
    renderModal()
    fireEvent.click(screen.getByTestId("cap5-phanloai-dong-y"))
    expect(screen.getByTestId("cap5-ketso-coach")).toBeInTheDocument()
    fireEvent.click(screen.getByTestId("cap5-phanloai-khac"))
    expect(screen.queryByTestId("cap5-ketso-coach")).not.toBeInTheDocument()
  })
})
