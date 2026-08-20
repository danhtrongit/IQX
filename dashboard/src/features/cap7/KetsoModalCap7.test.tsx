import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import React from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * Kết sổ Cấp 7 = Kết sổ Cấp 6 (mọi khối Cấp 1-4 + khối Đối chiếu của Cấp 6) +
 * khối "ĐỌC SỔ LỆNH — NHÌN LẠI" + lớp coach thứ 7.
 *
 * ★★ **CỔNG PHÂN LOẠI 4 Ô CỦA CẤP 5 ĐÃ NGHỈ HƯU** cùng Cấp 5 cũ: không còn
 * `PhanLoai4O`, `GET /cap5/verdict`, `POST /cap5/ketso`, lối ra "chưa phân loại
 * được", và nút `Đóng kết sổ ✓` KHÔNG còn bị khoá bởi verdict. Các `it` dưới
 * canh CHÍNH sự vắng mặt đó — bài học Cấp 2 bỏ "chuỗi kỷ luật" mà dòng chuỗi
 * sống sót ở Kết sổ Cấp 3-8 rồi in ra một con số bịa.
 */
const {
  recordKetsoCap1Async,
  recordKetsoCap2Mutate,
  markCap6Task,
  markCap7Task,
  cap5HooksLoaded,
  kehoachCap7,
  kehoachCap6,
  messageError,
} = vi.hoisted(() => ({
  recordKetsoCap1Async: vi.fn(),
  recordKetsoCap2Mutate: vi.fn(),
  markCap6Task: vi.fn(),
  markCap7Task: vi.fn(),
  // `true` NGAY KHI `@/features/cap5/hooks` được nạp lần đầu — cách duy nhất
  // khẳng định `useVerdictGoiY`/`useRecordKetsoCap5` đã bị gỡ HẲN khỏi cây import
  // của Kết sổ Cấp 7 (một `not.toHaveBeenCalled()` sẽ đúng một cách rỗng).
  cap5HooksLoaded: { value: false },
  // `GET /cap7/kehoach/{order_id}` + `GET /cap6/kehoach/{order_id}` — giá trị
  // trả về + ĐỐI SỐ mỗi lần gọi (cổng `enabled`: chỉ gọi khi user ở cấp đó).
  kehoachCap7: { current: {} as Record<string, unknown>, calls: [] as unknown[][] },
  kehoachCap6: { current: {} as Record<string, unknown>, calls: [] as unknown[][] },
  messageError: vi.fn(),
}))

vi.mock("@/features/cap1/hooks", () => ({
  useRecordKetso: () => ({ mutate: vi.fn(), mutateAsync: recordKetsoCap1Async }),
}))
vi.mock("@/features/cap2/hooks", () => ({
  useRecordKetsoCap2: () => ({ mutate: recordKetsoCap2Mutate }),
}))
vi.mock("@/features/cap5/hooks", () => {
  cap5HooksLoaded.value = true
  return {}
})
vi.mock("@/features/cap6/hooks", () => ({
  useCompleteCap6Task: () => ({ mutate: markCap6Task }),
  useKehoachCap6: (...args: unknown[]) => {
    kehoachCap6.calls.push(args)
    return kehoachCap6.current
  },
}))
vi.mock("./hooks", () => ({
  useCompleteCap7Task: () => ({ mutate: markCap7Task }),
  useKehoachCap7: (...args: unknown[]) => {
    kehoachCap7.calls.push(args)
    return kehoachCap7.current
  },
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
import { Cap7Provider } from "./Cap7Context"
import { Cap6Provider } from "@/features/cap6/Cap6Context"
import { readCap7TradeLog, type Cap7TradeRecord } from "./tradeLogCap7"
import type { KehoachDetailCap7 } from "./types"
import type { KehoachDetailCap6 } from "@/features/cap6/types"
import type { DoiChieuKetsoCap6 } from "@/features/cap6/KetsoModalCap6"
import type { Cap1Progress } from "@/features/cap1/types"

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
    so_ly_do_da_dung: 5,
    so_lenh_ly_do_ung_ho: 3,
    so_lenh_thuc_chien: 96,
    graduated_at: "2026-01-05T00:00:00Z",
    time_to_graduate_hours: 40,
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

function renderModal(
  overrides: Partial<KetsoDataCap7> = {},
  props: { onClose?: () => void; onRecorded?: (r: Cap7TradeRecord) => void } = {},
) {
  return render(
    <KetsoModalCap7
      data={{ ...data, ...overrides }}
      progress={cap1Progress()}
      trades={[]}
      onClose={props.onClose ?? vi.fn()}
      onRecorded={props.onRecorded}
    />,
  )
}

/**
 * Cùng modal, nhưng BÊN TRONG `Cap6Provider` + `Cap7Provider` — tức user thật sự
 * đang ở Cấp 7 (trang Cấp 7 bọc cả sáu provider). Chỉ khi đó modal mới được phép
 * gọi `GET /cap6|7/kehoach/{order_id}` (hai endpoint 404 khi thiếu hàng tiến độ).
 */
function renderInCap7(
  overrides: Partial<KetsoDataCap7> = {},
  props: { onClose?: () => void; onRecorded?: (r: Cap7TradeRecord) => void } = {},
) {
  return render(
    <Cap6Provider>
      <Cap7Provider>
        <KetsoModalCap7
          data={{ ...data, ...overrides }}
          progress={cap1Progress()}
          trades={[]}
          onClose={props.onClose ?? vi.fn()}
          onRecorded={props.onRecorded}
        />
      </Cap7Provider>
    </Cap6Provider>,
  )
}

/**
 * `GET /cap7/kehoach/{order_id}` — khối đọc lực ĐÃ GHI + bối cảnh chấm.
 *
 * Mẫu mặc định là ca "đã tới hạn và đã chấm": chính thứ mà Kết sổ trước đây
 * KHÔNG BAO GIỜ thấy được, vì FE chỉ có dữ liệu lúc mua.
 */
function kehoachDetail7(overrides: Partial<KehoachDetailCap7> = {}): KehoachDetailCap7 {
  return {
    id: "kh-96",
    order_id: "order-96",
    symbol: "VCB",
    luc_chi_so: 1.94,
    luc_band: "cau_ap_dao",
    luc_band_ten: "Cầu áp đảo",
    luc_doc_user: "manh",
    luc_doc_user_ten: "Cầu mạnh",
    doc_luc_dung: true,
    dien_bien_pct: 2.4,
    co_canh_giac_lenh_gia: false,
    hanh_vi_co: null,
    hanh_vi_co_ten: null,
    so_phien_cham: 2,
    giai_thich: "GIẢI THÍCH CHẤM CỦA SERVER",
    co_du_lieu: true,
    dead_band_pct: 0.5,
    han_cham_ngay: "2026-07-06",
    da_toi_han_cham: true,
    ...overrides,
  }
}

/**
 * Khối đọc lực dựng từ dữ liệu lúc MUA — `docLucDung`/`dienBienPct` luôn `null`
 * vì phiên đích chưa xảy ra lúc đó. Đây là trạng thái "cũ" của Kết sổ.
 */
const docLucChuaCham: DocLucKetsoCap7 = {
  ...docLuc,
  docLucDung: null,
  dienBienPct: null,
}

function closeButton(): HTMLElement {
  return screen.getByTestId("cap7-ketso-close")
}

/** `true` khi `a` đứng TRƯỚC `b` trong cây DOM. */
function precedes(a: Element, b: Element): boolean {
  return Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)
}

beforeEach(() => {
  recordKetsoCap1Async.mockReset()
  recordKetsoCap1Async.mockResolvedValue({ id: "ks1" })
  recordKetsoCap2Mutate.mockReset()
  markCap6Task.mockReset()
  markCap7Task.mockReset()
  messageError.mockReset()
  kehoachCap7.current = { data: undefined, isPending: false, isError: false }
  kehoachCap7.calls.length = 0
  kehoachCap6.current = { data: undefined, isPending: false, isError: false }
  kehoachCap6.calls.length = 0
  window.localStorage.clear()
})

describe("KetsoModalCap7 — cộng dồn: giữ NGUYÊN mọi khối Cấp 1-6", () => {
  it("renders nothing when data is null", () => {
    const { container } = render(
      <KetsoModalCap7
        data={null}
        progress={null}
        trades={[]}
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

  /**
   * ★ REGRESSION (fix wave FE-2). Bản cũ tự nhận là kiểm "đủ 6 lớp coach Cấp 1-6"
   * nhưng chỉ hỏi coach 3-6 — coach 1 (Cấp 1) và coach 2 (Cấp 2) không có testid
   * và không được assert, nên xoá cả hai lớp đó đi test vẫn xanh. Nay từng lớp
   * đều được đếm, và đều phải có NỘI DUNG (một div rỗng không phải lớp coach).
   *
   * ★ Lớp coach 5 KHÔNG còn trong danh sách: nó là "quyết định vs kết quả" của
   * phân loại 4 ô đã nghỉ hưu, và đoạn coach săn mã thay thế nó chưa có nguồn ở
   * Cấp 7 nên phải VẮNG chứ không được render với dữ liệu bịa.
   */
  it("giữ đủ lớp coach Cấp 1-4 + Cấp 6 + HỒ SƠ, KHÔNG có lớp coach Cấp 5", () => {
    renderModal()
    for (const n of [1, 2, 3, 4, 6]) {
      const coach = screen.getByTestId(`cap${n}-ketso-coach`)
      expect(coach).toBeInTheDocument()
      expect((coach.textContent ?? "").trim().length).toBeGreaterThan(0)
    }
    expect(screen.queryByTestId("cap5-ketso-coach")).not.toBeInTheDocument()
    expect(screen.getByTestId("cap7-ketso-profile")).toBeInTheDocument()
  })
})

describe("KetsoModalCap7 — cổng phân loại 4 ô của Cấp 5 ĐÃ NGHỈ HƯU", () => {
  it("KHÔNG còn khối phân loại 4 ô, ghi chú cổng, hay lối ra 'chưa phân loại'", () => {
    renderModal()
    expect(screen.queryByTestId("cap5-phanloai")).not.toBeInTheDocument()
    expect(screen.queryByTestId("cap7-ketso-gate-note")).not.toBeInTheDocument()
    expect(screen.queryByTestId("cap7-ketso-escape")).not.toBeInTheDocument()
    expect(screen.queryByTestId("cap7-ketso-escape-note")).not.toBeInTheDocument()
  })

  it("KHÔNG còn import `@/features/cap5/hooks` (verdict + POST /cap5/ketso đã gỡ)", () => {
    renderModal()
    expect(cap5HooksLoaded.value).toBe(false)
  })

  it("nút đóng KHÔNG bị khoá: bấm là POST cấp 1 → 2 + recompute Cấp 6 và Cấp 7", async () => {
    const onClose = vi.fn()
    renderModal({}, { onClose })
    expect(closeButton()).not.toBeDisabled()
    fireEvent.click(closeButton())
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
    expect(recordKetsoCap1Async).toHaveBeenCalledWith({ order_id: "order-96", cam_xuc: null })
    expect(recordKetsoCap2Mutate).toHaveBeenCalled()
    expect(markCap6Task).toHaveBeenCalledWith(2)
    expect(markCap7Task).toHaveBeenCalledWith(2)
  })

  it("nhật ký KHÔNG còn 3 trường của 4 ô, nhưng khối Cấp 7 vẫn được ghi", async () => {
    renderModal()
    fireEvent.click(closeButton())
    await waitFor(() => expect(readCap7TradeLog("user-1")).toHaveLength(1))
    const [rec] = readCap7TradeLog("user-1") as unknown as Record<string, unknown>[]
    expect("o4" in rec).toBe(false)
    expect("verdictHe" in rec).toBe(false)
    expect("verdictUser" in rec).toBe(false)
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
    expect(screen.getByTestId("cap4-ketso-doc5lop")).toBeInTheDocument()
  })
})

describe("KetsoModalCap7 — đọc lại đọc lực ĐÃ CHẤM của chính lệnh (GET /cap7/kehoach)", () => {
  it("ngoài Cấp 7 → KHÔNG gọi endpoint (nó 404 khi user chưa có hàng Cấp 7)", () => {
    renderModal()
    expect(kehoachCap7.calls.length).toBeGreaterThan(0)
    for (const args of kehoachCap7.calls) expect(args).toEqual(["order-96", false])
  })

  it("đang ở Cấp 7 → gọi CẢ hai endpoint với ĐÚNG order_id của lệnh", () => {
    renderInCap7()
    expect(kehoachCap7.calls.length).toBeGreaterThan(0)
    for (const args of kehoachCap7.calls) expect(args).toEqual(["order-96", true])
    expect(kehoachCap6.calls.length).toBeGreaterThan(0)
    for (const args of kehoachCap6.calls) expect(args).toEqual(["order-96", true])
  })

  it("lệnh ĐÃ tới hạn và server đã chấm → hiện phán quyết THẬT + đoạn coach Cấp 7", () => {
    kehoachCap7.current = { data: kehoachDetail7(), isPending: false, isError: false }
    renderInCap7({ docLuc: docLucChuaCham })
    const dienBien = screen.getByTestId("cap7-ketso-dienbien").textContent!
    expect(dienBien).toContain("2 phiên")
    expect(dienBien).toContain("+2.4%")
    expect(dienBien).toContain("ĐÚNG")
    expect(dienBien).not.toContain("chưa tới hạn chấm")
    // ★ Điểm cốt lõi: trước đây đoạn coach này KHÔNG BAO GIỜ hiện được.
    expect(screen.getByTestId("cap7-ketso-coach")).toBeInTheDocument()
  })

  it("hiện NGUYÊN VĂN câu giải thích chấm của server, thay câu cũ", () => {
    kehoachCap7.current = { data: kehoachDetail7(), isPending: false, isError: false }
    renderInCap7({ docLuc: docLucChuaCham })
    expect(screen.getByTestId("cap7-ketso-docluc-giaithich").textContent).toBe(
      "GIẢI THÍCH CHẤM CỦA SERVER",
    )
  })

  /**
   * ★★ HAI TEST DƯỚI ĐÂY DÙNG CHUNG MỘT FIXTURE, KHÁC NHAU ĐÚNG MỘT TRƯỜNG
   * (`doc_luc_dung`: `null` vs `false`). `dien_bien_pct` và `da_toi_han_cham`
   * GIỮ NGUYÊN ở cả hai, nên bất kỳ cách gộp `null` thành `false` nào (vd.
   * `?? false`, `Boolean(...)`) cũng làm test `null` đỏ ngay — và ngược lại.
   */
  it("★ doc_luc_dung === null (đã tới hạn, chưa lấy được giá) → KHÔNG phán quyết", () => {
    kehoachCap7.current = {
      data: kehoachDetail7({ doc_luc_dung: null, dien_bien_pct: -1.8 }),
      isPending: false,
      isError: false,
    }
    renderInCap7({ docLuc: docLucChuaCham })
    const dienBien = screen.getByTestId("cap7-ketso-dienbien").textContent!
    expect(dienBien).toContain("chưa")
    expect(dienBien).not.toContain("CHƯA ĐÚNG")
    expect(dienBien).not.toContain("ĐÚNG")
    expect(dienBien).not.toContain("SAI")
    expect(screen.queryByTestId("cap7-ketso-coach")).not.toBeInTheDocument()
  })

  it("★ doc_luc_dung === false (cùng fixture, chỉ khác trường này) → 'CHƯA ĐÚNG'", () => {
    kehoachCap7.current = {
      data: kehoachDetail7({ doc_luc_dung: false, dien_bien_pct: -1.8 }),
      isPending: false,
      isError: false,
    }
    renderInCap7({ docLuc: docLucChuaCham })
    const dienBien = screen.getByTestId("cap7-ketso-dienbien").textContent!
    expect(dienBien).toContain("CHƯA ĐÚNG")
    expect(dienBien).toContain("−1.8%")
    expect(dienBien).not.toContain("chưa tới hạn chấm")
    expect(screen.getByTestId("cap7-ketso-coach")).toBeInTheDocument()
    // Đọc sai vẫn KHÔNG bị mắng.
    const block = screen.getByTestId("cap7-ketso-docluc").textContent!.toLowerCase()
    for (const tu of CAM_TU) expect(block).not.toContain(tu)
  })

  it("chưa tới hạn chấm (da_toi_han_cham = false) → nói đúng là chưa tới hạn", () => {
    kehoachCap7.current = {
      data: kehoachDetail7({
        doc_luc_dung: null,
        dien_bien_pct: null,
        da_toi_han_cham: false,
        han_cham_ngay: "2026-07-14",
      }),
      isPending: false,
      isError: false,
    }
    renderInCap7({ docLuc: docLucChuaCham })
    const dienBien = screen.getByTestId("cap7-ketso-dienbien").textContent!
    expect(dienBien).toContain("chưa tới hạn chấm")
    expect(dienBien).not.toContain("ĐÚNG")
    expect(screen.queryByTestId("cap7-ketso-coach")).not.toBeInTheDocument()
  })

  it("đã tới hạn nhưng chưa chấm được → NÓI KHÁC 'chưa tới hạn' (hai ca khác nhau)", () => {
    kehoachCap7.current = {
      data: kehoachDetail7({ doc_luc_dung: null, dien_bien_pct: null, da_toi_han_cham: true }),
      isPending: false,
      isError: false,
    }
    renderInCap7({ docLuc: docLucChuaCham })
    const dienBien = screen.getByTestId("cap7-ketso-dienbien").textContent!
    expect(dienBien).not.toContain("chưa tới hạn chấm")
    expect(dienBien).toContain("chưa lấy được giá")
    expect(dienBien).not.toContain("ĐÚNG")
  })

  it("404 / lỗi mạng → im lặng giữ nguyên trạng thái cũ, modal VẪN đóng được", async () => {
    const onClose = vi.fn()
    kehoachCap7.current = { data: undefined, isPending: false, isError: true }
    kehoachCap6.current = { data: undefined, isPending: false, isError: true }
    renderInCap7({ docLuc: docLucChuaCham }, { onClose })
    expect(screen.getByTestId("cap7-ketso-dienbien").textContent).toContain("chưa tới hạn chấm")
    expect(screen.queryByTestId("cap7-ketso-coach")).not.toBeInTheDocument()
    expect(messageError).not.toHaveBeenCalled()
    expect(closeButton()).not.toBeDisabled()
    fireEvent.click(closeButton())
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
  })

  it("co_du_lieu = false → giữ nguyên khối cũ, KHÔNG xoá khối đã dựng", () => {
    kehoachCap7.current = {
      data: kehoachDetail7({
        id: null,
        luc_chi_so: null,
        luc_band: null,
        luc_band_ten: null,
        luc_doc_user: null,
        luc_doc_user_ten: null,
        doc_luc_dung: null,
        dien_bien_pct: null,
        co_canh_giac_lenh_gia: null,
        co_du_lieu: false,
        giai_thich: "Lệnh này chưa ghi bước đọc lực.",
      }),
      isPending: false,
      isError: false,
    }
    renderInCap7()
    expect(screen.getByTestId("cap7-ketso-luc").textContent).toContain("Cầu áp đảo")
    expect(screen.getByTestId("cap7-ketso-dienbien").textContent).toContain("ĐÚNG")
    expect(screen.getByTestId("cap7-ketso-docluc-giaithich").textContent).toContain(
      "GIẢI THÍCH CỦA HỆ THỐNG",
    )
  })

  it("FE không dựng nổi khối (thiếu quy_tac) nhưng server CÓ dữ liệu → khối vẫn hiện", () => {
    kehoachCap7.current = { data: kehoachDetail7(), isPending: false, isError: false }
    renderInCap7({ docLuc: null })
    const block = within(screen.getByTestId("cap7-ketso-docluc"))
    expect(block.getByTestId("cap7-ketso-luc").textContent).toContain("Cầu áp đảo")
    expect(block.getByTestId("cap7-ketso-dienbien").textContent).toContain("ĐÚNG")
  })

  it("nhật ký ghi kết quả chấm THẬT của server, không phải null cũ", async () => {
    const onRecorded = vi.fn()
    kehoachCap7.current = {
      data: kehoachDetail7({ doc_luc_dung: false, dien_bien_pct: -1.8 }),
      isPending: false,
      isError: false,
    }
    renderInCap7({ docLuc: docLucChuaCham }, { onRecorded })
    fireEvent.click(closeButton())
    await waitFor(() => expect(onRecorded).toHaveBeenCalledTimes(1))
    const rec = onRecorded.mock.calls[0][0] as Cap7TradeRecord
    expect(rec.docLucDung).toBe(false)
    expect(rec.dienBienPct).toBe(-1.8)
  })

  it("chưa chấm → nhật ký giữ docLucDung = null (KHÔNG quy về false)", async () => {
    const onRecorded = vi.fn()
    kehoachCap7.current = {
      data: kehoachDetail7({ doc_luc_dung: null, dien_bien_pct: -1.8 }),
      isPending: false,
      isError: false,
    }
    renderInCap7({ docLuc: docLucChuaCham }, { onRecorded })
    fireEvent.click(closeButton())
    await waitFor(() => expect(onRecorded).toHaveBeenCalledTimes(1))
    const rec = onRecorded.mock.calls[0][0] as Cap7TradeRecord
    expect(rec.docLucDung).toBeNull()
  })

  it("khối Đối chiếu Cấp 6 trong Kết sổ Cấp 7 cũng đọc từ server", () => {
    const detail6: KehoachDetailCap6 = {
      id: "kh-96",
      order_id: "order-96",
      symbol: "VCB",
      kieu_co_phieu: "dau_co_nho",
      kieu_ten: "Đầu cơ / vốn hóa nhỏ",
      nganh: null,
      lop_mau_thuan: null,
      trong_so_goi_y: null,
      lop_uu_tien: ["ky_thuat", "dong_tien"],
      lop_uu_tien_ten: ["Kỹ thuật", "Dòng tiền"],
      lop_it_tin: [],
      lop_it_tin_ten: [],
      lop_quyet_dinh: "dinh_gia",
      lop_quyet_dinh_ten: "Định giá",
      khop_goi_y: false,
      khop_goi_y_ten: "Lệch gợi ý",
      ly_do_doi_chieu: "P/B 1.2 — thấp hơn trung vị 3 năm",
      co_du_lieu: true,
      giai_thich: "GIẢI THÍCH ĐỐI CHIẾU CỦA SERVER",
    }
    kehoachCap6.current = { data: detail6, isPending: false, isError: false }
    renderInCap7({
      doiChieu: { ...doiChieu, kieu: null, kieuTen: null, lopUuTien: [], khopGoiY: null },
    })
    const block = within(screen.getByTestId("cap6-ketso-doichieu"))
    expect(block.getByTestId("cap6-ketso-kieu").textContent).toContain("Đầu cơ / vốn hóa nhỏ")
    expect(block.getByTestId("cap6-ketso-khop").textContent).toContain("khác gợi ý")
    expect(block.getByTestId("cap6-ketso-giaithich").textContent).toBe(
      "GIẢI THÍCH ĐỐI CHIẾU CỦA SERVER",
    )
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
    fireEvent.click(closeButton())
    await waitFor(() => expect(onRecorded).toHaveBeenCalledTimes(1))
    const rec = onRecorded.mock.calls[0][0] as Cap7TradeRecord
    expect(rec.docLucDung).toBeNull()
    expect(rec.dienBienPct).toBeNull()
    // …nhưng cách user đọc thì VẪN được ghi: nó có thật, chỉ là chưa chấm.
    expect(rec.lucDocUser).toBe("manh")
  })
})
