import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import React, { useEffect, useState } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { Lop, Lop5Partial } from "@/features/cap4/types"

/**
 * Khối "Đối chiếu" (spec §4) — renders ONLY when the user's own 5-lớp ratings
 * conflict, shows the server's kiểu + trọng số gợi ý + **giải thích nguyên văn**
 * (§C12c), and lets the user pick ANY of the 5 lớp + write one line why.
 *
 * ★ The two invariants this file exists to protect (spec §5/§10):
 *   1. a pick OUTSIDE the gợi ý is NEVER framed as "sai";
 *   2. a failed/unclassified suggestion NEVER blocks the user from deciding.
 */

const { goiYMock } = vi.hoisted(() => ({ goiYMock: vi.fn() }))

vi.mock("./hooks", () => ({
  useGoiYCap6: (...args: unknown[]) => goiYMock(...args),
}))

import { DoiChieuBlock } from "./DoiChieuBlock"
import { Cap6Provider, useCap6Events } from "./Cap6Context"
import type { GoiYCap6, KieuCoPhieu } from "./types"

const CONFLICT: Lop5Partial = {
  ky_thuat: "ok",
  dong_tien: "ok",
  noi_bo: "neu",
  tin_tuc: "neu",
  dinh_gia: "bad",
}

const NO_CONFLICT: Lop5Partial = {
  ky_thuat: "ok",
  dong_tien: "ok",
  noi_bo: "neu",
  tin_tuc: "neu",
  dinh_gia: "neu",
}

/** Exactly what the BE returns for a bank (`KIEU_CO_PHIEU["ngan_hang"]`). */
const GIAI_THICH_NGAN_HANG =
  "Ngân hàng định giá theo P/B và chất lượng tài sản — tín hiệu kỹ thuật ngắn hạn ít tin cậy hơn cho nhóm này."

const GOI_Y_NGAN_HANG: GoiYCap6 = {
  symbol: "VCB",
  nganh: "Ngân hàng",
  kieu: "ngan_hang",
  kieu_ten: "Ngân hàng",
  lop_uu_tien: ["dinh_gia", "noi_bo"],
  lop_uu_tien_ten: ["Định giá", "Nội bộ"],
  lop_it_tin: ["ky_thuat"],
  lop_it_tin_ten: ["Kỹ thuật"],
  giai_thich: GIAI_THICH_NGAN_HANG,
}

/** The BE's honest "chưa phân loại" payload (`kieu === null`). */
const GIAI_THICH_CHUA_PHAN_LOAI =
  "Chưa phân loại được kiểu cổ phiếu cho ABC (hệ chưa có dữ liệu ngành cho mã này), nên lần này IQX không gợi ý trọng số lớp. Bước Đối chiếu vẫn hoạt động bình thường: bạn tự chọn lớp quyết định và ghi vì sao."

const GOI_Y_CHUA_PHAN_LOAI: GoiYCap6 = {
  symbol: "ABC",
  nganh: null,
  kieu: null,
  kieu_ten: null,
  lop_uu_tien: [],
  lop_uu_tien_ten: [],
  lop_it_tin: [],
  lop_it_tin_ten: [],
  giai_thich: GIAI_THICH_CHUA_PHAN_LOAI,
}

function mockGoiY(
  state: Partial<{ data: GoiYCap6 | undefined; isLoading: boolean; isError: boolean }>,
) {
  goiYMock.mockReturnValue({
    data: undefined,
    isLoading: false,
    isError: false,
    ...state,
  })
}

interface HarnessProps {
  doc5Lop?: Lop5Partial
  symbol?: string
  onPicked?: (lop: Lop, khop: boolean | null) => void
  onShown?: (symbol: string, kieu: KieuCoPhieu | null) => void
}

/**
 * Registers the bus handlers. Rendered BEFORE the block so its effect runs
 * first — mirrors production, where FE2's page registers handlers before the
 * panel's async gợi ý resolves.
 */
function Registrant({ onPicked, onShown }: Pick<HarnessProps, "onPicked" | "onShown">) {
  const bus = useCap6Events()
  useEffect(() => {
    bus.registerHandlers({
      ...(onPicked ? { onLopQuyetDinhPicked: onPicked } : {}),
      ...(onShown ? { onConflictShown: onShown } : {}),
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return null
}

/** Controlled harness — `TradingPanel` owns the state, exactly as in the panel. */
function Harness({ doc5Lop = CONFLICT, symbol = "VCB", onPicked, onShown }: HarnessProps) {
  const [lop, setLop] = useState<Lop | null>(null)
  const [lyDo, setLyDo] = useState("")
  const [kieu, setKieu] = useState<KieuCoPhieu | null>(null)

  return (
    <>
      <Registrant onPicked={onPicked} onShown={onShown} />
      <DoiChieuBlock
        symbol={symbol}
        doc5Lop={doc5Lop}
        lopQuyetDinh={lop}
        onLopQuyetDinh={setLop}
        lyDo={lyDo}
        onLyDo={setLyDo}
        kieuCoPhieu={kieu}
        onKieuCoPhieu={setKieu}
      />
      <div data-testid="state">{`${lop ?? "-"}|${lyDo}|${kieu ?? "-"}`}</div>
    </>
  )
}

function renderBlock(props: HarnessProps = {}) {
  return render(
    <Cap6Provider>
      <Harness {...props} />
    </Cap6Provider>,
  )
}

beforeEach(() => {
  goiYMock.mockReset()
  mockGoiY({ data: GOI_Y_NGAN_HANG })
})

describe("DoiChieuBlock — CHỈ hiện khi 5 lớp mâu thuẫn (spec §4)", () => {
  it("KHÔNG render gì khi các lớp không mâu thuẫn", () => {
    renderBlock({ doc5Lop: NO_CONFLICT })
    expect(screen.queryByTestId("cap6-doichieu")).not.toBeInTheDocument()
  })

  it("KHÔNG render gì khi chưa chấm lớp nào", () => {
    renderBlock({ doc5Lop: {} })
    expect(screen.queryByTestId("cap6-doichieu")).not.toBeInTheDocument()
  })

  it("KHÔNG gọi gợi ý theo kiểu khi chưa có mâu thuẫn (không tốn request)", () => {
    renderBlock({ doc5Lop: NO_CONFLICT })
    expect(goiYMock).toHaveBeenCalledWith("VCB", false)
  })

  it("render khi có ≥1 lớp Ủng hộ VÀ ≥1 lớp Ngược chiều", () => {
    renderBlock()
    expect(screen.getByTestId("cap6-doichieu")).toBeInTheDocument()
    expect(screen.getByTestId("cap6-doichieu").textContent).toMatch(/mâu thuẫn/i)
    // Câu hỏi nhắc đúng mã đang xem (spec §4's "VỚI {MÃ}, TIN LỚP NÀO?").
    expect(screen.getByTestId("cap6-doichieu").textContent).toMatch(/VCB/)
  })

  it("tách rõ phía Ủng hộ và phía Ngược chiều, theo thứ tự chuẩn", () => {
    renderBlock()
    const ungHo = screen.getByTestId("cap6-ung-ho")
    expect(ungHo.textContent).toMatch(/Ủng hộ/)
    expect(ungHo.textContent).toMatch(/Kỹ thuật/)
    expect(ungHo.textContent).toMatch(/Dòng tiền/)
    expect(ungHo.textContent).not.toMatch(/Định giá/)

    const nguoc = screen.getByTestId("cap6-nguoc-chieu")
    expect(nguoc.textContent).toMatch(/Ngược chiều/)
    expect(nguoc.textContent).toMatch(/Định giá/)
    expect(nguoc.textContent).not.toMatch(/Kỹ thuật/)
  })
})

describe("DoiChieuBlock — kiểu cổ phiếu + trọng số gợi ý nguyên văn (§C12c)", () => {
  it("hiện kiểu cổ phiếu server suy ra từ ngành", () => {
    renderBlock()
    const kieu = screen.getByTestId("cap6-kieu")
    expect(kieu.textContent).toMatch(/Ngân hàng/)
  })

  it("hiện lớp ưu tiên + lớp ít tin hơn của kiểu đó", () => {
    renderBlock()
    const uuTien = screen.getByTestId("cap6-uu-tien")
    expect(uuTien.textContent).toMatch(/Định giá/)
    expect(uuTien.textContent).toMatch(/Nội bộ/)

    const itTin = screen.getByTestId("cap6-it-tin")
    expect(itTin.textContent).toMatch(/Kỹ thuật/)
  })

  it("hiện câu 'vì sao' NGUYÊN VĂN của server — không bao giờ gợi ý trơ", () => {
    renderBlock()
    expect(screen.getByTestId("cap6-giai-thich").textContent).toContain(GIAI_THICH_NGAN_HANG)
  })

  it("KHÔNG có ô chọn kiểu khi server đã phân loại được (kiểu do ngành, không tự gán)", () => {
    renderBlock()
    expect(screen.queryByTestId("cap6-kieu-picker")).not.toBeInTheDocument()
  })
})

describe("DoiChieuBlock — kiểu 'chưa phân loại' (kieu === null, spec §4/§10)", () => {
  beforeEach(() => {
    mockGoiY({ data: GOI_Y_CHUA_PHAN_LOAI })
  })

  it("nói thẳng là chưa phân loại, nguyên văn câu của server", () => {
    renderBlock({ symbol: "ABC" })
    expect(screen.getByTestId("cap6-chua-phan-loai")).toBeInTheDocument()
    expect(screen.getByTestId("cap6-giai-thich").textContent).toContain(
      GIAI_THICH_CHUA_PHAN_LOAI,
    )
  })

  it("MỞ ô chọn kiểu — đúng 6 kiểu của spec §5", () => {
    renderBlock({ symbol: "ABC" })
    const picker = screen.getByTestId("cap6-kieu-picker")
    for (const kieu of [
      "ngan_hang",
      "tang_truong",
      "chu_ky",
      "phong_thu",
      "bat_dong_san",
      "dau_co_nho",
    ]) {
      expect(within(picker).getByTestId(`cap6-kieu-pick-${kieu}`)).toBeInTheDocument()
    }
  })

  it("chọn kiểu → lưu vào state của panel (đường duy nhất kiểu do client quyết)", () => {
    renderBlock({ symbol: "ABC" })
    fireEvent.click(screen.getByTestId("cap6-kieu-pick-dau_co_nho"))
    expect(screen.getByTestId("state").textContent).toMatch(/dau_co_nho/)
  })

  it("VẪN cho chọn lớp quyết định + ghi lý do dù không có gợi ý", () => {
    renderBlock({ symbol: "ABC" })
    fireEvent.click(screen.getByTestId("cap6-lop-dong_tien"))
    fireEvent.change(screen.getByTestId("cap6-ly-do"), {
      target: { value: "dòng tiền lớn vào 3 phiên" },
    })
    expect(screen.getByTestId("state").textContent).toBe(
      "dong_tien|dòng tiền lớn vào 3 phiên|-",
    )
  })
})

describe("DoiChieuBlock — chọn lớp quyết định + lý do (spec §4)", () => {
  it("có đủ 5 lớp để chọn, theo thứ tự chuẩn", () => {
    renderBlock()
    const picker = screen.getByTestId("cap6-lop-picker")
    const buttons = within(picker).getAllByRole("button")
    expect(buttons).toHaveLength(5)
    expect(buttons.map((b) => b.getAttribute("data-testid"))).toEqual([
      "cap6-lop-ky_thuat",
      "cap6-lop-dong_tien",
      "cap6-lop-noi_bo",
      "cap6-lop-tin_tuc",
      "cap6-lop-dinh_gia",
    ])
  })

  it("chọn lớp → báo lên panel, nút đó thành trạng thái đang chọn", () => {
    renderBlock()
    fireEvent.click(screen.getByTestId("cap6-lop-dinh_gia"))
    expect(screen.getByTestId("state").textContent).toMatch(/^dinh_gia\|/)
    expect(screen.getByTestId("cap6-lop-dinh_gia")).toHaveAttribute("aria-pressed", "true")
  })

  it("ô lý do 1 dòng BẮT BUỘC — nhắc rõ là bắt buộc", () => {
    renderBlock()
    fireEvent.change(screen.getByTestId("cap6-ly-do"), { target: { value: "P/B 1.2 rẻ" } })
    expect(screen.getByTestId("state").textContent).toContain("P/B 1.2 rẻ")
    expect(screen.getByTestId("cap6-doichieu").textContent).toMatch(/Vì sao/i)
  })

  it("bắn cap6Events.onConflictShown khi bước Đối chiếu hiện (analytics §9)", async () => {
    const onShown = vi.fn()
    renderBlock({ onShown })
    await waitFor(() => expect(onShown).toHaveBeenCalledWith("VCB", "ngan_hang"))
  })

  it("KHÔNG bắn onConflictShown khi không có mâu thuẫn", () => {
    const onShown = vi.fn()
    renderBlock({ doc5Lop: NO_CONFLICT, onShown })
    expect(onShown).not.toHaveBeenCalled()
  })

  it("bắn cap6Events.onLopQuyetDinhPicked kèm khớp-gợi-ý (sự thật trung tính)", async () => {
    const onPicked = vi.fn()
    renderBlock({ onPicked })
    fireEvent.click(screen.getByTestId("cap6-lop-dinh_gia"))
    await waitFor(() => expect(onPicked).toHaveBeenCalledWith("dinh_gia", true))

    fireEvent.click(screen.getByTestId("cap6-lop-ky_thuat"))
    await waitFor(() => expect(onPicked).toHaveBeenLastCalledWith("ky_thuat", false))
  })
})

describe("DoiChieuBlock — lệch gợi ý là TRUNG TÍNH, không bao giờ 'sai' (spec §5/§10)", () => {
  it("chọn lớp NGOÀI gợi ý vẫn nhận bình thường, không hiện chữ 'sai'", () => {
    renderBlock()
    // 🎯 Kỹ thuật là lớp server xếp "ít tin hơn" cho ngân hàng.
    fireEvent.click(screen.getByTestId("cap6-lop-ky_thuat"))
    expect(screen.getByTestId("state").textContent).toMatch(/^ky_thuat\|/)

    const block = screen.getByTestId("cap6-doichieu")
    expect(block.textContent).not.toMatch(/sai/i)
    expect(block.textContent).not.toMatch(/không nên/i)
    // Không dán nhãn khớp/lệch ngay lúc đặt lệnh — đó là việc của Kết sổ.
    expect(block.textContent).not.toMatch(/lệch gợi ý/i)
  })

  it("nói rõ trọng số là GỢI Ý để cân nhắc, không phải luật", () => {
    renderBlock()
    const note = screen.getByTestId("cap6-goi-y-note")
    expect(note.textContent).toMatch(/gợi ý/i)
    expect(note.textContent).toMatch(/không phải luật/i)
  })
})

describe("DoiChieuBlock — degrade khi không lấy được gợi ý", () => {
  it("đang tải: nói đang tải, VẪN cho chọn lớp + ghi lý do", () => {
    mockGoiY({ isLoading: true })
    renderBlock()
    expect(screen.getByTestId("cap6-goi-y-loading")).toBeInTheDocument()
    fireEvent.click(screen.getByTestId("cap6-lop-noi_bo"))
    expect(screen.getByTestId("state").textContent).toMatch(/^noi_bo\|/)
  })

  it("lỗi/404 (chưa vào Cấp 6): báo trung thực, KHÔNG chặn quyết định", () => {
    mockGoiY({ isError: true })
    renderBlock()
    expect(screen.getByTestId("cap6-doichieu")).toBeInTheDocument()
    expect(screen.getByTestId("cap6-goi-y-error").textContent).toMatch(/chưa/i)
    fireEvent.click(screen.getByTestId("cap6-lop-tin_tuc"))
    fireEvent.change(screen.getByTestId("cap6-ly-do"), { target: { value: "tin ngành" } })
    expect(screen.getByTestId("state").textContent).toBe("tin_tuc|tin ngành|-")
  })

  it("lỗi gợi ý → KHÔNG bịa kiểu, cũng KHÔNG mở ô chọn kiểu", () => {
    mockGoiY({ isError: true })
    renderBlock()
    expect(screen.queryByTestId("cap6-kieu")).not.toBeInTheDocument()
    expect(screen.queryByTestId("cap6-kieu-picker")).not.toBeInTheDocument()
  })
})
