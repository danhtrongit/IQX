import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import React from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * Kết sổ Cấp 7 = Kết sổ Cấp 6 nguyên vẹn (mọi khối Cấp 1-5 + khối Đối chiếu của
 * Cấp 6 + CỔNG phân loại 4 ô của Cấp 5) + khối "ĐỌC SỔ LỆNH — NHÌN LẠI" + lớp
 * coach thứ 7.
 *
 * `PhanLoai4O` KHÔNG bị mock — cổng Cấp 5 phải đúng với khối thật. Chỉ mock tầng
 * hook + `Message`.
 */
const {
  recordKetsoCap1Async,
  recordKetsoCap2Mutate,
  recordKetsoCap5Async,
  markCap6Task,
  markCap7Task,
  verdictQuery,
  messageError,
} = vi.hoisted(() => ({
  recordKetsoCap1Async: vi.fn(),
  recordKetsoCap2Mutate: vi.fn(),
  recordKetsoCap5Async: vi.fn(),
  markCap6Task: vi.fn(),
  markCap7Task: vi.fn(),
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
vi.mock("@/features/cap6/hooks", () => ({
  useCompleteCap6Task: () => ({ mutate: markCap6Task }),
}))
vi.mock("./hooks", () => ({
  useCompleteCap7Task: () => ({ mutate: markCap7Task }),
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

import { KetsoModalCap7, type DocLucKetsoCap7, type KetsoDataCap7 } from "./KetsoModalCap7"
import { readCap7TradeLog, type Cap7TradeRecord } from "./tradeLogCap7"
import type { DoiChieuKetsoCap6 } from "@/features/cap6/KetsoModalCap6"
import type { Cap1Progress } from "@/features/cap1/types"
import type { Cap2Progress } from "@/features/cap2/types"
import type { VerdictGoiY } from "@/features/cap5/types"

const CAM_TU = ["sai lầm", "vi phạm", "bị phạt", "không nên", "lẽ ra"]

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
    so_lenh_thuc_chien: 96,
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

/** Khối Đọc sổ lệnh của lệnh mẫu — đúng ví dụ spec §6 (Lực 1.9:1, đọc "Cầu mạnh"). */
const docLuc: DocLucKetsoCap7 = {
  lucChiSo: 1.94,
  lucBand: "cau_ap_dao",
  lucBandTen: "Cầu áp đảo",
  lucDocUser: "manh",
  lucDocUserTen: "Cầu mạnh",
  docLucDung: true,
  dienBienPct: 1.2,
  soPhienCham: 2,
  deadBandPct: 0.5,
  coCanhGiac: false,
  hanhViCo: null,
  hanhViCoTen: null,
  giaCo: null,
  giaiThich: "GIẢI THÍCH CỦA HỆ THỐNG",
}

const data: KetsoDataCap7 = {
  n: 96,
  orderId: "order-96",
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
  flags: { order_id: "order-96" },
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
  docLuc,
}

function goiY(overrides: Partial<VerdictGoiY> = {}): VerdictGoiY {
  return {
    order_id: "order-96",
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
  overrides: Partial<KetsoDataCap7> = {},
  props: { onClose?: () => void; onRecorded?: (r: Cap7TradeRecord) => void } = {},
) {
  return render(
    <KetsoModalCap7
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
  return screen.getByTestId("cap7-ketso-close")
}

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
    order_id: "order-96",
    pnl_pct: 5.3,
    verdict_he: "dung",
    verdict_user: "dung",
    verdict_provenance: null,
    o_4: "dung_thang",
    ly_do_sua: null,
  })
  markCap6Task.mockReset()
  markCap7Task.mockReset()
  messageError.mockReset()
  verdictQuery.current = { data: goiY(), isPending: false, isError: false }
  window.localStorage.clear()
})

describe("KetsoModalCap7 — cộng dồn: giữ NGUYÊN mọi khối Cấp 1-6", () => {
  it("renders nothing when data is null", () => {
    const { container } = render(
      <KetsoModalCap7
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
    expect(screen.getByText("KẾT SỔ LỆNH · #96 · THỰC CHIẾN")).toBeInTheDocument()
    expect(screen.getByTestId("cap5-ketso-doichieu")).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText("+5.3%")).toBeInTheDocument(), { timeout: 2000 })
  })

  it("giữ CAM KẾT vs THỰC TẾ · QUẢN LÝ VỐN · ĐỌC 5 LỚP · ĐỐI CHIẾU", () => {
    renderModal()
    expect(screen.getByTestId("cap2-ketso-camket")).toBeInTheDocument()
    expect(screen.getByTestId("cap3-ketso-quanlyvon")).toBeInTheDocument()
    expect(screen.getByTestId("cap4-ketso-doc5lop")).toBeInTheDocument()
    expect(screen.getByTestId("cap6-ketso-doichieu")).toBeInTheDocument()
  })

  it("giữ khối phân loại 4 ô + đủ 6 lớp coach Cấp 1-6 + HỒ SƠ", () => {
    renderModal()
    expect(screen.getByTestId("cap5-phanloai")).toBeInTheDocument()
    chotPhanLoai()
    expect(screen.getByTestId("cap3-ketso-coach")).toBeInTheDocument()
    expect(screen.getByTestId("cap4-ketso-coach")).toBeInTheDocument()
    expect(screen.getByTestId("cap5-ketso-coach")).toBeInTheDocument()
    expect(screen.getByTestId("cap6-ketso-coach")).toBeInTheDocument()
    expect(screen.getByTestId("cap7-ketso-profile")).toBeInTheDocument()
  })
})

describe("KetsoModalCap7 — CỔNG phân loại 4 ô của Cấp 5 KHÔNG bị nới", () => {
  it("chưa chốt phân loại → nút đóng bị khoá + ghi chú vì sao", () => {
    renderModal()
    expect(closeButton()).toBeDisabled()
    expect(screen.getByTestId("cap7-ketso-gate-note")).toBeInTheDocument()
  })

  it("chốt phân loại → đóng thì POST cấp 1 → 2 → 5, recompute Cấp 6 + Cấp 7", async () => {
    const onClose = vi.fn()
    renderModal({}, { onClose })
    chotPhanLoai()
    expect(closeButton()).not.toBeDisabled()
    fireEvent.click(closeButton())
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
    expect(recordKetsoCap1Async).toHaveBeenCalledWith({ order_id: "order-96", cam_xuc: null })
    expect(recordKetsoCap2Mutate).toHaveBeenCalled()
    expect(recordKetsoCap5Async).toHaveBeenCalledWith({
      order_id: "order-96",
      verdict_user: "dung",
      ly_do_sua: null,
    })
    expect(markCap6Task).toHaveBeenCalledWith(2)
    expect(markCap7Task).toHaveBeenCalledWith(2)
  })

  it("POST /cap5/ketso lỗi → modal ở lại, KHÔNG ghi nhật ký, KHÔNG recompute", async () => {
    const onClose = vi.fn()
    recordKetsoCap5Async.mockRejectedValue(new Error("boom"))
    renderModal({}, { onClose })
    chotPhanLoai()
    fireEvent.click(closeButton())
    await waitFor(() => expect(messageError).toHaveBeenCalled())
    expect(onClose).not.toHaveBeenCalled()
    expect(markCap7Task).not.toHaveBeenCalled()
    expect(readCap7TradeLog("user-1")).toHaveLength(0)
  })

  it("verdict lỗi → LỐI RA của Cấp 5 vẫn còn, và khối Cấp 7 vẫn được ghi", async () => {
    const onClose = vi.fn()
    verdictQuery.current = { data: undefined, isPending: false, isError: true }
    renderModal({}, { onClose })
    fireEvent.click(screen.getByTestId("cap7-ketso-escape"))
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
    expect(recordKetsoCap5Async).not.toHaveBeenCalled()
    const [rec] = readCap7TradeLog("user-1")
    expect(rec.o4).toBeNull()
    expect(rec.lucDocUser).toBe("manh")
    expect(rec.docLucDung).toBe(true)
  })
})

describe("KetsoModalCap7 — khối ĐỌC SỔ LỆNH — NHÌN LẠI (spec §6)", () => {
  it("hiện Lực + cách bạn đọc + diễn biến ngay sau + kết quả chấm", () => {
    renderModal()
    const block = within(screen.getByTestId("cap7-ketso-docluc"))
    expect(block.getByTestId("cap7-ketso-luc").textContent).toContain("Cầu áp đảo")
    expect(block.getByTestId("cap7-ketso-luc").textContent).toContain("1.9:1")
    expect(block.getByTestId("cap7-ketso-luc").textContent).toContain("Cầu mạnh")
    const dienBien = block.getByTestId("cap7-ketso-dienbien").textContent!
    expect(dienBien).toContain("2 phiên")
    expect(dienBien).toContain("+1.2%")
    expect(dienBien).toContain("ĐÚNG")
  })

  it("đọc CHƯA ĐÚNG → nói thẳng, dùng dấu − (U+2212) cho % âm, KHÔNG mắng", () => {
    renderModal({
      docLuc: { ...docLuc, docLucDung: false, dienBienPct: -2.4 },
    })
    const block = screen.getByTestId("cap7-ketso-docluc")
    expect(block.textContent).toContain("−2.4%")
    expect(block.textContent).not.toContain("-2.4%")
    expect(screen.getByTestId("cap7-ketso-dienbien").textContent).toContain("CHƯA ĐÚNG")
    for (const tu of CAM_TU) expect(block.textContent!.toLowerCase()).not.toContain(tu)
  })

  it("★ doc_luc_dung === null → 'chưa tới hạn chấm', TUYỆT ĐỐI không phán quyết", () => {
    renderModal({
      docLuc: { ...docLuc, docLucDung: null, dienBienPct: null },
    })
    const dienBien = screen.getByTestId("cap7-ketso-dienbien").textContent!
    expect(dienBien).toContain("chưa tới hạn chấm")
    expect(dienBien).not.toContain("ĐÚNG")
    expect(dienBien).not.toContain("SAI")
    // Không có phán quyết thì cũng không có đoạn coach nào đoán hộ.
    expect(screen.queryByTestId("cap7-ketso-coach")).not.toBeInTheDocument()
  })

  it("có cờ → nêu giá + hành vi, và KHÔNG BAO GIỜ gọi đó là lệnh giả", () => {
    renderModal({
      docLuc: {
        ...docLuc,
        coCanhGiac: true,
        hanhViCo: "cho_xac_nhan",
        hanhViCoTen: "Chờ xác nhận (chờ khớp thật)",
        giaCo: 62_000,
      },
    })
    const co = screen.getByTestId("cap7-ketso-co").textContent!
    expect(co).toContain("62,000")
    expect(co).toContain("chờ xác nhận")
    const block = screen.getByTestId("cap7-ketso-docluc").textContent!
    expect(block).not.toContain("lệnh giả")
    expect(block).not.toMatch(/phát hiện/i)
  })

  it("mua đuổi → vẫn TRUNG TÍNH: ghi lại, không một chữ buộc tội", () => {
    renderModal({
      docLuc: {
        ...docLuc,
        coCanhGiac: true,
        hanhViCo: "mua_duoi_theo",
        hanhViCoTen: "Mua đuổi vào lệnh treo lớn",
        giaCo: 62_000,
      },
    })
    const block = screen.getByTestId("cap7-ketso-docluc").textContent!
    expect(screen.getByTestId("cap7-ketso-co").textContent).toContain("mua đuổi")
    for (const tu of CAM_TU) expect(block.toLowerCase()).not.toContain(tu)
  })

  it("không có cờ → KHÔNG dựng dòng cờ rỗng", () => {
    renderModal()
    expect(screen.queryByTestId("cap7-ketso-co")).not.toBeInTheDocument()
  })

  it("giữ NGUYÊN VĂN câu giải thích của server (§C12c)", () => {
    renderModal()
    expect(screen.getByTestId("cap7-ketso-docluc-giaithich").textContent).toContain(
      "GIẢI THÍCH CỦA HỆ THỐNG",
    )
  })

  it("chỉ số Lực thiếu → nói thẳng hệ chưa ghi được, KHÔNG bịa tỷ lệ", () => {
    renderModal({ docLuc: { ...docLuc, lucChiSo: null, lucBand: null, lucBandTen: null } })
    const luc = screen.getByTestId("cap7-ketso-luc").textContent!
    expect(luc).toContain("chưa ghi")
    expect(luc).not.toContain(":1")
  })

  it("lệnh KHÔNG đọc lực → khối bị BỎ HẲN, mọi khối Cấp 1-6 vẫn còn", () => {
    renderModal({ docLuc: null })
    expect(screen.queryByTestId("cap7-ketso-docluc")).not.toBeInTheDocument()
    expect(screen.queryByTestId("cap7-ketso-coach")).not.toBeInTheDocument()
    expect(screen.getByTestId("cap6-ketso-doichieu")).toBeInTheDocument()
    expect(screen.getByTestId("cap5-phanloai")).toBeInTheDocument()
  })
})

describe("KetsoModalCap7 — lớp coach thứ 7", () => {
  it("đọc đúng → đoạn coach nguyên văn spec §6, in đậm cụm được nhấn", () => {
    renderModal()
    const coach = screen.getByTestId("cap7-ketso-coach").textContent!
    expect(coach).toContain("Cầu mạnh")
    expect(coach).toContain("Đọc lực đang lên tay")
    expect(coach).toContain("lực chỉ đúng cho thời điểm rất ngắn")
  })

  it("đọc sai → KHÔNG mắng, dùng đúng câu 'lực sổ lệnh nhiễu' của spec", () => {
    renderModal({ docLuc: { ...docLuc, docLucDung: false, dienBienPct: -2.4 } })
    const coach = screen.getByTestId("cap7-ketso-coach").textContent!
    expect(coach).toContain("Lực sổ lệnh nhiễu và đổi nhanh")
    for (const tu of CAM_TU) expect(coach.toLowerCase()).not.toContain(tu)
  })

  it("có cờ + mua đuổi → NHẮC NHỞ, nói rõ đây không phải điểm trừ", () => {
    renderModal({
      docLuc: {
        ...docLuc,
        coCanhGiac: true,
        hanhViCo: "mua_duoi_theo",
        hanhViCoTen: "Mua đuổi vào lệnh treo lớn",
        giaCo: 62_000,
      },
    })
    const coach = screen.getByTestId("cap7-ketso-coach").textContent!
    expect(coach).toContain("Lần sau chờ nó khớp thật")
    expect(coach).toContain("không phải điểm trừ")
  })

  it("khối đọc sổ lệnh đứng TRƯỚC đoạn coach Cấp 7 trong DOM", () => {
    renderModal()
    expect(
      precedes(screen.getByTestId("cap7-ketso-docluc"), screen.getByTestId("cap7-ketso-coach")),
    ).toBe(true)
  })
})

describe("KetsoModalCap7 — nhật ký Cấp 7", () => {
  it("ghi 1 bản ghi kèm ĐỦ 7 trường Cấp 7 và gọi onRecorded", async () => {
    const onRecorded = vi.fn()
    renderModal(
      {
        docLuc: {
          ...docLuc,
          coCanhGiac: true,
          hanhViCo: "mua_duoi_theo",
          hanhViCoTen: "Mua đuổi vào lệnh treo lớn",
          giaCo: 62_000,
        },
      },
      { onRecorded },
    )
    chotPhanLoai()
    fireEvent.click(closeButton())
    await waitFor(() => expect(onRecorded).toHaveBeenCalledTimes(1))
    const rec = onRecorded.mock.calls[0][0] as Cap7TradeRecord
    expect(rec.lucChiSo).toBe(1.94)
    expect(rec.lucBand).toBe("cau_ap_dao")
    expect(rec.lucDocUser).toBe("manh")
    expect(rec.docLucDung).toBe(true)
    expect(rec.dienBienPct).toBe(1.2)
    expect(rec.coCanhGiac).toBe(true)
    expect(rec.hanhViCo).toBe("mua_duoi_theo")
    // Khối Cấp 6 của lệnh vẫn nằm trong CÙNG bản ghi (cộng dồn ở tầng dữ liệu).
    expect(rec.khopGoiY).toBe(true)
    expect(readCap7TradeLog("user-1")).toHaveLength(1)
  })

  it("lệnh không đọc lực → 7 trường Cấp 7 là null (KHÔNG quy về 'đọc sai')", async () => {
    const onRecorded = vi.fn()
    renderModal({ docLuc: null }, { onRecorded })
    chotPhanLoai()
    fireEvent.click(closeButton())
    await waitFor(() => expect(onRecorded).toHaveBeenCalledTimes(1))
    const rec = onRecorded.mock.calls[0][0] as Cap7TradeRecord
    expect(rec.lucChiSo).toBeNull()
    expect(rec.lucDocUser).toBeNull()
    expect(rec.docLucDung).toBeNull()
    expect(rec.coCanhGiac).toBeNull()
    expect(rec.hanhViCo).toBeNull()
  })

  it("chưa tới hạn chấm → docLucDung vào nhật ký là null, KHÔNG phải false", async () => {
    const onRecorded = vi.fn()
    renderModal({ docLuc: { ...docLuc, docLucDung: null, dienBienPct: null } }, { onRecorded })
    chotPhanLoai()
    fireEvent.click(closeButton())
    await waitFor(() => expect(onRecorded).toHaveBeenCalledTimes(1))
    const rec = onRecorded.mock.calls[0][0] as Cap7TradeRecord
    expect(rec.docLucDung).toBeNull()
    expect(rec.dienBienPct).toBeNull()
    // …nhưng cách user đọc thì VẪN được ghi: nó có thật, chỉ là chưa chấm.
    expect(rec.lucDocUser).toBe("manh")
  })
})
