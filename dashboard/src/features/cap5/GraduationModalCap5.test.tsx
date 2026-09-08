import { render, screen, fireEvent } from "@testing-library/react"
import React from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { Cap5Progress } from "./types"

/**
 * Màn tốt nghiệp Cấp 5 «Lão luyện — Săn mã» (spec §3).
 *
 * Ba luật bất di bất dịch được canh ở đây (cả ba đều đã từng bị vi phạm THẬT
 * trên repo này):
 *   1. **Chỉ ghi công việc user THẬT SỰ làm.** Cấp 5 mới đo đúng hai thứ: số mã
 *      săn vào Watchlist và số mã săn đã mua. Không một chữ nào về "4 ô", "đứng
 *      ngoài", "tỷ lệ quyết định đúng" (Cấp 5 CŨ), và cũng KHÔNG khen "việc săn
 *      đã mang lại lãi thật" — Cấp 5 KHÔNG đo lãi (spec §2 bỏ hẳn ngưỡng lãi).
 *   2. **CTA không bao giờ `disabled` kiểu "sắp ra mắt".** Modal
 *      `closable={false}` và chỉ unmount khi có `graduated_at` ⇒ nút tắt cứng
 *      nhốt vĩnh viễn user đã đủ điều kiện. Chỉ `isPending` được phép tắt nút.
 *   3. **Số nào chưa biết thì nói chưa biết** — `best_filter = null` là "chưa đủ
 *      dữ liệu", không phải một bộ lọc bất kỳ.
 */
const { useCap5ProgressMock, graduateMutate, enterCap6Mutate, capFlags, pending } = vi.hoisted(
  () => ({
    useCap5ProgressMock: vi.fn(),
    graduateMutate: vi.fn((_vars?: unknown, opts?: { onSuccess?: () => void }) => {
      opts?.onSuccess?.()
    }),
    enterCap6Mutate: vi.fn(),
    // ★★ MẶC ĐỊNH = TRẦN THẬT (`CAP_MAX_ENABLED` đang là 8 — Cấp 6 đã mở). Các
    // bài canh nhánh "chưa mở" tự đặt `capFlags.max = 5`, nên câu chữ của CẢ HAI
    // phía trần vẫn bị canh dù mặc định nằm ở phía "đã mở".
    capFlags: { max: 8 },
    pending: { current: false },
  }),
)

vi.mock("./hooks", () => ({
  useCap5Progress: (...a: unknown[]) => useCap5ProgressMock(...a),
  useGraduateCap5: () => ({ mutate: graduateMutate, isPending: pending.current }),
}))
vi.mock("@/features/cap6/hooks", () => ({
  useEnterCap6: () => ({ mutate: enterCap6Mutate, isPending: false }),
}))
vi.mock("@/features/cap1/capFlags", () => ({
  get CAP_MAX_ENABLED() {
    return capFlags.max
  },
}))

import { GraduationModalCap5, isGraduationReadyCap5 } from "./GraduationModalCap5"

function makeProgress(overrides: Partial<Cap5Progress> = {}): Cap5Progress {
  return {
    id: "p5",
    user_id: "u1",
    entered_at: "2026-08-20T00:00:00Z",
    task_1_done_at: "2026-08-25T00:00:00Z",
    task_2_done_at: "2026-08-25T00:00:00Z",
    so_ma_da_san: 34,
    so_ma_mua_tu_watchlist: 14,
    so_ma_cho_du_lop: 19,
    muc_tieu_so_ma_san: 10,
    muc_tieu_so_ma_mua: 5,
    da_xem_tour_sanma: true,
    best_filter: "ngoai",
    best_filter_ten: "Khối ngoại gom",
    graduated_at: null,
    time_to_graduate_hours: null,
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  capFlags.max = 8
  pending.current = false
  useCap5ProgressMock.mockReturnValue({ data: makeProgress() })
})

describe("isGraduationReadyCap5 — 2/2 nhiệm vụ (spec §3)", () => {
  it("chưa xong thì không mở", () => {
    expect(isGraduationReadyCap5(makeProgress({ task_1_done_at: null }))).toBe(false)
    expect(isGraduationReadyCap5(makeProgress({ task_2_done_at: null }))).toBe(false)
    expect(isGraduationReadyCap5(null)).toBe(false)
  })

  it("2/2 → mở", () => {
    expect(isGraduationReadyCap5(makeProgress())).toBe(true)
  })

  it("★ đã tốt nghiệp thì KHÔNG mở lại (một chiều)", () => {
    expect(isGraduationReadyCap5(makeProgress({ graduated_at: "2026-08-26T00:00:00Z" }))).toBe(
      false,
    )
  })
})

describe("GraduationModalCap5 — header (spec §3)", () => {
  it("tag HOÀN THÀNH + CẤP 5 · LÃO LUYỆN", () => {
    render(<GraduationModalCap5 />)
    expect(screen.getByText("HOÀN THÀNH")).toBeInTheDocument()
    expect(screen.getByText("CẤP 5 · LÃO LUYỆN")).toBeInTheDocument()
  })

  it("dòng phụ: săn X mã · mua Y mã (sàng lọc Z%) · bộ lọc mạnh nhất", () => {
    render(<GraduationModalCap5 />)
    const sub = screen.getByTestId("cap5-grad-sub")
    expect(sub).toHaveTextContent("săn 34 mã")
    expect(sub).toHaveTextContent("mua 14 mã")
    expect(sub).toHaveTextContent("sàng lọc 59%")
    expect(sub).toHaveTextContent("bộ lọc mạnh nhất: Khối ngoại gom")
  })

  it("★ chưa đủ dữ liệu để chốt bộ lọc mạnh nhất → nói thẳng", () => {
    useCap5ProgressMock.mockReturnValue({
      data: makeProgress({ best_filter: null, best_filter_ten: null }),
    })
    render(<GraduationModalCap5 />)
    const sub = screen.getByTestId("cap5-grad-sub")
    expect(sub).toHaveTextContent("bộ lọc mạnh nhất: chưa đủ dữ liệu để kết luận")
    for (const ten of ["Khối ngoại gom", "Tự doanh gom", "Vượt đỉnh 20 phiên"]) {
      expect(sub).not.toHaveTextContent(ten)
    }
  })

  it("★ chưa săn mã nào → KHÔNG in «sàng lọc NaN%» hay «sàng lọc 0%» bịa", () => {
    useCap5ProgressMock.mockReturnValue({
      data: makeProgress({ so_ma_da_san: 0, so_ma_mua_tu_watchlist: 0 }),
    })
    render(<GraduationModalCap5 />)
    const sub = screen.getByTestId("cap5-grad-sub")
    expect(sub).not.toHaveTextContent("sàng lọc")
    expect(sub.textContent).not.toContain("NaN")
    expect(sub.textContent).not.toContain("Infinity")
  })
})

describe("GraduationModalCap5 — Khối 1 chỉ ghi công 2 nhiệm vụ THẬT", () => {
  it("nói đúng số mã đã săn và đã mua", () => {
    render(<GraduationModalCap5 />)
    const k1 = screen.getByTestId("cap5-grad-khoi1")
    expect(k1).toHaveTextContent("34 mã")
    expect(k1).toHaveTextContent("14 mã")
    expect(k1).toHaveTextContent("chủ động đi săn")
  })

  // ★★ `document.body`, KHÔNG phải `container` của `render()`: Arco `Modal` vẽ
  // vào một portal ngoài container, nên `container.textContent` là chuỗi RỖNG và
  // mọi `not.toContain` trên nó đều xanh giả. Đã bắt được đúng lỗi đó ở đây bằng
  // đột biến (nhồi "lãi thật" vào Khối 1 mà bài vẫn xanh).
  it("★ TUYỆT ĐỐI không còn chữ nào của Cấp 5 CŨ (4 ô / quyết định đúng / phân loại)", () => {
    render(<GraduationModalCap5 />)
    expect(screen.getByTestId("cap5-grad-khoi1")).toBeInTheDocument()
    for (const tu of ["4 ô", "bốn ô", "quyết định đúng", "phân loại", "đúng/sai", "thắng hay thua"]) {
      expect(document.body.textContent).not.toContain(tu)
    }
  })

  // ★ "đứng ngoài" được phép xuất hiện ĐÚNG MỘT chỗ: Khối 3 tả những gì CẤP 6
  // sẽ dạy ("khi nào mâu thuẫn nghĩa là nên đứng ngoài" — verbatim spec §3). Nó
  // KHÔNG được xuất hiện ở phần GHI CÔNG (header + Khối 1), vì Cấp 5 mới không
  // có nhật ký đứng ngoài — khen nó là ghi công việc user chưa từng làm.
  it("★ «đứng ngoài» không được nằm trong phần ghi công (header + Khối 1)", () => {
    render(<GraduationModalCap5 />)
    expect(screen.getByTestId("cap5-grad-sub").textContent).not.toContain("ứng ngoài")
    expect(screen.getByTestId("cap5-grad-khoi1").textContent).not.toContain("ứng ngoài")
    // …và đúng là chỗ hợp lệ duy nhất có nó.
    expect(screen.getByTestId("cap5-grad-khoi3").textContent).toContain("đứng ngoài")
  })

  /**
   * ★★★ B7 — MÀN TỐT NGHIỆP KHÔNG GHI CÔNG VIỆC KHÔNG LÀM.
   *
   * Tỷ lệ sàng lọc 0% (mua hết số mã săn) nghĩa là user CHƯA loại mã nào. Câu
   * "biết loại bỏ những mã chưa chín" khi đó là khen một việc chưa xảy ra.
   */
  it("★★★ sàng lọc 0% → KHÔNG khen «biết loại bỏ», nói thẳng chưa loại mã nào", () => {
    useCap5ProgressMock.mockReturnValue({
      data: makeProgress({ so_ma_da_san: 12, so_ma_mua_tu_watchlist: 12 }),
    })
    render(<GraduationModalCap5 />)
    const k1 = screen.getByTestId("cap5-grad-khoi1")
    expect(k1).toHaveTextContent("chưa loại mã nào")
    expect(k1.textContent).not.toContain("biết loại bỏ")
    expect(k1.textContent).not.toContain("bản lĩnh của thợ săn")
    // …vẫn ghi công đúng hai nhiệm vụ ĐÃ làm.
    expect(k1).toHaveTextContent("12 mã")
    expect(k1).toHaveTextContent("hai nhiệm vụ của Cấp 5 đã xong")
  })

  it("★ mua NHIỀU HƠN số mã săn (wire lệch) cũng không được khen «biết lọc»", () => {
    useCap5ProgressMock.mockReturnValue({
      data: makeProgress({ so_ma_da_san: 5, so_ma_mua_tu_watchlist: 9 }),
    })
    render(<GraduationModalCap5 />)
    expect(screen.getByTestId("cap5-grad-khoi1").textContent).not.toContain("biết loại bỏ")
  })

  it("có sàng lọc thật → MỚI khen «biết loại bỏ những mã chưa chín»", () => {
    render(<GraduationModalCap5 />)
    const k1 = screen.getByTestId("cap5-grad-khoi1")
    expect(k1).toHaveTextContent("biết loại bỏ những mã chưa chín")
    expect(k1.textContent).not.toContain("chưa loại mã nào")
  })

  it("★ KHÔNG khen «lãi thật» — Cấp 5 không đo lãi (spec §2 bỏ ngưỡng lãi)", () => {
    render(<GraduationModalCap5 />)
    expect(screen.getByTestId("cap5-grad-khoi1")).toBeInTheDocument()
    expect(document.body.textContent).not.toContain("lãi thật")
    expect(document.body.textContent).not.toContain("mang lại lãi")
    // …và nói THẲNG rằng cấp này không đo lãi, để không ai suy ra ngược.
    expect(screen.getByTestId("cap5-grad-khoi1")).toHaveTextContent("không đo lãi")
  })
})

describe("GraduationModalCap5 — Khối 2 + Khối 3 hứa đúng Cấp 6 có thật", () => {
  it("Khối 2: các lớp mâu thuẫn nhau", () => {
    render(<GraduationModalCap5 />)
    const k2 = screen.getByTestId("cap5-grad-khoi2")
    expect(k2).toHaveTextContent("mâu thuẫn")
    expect(k2).toHaveTextContent("định giá đắt")
  })

  it("Khối 3: Cấp 6 dạy lớp nào có quyền phủ quyết", () => {
    capFlags.max = 6
    render(<GraduationModalCap5 />)
    const k3 = screen.getByTestId("cap5-grad-khoi3")
    expect(k3).toHaveTextContent("Cấp 6")
    expect(k3).toHaveTextContent("phủ quyết")
  })

  /**
   * ★★★ B2 — MỘT MÀN KHÔNG ĐƯỢC TỰ MÂU THUẪN.
   *
   * Ở trần thật (5), dòng dưới CTA nói "Cấp 6 sắp ra mắt". Khối 3 vì thế KHÔNG
   * được nói "**Cấp 6 đang chờ:**" ở thì hiện tại. Trước bản vá, `BLOCK_3` là
   * một hằng số duy nhất không gắn cờ trần nên màn nói cả hai câu, cách nhau ba
   * dòng — và CI không bắt được vì mặc định của file test này là `max = 6`.
   */
  it("★★★ trần còn ở 5 → Khối 3 nói Cấp 6 CHƯA ra mắt, không nói «đang chờ»", () => {
    capFlags.max = 5
    render(<GraduationModalCap5 />)
    const k3 = screen.getByTestId("cap5-grad-khoi3")
    expect(k3).toHaveTextContent("chưa ra mắt")
    expect(k3.textContent).not.toContain("Cấp 6 đang chờ")
    // …nhưng VẪN nói Cấp 6 sẽ dạy gì (user cần biết mình đang chờ điều gì).
    expect(k3).toHaveTextContent("phủ quyết")
    // …và không mâu thuẫn với dòng dưới CTA.
    expect(screen.getByTestId("cap5-grad-cta")).toHaveTextContent("sắp ra mắt")
  })

  it("★ trần ≥6 → dòng «sắp ra mắt» biến mất và Khối 3 về câu nguyên văn spec", () => {
    capFlags.max = 6
    render(<GraduationModalCap5 />)
    expect(screen.getByTestId("cap5-grad-khoi3")).toHaveTextContent("Cấp 6 đang chờ")
    expect(screen.getByTestId("cap5-grad-cta").textContent).not.toContain("sắp ra mắt")
  })

  /**
   * ★ Bài canh của LỚP lỗi: hai câu này loại trừ nhau tuyệt đối, ở CẢ HAI phía
   * của trần. Nếu ai đó thêm một hằng số thứ ba hay quên gắn cờ, bài này đỏ.
   */
  it.each([5, 6])("★ trần = %i → màn KHÔNG bao giờ chứa cả «đang chờ» lẫn «sắp ra mắt»", (max) => {
    capFlags.max = max
    render(<GraduationModalCap5 />)
    const text = document.body.textContent ?? ""
    const daMo = text.includes("Cấp 6 đang chờ")
    const chuaMo = text.includes("sắp ra mắt")
    expect(screen.getByTestId("cap5-grad-khoi3")).toBeInTheDocument()
    expect(daMo && chuaMo).toBe(false)
    expect(daMo || chuaMo).toBe(true)
  })
})

describe("GraduationModalCap5 — CTA (luật số 2: KHÔNG BAO GIỜ nhốt user)", () => {
  it("bấm CTA → ghi tốt nghiệp về server", () => {
    render(<GraduationModalCap5 />)
    fireEvent.click(screen.getByTestId("cap5-grad-cta"))
    expect(graduateMutate).toHaveBeenCalledTimes(1)
  })

  it("trần ≥6 → vào thẳng Cấp 6 sau khi tốt nghiệp", () => {
    capFlags.max = 6
    render(<GraduationModalCap5 />)
    fireEvent.click(screen.getByTestId("cap5-grad-cta"))
    expect(enterCap6Mutate).toHaveBeenCalledTimes(1)
  })

  it("★ trần còn ở 5 → CTA VẪN bấm được, vẫn ghi tốt nghiệp, KHÔNG tạo hàng Cấp 6", () => {
    capFlags.max = 5
    render(<GraduationModalCap5 />)
    const cta = screen.getByTestId("cap5-grad-cta")
    expect(cta).toBeEnabled()
    fireEvent.click(cta)
    expect(graduateMutate).toHaveBeenCalledTimes(1)
    expect(enterCap6Mutate).not.toHaveBeenCalled()
  })

  it("★ trần còn ở 5 → nói thẳng Cấp 6 sắp ra mắt (không im lặng)", () => {
    capFlags.max = 5
    render(<GraduationModalCap5 />)
    expect(screen.getByTestId("cap5-grad-cta")).toHaveTextContent("sắp ra mắt")
  })

  it("★ CTA chỉ bị tắt khi đang gửi (chặn double-submit), không vì lý do nào khác", () => {
    pending.current = true
    render(<GraduationModalCap5 />)
    expect(screen.getByTestId("cap5-grad-cta")).toBeDisabled()
  })

  it("modal không đóng được bằng tay (closable=false)", () => {
    render(<GraduationModalCap5 />)
    expect(document.querySelector(".arco-modal-close-icon")).toBeNull()
  })
})

describe("GraduationModalCap5 — chỉ hiện đúng lúc", () => {
  it("chưa xong 2/2 → không render nội dung", () => {
    useCap5ProgressMock.mockReturnValue({ data: makeProgress({ task_2_done_at: null }) })
    render(<GraduationModalCap5 />)
    expect(screen.queryByTestId("cap5-grad-khoi1")).not.toBeInTheDocument()
  })
})
