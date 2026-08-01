import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import React from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * Kết sổ Cấp 6 = Kết sổ Cấp 5 nguyên vẹn (mọi khối Cấp 1-5 + khối phân loại 4 ô +
 * CỔNG `Đóng kết sổ ✓`) + khối "ĐỐI CHIẾU — NHÌN LẠI" + lớp coach thứ 6.
 *
 * `PhanLoai4O` KHÔNG bị mock — cổng Cấp 5 phải đúng với khối thật (kể cả khi user
 * đảo verdict rồi chưa ghi lý do, tức "bỏ chốt"). Chỉ mock tầng hook + `Message`.
 */
const {
  recordKetsoCap1Async,
  recordKetsoCap2Mutate,
  recordKetsoCap5Async,
  markCap6Task,
  verdictQuery,
  messageError,
} = vi.hoisted(() => ({
  recordKetsoCap1Async: vi.fn(),
  recordKetsoCap2Mutate: vi.fn(),
  recordKetsoCap5Async: vi.fn(),
  markCap6Task: vi.fn(),
  verdictQuery: { current: {} as Record<string, unknown> },
  messageError: vi.fn(),
}))

vi.mock("@/features/cap1/hooks", () => ({
  useRecordKetso: () => ({ mutate: vi.fn(), mutateAsync: recordKetsoCap1Async }),
}))
vi.mock("@/features/cap2/hooks", () => ({
  useRecordKetsoCap2: () => ({ mutate: recordKetsoCap2Mutate }),
}))
vi.mock("@/features/cap5/hooks", () => ({
  useVerdictGoiY: () => verdictQuery.current,
  useRecordKetsoCap5: () => ({ mutateAsync: recordKetsoCap5Async, isPending: false }),
}))
vi.mock("./hooks", () => ({
  useCompleteCap6Task: () => ({ mutate: markCap6Task }),
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

import {
  KetsoModalCap6,
  type DoiChieuKetsoCap6,
  type KetsoDataCap6,
} from "./KetsoModalCap6"
import { readCap6TradeLog, type Cap6TradeRecord } from "./tradeLogCap6"
import type { Cap1Progress } from "@/features/cap1/types"
import type { Cap2Progress } from "@/features/cap2/types"
import type { VerdictGoiY } from "@/features/cap5/types"

const CAM_TU = ["sai", "không nên", "lẽ ra", "may mắn"]

function cap1Progress(): Cap1Progress {
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
    so_lenh_thuc_chien: 84,
    graduated_at: "2026-01-05T00:00:00Z",
    time_to_graduate_hours: 40,
  }
}

function cap2Progress(): Cap2Progress {
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
  }
}

const doiChieu: DoiChieuKetsoCap6 = {
  kieu: "ngan_hang",
  kieuTen: "Ngân hàng",
  nganh: "Ngân hàng",
  lopQuyetDinh: "dinh_gia",
  lopUuTien: ["dinh_gia", "noi_bo"],
  khopGoiY: true,
  lyDo: "P/B 1.2 — thấp hơn trung vị 3 năm",
}

/**
 * Lệnh mẫu: #84 · 200 VCB · +5.3% — user đọc 🎯 Kỹ thuật + 💰 Dòng tiền Ủng hộ
 * NHƯNG 💎 Định giá Ngược chiều (đúng điều kiện mâu thuẫn của spec §4), rồi tin
 * 💎 Định giá — khớp gợi ý cho kiểu Ngân hàng.
 */
const data: KetsoDataCap6 = {
  n: 84,
  orderId: "order-84",
  symbol: "VCB",
  quantity: 200,
  entryPrice: 30_000,
  exitPrice: 31_590,
  vungMua: 30_000,
  lyDo: "dinh_gia",
  trangThaiLucDat: "ung_ho",
  buyDate: "2026-07-02",
  sellDate: "2026-07-10",
  phuongPhapSlTp: "ho_tro_khang_cu",
  catLo: 28_500,
  chotLoi: 32_500,
  flags: { order_id: "order-84" },
  giaSauKhiCat: null,
  khauVi: "can_bang",
  mucTuTin: 2,
  cachKhoiLuong: "linh_hoat",
  khoiLuong: 200,
  pctVon: 15,
  doc5Lop: {
    ky_thuat: "ok",
    dong_tien: "ok",
    noi_bo: "neu",
    tin_tuc: "neu",
    dinh_gia: "bad",
  },
  ai5Lop: null,
  doiChieu,
}

function goiY(overrides: Partial<VerdictGoiY> = {}): VerdictGoiY {
  return {
    order_id: "order-84",
    verdict: "dung",
    giai_thich: "Lệnh giữ đúng cắt lỗ và khối lượng đã cam kết.",
    signals: [
      {
        ma: "co_so",
        ten: "Cơ sở khi đặt lệnh",
        dat: true,
        giai_thich: "2/5 lớp bạn đọc là Ủng hộ lúc đặt",
      },
    ],
    pnl_pct: 5.3,
    thang: true,
    o_4_du_kien: "dung_thang",
    ...overrides,
  }
}

function renderModal(
  overrides: Partial<KetsoDataCap6> = {},
  props: { onClose?: () => void; onRecorded?: (r: Cap6TradeRecord) => void } = {},
) {
  return render(
    <KetsoModalCap6
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
  return screen.getByTestId("cap6-ketso-close")
}

/** Chốt verdict trong khối phân loại 4 ô thật (đồng ý với verdict hệ). */
function chotPhanLoai() {
  fireEvent.click(screen.getByTestId("cap5-phanloai-dong-y"))
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
    order_id: "order-84",
    pnl_pct: 5.3,
    verdict_he: "dung",
    verdict_user: "dung",
    verdict_provenance: null,
    o_4: "dung_thang",
    ly_do_sua: null,
  })
  markCap6Task.mockReset()
  messageError.mockReset()
  verdictQuery.current = { data: goiY(), isPending: false, isError: false }
  window.localStorage.clear()
})

describe("KetsoModalCap6 — cộng dồn: giữ NGUYÊN mọi khối Cấp 1-5", () => {
  it("renders nothing when data is null", () => {
    const { container } = render(
      <KetsoModalCap6
        data={null}
        progress={null}
        trades={[]}
        cap2Progress={null}
        onClose={vi.fn()}
      />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it("giữ tag header + count-up + bảng đối chiếu Cấp 1", async () => {
    renderModal()
    expect(screen.getByText("KẾT SỔ LỆNH · #84 · THỰC CHIẾN")).toBeInTheDocument()
    expect(screen.getByTestId("cap5-ketso-doichieu")).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText("+5.3%")).toBeInTheDocument(), { timeout: 2000 })
  })

  it("giữ CAM KẾT vs THỰC TẾ (Cấp 2) · QUẢN LÝ VỐN (Cấp 3) · ĐỌC 5 LỚP (Cấp 4)", () => {
    renderModal()
    expect(screen.getByTestId("cap2-ketso-camket")).toBeInTheDocument()
    expect(screen.getByTestId("cap3-ketso-quanlyvon")).toBeInTheDocument()
    expect(screen.getByTestId("cap4-ketso-doc5lop")).toBeInTheDocument()
  })

  it("giữ khối phân loại 4 ô + 5 lớp coach Cấp 1-5", () => {
    renderModal()
    expect(screen.getByTestId("cap5-phanloai")).toBeInTheDocument()
    chotPhanLoai()
    expect(screen.getByTestId("cap3-ketso-coach")).toBeInTheDocument()
    expect(screen.getByTestId("cap4-ketso-coach")).toBeInTheDocument()
    expect(screen.getByTestId("cap5-ketso-coach")).toBeInTheDocument()
  })

  it("giữ 3 dòng HỒ SƠ CỦA BẠN", () => {
    renderModal()
    expect(screen.getByTestId("cap5-ketso-profile")).toBeInTheDocument()
  })
})

describe("KetsoModalCap6 — CỔNG phân loại 4 ô của Cấp 5 KHÔNG bị nới", () => {
  it("chưa chốt phân loại → nút đóng bị khoá + có ghi chú vì sao", () => {
    renderModal()
    expect(closeButton()).toBeDisabled()
    expect(screen.getByTestId("cap6-ketso-gate-note")).toBeInTheDocument()
  })

  it("bấm đóng khi chưa chốt → KHÔNG gọi POST nào, KHÔNG đóng", () => {
    const onClose = vi.fn()
    renderModal({}, { onClose })
    fireEvent.click(closeButton())
    expect(recordKetsoCap5Async).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })

  it("chốt phân loại → nút mở; đóng thì POST cấp 1 → 2 → 5 và gọi onClose", async () => {
    const onClose = vi.fn()
    renderModal({}, { onClose })
    chotPhanLoai()
    expect(closeButton()).not.toBeDisabled()
    fireEvent.click(closeButton())
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
    expect(recordKetsoCap1Async).toHaveBeenCalledWith({ order_id: "order-84", cam_xuc: null })
    expect(recordKetsoCap2Mutate).toHaveBeenCalled()
    expect(recordKetsoCap5Async).toHaveBeenCalledWith({
      order_id: "order-84",
      verdict_user: "dung",
      ly_do_sua: null,
    })
  })

  it("đảo verdict mà chưa ghi lý do → cổng ĐÓNG LẠI (fail-closed)", () => {
    renderModal()
    chotPhanLoai()
    expect(closeButton()).not.toBeDisabled()
    fireEvent.click(screen.getByTestId("cap5-phanloai-khac"))
    expect(closeButton()).toBeDisabled()
  })

  it("POST /cap5/ketso lỗi → modal ở lại, hiện lỗi, không onClose", async () => {
    const onClose = vi.fn()
    recordKetsoCap5Async.mockRejectedValue(new Error("boom"))
    renderModal({}, { onClose })
    chotPhanLoai()
    fireEvent.click(closeButton())
    await waitFor(() => expect(messageError).toHaveBeenCalled())
    expect(onClose).not.toHaveBeenCalled()
  })

  it("verdict lỗi → hiện LỐI RA của Cấp 5 (không kẹt trong modal closable=false)", async () => {
    const onClose = vi.fn()
    verdictQuery.current = { data: undefined, isPending: false, isError: true }
    renderModal({}, { onClose })
    const escape = screen.getByTestId("cap6-ketso-escape")
    fireEvent.click(escape)
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
    expect(recordKetsoCap5Async).not.toHaveBeenCalled()
    // 7 cờ kỷ luật Cấp 2 vẫn được ghi (chúng không phụ thuộc verdict).
    expect(recordKetsoCap2Mutate).toHaveBeenCalled()
    const [rec] = readCap6TradeLog("user-1")
    expect(rec.o4).toBeNull()
    // Khối Đối chiếu của lệnh vẫn được ghi — nó độc lập với verdict 4 ô.
    expect(rec.khopGoiY).toBe(true)
    expect(rec.lopQuyetDinh).toBe("dinh_gia")
  })
})

describe("KetsoModalCap6 — khối ĐỐI CHIẾU — NHÌN LẠI", () => {
  it("hiện kiểu cổ phiếu KÈM ngành nó được suy ra từ (provenance §C12c)", () => {
    renderModal()
    const block = within(screen.getByTestId("cap6-ketso-doichieu"))
    expect(block.getByText(/ĐỐI CHIẾU — NHÌN LẠI/)).toBeInTheDocument()
    expect(block.getByTestId("cap6-ketso-kieu").textContent).toContain("Ngân hàng")
    expect(block.getByTestId("cap6-ketso-nganh").textContent).toContain("Ngân hàng")
  })

  it("hiện lớp Ủng hộ vs Ngược chiều lúc đặt, suy ra từ chính bản chấm 5 lớp", () => {
    renderModal()
    const block = within(screen.getByTestId("cap6-ketso-doichieu"))
    expect(block.getByTestId("cap6-ketso-ungho").textContent).toContain("🎯 Kỹ thuật")
    expect(block.getByTestId("cap6-ketso-ungho").textContent).toContain("💰 Dòng tiền")
    expect(block.getByTestId("cap6-ketso-nguoc").textContent).toContain("💎 Định giá")
    // Lớp trung tính KHÔNG thuộc phía nào.
    expect(block.getByTestId("cap6-ketso-ungho").textContent).not.toContain("📰 Tin tức")
    expect(block.getByTestId("cap6-ketso-nguoc").textContent).not.toContain("📰 Tin tức")
  })

  it("hiện lớp bạn đã tin + 1 dòng vì sao đã ghi lúc đặt", () => {
    renderModal()
    const block = within(screen.getByTestId("cap6-ketso-doichieu"))
    expect(block.getByTestId("cap6-ketso-lop-tin").textContent).toContain("💎 Định giá")
    expect(block.getByTestId("cap6-ketso-lydo").textContent).toContain("P/B 1.2")
  })

  it("khớp gợi ý → nói khớp, và nêu nhóm lớp gợi ý THẬT", () => {
    renderModal()
    const khop = screen.getByTestId("cap6-ketso-khop")
    expect(khop.textContent).toContain("khớp")
    expect(screen.getByTestId("cap6-ketso-goi-y").textContent).toContain("👤 Nội bộ")
  })

  it("LỆCH gợi ý: diễn đạt TRUNG TÍNH — không 'sai', không cảnh báo", () => {
    renderModal({
      doiChieu: { ...doiChieu, lopQuyetDinh: "ky_thuat", khopGoiY: false },
    })
    const block = screen.getByTestId("cap6-ketso-doichieu")
    expect(screen.getByTestId("cap6-ketso-khop").textContent).toContain("khác gợi ý")
    for (const tu of CAM_TU) {
      expect(block.textContent!.toLowerCase()).not.toContain(tu)
    }
  })

  it("khop_goi_y === null → 'chưa phân loại', KHÔNG hiện là lệch, KHÔNG có coach Cấp 6", () => {
    renderModal({
      doiChieu: { ...doiChieu, kieu: null, kieuTen: null, khopGoiY: null, lopUuTien: [] },
    })
    const khop = screen.getByTestId("cap6-ketso-khop")
    expect(khop.textContent).toContain("chưa phân loại")
    expect(khop.textContent).not.toContain("lệch")
    expect(screen.queryByTestId("cap6-ketso-coach")).not.toBeInTheDocument()
  })

  it("lệnh KHÔNG có dữ liệu Cấp 6 → khối bị BỎ HẲN, im lặng (không dựng khối rỗng)", () => {
    renderModal({ doiChieu: null })
    expect(screen.queryByTestId("cap6-ketso-doichieu")).not.toBeInTheDocument()
    expect(screen.queryByTestId("cap6-ketso-coach")).not.toBeInTheDocument()
    // Mọi khối Cấp 1-5 vẫn còn nguyên.
    expect(screen.getByTestId("cap5-phanloai")).toBeInTheDocument()
    expect(screen.getByTestId("cap4-ketso-doc5lop")).toBeInTheDocument()
  })

  it("thiếu ngành → không bịa provenance", () => {
    renderModal({ doiChieu: { ...doiChieu, nganh: null } })
    expect(screen.queryByTestId("cap6-ketso-nganh")).not.toBeInTheDocument()
  })
})

describe("KetsoModalCap6 — lớp coach thứ 6", () => {
  it("khớp + thắng → đoạn coach ô khop_thang, in đậm cụm được nhấn", () => {
    renderModal()
    const coach = within(screen.getByTestId("cap6-ketso-coach"))
    expect(coach.getByText(/Khớp gợi ý · Thắng/)).toBeInTheDocument()
    const body = screen.getByTestId("cap6-ketso-coach").textContent!
    expect(body).toContain("Đối chiếu theo kiểu đang cho quả ngọt")
    expect(body).toContain("+5.3%")
  })

  it("lệch + thua → vẫn TRUNG TÍNH, chỉ về khối ⑮", () => {
    renderModal({
      exitPrice: 28_800,
      doiChieu: { ...doiChieu, lopQuyetDinh: "ky_thuat", khopGoiY: false },
    })
    const coach = screen.getByTestId("cap6-ketso-coach")
    expect(coach.textContent).toContain("⑮")
    for (const tu of CAM_TU) expect(coach.textContent!.toLowerCase()).not.toContain(tu)
  })

  it("khối đối chiếu đứng TRƯỚC đoạn coach Cấp 6 trong DOM", () => {
    renderModal()
    expect(
      precedes(screen.getByTestId("cap6-ketso-doichieu"), screen.getByTestId("cap6-ketso-coach")),
    ).toBe(true)
  })
})

describe("KetsoModalCap6 — nhật ký + recompute Cấp 6", () => {
  it("ghi 1 bản ghi Cấp 6 kèm kiểu / lớp quyết định / khớp, và gọi onRecorded", async () => {
    const onRecorded = vi.fn()
    renderModal({}, { onRecorded })
    chotPhanLoai()
    fireEvent.click(closeButton())
    await waitFor(() => expect(onRecorded).toHaveBeenCalledTimes(1))
    const rec = onRecorded.mock.calls[0][0] as Cap6TradeRecord
    expect(rec.kieuCoPhieu).toBe("ngan_hang")
    expect(rec.lopQuyetDinh).toBe("dinh_gia")
    expect(rec.khopGoiY).toBe(true)
    expect(rec.o4).toBe("dung_thang")
    expect(readCap6TradeLog("user-1")).toHaveLength(1)
  })

  it("lệnh không có đối chiếu → 3 trường Cấp 6 là null (KHÔNG suy ra lệch)", async () => {
    const onRecorded = vi.fn()
    renderModal({ doiChieu: null }, { onRecorded })
    chotPhanLoai()
    fireEvent.click(closeButton())
    await waitFor(() => expect(onRecorded).toHaveBeenCalledTimes(1))
    const rec = onRecorded.mock.calls[0][0] as Cap6TradeRecord
    expect(rec.kieuCoPhieu).toBeNull()
    expect(rec.lopQuyetDinh).toBeNull()
    expect(rec.khopGoiY).toBeNull()
  })

  it("kích hoạt recompute Cấp 6 (PATCH /cap6/task) sau khi ghi thành công", async () => {
    renderModal()
    chotPhanLoai()
    fireEvent.click(closeButton())
    await waitFor(() => expect(markCap6Task).toHaveBeenCalledWith(2))
  })

  it("POST /cap5/ketso lỗi → KHÔNG ghi nhật ký, KHÔNG recompute", async () => {
    recordKetsoCap5Async.mockRejectedValue(new Error("boom"))
    renderModal()
    chotPhanLoai()
    fireEvent.click(closeButton())
    await waitFor(() => expect(messageError).toHaveBeenCalled())
    expect(markCap6Task).not.toHaveBeenCalled()
    expect(readCap6TradeLog("user-1")).toHaveLength(0)
  })
})
