import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import React, { useEffect, useState } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { visibleText } from "@/__tests__/textGuards"
import type { Lop } from "@/features/cap4/types"

/**
 * Khối "Toàn cảnh 5 lớp + bảng mâu thuẫn + ô nhận định" (spec §5/§6).
 *
 * ★ Ba bất biến file này canh:
 *   1. bảng CHỈ hiện khi có ĐỒNG THỜI ≥1 lớp ủng hộ VÀ ≥1 lớp ngược;
 *   2. "chưa đủ dữ liệu" KHÔNG được nói thành "không có mâu thuẫn";
 *   3. ô nhận định là NHẬN ĐỊNH: không khoá gì, không nhắc cắt lỗ, không chỉnh
 *      khối lượng — và câu cảnh báo của server in NGUYÊN VĂN.
 */

const { mauThuanMock, progressMock, markTourMock } = vi.hoisted(() => ({
  mauThuanMock: vi.fn(),
  progressMock: vi.fn(),
  markTourMock: vi.fn(),
}))

vi.mock("./hooks", () => ({
  useMauThuanCap6: (...args: unknown[]) => mauThuanMock(...args),
  useCap6Progress: (...args: unknown[]) => progressMock(...args),
  useMarkTourMauThuan: () => ({ mutate: markTourMock, isPending: false }),
}))

import { MauThuanBlock } from "./MauThuanBlock"
import { Cap6Provider, useCap6Events } from "./Cap6Context"
import type { ConflictLevel, MauThuanCap6 } from "./mauThuanTypes"

const CANH_BAO =
  "Có 2 lớp phủ quyết đang ở mức rất xấu. Tin tức rất tiêu cực và lãnh đạo đang bán ra — những lớp này khi rất xấu có thể phủ định cả tín hiệu kỹ thuật đẹp. Đây là loại mâu thuẫn cần cân nhắc rất kỹ."

const LY_DO_CHUA_DU =
  "Mã BCD chưa được đọc đủ 5 lớp (IQX chỉ chạy phân tích cho mã bạn đã xem hoặc đã đưa vào Watchlist), nên chưa xét được mâu thuẫn."

/** Đúng bản mockup `iqx-cap6-datlenh.html`: 2 ủng hộ · 2 ngược (cả 2 phủ quyết) · 1 trung tính. */
const GEX: MauThuanCap6 = {
  co_mau_thuan: true,
  ung_ho: [
    { lop: "ky_thuat", nhan: "Mạnh", bac: 5 },
    { lop: "dong_tien", nhan: "Ủng hộ", bac: 4 },
  ],
  nguoc: [
    { lop: "noi_bo", nhan: "Lãnh đạo bán", bac: 1, la_phu_quyet: true },
    { lop: "tin_tuc", nhan: "Rất tiêu cực", bac: 1, la_phu_quyet: true },
  ],
  trung_tinh: [{ lop: "dinh_gia", nhan: "Trung tính" }],
  phu_quyet_kich_hoat: true,
  lop_phu_quyet_xau: ["noi_bo", "tin_tuc"],
  canh_bao: CANH_BAO,
  chua_du_du_lieu: false,
  ly_do_chua_du: null,
}

function loaded(data: MauThuanCap6) {
  return { data, isLoading: false, isError: false }
}

/** Bọc state của `nhanDinh` như `TradingPanel` làm (component là controlled). */
function Harness({ symbol = "GEX" }: { symbol?: string } = {}) {
  const [level, setLevel] = useState<ConflictLevel | null>(null)
  return (
    <Cap6Provider>
      <MauThuanBlock symbol={symbol} nhanDinh={level} onNhanDinh={setLevel} />
    </Cap6Provider>
  )
}

/**
 * Đăng ký handler THẬT lên bus Cấp 6 (không mock `Cap6Context`) rồi cho khối
 * render bên trong — cách duy nhất chứng minh khối bắn đúng sự kiện analytics
 * qua đúng cái bus mà `Cap6TradingPage` đăng ký.
 */
function BusSpy({
  children,
  onShown,
  onRated,
}: {
  children: React.ReactNode
  onShown?: (symbol: string, veto: Lop[]) => void
  onRated?: (symbol: string, level: ConflictLevel) => void
}) {
  return (
    <Cap6Provider>
      <Registrar onShown={onShown} onRated={onRated} />
      {children}
    </Cap6Provider>
  )
}

function Registrar({
  onShown,
  onRated,
}: {
  onShown?: (symbol: string, veto: Lop[]) => void
  onRated?: (symbol: string, level: ConflictLevel) => void
}) {
  const { registerHandlers } = useCap6Events()
  useEffect(() => {
    registerHandlers({ onMauThuanShown: onShown, onNhanDinhPicked: onRated })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registerHandlers])
  return null
}

beforeEach(() => {
  mauThuanMock.mockReset()
  progressMock.mockReset()
  markTourMock.mockReset()
  // Mặc định: server nói ĐÃ xem tour → không tự bật (từng bài tour tự đặt lại).
  progressMock.mockReturnValue({ data: { da_xem_tour_mauthuan: true } })
})

describe("MauThuanBlock — toàn cảnh 5 lớp", () => {
  it("đếm đúng 3 phe và ghép icon theo thứ tự chuẩn 5 lớp", () => {
    mauThuanMock.mockReturnValue(loaded(GEX))
    render(<Harness />)
    expect(screen.getByTestId("cap6-toancanh-score")).toHaveTextContent(
      "2 ủng hộ · 2 ngược · 1 trung tính",
    )
    expect(screen.getByTestId("cap6-toancanh-icons").textContent).toBe(
      "🎯✅ 💰✅ 👤❌ 📰❌ 💎⚪",
    )
  })

  it('mở/đóng "chi tiết" hiện nhãn từng lớp của server', () => {
    mauThuanMock.mockReturnValue(loaded(GEX))
    render(<Harness />)
    expect(screen.queryByTestId("cap6-toancanh-detail")).toBeNull()
    fireEvent.click(screen.getByTestId("cap6-toancanh"))
    const detail = screen.getByTestId("cap6-toancanh-detail")
    expect(within(detail).getByTestId("cap6-ld-tin_tuc")).toHaveTextContent("Rất tiêu cực")
    expect(within(detail).getByTestId("cap6-ld-ky_thuat")).toHaveTextContent("Mạnh")
    fireEvent.click(screen.getByTestId("cap6-toancanh"))
    expect(screen.queryByTestId("cap6-toancanh-detail")).toBeNull()
  })
})

describe("MauThuanBlock — bảng chỉ hiện khi CÓ CẢ HAI PHE (spec §5.1)", () => {
  it("có ủng hộ + có ngược → hiện bảng, chip hai phe, tag PHỦ QUYẾT", () => {
    mauThuanMock.mockReturnValue(loaded(GEX))
    render(<Harness />)
    expect(screen.getByTestId("cap6-bang-mau-thuan")).toBeInTheDocument()
    const ungHo = screen.getByTestId("cap6-phe-ungho")
    expect(ungHo).toHaveTextContent("🎯 Kỹ thuật · Mạnh")
    expect(ungHo).toHaveTextContent("💰 Dòng tiền · Ủng hộ")
    const nguoc = screen.getByTestId("cap6-phe-nguoc")
    expect(nguoc).toHaveTextContent("📰 Tin tức · Rất tiêu cực")
    expect(screen.getByTestId("cap6-veto-tin_tuc")).toHaveTextContent("PHỦ QUYẾT")
    expect(screen.getByTestId("cap6-veto-noi_bo")).toHaveTextContent("PHỦ QUYẾT")
  })

  it("lớp ngược KHÔNG phủ quyết thì KHÔNG có tag", () => {
    mauThuanMock.mockReturnValue(
      loaded({
        ...GEX,
        nguoc: [{ lop: "dinh_gia", nhan: "Đắt", bac: 2, la_phu_quyet: false }],
        trung_tinh: [],
        phu_quyet_kich_hoat: false,
        lop_phu_quyet_xau: [],
      }),
    )
    render(<Harness />)
    // Neo dương tính: bảng THẬT SỰ đã render với chip của lớp ngược.
    expect(screen.getByTestId("cap6-phe-nguoc")).toHaveTextContent("💎 Định giá · Đắt")
    expect(screen.queryByTestId("cap6-veto-dinh_gia")).toBeNull()
    expect(visibleText()).not.toContain("PHỦ QUYẾT")
  })

  it("chỉ có phe ủng hộ → KHÔNG bảng, KHÔNG ô nhận định, có câu giải thích", () => {
    mauThuanMock.mockReturnValue(
      loaded({
        ...GEX,
        co_mau_thuan: false,
        nguoc: [],
        trung_tinh: [{ lop: "dinh_gia", nhan: "Trung tính" }],
        phu_quyet_kich_hoat: false,
        lop_phu_quyet_xau: [],
        canh_bao: null,
      }),
    )
    render(<Harness />)
    expect(screen.queryByTestId("cap6-bang-mau-thuan")).toBeNull()
    expect(screen.queryByTestId("cap6-nhandinh")).toBeNull()
    expect(screen.getByTestId("cap6-khong-mau-thuan")).toHaveTextContent("không mâu thuẫn nhau")
  })

  it("server nói co_mau_thuan nhưng một phe rỗng → vẫn KHÔNG bảng", () => {
    mauThuanMock.mockReturnValue(loaded({ ...GEX, ung_ho: [] }))
    render(<Harness />)
    expect(screen.queryByTestId("cap6-bang-mau-thuan")).toBeNull()
    expect(screen.getByTestId("cap6-khong-mau-thuan")).toBeInTheDocument()
  })
})

describe("MauThuanBlock — 'chưa đủ dữ liệu' KHÁC 'không mâu thuẫn' (luật số 7)", () => {
  it("in NGUYÊN VĂN câu của server, và KHÔNG nói không có mâu thuẫn", () => {
    mauThuanMock.mockReturnValue(
      loaded({
        co_mau_thuan: false,
        ung_ho: [],
        nguoc: [],
        trung_tinh: [],
        phu_quyet_kich_hoat: false,
        lop_phu_quyet_xau: [],
        canh_bao: null,
        chua_du_du_lieu: true,
        ly_do_chua_du: LY_DO_CHUA_DU,
      }),
    )
    render(<Harness symbol="BCD" />)
    expect(screen.getByTestId("cap6-mauthuan-chuadu")).toHaveTextContent(LY_DO_CHUA_DU)
    expect(screen.queryByTestId("cap6-khong-mau-thuan")).toBeNull()
    expect(screen.queryByTestId("cap6-bang-mau-thuan")).toBeNull()
  })

  it("chưa đủ dữ liệu nhưng thiếu câu server → vẫn có câu riêng, không im lặng", () => {
    mauThuanMock.mockReturnValue(
      loaded({
        co_mau_thuan: false,
        ung_ho: [],
        nguoc: [],
        trung_tinh: [],
        phu_quyet_kich_hoat: false,
        lop_phu_quyet_xau: [],
        canh_bao: null,
        chua_du_du_lieu: true,
        ly_do_chua_du: null,
      }),
    )
    render(<Harness symbol="BCD" />)
    expect(screen.getByTestId("cap6-mauthuan-chuadu")).toHaveTextContent("Chưa đọc đủ 5 lớp")
  })

  it("lỗi query → nói thẳng chưa đọc được, KHÔNG khẳng định sạch mâu thuẫn", () => {
    mauThuanMock.mockReturnValue({ data: undefined, isLoading: false, isError: true })
    render(<Harness />)
    const box = screen.getByTestId("cap6-mauthuan-error")
    expect(box).toHaveTextContent("Chưa đọc được bản 5 lớp")
    expect(box).toHaveTextContent("Bạn vẫn đặt lệnh bình thường")
  })

  it("đang tải → một câu đang tải, không khẳng định gì", () => {
    mauThuanMock.mockReturnValue({ data: undefined, isLoading: true, isError: false })
    render(<Harness />)
    expect(screen.getByTestId("cap6-mauthuan-loading")).toBeInTheDocument()
    expect(screen.queryByTestId("cap6-bang-mau-thuan")).toBeNull()
  })
})

describe("MauThuanBlock — câu chữ của server + câu chốt", () => {
  it("dòng cảnh báo in NGUYÊN VĂN (§C12c)", () => {
    mauThuanMock.mockReturnValue(loaded(GEX))
    render(<Harness />)
    expect(screen.getByTestId("cap6-canh-bao")).toHaveTextContent(CANH_BAO)
  })

  it("không có cảnh báo → không dựng một dòng cảnh báo rỗng", () => {
    mauThuanMock.mockReturnValue(loaded({ ...GEX, canh_bao: null }))
    render(<Harness />)
    expect(screen.getByTestId("cap6-bang-mau-thuan")).toBeInTheDocument()
    expect(screen.queryByTestId("cap6-canh-bao")).toBeNull()
  })

  it('câu chốt "quyết định vẫn là của bạn" + chú thích khung tham khảo', () => {
    mauThuanMock.mockReturnValue(loaded(GEX))
    render(<Harness />)
    const text = visibleText()
    expect(text).toContain("IQX chỉ ra mâu thuẫn")
    expect(text).toContain("Quyết định vẫn là của bạn.")
    const chuThich = screen.getByTestId("cap6-chu-thich")
    expect(chuThich).toHaveTextContent("Lớp phủ quyết: 📰 Tin tức · 👤 Nội bộ")
    expect(chuThich).toHaveTextContent("Lớp điểm trừ: 🎯 Kỹ thuật · 💰 Dòng tiền · 💎 Định giá")
    expect(chuThich).toHaveTextContent("Khung tham khảo của IQX, không phải quy tắc bắt buộc")
  })
})

describe("MauThuanBlock — ô nhận định 4 mức (spec §6)", () => {
  it("có đủ 4 mức, chọn xong hiện phản hồi và aria-pressed", () => {
    mauThuanMock.mockReturnValue(loaded(GEX))
    render(<Harness />)
    for (const m of ["nhe", "ngai", "nghiem", "chua_ro"]) {
      expect(screen.getByTestId(`cap6-nhandinh-${m}`)).toBeInTheDocument()
    }
    expect(screen.queryByTestId("cap6-nhandinh-feedback")).toBeNull()
    fireEvent.click(screen.getByTestId("cap6-nhandinh-nghiem"))
    expect(screen.getByTestId("cap6-nhandinh-nghiem")).toHaveAttribute("aria-pressed", "true")
    expect(screen.getByTestId("cap6-nhandinh-feedback")).toHaveTextContent("nghiêm trọng")
  })

  it("KHÔNG nhắc cắt lỗ ở bất kỳ mức nào (spec §4.3/§6)", () => {
    mauThuanMock.mockReturnValue(loaded(GEX))
    render(<Harness />)
    for (const m of ["nhe", "ngai", "nghiem", "chua_ro"]) {
      fireEvent.click(screen.getByTestId(`cap6-nhandinh-${m}`))
      // Neo dương tính: phản hồi THẬT SỰ đã render cho mức này.
      expect(screen.getByTestId("cap6-nhandinh-feedback").textContent?.length ?? 0).toBeGreaterThan(
        20,
      )
      expect(visibleText()).not.toContain("cắt lỗ")
    }
  })

  it("khối KHÔNG chứa ô nhập khối lượng nào (spec §4.2 — không chỉnh hộ user)", () => {
    mauThuanMock.mockReturnValue(loaded(GEX))
    const { container } = render(<Harness />)
    expect(container.querySelectorAll("input")).toHaveLength(0)
  })
})

describe("MauThuanBlock — bus analytics + nút mở lại tour", () => {
  it("cap6_conflict_shown bắn đúng một lần với danh sách lớp phủ quyết xấu", () => {
    mauThuanMock.mockReturnValue(loaded(GEX))
    const seen: [string, Lop[]][] = []
    const { rerender } = render(
      <BusSpy onShown={(s, v) => seen.push([s, v])}>
        <MauThuanBlock symbol="GEX" nhanDinh={null} onNhanDinh={() => {}} />
      </BusSpy>,
    )
    rerender(
      <BusSpy onShown={(s, v) => seen.push([s, v])}>
        <MauThuanBlock symbol="GEX" nhanDinh="nhe" onNhanDinh={() => {}} />
      </BusSpy>,
    )
    expect(seen).toEqual([["GEX", ["noi_bo", "tin_tuc"]]])
  })

  it("KHÔNG bắn cap6_conflict_shown khi không có bảng nào hiện ra", () => {
    mauThuanMock.mockReturnValue(
      loaded({ ...GEX, chua_du_du_lieu: true, ly_do_chua_du: LY_DO_CHUA_DU }),
    )
    const seen: string[] = []
    render(
      <BusSpy onShown={(s) => seen.push(s)}>
        <MauThuanBlock symbol="GEX" nhanDinh={null} onNhanDinh={() => {}} />
      </BusSpy>,
    )
    // Neo dương tính: khối THẬT SỰ đã render (câu "chưa đủ dữ liệu").
    expect(screen.getByTestId("cap6-mauthuan-chuadu")).toBeInTheDocument()
    expect(seen).toEqual([])
  })

  it("cap6_conflict_rated bắn kèm mã + mức user chọn", () => {
    mauThuanMock.mockReturnValue(loaded(GEX))
    const rated: [string, ConflictLevel][] = []
    render(
      <BusSpy onRated={(s, l) => rated.push([s, l])}>
        <MauThuanBlock symbol="GEX" nhanDinh={null} onNhanDinh={() => {}} />
      </BusSpy>,
    )
    fireEvent.click(screen.getByTestId("cap6-nhandinh-ngai"))
    expect(rated).toEqual([["GEX", "ngai"]])
  })

  it("nút '?' mở lại tour «Xử lý mâu thuẫn» bất cứ lúc nào", () => {
    mauThuanMock.mockReturnValue(loaded(GEX))
    render(<Harness />)
    fireEvent.click(screen.getByRole("button", { name: /Hướng dẫn/ }))
    expect(screen.getByText("Khi các lớp không cùng chiều")).toBeInTheDocument()
  })
})

describe("MauThuanBlock — tour tự bật đúng một lần (spec §10)", () => {
  it("server nói da_xem_tour_mauthuan === false + CÓ bảng → tự bật", () => {
    mauThuanMock.mockReturnValue(loaded(GEX))
    progressMock.mockReturnValue({ data: { da_xem_tour_mauthuan: false } })
    render(<Harness />)
    expect(screen.getByText("Khi các lớp không cùng chiều")).toBeInTheDocument()
  })

  it("★ chưa biết (undefined) → KHÔNG tự bật", () => {
    mauThuanMock.mockReturnValue(loaded(GEX))
    progressMock.mockReturnValue({ data: undefined })
    render(<Harness />)
    // Neo dương tính: bảng mâu thuẫn THẬT SỰ đã render.
    expect(screen.getByTestId("cap6-bang-mau-thuan")).toBeInTheDocument()
    expect(screen.queryByText("Khi các lớp không cùng chiều")).toBeNull()
  })

  it("đã xem rồi → KHÔNG tự bật", () => {
    mauThuanMock.mockReturnValue(loaded(GEX))
    progressMock.mockReturnValue({ data: { da_xem_tour_mauthuan: true } })
    render(<Harness />)
    expect(screen.getByTestId("cap6-bang-mau-thuan")).toBeInTheDocument()
    expect(screen.queryByText("Khi các lớp không cùng chiều")).toBeNull()
  })

  it("chưa xem nhưng mã KHÔNG có mâu thuẫn → KHÔNG tự bật (bước 2/3 trỏ vào chỗ trống)", () => {
    mauThuanMock.mockReturnValue(loaded({ ...GEX, co_mau_thuan: false, nguoc: [] }))
    progressMock.mockReturnValue({ data: { da_xem_tour_mauthuan: false } })
    render(<Harness />)
    expect(screen.getByTestId("cap6-khong-mau-thuan")).toBeInTheDocument()
    expect(screen.queryByText("Khi các lớp không cùng chiều")).toBeNull()
  })

  it("★ «Bỏ qua» giữa tour KHÔNG ghi là đã xem", () => {
    mauThuanMock.mockReturnValue(loaded(GEX))
    progressMock.mockReturnValue({ data: { da_xem_tour_mauthuan: false } })
    render(<Harness />)
    fireEvent.click(screen.getByRole("button", { name: /Bỏ qua/ }))
    expect(markTourMock).not.toHaveBeenCalled()
  })

  it("đi HẾT 7 bước → POST /cap6/tour-mauthuan đúng một lần", async () => {
    mauThuanMock.mockReturnValue(loaded(GEX))
    progressMock.mockReturnValue({ data: { da_xem_tour_mauthuan: false } })
    render(<Harness />)
    // ★ `busy` của engine chặn double-click giữa lúc chuyển bước (~250ms), nên
    // phải CHỜ nút "Tiếp theo" nhận click lại — bấm liên tiếp đồng bộ chỉ ăn
    // đúng một bước và bài kiểm sẽ chỉ chứng minh được... một bước.
    for (let i = 0; i < 6; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await waitFor(() => {
        fireEvent.click(screen.getByRole("button", { name: "Tiếp theo →" }))
        expect(document.querySelector(".iqx-tour-counter")?.textContent).toContain(
          `${i + 2}/7`,
        )
      })
    }
    fireEvent.click(screen.getByRole("button", { name: "Hoàn thành ✓" }))
    expect(markTourMock).toHaveBeenCalledTimes(1)
  })
})
