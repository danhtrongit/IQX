import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import React from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { expectRendersNothing } from "@/__tests__/textGuards"

/**
 * Kết sổ Cấp 6 = Kết sổ Cấp 5 (mọi khối Cấp 1-4 kế thừa) + khối "ĐỐI CHIẾU —
 * NHÌN LẠI" + lớp coach thứ 6.
 *
 * ★★ **CỔNG PHÂN LOẠI 4 Ô CỦA CẤP 5 ĐÃ NGHỈ HƯU** cùng Cấp 5 cũ: không còn
 * `PhanLoai4O`, không còn `GET /cap5/verdict`, không còn `POST /cap5/ketso`,
 * không còn lối ra "chưa phân loại được", và nút `Đóng kết sổ ✓` KHÔNG còn bị
 * khoá bởi verdict. Các `it` dưới canh CHÍNH sự vắng mặt đó — bài học Cấp 2 bỏ
 * "chuỗi kỷ luật" mà dòng hiển thị chuỗi sống sót ở Kết sổ Cấp 3-8 rồi đọc từ
 * một cột đã DROP (hiện "tăng lên 1 lệnh liên tiếp" — một con số bịa).
 */
const {
  recordKetsoCap1Async,
  recordKetsoCap2Mutate,
  markCap6Task,
  cap5HooksLoaded,
  kehoachCap6,
  nhanDinhCap6,
  messageError,
} = vi.hoisted(() => ({
  recordKetsoCap1Async: vi.fn(),
  recordKetsoCap2Mutate: vi.fn(),
  markCap6Task: vi.fn(),
  // `true` NGAY KHI `@/features/cap5/hooks` được nạp lần đầu — tức khi một
  // module trong cây import của Kết sổ Cấp 6 còn `import` nó. Đó là cách duy
  // nhất khẳng định `useVerdictGoiY`/`useRecordKetsoCap5` đã bị gỡ HẲN (một
  // `expect(fn).not.toHaveBeenCalled()` sẽ đúng một cách rỗng khi module không
  // còn được import).
  cap5HooksLoaded: { value: false },
  // `GET /cap6/kehoach/{order_id}` — giá trị trả về + ĐỐI SỐ mỗi lần gọi (để
  // khẳng định cổng `enabled`: chỉ gọi khi user thật sự đang ở Cấp 6).
  kehoachCap6: { current: {} as Record<string, unknown>, calls: [] as unknown[][] },
  // `GET /cap6/kehoach/{order_id}` — bản Cấp 6 «Bậc thầy»: các cột đã lưu của
  // lệnh (had_conflict / conflict_level / had_veto / veto_layers + %vốn + tự tin).
  nhanDinhCap6: { current: {} as Record<string, unknown>, calls: [] as unknown[][] },
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
vi.mock("./hooks", () => ({
  useCompleteCap6Task: () => ({ mutate: markCap6Task }),
  useKehoachCap6: (...args: unknown[]) => {
    kehoachCap6.calls.push(args)
    return kehoachCap6.current
  },
  useKehoachMauThuanCap6: (...args: unknown[]) => {
    nhanDinhCap6.calls.push(args)
    return nhanDinhCap6.current
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

import {
  KetsoModalCap6,
  type DoiChieuKetsoCap6,
  type KetsoDataCap6,
} from "./KetsoModalCap6"
import { Cap6Provider } from "./Cap6Context"
import { readCap6TradeLog, type Cap6TradeRecord } from "./tradeLogCap6"
import type { KehoachDetailCap6 } from "./types"
import type { KehoachMauThuanCap6 } from "./mauThuanTypes"
import type { Cap1Progress } from "@/features/cap1/types"

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
    so_ly_do_da_dung: 5,
    so_lenh_ly_do_ung_ho: 3,
    so_lenh_thuc_chien: 84,
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
  // ★★ NGUỒN SĂN THẬT của lệnh (nguyên tắc cộng dồn: cấp này VẪN có màn Săn mã).
  // Fixture mặc định là một lệnh ĐẾN TỪ săn mã — nếu `buildRecord` quay lại điền
  // `null` cứng thì bài canh nguồn săn dưới đây ĐỎ.
  huntFilter: "kl",
  huntSoPhienCho: 3,
  huntSoLopLucVao: null,
  doiChieu,
  // ★ CẤP 6 «BẬC THẦY» — ảnh chụp hai phe lúc MUA (spec §8). Mức nhận định +
  //   %vốn + tự tin sẽ do hàng đã lưu của server ghi đè.
  nhanDinh: {
    pheUngHo: ["ky_thuat", "dong_tien"],
    pheNguoc: ["noi_bo", "tin_tuc"],
    conflictLevel: "nghiem",
    lopPhuQuyetXau: ["noi_bo", "tin_tuc"],
    pctVon: 15,
    mucTuTin: 2,
  },
}

/** Hàng Cấp 6 «Bậc thầy» ĐÃ LƯU của lệnh — `GET /cap6/kehoach/{order_id}`. */
function nhanDinhDetail(
  overrides: Partial<KehoachMauThuanCap6> = {},
): KehoachMauThuanCap6 {
  return {
    order_id: "order-84",
    had_conflict: true,
    conflict_level: "nghiem",
    had_veto: true,
    veto_layers: ["noi_bo", "tin_tuc"],
    pct_von: 30,
    muc_tu_tin: 3,
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
      onClose={props.onClose ?? vi.fn()}
      onRecorded={props.onRecorded}
    />,
  )
}

/**
 * Cùng modal, nhưng BÊN TRONG `Cap6Provider` — tức user thật sự đang ở Cấp 6.
 * Chỉ khi đó modal mới được phép gọi `GET /cap6/kehoach/{order_id}` (endpoint
 * 404 nếu user chưa có hàng tiến độ Cấp 6).
 */
function renderInCap6(
  overrides: Partial<KetsoDataCap6> = {},
  props: { onClose?: () => void; onRecorded?: (r: Cap6TradeRecord) => void } = {},
) {
  return render(
    <Cap6Provider>
      <KetsoModalCap6
        data={{ ...data, ...overrides }}
        progress={cap1Progress()}
        trades={[]}
        onClose={props.onClose ?? vi.fn()}
        onRecorded={props.onRecorded}
      />
    </Cap6Provider>,
  )
}

/**
 * `GET /cap6/kehoach/{order_id}` — khối Đối chiếu ĐÃ GHI của lệnh này.
 *
 * Mẫu mặc định là đúng ca bug: mã hệ KHÔNG phân loại được (nên `/cap6/goi-y`
 * mãi mãi trả "chưa phân loại"), user tự chọn kiểu, và server VẪN ghi
 * `khop_goi_y` cho lệnh.
 */
function kehoachDetail(overrides: Partial<KehoachDetailCap6> = {}): KehoachDetailCap6 {
  return {
    id: "kh-84",
    order_id: "order-84",
    symbol: "VCB",
    kieu_co_phieu: "dau_co_nho",
    kieu_ten: "Đầu cơ / vốn hóa nhỏ",
    nganh: null,
    lop_mau_thuan: null,
    trong_so_goi_y: null,
    lop_uu_tien: ["ky_thuat", "dong_tien"],
    lop_uu_tien_ten: ["Kỹ thuật", "Dòng tiền"],
    lop_it_tin: ["dinh_gia"],
    lop_it_tin_ten: ["Định giá"],
    lop_quyet_dinh: "dinh_gia",
    lop_quyet_dinh_ten: "Định giá",
    khop_goi_y: false,
    khop_goi_y_ten: "Lệch gợi ý",
    ly_do_doi_chieu: "P/B 1.2 — thấp hơn trung vị 3 năm",
    co_du_lieu: true,
    giai_thich:
      "VCB thuộc kiểu Đầu cơ / vốn hóa nhỏ (bạn tự chọn vì hệ chưa có dữ liệu " +
      "ngành cho mã này).",
    ...overrides,
  }
}

/** Khối dựng từ sự kiện lệnh khi `/cap6/goi-y` bó tay — trạng thái "cũ". */
const doiChieuChuaPhanLoai: DoiChieuKetsoCap6 = {
  ...doiChieu,
  kieu: null,
  kieuTen: null,
  nganh: null,
  lopUuTien: [],
  khopGoiY: null,
}

function closeButton(): HTMLElement {
  return screen.getByTestId("cap6-ketso-close")
}

/**
 * Mở chồng khối Cấp 1-5 (mặc định THU GỌN — mockup `iqx-cap6-ketso.html` vẽ đúng
 * một thanh `.collapsed` thay cho cả chồng đó).
 */
function moKeThua(): void {
  fireEvent.click(screen.getByTestId("cap6-ketso-kethua-toggle"))
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
  messageError.mockReset()
  kehoachCap6.current = { data: undefined, isPending: false, isError: false }
  kehoachCap6.calls.length = 0
  nhanDinhCap6.current = { data: undefined, isPending: false, isError: false }
  nhanDinhCap6.calls.length = 0
  window.localStorage.clear()
})

describe("KetsoModalCap6 — cộng dồn: giữ NGUYÊN mọi khối Cấp 1-5", () => {
  it("renders nothing when data is null", () => {
    render(
      <KetsoModalCap6
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

  it("giữ tag header + count-up + bảng đối chiếu Cấp 1", async () => {
    renderModal()
    expect(screen.getByText("KẾT SỔ LỆNH · #84 · THỰC CHIẾN")).toBeInTheDocument()
    moKeThua()
    expect(screen.getByTestId("cap5-ketso-doichieu")).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText("+5.3%")).toBeInTheDocument(), { timeout: 2000 })
  })

  it("giữ CAM KẾT vs THỰC TẾ (Cấp 2) · QUẢN LÝ VỐN (Cấp 3) · ĐỌC 5 LỚP (Cấp 4)", () => {
    renderModal()
    moKeThua()
    expect(screen.getByTestId("cap2-ketso-camket")).toBeInTheDocument()
    expect(screen.getByTestId("cap3-ketso-quanlyvon")).toBeInTheDocument()
    expect(screen.getByTestId("cap4-ketso-doc5lop")).toBeInTheDocument()
  })

  /**
   * ★★★ B3 — bài canh cũ khẳng định "KHÔNG có lớp coach 5" và ghim đúng cái lỗi:
   * nó đúng cho lớp coach 5 CŨ ("quyết định vs kết quả" của 4 ô đã nghỉ hưu),
   * nhưng Cấp 5 mới = SĂN MÃ và nguyên tắc cộng dồn giữ màn Săn mã ở Cấp 6/7/8.
   * Lớp coach săn mã vì thế PHẢI có khi biết nguồn săn của lệnh.
   */
  it("giữ chồng coach Cấp 1-4 + lớp coach SĂN MÃ của Cấp 5 (cộng dồn)", () => {
    renderModal()
    expect(screen.getByTestId("cap3-ketso-coach")).toBeInTheDocument()
    expect(screen.getByTestId("cap4-ketso-coach")).toBeInTheDocument()
    expect(screen.getByTestId("cap5-ketso-coach")).toBeInTheDocument()
    // …và đúng là lớp SĂN MÃ, không phải lớp "quyết định vs kết quả" đã nghỉ hưu.
    expect(screen.getByTestId("cap5-ketso-coach")).toHaveTextContent("SĂN MÃ")
    expect(screen.getByTestId("cap5-ketso-coach").textContent).not.toContain("QUYẾT ĐỊNH VS")
  })

  it("★ chưa biết nguồn săn → lớp coach săn mã VẮNG (không đoán nguồn gốc lệnh)", () => {
    renderModal({ huntNguonChuaBiet: true, huntFilter: null })
    expect(screen.queryByTestId("cap5-ketso-coach")).not.toBeInTheDocument()
    // 4 lớp dưới vẫn đủ.
    expect(screen.getByTestId("cap4-ketso-coach")).toBeInTheDocument()
  })

  it("giữ 3 dòng HỒ SƠ CỦA BẠN", () => {
    renderModal()
    expect(screen.getByTestId("cap5-ketso-profile")).toBeInTheDocument()
  })
})

describe("KetsoModalCap6 — cổng phân loại 4 ô của Cấp 5 ĐÃ NGHỈ HƯU", () => {
  it("KHÔNG còn khối phân loại 4 ô, ghi chú cổng, hay lối ra 'chưa phân loại'", () => {
    renderModal()
    expect(screen.queryByTestId("cap5-phanloai")).not.toBeInTheDocument()
    expect(screen.queryByTestId("cap6-ketso-gate-note")).not.toBeInTheDocument()
    expect(screen.queryByTestId("cap6-ketso-escape")).not.toBeInTheDocument()
    expect(screen.queryByTestId("cap6-ketso-escape-note")).not.toBeInTheDocument()
  })

  it("KHÔNG còn import `@/features/cap5/hooks` (verdict + POST /cap5/ketso đã gỡ)", () => {
    renderModal()
    expect(cap5HooksLoaded.value).toBe(false)
  })

  it("nút đóng KHÔNG bị khoá: bấm là kết sổ Cấp 1 → Cấp 2 rồi onClose", async () => {
    const onClose = vi.fn()
    renderModal({}, { onClose })
    expect(closeButton()).not.toBeDisabled()
    fireEvent.click(closeButton())
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
    expect(recordKetsoCap1Async).toHaveBeenCalledWith({ order_id: "order-84", cam_xuc: null })
    expect(recordKetsoCap2Mutate).toHaveBeenCalled()
  })

  it("nhật ký KHÔNG còn 3 trường của 4 ô (o4 / verdictHe / verdictUser)", async () => {
    const onRecorded = vi.fn()
    renderModal({}, { onRecorded })
    fireEvent.click(closeButton())
    await waitFor(() => expect(onRecorded).toHaveBeenCalledTimes(1))
    const rec = onRecorded.mock.calls[0][0] as Record<string, unknown>
    expect("o4" in rec).toBe(false)
    expect("verdictHe" in rec).toBe(false)
    expect("verdictUser" in rec).toBe(false)
    // Khối Đối chiếu của lệnh (Cấp 6, độc lập với 4 ô) vẫn được ghi nguyên vẹn.
    expect(rec.khopGoiY).toBe(true)
    expect(rec.lopQuyetDinh).toBe("dinh_gia")
  })
})

describe("KetsoModalCap6 — chồng khối Cấp 1-5 THU GỌN (spec §8, mockup)", () => {
  it("mặc định gấp lại, một cú bấm là mở đủ — «thu gọn» KHÔNG phải «bỏ»", () => {
    renderModal()
    expect(screen.queryByTestId("cap6-ketso-kethua")).not.toBeInTheDocument()
    expect(screen.getByTestId("cap6-ketso-kethua-toggle")).toHaveTextContent(
      "Đối chiếu kế hoạch · Quản lý vốn · Đọc 5 lớp (giữ từ Cấp 1-5)",
    )
    moKeThua()
    const kethua = screen.getByTestId("cap6-ketso-kethua")
    expect(within(kethua).getByTestId("cap2-ketso-camket")).toBeInTheDocument()
    expect(within(kethua).getByTestId("cap3-ketso-quanlyvon")).toBeInTheDocument()
    expect(within(kethua).getByTestId("cap4-ketso-doc5lop")).toBeInTheDocument()
    moKeThua()
    expect(screen.queryByTestId("cap6-ketso-kethua")).not.toBeInTheDocument()
  })

  it("★ khối MỚI của Cấp 6 KHÔNG nằm trong phần gấp — nó là phần cấp này dạy", () => {
    renderModal()
    expect(screen.getByTestId("cap6-ketso-nhandinh")).toBeInTheDocument()
    expect(screen.getByTestId("cap6-ketso-coach")).toBeInTheDocument()
  })
})

describe("KetsoModalCap6 — khối «nhận định có khớp hành động không» (spec §8)", () => {
  it("hai phe lúc đặt + tag PHỦ QUYẾT đúng lớp server đánh dấu", () => {
    renderModal()
    const block = screen.getByTestId("cap6-ketso-nhandinh")
    expect(within(block).getByTestId("cap6-ketso-ungho")).toHaveTextContent(
      "🎯 Kỹ thuật · 💰 Dòng tiền",
    )
    expect(within(block).getByTestId("cap6-ketso-nguoc")).toHaveTextContent("📰 Tin tức")
    expect(screen.getByTestId("cap6-ketso-veto-tin_tuc")).toHaveTextContent("PHỦ QUYẾT")
    expect(screen.getByTestId("cap6-ketso-veto-noi_bo")).toHaveTextContent("PHỦ QUYẾT")
  })

  it("hiện mức user tự đọc + khối lượng và mức tự tin đã mua", () => {
    renderModal()
    expect(screen.getByTestId("cap6-ketso-muc")).toHaveTextContent("🔴 Nghiêm trọng")
    const hd = screen.getByTestId("cap6-ketso-hanhdong")
    expect(hd).toHaveTextContent("15% vốn")
    expect(hd).toHaveTextContent("tự tin")
  })

  it("★ CHỈ khối lượng + tự tin — bảng KHÔNG có dòng cắt lỗ nào (spec §4.3/§8)", () => {
    renderModal()
    // Bảng đối chiếu: 4 dòng, không dòng nào về cắt lỗ/chốt lời.
    const table = screen
      .getByTestId("cap6-ketso-nhandinh")
      .querySelector("table") as HTMLElement
    expect(table.textContent).toContain("Bạn đọc mâu thuẫn")
    for (const tu of ["cắt lỗ", "chốt lời", "Cắt lỗ"]) {
      expect(table.textContent).not.toContain(tu)
    }
    // Câu §C12c ở dưới bảng nói THẲNG vì sao cắt lỗ không nằm trong phép so.
    expect(screen.getByTestId("cap6-ketso-nhandinh-giaithich")).toHaveTextContent(
      "KHÔNG xét cắt lỗ",
    )
  })

  it("lệnh KHÔNG có mâu thuẫn → khối bị BỎ HẲN, im lặng (không dựng khối rỗng)", () => {
    renderModal({ nhanDinh: null })
    expect(screen.queryByTestId("cap6-ketso-nhandinh")).not.toBeInTheDocument()
    expect(screen.queryByTestId("cap6-ketso-lech")).not.toBeInTheDocument()
    expect(screen.queryByTestId("cap6-ketso-coach")).not.toBeInTheDocument()
    // Neo dương tính: modal THẬT SỰ mở (mọi khối kế thừa còn nguyên).
    moKeThua()
    expect(screen.getByTestId("cap2-ketso-camket")).toBeInTheDocument()
  })

  it("★ chưa chọn mức nhận định → nói thẳng, và KHÔNG kết luận là đã khớp", () => {
    renderModal({
      nhanDinh: { ...data.nhanDinh!, conflictLevel: null },
    })
    expect(screen.getByTestId("cap6-ketso-muc")).toHaveTextContent("bạn không chọn mức nào")
    expect(screen.getByTestId("cap6-ketso-chua-xet")).toHaveTextContent(
      "Chưa xét được KHÔNG có nghĩa là đã khớp",
    )
    expect(screen.queryByTestId("cap6-ketso-lech")).not.toBeInTheDocument()
  })

  it("★ thiếu %vốn/tự tin → nói «chưa ghi lại được», KHÔNG in 0%", () => {
    renderModal({
      nhanDinh: { ...data.nhanDinh!, pctVon: null, mucTuTin: null },
    })
    const hd = screen.getByTestId("cap6-ketso-hanhdong")
    expect(hd).toHaveTextContent("khối lượng: chưa ghi lại được")
    expect(hd).toHaveTextContent("mức tự tin: chưa ghi lại được")
    expect(hd.textContent).not.toContain("0% vốn")
  })
})

describe("KetsoModalCap6 — khối cảnh báo lệch (spec §8)", () => {
  it("nghiêm trọng + tự tin cao → cảnh báo bẫy «đắn đo mà vẫn mua lớn»", () => {
    renderModal({ nhanDinh: { ...data.nhanDinh!, mucTuTin: 3, pctVon: 30 } })
    const lech = screen.getByTestId("cap6-ketso-lech")
    expect(lech).toHaveTextContent("Nhận định và hành động đang lệch nhau")
    expect(lech).toHaveTextContent("vẫn mua 30% vốn")
    expect(lech).toHaveTextContent("Đắn đo trong đầu nhưng tay vẫn mua lớn")
    expect(screen.getByTestId("cap6-ketso-hanhdong-label")).toHaveTextContent("Nhưng đã mua")
  })

  it("★ khối cảnh báo KHÔNG nhắc cắt lỗ", () => {
    renderModal({ nhanDinh: { ...data.nhanDinh!, mucTuTin: 3 } })
    expect(screen.getByTestId("cap6-ketso-lech").textContent).not.toContain("cắt lỗ")
  })

  it("nghiêm trọng + tự tin THẤP NHẤT → KHÔNG cảnh báo, nhãn là «Bạn đã mua»", () => {
    renderModal({ nhanDinh: { ...data.nhanDinh!, mucTuTin: 1 } })
    expect(screen.queryByTestId("cap6-ketso-lech")).not.toBeInTheDocument()
    expect(screen.getByTestId("cap6-ketso-hanhdong-label")).toHaveTextContent("Bạn đã mua")
  })

  it("mức «nhẹ» + tự tin cao → KHÔNG cảnh báo (chỉ mức nghiêm trọng mới lệch)", () => {
    renderModal({ nhanDinh: { ...data.nhanDinh!, conflictLevel: "nhe", mucTuTin: 3 } })
    expect(screen.getByTestId("cap6-ketso-nhandinh")).toBeInTheDocument()
    expect(screen.queryByTestId("cap6-ketso-lech")).not.toBeInTheDocument()
  })

  /**
   * ★★ MOCKUP viết "và lần này nó khiến bạn lỗ 6,3%" — dán câu đó vào một lệnh
   * CÓ LÃI là nói sai sự thật. Lệnh lãi vẫn phải bị cảnh báo (bài học là sự NHẤT
   * QUÁN, không phải kết quả), nhưng bằng câu khác.
   */
  it("★ lệnh LỖ → nhắc đúng con số lỗ", () => {
    renderModal({
      exitPrice: 28_000,
      nhanDinh: { ...data.nhanDinh!, mucTuTin: 3 },
    })
    const lech = screen.getByTestId("cap6-ketso-lech")
    expect(lech).toHaveTextContent("khiến bạn lỗ")
    expect(lech.textContent).not.toContain("Lần này lệnh có lãi")
  })

  it("★ lệnh LÃI → vẫn cảnh báo, nhưng KHÔNG bịa ra một khoản lỗ", () => {
    renderModal({ nhanDinh: { ...data.nhanDinh!, mucTuTin: 3 } })
    const lech = screen.getByTestId("cap6-ketso-lech")
    expect(lech).toHaveTextContent("Lần này lệnh có lãi")
    expect(lech).toHaveTextContent("lãi không làm cho sự lệch đó thành đúng")
    expect(lech.textContent).not.toContain("khiến bạn lỗ")
  })
})

describe("KetsoModalCap6 — đọc lại hàng ĐÃ LƯU (GET /cap6/kehoach/{order_id})", () => {
  it("ngoài Cấp 6 → KHÔNG gọi endpoint (nó 404 khi user chưa có hàng Cấp 6)", () => {
    renderModal()
    expect(nhanDinhCap6.calls.at(-1)).toEqual(["order-84", false])
  })

  it("đang ở Cấp 6 → gọi endpoint với ĐÚNG order_id của lệnh", () => {
    renderInCap6()
    expect(nhanDinhCap6.calls.at(-1)).toEqual(["order-84", true])
  })

  it("★ hàng đã lưu THẮNG ảnh chụp client — số hiện là số server", () => {
    nhanDinhCap6.current = { data: nhanDinhDetail(), isPending: false, isError: false }
    renderInCap6()
    // Client chụp 15% vốn / tự tin Vừa; server đã lưu 30% / Cao → hiện số SERVER.
    const hd = screen.getByTestId("cap6-ketso-hanhdong")
    expect(hd).toHaveTextContent("30% vốn")
    expect(hd.textContent).not.toContain("15% vốn")
    expect(screen.getByTestId("cap6-ketso-lech")).toBeInTheDocument()
  })

  it("★ server nói had_conflict = false → BỎ HẲN khối, dù client có ảnh chụp", () => {
    nhanDinhCap6.current = {
      data: nhanDinhDetail({ had_conflict: false, conflict_level: null }),
      isPending: false,
      isError: false,
    }
    renderInCap6()
    expect(screen.queryByTestId("cap6-ketso-nhandinh")).not.toBeInTheDocument()
    moKeThua()
    expect(screen.getByTestId("cap2-ketso-camket")).toBeInTheDocument()
  })

  it("★ query lỗi → FAIL-CLOSED về ảnh chụp client, modal KHÔNG vỡ", () => {
    nhanDinhCap6.current = { data: undefined, isPending: false, isError: true }
    renderInCap6()
    expect(screen.getByTestId("cap6-ketso-muc")).toHaveTextContent("🔴 Nghiêm trọng")
    expect(screen.getByTestId("cap6-ketso-hanhdong")).toHaveTextContent("15% vốn")
    // Nút đóng vẫn bấm được — modal `closable={false}` không được nhốt ai.
    expect(closeButton()).not.toBeDisabled()
  })

  it("★ lớp phủ quyết lấy theo veto_layers của SERVER", () => {
    nhanDinhCap6.current = {
      data: nhanDinhDetail({ veto_layers: ["tin_tuc"] }),
      isPending: false,
      isError: false,
    }
    renderInCap6()
    expect(screen.getByTestId("cap6-ketso-veto-tin_tuc")).toBeInTheDocument()
    expect(screen.queryByTestId("cap6-ketso-veto-noi_bo")).not.toBeInTheDocument()
  })
})

describe("KetsoModalCap6 — lớp coach thứ 6 «SỰ NHẤT QUÁN»", () => {
  it("nhấn «để hành động khớp nhận định» + nhắc «không mua cũng là lựa chọn»", () => {
    renderModal()
    const coach = screen.getByTestId("cap6-ketso-coach")
    expect(coach).toHaveTextContent("NHÌN LẠI · SỰ NHẤT QUÁN")
    expect(coach).toHaveTextContent("để hành động khớp với nhận định")
    expect(coach).toHaveTextContent('"không mua" cũng là một lựa chọn')
  })

  it("★ coach KHÔNG nhắc cắt lỗ (spec §8 «CHỈ khối lượng + tự tin»)", () => {
    renderModal()
    expect(screen.getByTestId("cap6-ketso-coach")).toBeInTheDocument()
    expect(screen.getByTestId("cap6-ketso-coach").textContent).not.toContain("cắt lỗ")
  })

  it("lệnh không mâu thuẫn → KHÔNG có đoạn coach này", () => {
    renderModal({ nhanDinh: null })
    expect(screen.queryByTestId("cap6-ketso-coach")).not.toBeInTheDocument()
  })

  it("đứng SAU khối cảnh báo lệch (thứ tự mockup)", () => {
    renderModal({ nhanDinh: { ...data.nhanDinh!, mucTuTin: 3 } })
    expect(
      precedes(screen.getByTestId("cap6-ketso-lech"), screen.getByTestId("cap6-ketso-coach")),
    ).toBe(true)
  })
})

describe("KetsoModalCap6 — nhật ký + recompute Cấp 6", () => {
  it("ghi 1 bản ghi Cấp 6 kèm kiểu / lớp quyết định / khớp, và gọi onRecorded", async () => {
    const onRecorded = vi.fn()
    renderModal({}, { onRecorded })
    fireEvent.click(closeButton())
    await waitFor(() => expect(onRecorded).toHaveBeenCalledTimes(1))
    const rec = onRecorded.mock.calls[0][0] as Cap6TradeRecord
    expect(rec.kieuCoPhieu).toBe("ngan_hang")
    expect(rec.lopQuyetDinh).toBe("dinh_gia")
    expect(rec.khopGoiY).toBe(true)
    expect(readCap6TradeLog("user-1")).toHaveLength(1)
  })

  it("lệnh không có đối chiếu → 3 trường Cấp 6 là null (KHÔNG suy ra lệch)", async () => {
    const onRecorded = vi.fn()
    renderModal({ doiChieu: null }, { onRecorded })
    fireEvent.click(closeButton())
    await waitFor(() => expect(onRecorded).toHaveBeenCalledTimes(1))
    const rec = onRecorded.mock.calls[0][0] as Cap6TradeRecord
    expect(rec.kieuCoPhieu).toBeNull()
    expect(rec.lopQuyetDinh).toBeNull()
    expect(rec.khopGoiY).toBeNull()
  })

  it("kích hoạt recompute Cấp 6 (PATCH /cap6/task) sau khi ghi thành công", async () => {
    renderModal()
    fireEvent.click(closeButton())
    await waitFor(() => expect(markCap6Task).toHaveBeenCalledWith(2))
  })
})

/* ══════════════════════════════════════════════════════════════════════════
   NGUỒN SĂN CỦA LỆNH (nguyên tắc cộng dồn: cấp này VẪN có màn Săn mã)
   ══════════════════════════════════════════════════════════════════════════ */
describe("KetsoModalCap6 — nguồn săn của lệnh KHÔNG được điền `null` cứng", () => {
  /**
   * ★★★ B3 — HAI NGUỒN NÓI KHÁC NHAU VỀ CÙNG MỘT LỆNH.
   *
   * `Cap6TradingPage` bọc `Cap5Provider` (cộng dồn) ⇒ `isCap5Active === true` ⇒
   * `RightToolbar`/`RightSidebar` mọc đủ nút «Săn mã» + «Watchlist» ở Cấp 6/7/8,
   * và backend đóng dấu `order_kehoach.hunt_filter` cho lệnh săn được. Bản ghi FE
   * từng điền `huntFilter: null` CỨNG kèm docstring "trang Cấp 6 KHÔNG có màn
   * Săn mã" — vừa sai, vừa biến `null` thành câu khẳng định "mã này KHÔNG đến từ
   * săn mã" (`coachTemplateCap5`).
   */
  it("★★★ bản ghi mang NGUỒN SĂN THẬT của lệnh, không phải `null` cứng", async () => {
    const onRecorded = vi.fn()
    renderModal({ huntFilter: "kl", huntSoPhienCho: 3 }, { onRecorded })
    fireEvent.click(closeButton())
    await waitFor(() => expect(onRecorded).toHaveBeenCalledTimes(1))
    const rec = onRecorded.mock.calls[0][0] as Record<string, unknown>
    expect(rec.huntFilter).toBe("kl")
    expect(rec.huntSoPhienCho).toBe(3)
    // `so_lop_luc_vao` server LUÔN null (không lưu điểm lúc đặt lệnh) — chép nguyên.
    expect(rec.huntSoLopLucVao).toBeNull()
  })

  it("★ mã user tự gõ (server nói không từ săn mã) ⇒ `null` — và đó là sự thật", async () => {
    const onRecorded = vi.fn()
    renderModal({ huntFilter: null, huntSoPhienCho: null }, { onRecorded })
    fireEvent.click(closeButton())
    await waitFor(() => expect(onRecorded).toHaveBeenCalledTimes(1))
    const rec = onRecorded.mock.calls[0][0] as Record<string, unknown>
    expect(rec.huntFilter).toBeNull()
  })

  it("★ đoạn coach săn mã CÓ mặt khi biết nguồn săn", () => {
    renderModal({ huntFilter: "kl", huntSoPhienCho: 3 })
    expect(document.body.textContent).toMatch(/Khối lượng đột biến/)
  })

  /**
   * ★ NGOẠI LỆ: không lấy được nguồn săn (`GET /cap5/nguon-san` lỗi) ⇒ VẮNG đoạn
   * coach. In "Mã này KHÔNG đến từ săn mã" khi chưa biết nguồn là bịa đặt về
   * nguồn gốc lệnh — "chưa lấy được" ≠ "không đến từ săn mã" (luật số 1).
   */
  it("★ chưa biết nguồn săn ⇒ KHÔNG câu nào khẳng định về nguồn gốc lệnh", () => {
    renderModal({ huntNguonChuaBiet: true, huntFilter: null })
    expect(document.body.textContent).not.toMatch(/KHÔNG đến từ săn mã/i)
    expect(document.body.textContent).not.toMatch(/không đến từ săn mã/i)
  })
})
