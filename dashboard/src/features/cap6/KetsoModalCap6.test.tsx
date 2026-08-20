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
  doiChieu,
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
    expect(screen.getByTestId("cap5-ketso-doichieu")).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText("+5.3%")).toBeInTheDocument(), { timeout: 2000 })
  })

  it("giữ CAM KẾT vs THỰC TẾ (Cấp 2) · QUẢN LÝ VỐN (Cấp 3) · ĐỌC 5 LỚP (Cấp 4)", () => {
    renderModal()
    expect(screen.getByTestId("cap2-ketso-camket")).toBeInTheDocument()
    expect(screen.getByTestId("cap3-ketso-quanlyvon")).toBeInTheDocument()
    expect(screen.getByTestId("cap4-ketso-doc5lop")).toBeInTheDocument()
  })

  it("giữ chồng coach Cấp 1-4 (Cấp 5 đã nghỉ hưu → KHÔNG có lớp coach 5)", () => {
    renderModal()
    expect(screen.getByTestId("cap3-ketso-coach")).toBeInTheDocument()
    expect(screen.getByTestId("cap4-ketso-coach")).toBeInTheDocument()
    expect(screen.queryByTestId("cap5-ketso-coach")).not.toBeInTheDocument()
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
    // Mọi khối Cấp 1-4 vẫn còn nguyên.
    expect(screen.getByTestId("cap4-ketso-doc5lop")).toBeInTheDocument()
    expect(screen.getByTestId("cap3-ketso-quanlyvon")).toBeInTheDocument()
  })

  it("thiếu ngành → không bịa provenance", () => {
    renderModal({ doiChieu: { ...doiChieu, nganh: null } })
    expect(screen.queryByTestId("cap6-ketso-nganh")).not.toBeInTheDocument()
  })
})

describe("KetsoModalCap6 — đọc lại Đối chiếu ĐÃ GHI của chính lệnh (GET /cap6/kehoach)", () => {
  it("ngoài Cấp 6 → KHÔNG gọi endpoint (nó 404 khi user chưa có hàng Cấp 6)", () => {
    renderModal()
    expect(kehoachCap6.calls.length).toBeGreaterThan(0)
    for (const args of kehoachCap6.calls) expect(args).toEqual(["order-84", false])
  })

  it("đang ở Cấp 6 → gọi endpoint với ĐÚNG order_id của lệnh", () => {
    renderInCap6()
    expect(kehoachCap6.calls.length).toBeGreaterThan(0)
    for (const args of kehoachCap6.calls) expect(args).toEqual(["order-84", true])
  })

  it("server ĐÃ ghi khớp/lệch cho lệnh → hiện sự thật đã lưu, KHÔNG còn 'chưa phân loại'", () => {
    kehoachCap6.current = { data: kehoachDetail(), isPending: false, isError: false }
    renderInCap6({ doiChieu: doiChieuChuaPhanLoai })
    const block = within(screen.getByTestId("cap6-ketso-doichieu"))
    expect(block.getByTestId("cap6-ketso-kieu").textContent).toContain("Đầu cơ / vốn hóa nhỏ")
    const khop = block.getByTestId("cap6-ketso-khop")
    expect(khop.textContent).toContain("khác gợi ý")
    expect(khop.textContent).not.toContain("chưa phân loại")
    expect(block.getByTestId("cap6-ketso-goi-y").textContent).toContain("🎯 Kỹ thuật")
    expect(block.getByTestId("cap6-ketso-goi-y").textContent).toContain("💰 Dòng tiền")
  })

  it("hiện câu giải thích của server NGUYÊN VĂN (§C12c)", () => {
    const detail = kehoachDetail()
    kehoachCap6.current = { data: detail, isPending: false, isError: false }
    renderInCap6({ doiChieu: doiChieuChuaPhanLoai })
    expect(screen.getByTestId("cap6-ketso-giaithich").textContent).toBe(detail.giai_thich)
  })

  it("lệch gợi ý đọc từ server vẫn TRUNG TÍNH — không 'sai', không cảnh báo", () => {
    kehoachCap6.current = { data: kehoachDetail(), isPending: false, isError: false }
    renderInCap6({ doiChieu: doiChieuChuaPhanLoai })
    const block = screen.getByTestId("cap6-ketso-doichieu")
    for (const tu of CAM_TU) expect(block.textContent!.toLowerCase()).not.toContain(tu)
    expect(screen.getByTestId("cap6-ketso-khop").className).not.toContain("canhbao")
  })

  /**
   * ★ REGRESSION MÀU (fix wave FE-2) — jsdom không nạp CSS nên phải đọc thẳng file.
   *
   * `.cap6-ketso-khop--khac` từng dùng `var(--cap6)` = `#d64550`. Hai hàng bên dưới
   * TRONG CÙNG MỘT `<table>`, ô "Kết quả" dùng `text-down` = `#ff6b6b`. Ở 12px hai
   * đỏ đó không phân biệt được, nên một lệnh lỗ đi lệch gợi ý hiện `khác gợi ý…` và
   * `−4.2%` cạnh nhau cùng một màu đỏ, trong khi `khớp gợi ý ✓` xanh — mắt đọc ra
   * một PHÁN QUYẾT, và lệch gợi ý thì KHÔNG BAO GIỜ được đóng khung là sai (spec
   * §5/§10). Chữ đã trung tính sẵn; chỉ còn màu.
   */
  it("★ 'khác gợi ý' KHÔNG dùng màu đỏ — nó ở ngay trên một ô text-down đỏ", async () => {
    // Đọc thẳng từ đĩa: vitest stub CSS import (`css: false`), nên `?raw` cũng
    // không mang nội dung thật về. `process.cwd()` là root của vitest (`dashboard/`).
    const { readFileSync } = await import("node:fs")
    const { resolve } = await import("node:path")
    const css = readFileSync(
      resolve(process.cwd(), "src/features/cap6/cap6-ketso.css"),
      "utf8",
    )
    const rule = /\.cap6-ketso-khop--khac\s*\{([^}]*)\}/.exec(css)
    expect(rule).not.toBeNull()
    const decl = rule![1]
    // Không phải đỏ son của cấp (var(--cap6) hoặc literal), không phải bất kỳ đỏ
    // nào của bảng giá.
    expect(decl).not.toContain("--cap6")
    expect(decl.toLowerCase()).not.toContain("#d64550")
    expect(decl.toLowerCase()).not.toContain("#ff6b6b")
    expect(decl.toLowerCase()).not.toMatch(/#[ef][0-9a-f]{5}/)
    // …nhưng vẫn PHẢI có một khai báo màu: bỏ trắng ô sẽ làm nó tàng hình.
    expect(decl).toMatch(/color\s*:/)
  })

  it("có kiểu + có gợi ý nhưng khop_goi_y === null → 'không xét', TUYỆT ĐỐI không thành lệch", () => {
    // ★ Fixture này khác fixture "đã chấm" ĐÚNG MỘT TRƯỜNG (`khop_goi_y`), nên
    // bất kỳ cách gộp `null` vào `false` nào (vd. `?? false`) đều làm test đỏ.
    kehoachCap6.current = {
      data: kehoachDetail({ khop_goi_y: null, khop_goi_y_ten: null }),
      isPending: false,
      isError: false,
    }
    renderInCap6({ doiChieu: doiChieuChuaPhanLoai })
    const khop = screen.getByTestId("cap6-ketso-khop")
    expect(khop.textContent).toContain("không xét")
    // "cho kiểu này" chỉ có ở HAI câu phán khớp/lệch — vắng mặt nó là bằng chứng
    // `null` không bị đọc thành một trong hai.
    expect(khop.textContent).not.toContain("cho kiểu này")
    // Không có gợi ý nào để so → không có đoạn coach Cấp 6 nào được đoán hộ.
    expect(screen.queryByTestId("cap6-ketso-coach")).not.toBeInTheDocument()
  })

  it("kiểu chưa phân loại (payload thật) → ô kiểu vẫn nói 'chưa phân loại'", () => {
    kehoachCap6.current = {
      data: kehoachDetail({
        kieu_co_phieu: null,
        kieu_ten: null,
        lop_uu_tien: [],
        lop_uu_tien_ten: [],
        khop_goi_y: null,
        khop_goi_y_ten: null,
      }),
      isPending: false,
      isError: false,
    }
    renderInCap6({ doiChieu: doiChieuChuaPhanLoai })
    expect(screen.getByTestId("cap6-ketso-kieu").textContent).toContain("chưa phân loại")
    expect(screen.queryByTestId("cap6-ketso-goi-y")).not.toBeInTheDocument()
  })

  it("404 / lỗi mạng → im lặng giữ nguyên trạng thái cũ, modal VẪN đóng được", () => {
    const onClose = vi.fn()
    kehoachCap6.current = { data: undefined, isPending: false, isError: true }
    renderInCap6({}, { onClose })
    // Khối dựng từ sự kiện lệnh (khớp = true) còn nguyên — không lỗi, không toast.
    expect(screen.getByTestId("cap6-ketso-khop").textContent).toContain("khớp gợi ý")
    expect(messageError).not.toHaveBeenCalled()
    expect(closeButton()).not.toBeDisabled()
    fireEvent.click(closeButton())
    return waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
  })

  it("404 khi khối cũ là 'chưa phân loại' → vẫn là 'chưa phân loại', không bịa lệch", () => {
    kehoachCap6.current = { data: undefined, isPending: false, isError: true }
    renderInCap6({ doiChieu: doiChieuChuaPhanLoai })
    const khop = screen.getByTestId("cap6-ketso-khop")
    expect(khop.textContent).toContain("chưa phân loại")
    expect(khop.textContent).not.toContain("khác gợi ý")
  })

  it("co_du_lieu = false → giữ nguyên khối cũ, KHÔNG xoá khối đã dựng", () => {
    kehoachCap6.current = {
      data: kehoachDetail({
        id: null,
        kieu_co_phieu: null,
        kieu_ten: null,
        lop_uu_tien: [],
        lop_uu_tien_ten: [],
        lop_it_tin: [],
        lop_it_tin_ten: [],
        lop_quyet_dinh: null,
        lop_quyet_dinh_ten: null,
        khop_goi_y: null,
        khop_goi_y_ten: null,
        ly_do_doi_chieu: null,
        co_du_lieu: false,
        giai_thich: "Lệnh này chưa đi qua bước Đối chiếu.",
      }),
      isPending: false,
      isError: false,
    }
    renderInCap6()
    expect(screen.getByTestId("cap6-ketso-khop").textContent).toContain("khớp gợi ý")
    expect(screen.getByTestId("cap6-ketso-kieu").textContent).toContain("Ngân hàng")
    expect(screen.queryByTestId("cap6-ketso-giaithich")).not.toBeInTheDocument()
  })

  it("nhật ký ghi khớp/lệch THẬT của server, không phải giá trị cũ", async () => {
    const onRecorded = vi.fn()
    kehoachCap6.current = { data: kehoachDetail(), isPending: false, isError: false }
    renderInCap6({ doiChieu: doiChieuChuaPhanLoai }, { onRecorded })
    fireEvent.click(closeButton())
    await waitFor(() => expect(onRecorded).toHaveBeenCalledTimes(1))
    const rec = onRecorded.mock.calls[0][0] as Cap6TradeRecord
    expect(rec.kieuCoPhieu).toBe("dau_co_nho")
    expect(rec.khopGoiY).toBe(false)
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
