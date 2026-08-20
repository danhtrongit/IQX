import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import React from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * Kết sổ Cấp 8 = Kết sổ Cấp 7 (mọi khối Cấp 1-4 + khối Đối chiếu Cấp 6 + khối Đọc
 * sổ lệnh Cấp 7) + khối "KIỂM TRA DANH MỤC — NHÌN LẠI" + lớp coach thứ 8.
 *
 * ★★ **CỔNG PHÂN LOẠI 4 Ô CỦA CẤP 5 ĐÃ NGHỈ HƯU** cùng Cấp 5 cũ: không còn
 * `PhanLoai4O`, `GET /cap5/verdict`, `POST /cap5/ketso`, lối ra "chưa phân loại
 * được", và `Đóng kết sổ ✓` KHÔNG còn bị khoá bởi verdict. Các `it` dưới canh
 * CHÍNH sự vắng mặt đó — bài học Cấp 2 bỏ "chuỗi kỷ luật" mà dòng chuỗi sống sót
 * ở Kết sổ Cấp 3-8 rồi in ra một con số bịa.
 */
const {
  recordKetsoCap1Async,
  recordKetsoCap2Mutate,
  markCap6Task,
  markCap7Task,
  markCap8Task,
  cap5HooksLoaded,
  messageError,
} = vi.hoisted(() => ({
  recordKetsoCap1Async: vi.fn(),
  recordKetsoCap2Mutate: vi.fn(),
  markCap6Task: vi.fn(),
  markCap7Task: vi.fn(),
  markCap8Task: vi.fn(),
  // `true` NGAY KHI `@/features/cap5/hooks` được nạp lần đầu — cách duy nhất
  // khẳng định `useVerdictGoiY`/`useRecordKetsoCap5` đã bị gỡ HẲN khỏi cây import
  // của Kết sổ Cấp 8 (một `not.toHaveBeenCalled()` sẽ đúng một cách rỗng).
  cap5HooksLoaded: { value: false },
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
}))
vi.mock("@/features/cap7/hooks", () => ({
  useCompleteCap7Task: () => ({ mutate: markCap7Task }),
}))
vi.mock("./hooks", () => ({
  useCompleteCap8Task: () => ({ mutate: markCap8Task }),
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
  KetsoModalCap8,
  type KetsoDataCap8,
  type KiemTraKetsoCap8,
} from "./KetsoModalCap8"
import type { DocLucKetsoCap7 } from "@/features/cap7/KetsoModalCap7"
import { readCap7TradeLog, type Cap7TradeRecord } from "@/features/cap7/tradeLogCap7"
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
    so_lenh_thuc_chien: 120,
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
  giaiThich: "GIẢI THÍCH CẤP 7",
}

/** Khối Kiểm tra danh mục của lệnh mẫu — đúng ví dụ spec §6. */
function kiemTra(overrides: Partial<KiemTraKetsoCap8> = {}): KiemTraKetsoCap8 {
  return {
    canhBao: ["don_nganh"],
    canhBaoTen: ["Dồn ngành"],
    canhBaoText: "Dồn ngành",
    hanhVi: "giam_kl",
    hanhViTen: "Giảm khối lượng",
    donNganhPct: 46,
    nganh: "Ngân hàng",
    tuongQuanCaoVoi: null,
    tongRuiRoPct: 17,
    soViTheThieuCatLo: 0,
    giaiThich: "GIẢI THÍCH CẤP 8 CỦA SERVER",
    ...overrides,
  }
}

const data: KetsoDataCap8 = {
  n: 120,
  orderId: "order-120",
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
  flags: { order_id: "order-120" },
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
  kiemTra: kiemTra(),
}

function renderModal(
  overrides: Partial<KetsoDataCap8> = {},
  props: { onClose?: () => void; onRecorded?: (r: Cap7TradeRecord) => void } = {},
) {
  return render(
    <KetsoModalCap8
      data={{ ...data, ...overrides }}
      progress={cap1Progress()}
      trades={[]}
      onClose={props.onClose ?? vi.fn()}
      onRecorded={props.onRecorded}
    />,
  )
}

function closeButton(): HTMLElement {
  return screen.getByTestId("cap8-ketso-close")
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
  markCap8Task.mockReset()
  messageError.mockReset()
  window.localStorage.clear()
})

// ── CỘNG DỒN: mọi khối Cấp 1-7 còn nguyên ───────────────────────────────────

describe("KetsoModalCap8 — cộng dồn Cấp 1-7 (spec §0/§6)", () => {
  it("giữ ĐỦ mọi khối của Cấp 1-7", () => {
    renderModal()
    expect(screen.getByTestId("cap5-ketso-doichieu")).toBeInTheDocument()
    expect(screen.getByTestId("cap2-ketso-camket")).toBeInTheDocument()
    expect(screen.getByTestId("cap3-ketso-quanlyvon")).toBeInTheDocument()
    expect(screen.getByTestId("cap4-ketso-doc5lop")).toBeInTheDocument()
    expect(screen.getByTestId("cap6-ketso-doichieu")).toBeInTheDocument()
    expect(screen.getByTestId("cap7-ketso-docluc")).toBeInTheDocument()
    expect(screen.getByTestId("cap8-ketso-kiemtra")).toBeInTheDocument()
  })

  it("cổng phân loại 4 ô của Cấp 5 ĐÃ NGHỈ HƯU: không khối, không cổng, không lối ra", () => {
    renderModal()
    expect(screen.queryByTestId("cap5-phanloai")).not.toBeInTheDocument()
    expect(screen.queryByTestId("cap8-ketso-gate-note")).not.toBeInTheDocument()
    expect(screen.queryByTestId("cap8-ketso-escape")).not.toBeInTheDocument()
    expect(screen.queryByTestId("cap8-ketso-escape-note")).not.toBeInTheDocument()
    expect(closeButton()).not.toBeDisabled()
  })

  it("KHÔNG còn import `@/features/cap5/hooks` (verdict + POST /cap5/ketso đã gỡ)", () => {
    renderModal()
    expect(cap5HooksLoaded.value).toBe(false)
  })

  it("có đủ lớp coach Cấp 1-4 + 6 + 7 + 8, KHÔNG có lớp coach Cấp 5", () => {
    renderModal()
    expect(screen.getByTestId("cap3-ketso-coach")).toBeInTheDocument()
    expect(screen.getByTestId("cap4-ketso-coach")).toBeInTheDocument()
    // Lớp coach 5 = "quyết định vs kết quả" của 4 ô đã nghỉ hưu; đoạn coach săn mã
    // thay nó chưa có nguồn ở Cấp 8 nên phải VẮNG, không render dữ liệu bịa.
    expect(screen.queryByTestId("cap5-ketso-coach")).not.toBeInTheDocument()
    expect(screen.getByTestId("cap6-ketso-coach")).toBeInTheDocument()
    expect(screen.getByTestId("cap7-ketso-coach")).toBeInTheDocument()
    expect(screen.getByTestId("cap8-ketso-coach")).toBeInTheDocument()
  })

  it("khối Cấp 8 đứng DƯỚI mọi khối kế thừa và TRÊN chồng coach", () => {
    renderModal()
    const kiemTraBlock = screen.getByTestId("cap8-ketso-kiemtra")
    expect(precedes(screen.getByTestId("cap7-ketso-docluc"), kiemTraBlock)).toBe(true)
    expect(precedes(kiemTraBlock, screen.getByTestId("cap8-ketso-coach"))).toBe(true)
  })
})

// ── Khối KIỂM TRA DANH MỤC — NHÌN LẠI (spec §6) ─────────────────────────────

describe("khối Kiểm tra danh mục — nhìn lại (spec §6)", () => {
  it("dòng 'Lúc mua' theo đúng mẫu spec: ⚠ {cảnh báo} · bạn: {xử lý} ✓", () => {
    renderModal()
    const block = screen.getByTestId("cap8-ketso-kiemtra")
    expect(within(block).getByTestId("cap8-ketso-lucmua")).toHaveTextContent(
      "⚠ Dồn ngành · bạn: Giảm khối lượng ✓",
    )
  })

  it("'Vẫn mua' KHÔNG bị đánh dấu sai — không ✓, không ✗, không 'sai' (§C8)", () => {
    // Đổi ĐÚNG MỘT biến so với fixture xanh: `hanhVi` (+ nhãn của chính nó).
    renderModal({ kiemTra: kiemTra({ hanhVi: "van_mua", hanhViTen: "Vẫn mua" }) })
    const dong = screen.getByTestId("cap8-ketso-lucmua")
    expect(dong).toHaveTextContent("bạn: Vẫn mua")
    expect(dong.textContent).not.toContain("✓")
    expect(dong.textContent).not.toContain("✗")
    expect(dong.textContent?.toLowerCase()).not.toContain("sai")
  })

  it("dòng 'Kết quả' hiện %lãi/lỗ của lệnh", () => {
    renderModal()
    const block = screen.getByTestId("cap8-ketso-kiemtra")
    expect(within(block).getByTestId("cap8-ketso-ketqua")).toHaveTextContent("+5.3%")
  })

  it("dồn ngành + tổng vốn ở rủi ro hiện đúng số, có ghi 'nếu mọi cắt lỗ bị chạm'", () => {
    renderModal()
    const block = screen.getByTestId("cap8-ketso-kiemtra")
    expect(within(block).getByTestId("cap8-ketso-donnganh")).toHaveTextContent(
      "Ngân hàng 46% danh mục",
    )
    expect(within(block).getByTestId("cap8-ketso-tongruiro")).toHaveTextContent(
      "17% (nếu mọi cắt lỗ bị chạm)",
    )
  })

  it("dồn ngành `null` → nói thẳng là chưa ghi lại được, TUYỆT ĐỐI không 0%", () => {
    // Đổi ĐÚNG MỘT biến so với fixture xanh: `donNganhPct`.
    renderModal({ kiemTra: kiemTra({ donNganhPct: null }) })
    const o = screen.getByTestId("cap8-ketso-donnganh")
    expect(o).toHaveTextContent("hệ chưa ghi lại được tỷ trọng ngành của lệnh này")
    expect(o.textContent).not.toContain("0%")
    expect(o.textContent).not.toMatch(/\d/)
  })

  it("tổng rủi ro `null` → 'chưa tính được', TUYỆT ĐỐI không 0%", () => {
    renderModal({ kiemTra: kiemTra({ tongRuiRoPct: null }) })
    const o = screen.getByTestId("cap8-ketso-tongruiro")
    expect(o).toHaveTextContent("chưa tính được")
    expect(o.textContent).not.toContain("0%")
  })

  it("có vị thế chưa có cắt lỗ → caveat đi kèm ngay cạnh tổng rủi ro", () => {
    renderModal({ kiemTra: kiemTra({ soViTheThieuCatLo: 3 }) })
    const caveat = screen.getByTestId("cap8-ketso-caveat")
    expect(caveat).toHaveTextContent("3 vị thế chưa có cắt lỗ")
    expect(caveat).toHaveTextContent("chưa tính được rủi ro của các vị thế này")
  })

  it("hệ không ghi lại được số vị thế thiếu cắt lỗ → NÓI THẲNG, không im lặng", () => {
    // Đổi ĐÚNG MỘT biến so với test trên: `soViTheThieuCatLo`.
    renderModal({ kiemTra: kiemTra({ soViTheThieuCatLo: null }) })
    expect(screen.getByTestId("cap8-ketso-caveat")).toHaveTextContent(
      "Hệ chưa ghi lại được lúc đó có vị thế nào chưa đặt cắt lỗ hay không",
    )
  })

  it("caveat LUÔN có mặt ở nơi hiện tổng rủi ro, kể cả khi không thiếu gì", () => {
    renderModal()
    expect(screen.getByTestId("cap8-ketso-caveat")).toBeInTheDocument()
  })

  /**
   * ★ REGRESSION (fix wave FE-2). Với `tongRuiRoPct == null` VÀ
   * `soViTheThieuCatLo === 0`, hàng "Tổng vốn ở rủi ro" nói "chưa tính được" còn
   * dòng ngay bên dưới lại nói "…nên tổng ở trên là toàn bộ phần vốn ở rủi ro" —
   * mô tả một con số không hề có trên màn hình.
   *
   * Fixture đổi ĐÚNG MỘT biến so với test trên: `tongRuiRoPct`.
   */
  it("★ tổng rủi ro chưa ghi lại được → caveat KHÔNG nói về 'tổng ở trên'", () => {
    renderModal({ kiemTra: kiemTra({ tongRuiRoPct: null, soViTheThieuCatLo: 0 }) })
    const caveat = screen.getByTestId("cap8-ketso-caveat").textContent!
    expect(caveat).not.toMatch(/tổng ở trên là toàn bộ/)
    // Vẫn phải nói ra CẢ hai sự thật: mọi vị thế đã có cắt lỗ, nhưng tổng thì hệ
    // không ghi lại được — im lặng một trong hai là bỏ rơi người đọc.
    expect(caveat).toMatch(/đều đã có cắt lỗ/)
    expect(caveat).toMatch(/không ghi lại được/)
  })

  it("có tổng + không thiếu cắt lỗ → VẪN nói tổng là toàn bộ (không bị cắt oan)", () => {
    renderModal({ kiemTra: kiemTra({ tongRuiRoPct: 17, soViTheThieuCatLo: 0 }) })
    expect(screen.getByTestId("cap8-ketso-caveat").textContent).toMatch(
      /tổng ở trên là toàn bộ phần vốn ở rủi ro/,
    )
  })

  it("hàng tương quan chỉ hiện khi THẬT SỰ có cặp bị gắn cờ", () => {
    renderModal()
    expect(screen.queryByTestId("cap8-ketso-tuongquan")).not.toBeInTheDocument()

    renderModal({
      kiemTra: kiemTra({ tuongQuanCaoVoi: { symbol: "MBB", he_so: 0.82 } }),
    })
    expect(screen.getAllByTestId("cap8-ketso-tuongquan")[0]).toHaveTextContent("MBB (~0.82)")
  })

  it("lệnh sạch → dòng 'Lúc mua' nói không có cảnh báo, KHÔNG có ⚠", () => {
    renderModal({
      kiemTra: kiemTra({
        canhBao: [],
        canhBaoTen: [],
        canhBaoText: "",
        hanhVi: "khong_canh_bao",
        hanhViTen: "Không có cảnh báo",
      }),
    })
    const dong = screen.getByTestId("cap8-ketso-lucmua")
    expect(dong).toHaveTextContent("Không có cảnh báo danh mục nào")
    expect(dong.textContent).not.toContain("⚠")
  })

  it("câu §C12c của server hiện NGUYÊN VĂN", () => {
    renderModal()
    expect(screen.getByTestId("cap8-ketso-giaithich")).toHaveTextContent(
      "GIẢI THÍCH CẤP 8 CỦA SERVER",
    )
  })

  it("lệnh KHÔNG có dữ liệu Cấp 8 → bỏ HẲN khối, im lặng (không khối rỗng)", () => {
    renderModal({ kiemTra: null })
    expect(screen.queryByTestId("cap8-ketso-kiemtra")).not.toBeInTheDocument()
    expect(screen.queryByTestId("cap8-ketso-coach")).not.toBeInTheDocument()
    // …nhưng mọi khối Cấp 1-7 vẫn nguyên.
    expect(screen.getByTestId("cap7-ketso-docluc")).toBeInTheDocument()
    expect(screen.getByTestId("cap6-ketso-doichieu")).toBeInTheDocument()
  })

  it("lệnh có hàng kế hoạch nhưng CHƯA qua bước kiểm tra → cũng bỏ hẳn khối", () => {
    // Đổi ĐÚNG MỘT biến: `hanhVi` — hàng `order_kehoach` vẫn tồn tại.
    renderModal({ kiemTra: kiemTra({ hanhVi: null, hanhViTen: null }) })
    expect(screen.queryByTestId("cap8-ketso-kiemtra")).not.toBeInTheDocument()
    expect(screen.queryByTestId("cap8-ketso-coach")).not.toBeInTheDocument()
  })
})

// ── Lớp coach thứ 8 ─────────────────────────────────────────────────────────

describe("lớp coach thứ 8 (spec §6)", () => {
  it("ô 'nghe cảnh báo' — nguyên văn spec", () => {
    renderModal()
    const coach = screen.getByTestId("cap8-ketso-coach")
    expect(coach).toHaveTextContent("Có cảnh báo · đã điều chỉnh")
    expect(coach).toHaveTextContent("đúng tinh thần phân tán")
  })

  it("ô 'vẫn mua + thắng' — nối lại bài 'sai mà thắng' của Cấp 5", () => {
    renderModal({ kiemTra: kiemTra({ hanhVi: "van_mua", hanhViTen: "Vẫn mua" }) })
    const coach = screen.getByTestId("cap8-ketso-coach")
    expect(coach).toHaveTextContent("Cấp 5 đã dạy")
    expect(coach).toHaveTextContent("sai mà thắng")
    // Ô duy nhất được tô cảnh báo.
    expect(coach.className).toContain("cap8-coach--canhbao")
  })

  it("ô 'vẫn mua + thua' — KHÔNG quy nhân quả và KHÔNG tô cảnh báo", () => {
    renderModal({
      kiemTra: kiemTra({ hanhVi: "van_mua", hanhViTen: "Vẫn mua" }),
      exitPrice: 28_800, // −4.0%
    })
    const coach = screen.getByTestId("cap8-ketso-coach")
    expect(coach).toHaveTextContent("Không chắc thua vì điều đó")
    expect(coach.className).not.toContain("cap8-coach--canhbao")
  })

  it("KHÔNG dùng từ buộc tội ở bất kỳ ô nào", () => {
    for (const hv of ["giam_kl", "van_mua", "chon_ma_khac", "khong_canh_bao"] as const) {
      const { unmount } = renderModal({ kiemTra: kiemTra({ hanhVi: hv, hanhViTen: null }) })
      const text = screen.getByTestId("cap8-ketso-coach").textContent?.toLowerCase() ?? ""
      for (const tu of CAM_TU) expect(text).not.toContain(tu)
      unmount()
    }
  })
})

// ── Đóng kết sổ: chuỗi ghi + nhiệm vụ ② của Cấp 8 ───────────────────────────

describe("đóng kết sổ", () => {
  it("gọi PATCH /cap8/task cho nhiệm vụ ② (cùng Cấp 6/7)", async () => {
    const onClose = vi.fn()
    renderModal({}, { onClose })
    fireEvent.click(closeButton())
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(markCap8Task).toHaveBeenCalledWith(2)
    expect(markCap7Task).toHaveBeenCalledWith(2)
    expect(markCap6Task).toHaveBeenCalledWith(2)
  })

  it("ghi nhật ký (dùng chung nhật ký Cấp 7) + gọi onRecorded", async () => {
    const onRecorded = vi.fn()
    const onClose = vi.fn()
    renderModal({}, { onClose, onRecorded })
    fireEvent.click(closeButton())
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(onRecorded).toHaveBeenCalledTimes(1)
    expect(readCap7TradeLog("user-1")).toHaveLength(1)
    expect(readCap7TradeLog("user-1")[0].orderId).toBe("order-120")
  })

  it("nhật ký KHÔNG còn 3 trường của 4 ô (o4 / verdictHe / verdictUser)", async () => {
    const onClose = vi.fn()
    renderModal({}, { onClose })
    fireEvent.click(closeButton())
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    const [rec] = readCap7TradeLog("user-1") as unknown as Record<string, unknown>[]
    expect("o4" in rec).toBe(false)
    expect("verdictHe" in rec).toBe(false)
    expect("verdictUser" in rec).toBe(false)
    // Khối Cấp 6/7 của lệnh (độc lập với 4 ô) vẫn được ghi nguyên vẹn.
    expect(rec.khopGoiY).toBe(true)
    expect(rec.docLucDung).toBe(true)
  })

  it("khối Cấp 8 KHÔNG thêm cổng nào — và không còn cổng nào khác để phụ thuộc", () => {
    renderModal({ kiemTra: kiemTra({ hanhVi: "van_mua", hanhViTen: "Vẫn mua" }) })
    expect(closeButton()).not.toBeDisabled()
  })
})
