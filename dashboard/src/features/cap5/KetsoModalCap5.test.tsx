import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import React from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { expectRendersNothing } from "@/__tests__/textGuards"

/**
 * Kết sổ Cấp 5 = Kết sổ Cấp 4 NGUYÊN VẸN + **một dòng đọc** (nguồn săn, spec §8)
 * + **một đoạn coach** «NHÌN LẠI · SĂN MÃ».
 *
 * ★★ Khối phân loại 4 ô đã NGHỈ HƯU, và cùng nó là CỔNG "chốt verdict mới đóng
 * được kết sổ", `POST /cap5/ketso`, `GET /cap5/verdict/{id}` và lối ra khẩn cấp
 * mà cái cổng đó buộc phải có. Nút «Đóng kết sổ ✓» giờ KHÔNG còn điều kiện nào
 * ngoài `closing` — đúng cách, vì modal `closable={false}` mà cổng phụ thuộc một
 * request có thể lỗi chính là lớp lỗi "nhốt vĩnh viễn user".
 *
 * Trục canh mới: dòng nguồn săn có BA trạng thái (từ săn / không từ săn / CHƯA
 * LẤY ĐƯỢC), và trạng thái thứ ba tuyệt đối không được nói thành trạng thái thứ
 * hai.
 */
const { recordKetsoCap1Async, recordKetsoCap2Mutate, messageError } = vi.hoisted(() => ({
  recordKetsoCap1Async: vi.fn(),
  recordKetsoCap2Mutate: vi.fn(),
  messageError: vi.fn(),
}))

vi.mock("@/features/cap1/hooks", () => ({
  useRecordKetso: () => ({ mutate: vi.fn(), mutateAsync: recordKetsoCap1Async }),
}))
vi.mock("@/features/cap2/hooks", () => ({
  useRecordKetsoCap2: () => ({ mutate: recordKetsoCap2Mutate }),
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
import type { Cap1Progress } from "@/features/cap1/types"

function cap1Progress(overrides: Partial<Cap1Progress> = {}): Cap1Progress {
  return {
    id: "p1",
    user_id: "u1",
    entered_at: "2026-01-01T00:00:00Z",
    da_xem_tour: true,
    task_1_done_at: "2026-01-01T00:00:00Z",
    task_2_done_at: "2026-01-01T00:00:00Z",
    task_4_done_at: "2026-01-01T00:00:00Z",
    task_5_done_at: "2026-01-01T00:00:00Z",
    so_ly_do_da_dung: 5,
    so_lenh_ly_do_ung_ho: 3,
    so_lenh_thuc_chien: 61,
    graduated_at: "2026-01-05T00:00:00Z",
    time_to_graduate_hours: 40,
    ...overrides,
    task_3_done_at:
      overrides.task_3_done_at === undefined
        ? "2026-01-01T00:00:00Z"
        : overrides.task_3_done_at,
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
  // NGUỒN SĂN của lệnh (spec §8) — `GET /cap5/nguon-san/{symbol}` do
  // `Cap5TradingPage` gọi TRƯỚC khi mở modal.
  huntFilter: "ngoai",
  huntSoPhienCho: 2,
  huntSoLopLucVao: null,
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
  messageError.mockReset()
  window.localStorage.clear()
})

describe("KetsoModalCap5 — giữ nguyên mọi khối Cấp 1/2/3/4 (cộng dồn)", () => {
  it("renders nothing when data is null", () => {
    render(
      <KetsoModalCap5
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


/* ══════════════════════════════════════════════════════════════════════════
   DÒNG NGUỒN SĂN (spec §8) — BA trạng thái, không hai
   ══════════════════════════════════════════════════════════════════════════ */
describe("KetsoModalCap5 — dòng nguồn săn (spec §8)", () => {
  it("mã đến từ săn: nêu đúng bộ lọc + số phiên chờ", () => {
    renderModal()
    const line = screen.getByTestId("cap5-ketso-hunt-origin")
    expect(line).toHaveTextContent("săn từ bộ lọc «Khối ngoại gom»")
    expect(line).toHaveTextContent("2 phiên trước")
  })

  it("đứng SAU bảng Đọc 5 lớp và TRƯỚC lớp coach đầu tiên (mockup)", () => {
    renderModal()
    const doc5 = screen.getByTestId("cap4-ketso-doc5lop")
    const origin = screen.getByTestId("cap5-ketso-hunt-origin")
    const coach1 = screen.getByText("NHÌN LẠI")
    expect(precedes(doc5, origin)).toBe(true)
    expect(precedes(origin, coach1)).toBe(true)
  })

  it("★ mã KHÔNG đến từ săn mã → nói THẲNG, tuyệt đối không nêu một bộ lọc", () => {
    renderModal({ huntFilter: null, huntSoPhienCho: null })
    const line = screen.getByTestId("cap5-ketso-hunt-origin")
    expect(line).toHaveTextContent("không đến từ săn mã")
    expect(line).not.toHaveTextContent("Khối ngoại gom")
    expect(line).not.toHaveTextContent("săn từ bộ lọc")
  })

  it("★ CHƯA LẤY ĐƯỢC nguồn săn ≠ «không đến từ săn mã»", () => {
    renderModal({ huntNguonChuaBiet: true, huntFilter: null, huntSoPhienCho: null })
    const line = screen.getByTestId("cap5-ketso-hunt-origin")
    expect(line).toHaveTextContent("Chưa lấy được nguồn săn")
    expect(line).toHaveTextContent('Không phải là "không đến từ săn mã"')
  })

  it("★ chưa biết nguồn → KHÔNG có đoạn coach săn mã (mẫu coach khẳng định nguồn)", () => {
    renderModal({ huntNguonChuaBiet: true, huntFilter: null, huntSoPhienCho: null })
    expect(screen.queryByTestId("cap5-ketso-coach")).not.toBeInTheDocument()
  })

  it("★ thiếu số phiên chờ → bỏ hẳn vế đó, KHÔNG in «0 phiên trước»", () => {
    renderModal({ huntSoPhienCho: null })
    const line = screen.getByTestId("cap5-ketso-hunt-origin")
    expect(line).toHaveTextContent("săn từ bộ lọc «Khối ngoại gom»")
    expect(line).not.toHaveTextContent("0 phiên trước")
  })

  it("★ `huntSoLopLucVao: null` → nói chưa chấm được, KHÔNG in «0/5 lớp»", () => {
    renderModal({ huntSoLopLucVao: null })
    const line = screen.getByTestId("cap5-ketso-hunt-origin")
    expect(line).toHaveTextContent("chưa chấm được")
    expect(line).not.toHaveTextContent("0/5 lớp")
  })

  it("có số lớp lúc vào lệnh thì in ra", () => {
    renderModal({ huntSoLopLucVao: 4 })
    expect(screen.getByTestId("cap5-ketso-hunt-origin")).toHaveTextContent("4/5 lớp ủng hộ")
  })
})

describe("KetsoModalCap5 — coach «NHÌN LẠI · SĂN MÃ» (spec §8)", () => {
  it("mã từ săn mã → có đoạn coach nhắc quy trình «săn rồi sàng, không mua vội»", () => {
    renderModal()
    const coach = screen.getByTestId("cap5-ketso-coach")
    expect(coach).toBeInTheDocument()
    expect(screen.getByText("NHÌN LẠI · SĂN MÃ")).toBeInTheDocument()
  })

  it("mã KHÔNG từ săn mã → coach nói thẳng điều đó, không bịa bộ lọc", () => {
    renderModal({ huntFilter: null })
    const coach = screen.getByTestId("cap5-ketso-coach")
    expect(coach).toHaveTextContent("KHÔNG đến từ săn mã")
  })
})

/* ══════════════════════════════════════════════════════════════════════════
   ĐÓNG KẾT SỔ — không còn cổng nào (luật "không nhốt user")
   ══════════════════════════════════════════════════════════════════════════ */
describe("KetsoModalCap5 — «Đóng kết sổ ✓» KHÔNG còn là cổng", () => {
  it("★ nút bấm được ngay, không phụ thuộc request nào", () => {
    renderModal()
    expect(closeButton()).toBeEnabled()
  })

  it("★ kể cả khi không lấy được nguồn săn, nút vẫn bấm được", () => {
    renderModal({ huntNguonChuaBiet: true, huntFilter: null })
    expect(closeButton()).toBeEnabled()
  })

  it("đóng: kết sổ Cấp 1 (await) + 7 cờ Cấp 2 + ghi nhật ký Cấp 5, rồi đóng", async () => {
    const onClose = vi.fn()
    renderModal({}, { onClose })
    fireEvent.click(closeButton())
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
    expect(recordKetsoCap1Async).toHaveBeenCalledWith(
      expect.objectContaining({ order_id: "order-61" }),
    )
    expect(recordKetsoCap2Mutate).toHaveBeenCalledWith(
      expect.objectContaining({ order_id: "order-61" }),
    )
  })

  it("★ nhật ký Cấp 5 chép NGUYÊN 3 trường nguồn săn (khối ⑫ đọc từ đây)", async () => {
    const onClose = vi.fn()
    renderModal({ huntFilter: "kl", huntSoPhienCho: 7, huntSoLopLucVao: 3 }, { onClose })
    fireEvent.click(closeButton())
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
    const [rec] = readCap5TradeLog("user-1")
    expect(rec.huntFilter).toBe("kl")
    expect(rec.huntSoPhienCho).toBe(7)
    expect(rec.huntSoLopLucVao).toBe(3)
    // …và vẫn đủ dữ liệu Cấp 1-4 để các khối cũ tính được.
    expect(rec.orderId).toBe("order-61")
    expect(rec.lyDo).toBe("tin_tuc")
    expect(rec.khoiLuong).toBe(200)
    expect(rec.doc_5_lop).toEqual(data.doc5Lop)
  })

  it("★ mã không từ săn mã → nhật ký giữ `huntFilter: null`, KHÔNG gán bừa một bộ lọc", async () => {
    const onClose = vi.fn()
    renderModal({ huntFilter: null, huntSoPhienCho: null }, { onClose })
    fireEvent.click(closeButton())
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
    const [rec] = readCap5TradeLog("user-1")
    expect(rec.huntFilter).toBeNull()
  })

  it("gọi onRecorded 1 lần với bản ghi Cấp 5 (siêu tập Cấp 1-4)", async () => {
    const onRecorded = vi.fn()
    const onClose = vi.fn()
    renderModal({}, { onClose, onRecorded })
    fireEvent.click(closeButton())
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
    expect(onRecorded).toHaveBeenCalledTimes(1)
    expect(onRecorded.mock.calls[0][0]).toMatchObject({
      orderId: "order-61",
      huntFilter: "ngoai",
    })
  })

  it("kết sổ Cấp 1 lỗi (409 đã kết sổ) vẫn đóng được — không nuốt lệnh", async () => {
    recordKetsoCap1Async.mockRejectedValue(new Error("409"))
    const onClose = vi.fn()
    renderModal({}, { onClose })
    fireEvent.click(closeButton())
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
    const log = readCap5TradeLog("user-1")
    expect(log).toHaveLength(1)
  })

  it("bấm đóng 2 lần không tạo 2 bản ghi", async () => {
    const onClose = vi.fn()
    renderModal({}, { onClose })
    fireEvent.click(closeButton())
    fireEvent.click(closeButton())
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
    expect(readCap5TradeLog("user-1")).toHaveLength(1)
  })
})

describe("KetsoModalCap5 — Cấp 5 CŨ không mọc lại", () => {
  it("★ không còn khối phân loại 4 ô / lối ra khẩn cấp", () => {
    renderModal()
    expect(screen.queryByTestId("cap5-phanloai")).not.toBeInTheDocument()
    expect(screen.queryByTestId("cap5-phanloai-dong-y")).not.toBeInTheDocument()
    expect(screen.queryByText(/chưa phân loại được/)).not.toBeInTheDocument()
  })
})
