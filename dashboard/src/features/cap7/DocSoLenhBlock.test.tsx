import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import React, { useEffect, useState } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * Khối "Đọc sổ lệnh" (spec §4/§5, 🟢 THÊM MỚI) — Cấp 7's ONE insertion into the
 * buy panel: a reading layer over the bid/ask book that has been visible since
 * Cấp 2.
 *
 * ★ The four invariants this file exists to protect:
 *   1. **Nothing here ever blocks MUA** (spec §9: soft, nhiệm vụ ① only needs
 *      one recorded reading).
 *   2. **`trong_phien` comes from the SERVER**, never the browser clock.
 *   3. **A book with no dư on one side is reported as too thin to read** — never
 *      `Infinity`, never a fabricated band.
 *   4. **The cờ NEVER claims a fake order was detected.** It teaches skepticism:
 *      a large resting order MAY or may not be real.
 */

const { phienMock } = vi.hoisted(() => ({ phienMock: vi.fn() }))

vi.mock("./hooks", () => ({
  usePhienCap7: (...args: unknown[]) => phienMock(...args),
}))

import { DocSoLenhBlock } from "./DocSoLenhBlock"
import { Cap7Provider, useCap7Events } from "./Cap7Context"
import type { MucSoLenh } from "./docSoLenh"
import type { HanhViCo, LucDocUser, PhienCap7 } from "./types"

/* ── Wire fixtures: exactly what the BE publishes today ───────────────────── */

const COPY_CO_CANH_GIAC =
  "Lệnh treo to chưa chắc là cầu/cung thật — đôi khi là 'kê giá' rồi rút. Chờ nó KHỚP THẬT rồi hãy tin."

const COPY_NGOAI_GIO =
  "Sổ lệnh chỉ sống trong giờ giao dịch — quay lại lúc thị trường mở để đọc lực."

const COPY_TRONG_GIO =
  "Sổ lệnh đang sống: chỉ số Lực là ảnh chụp 3 mức dư mua / dư bán ngay lúc bạn nhìn, và nó đổi liên tục trong phiên — đọc để chọn thời điểm, đừng coi là dự báo."

const GIAI_THICH_CAU_AP_DAO =
  "Tổng dư MUA 3 mức đang lớn hơn tổng dư BÁN ít nhất 1.5 lần — bên mua xếp hàng dày hơn hẳn ngay lúc này. Đây là ảnh chụp tức thời của sổ lệnh, không phải dự báo giá."

const CHAM_GIAI_THICH =
  'Sau 2 phiên giao dịch kể từ ngày bạn mua, hệ lấy giá đóng cửa THẬT của phiên đó và so với giá bạn khớp: tăng quá 1.0% thì đọc "Cầu mạnh" là đúng.'

const QUY_TAC: PhienCap7["quy_tac"] = {
  nguong_cau_ap_dao: 1.5,
  nguong_cung_ap_dao: 1 / 1.5,
  bands: [
    {
      ma: "cau_ap_dao",
      ten: "Cầu áp đảo",
      dieu_kien_text: "Lực ≥ 1.50 : 1",
      giai_thich: GIAI_THICH_CAU_AP_DAO,
    },
    {
      ma: "can_bang",
      ten: "Cân bằng",
      dieu_kien_text: "0.67 : 1 < Lực < 1.50 : 1",
      giai_thich: "Dư mua và dư bán 3 mức xấp xỉ nhau.",
    },
    {
      ma: "cung_ap_dao",
      ten: "Cung áp đảo",
      dieu_kien_text: "Lực ≤ 0.67 : 1",
      giai_thich: "Tổng dư BÁN 3 mức đang lớn hơn tổng dư MUA ít nhất 1.5 lần.",
    },
  ],
  co_canh_giac_he_so: 3,
  co_canh_giac_min_muc: 3,
  co_canh_giac_copy: COPY_CO_CANH_GIAC,
  so_phien_cham: 2,
  dead_band_pct: 1,
  cham_giai_thich: CHAM_GIAI_THICH,
}

const TRONG_PHIEN: PhienCap7 = {
  trong_phien: true,
  gio_giao_dich_text:
    "Giờ giao dịch: 09:00–11:30 (phiên sáng) và 13:00–14:45 (phiên chiều), các ngày trong tuần.",
  giai_thich: COPY_TRONG_GIO,
  quy_tac: QUY_TAC,
}

const NGOAI_PHIEN: PhienCap7 = { ...TRONG_PHIEN, trong_phien: false, giai_thich: COPY_NGOAI_GIO }

/** spec §4's worked example: 1,240,000 dư mua vs 640,000 dư bán ≈ 1.9 : 1. */
const BID: MucSoLenh[] = [
  { price: 62.3, volume: 540_000 },
  { price: 62.2, volume: 400_000 },
  { price: 62.1, volume: 300_000 },
]
const ASK: MucSoLenh[] = [
  { price: 62.4, volume: 240_000 },
  { price: 62.5, volume: 220_000 },
  { price: 62.6, volume: 180_000 },
]

/** Same book with one wall on the bid side → the cờ trips at 62.0. */
const BID_CO_TUONG: MucSoLenh[] = [
  { price: 62.3, volume: 240_000 },
  { price: 62.2, volume: 200_000 },
  { price: 62.0, volume: 5_000_000 },
]

function mockPhien(state: Partial<{ data: PhienCap7 | undefined; isLoading: boolean; isError: boolean }>) {
  phienMock.mockReturnValue({ data: undefined, isLoading: false, isError: false, ...state })
}

interface HarnessProps {
  symbol?: string
  bid?: MucSoLenh[]
  ask?: MucSoLenh[]
  onLucShown?: (symbol: string, chiSo: number) => void
  onLucDoc?: (doc: LucDocUser) => void
  onCoShown?: (symbol: string, gia: number, kl: number) => void
  onCoHanhVi?: (hanhVi: HanhViCo) => void
}

/** Registers the bus handlers BEFORE the block, mirroring production. */
function Registrant(props: Omit<HarnessProps, "symbol" | "bid" | "ask">) {
  const bus = useCap7Events()
  useEffect(() => {
    bus.registerHandlers({
      ...(props.onLucShown ? { onLucShown: props.onLucShown } : {}),
      ...(props.onLucDoc ? { onLucDoc: props.onLucDoc } : {}),
      ...(props.onCoShown ? { onCoShown: props.onCoShown } : {}),
      ...(props.onCoHanhVi ? { onCoHanhVi: props.onCoHanhVi } : {}),
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return null
}

/** Controlled harness — `TradingPanel` owns the state, exactly as in the panel. */
function Harness({ symbol = "VCB", bid = BID, ask = ASK, ...handlers }: HarnessProps) {
  const [docLuc, setDocLuc] = useState<LucDocUser | null>(null)
  const [hanhViCo, setHanhViCo] = useState<HanhViCo | null>(null)

  return (
    <>
      <Registrant {...handlers} />
      <DocSoLenhBlock
        symbol={symbol}
        bid={bid}
        ask={ask}
        docLuc={docLuc}
        onDocLuc={setDocLuc}
        hanhViCo={hanhViCo}
        onHanhViCo={setHanhViCo}
      />
      <div data-testid="state">{`${docLuc ?? "-"}|${hanhViCo ?? "-"}`}</div>
    </>
  )
}

function renderBlock(props: HarnessProps = {}) {
  return render(
    <Cap7Provider>
      <Harness {...props} />
    </Cap7Provider>,
  )
}

beforeEach(() => {
  phienMock.mockReset()
  mockPhien({ data: TRONG_PHIEN })
})

describe("DocSoLenhBlock — ngoài giờ giao dịch (spec §4)", () => {
  beforeEach(() => mockPhien({ data: NGOAI_PHIEN }))

  it("hiện ĐÚNG ghi chú của spec, nguyên văn từ server", () => {
    renderBlock()
    expect(screen.getByTestId("cap7-ngoai-gio").textContent).toContain(COPY_NGOAI_GIO)
  })

  it("KHÔNG có ô đoán lực — sổ tĩnh thì không đọc được lực", () => {
    renderBlock()
    expect(screen.queryByTestId("cap7-picker")).not.toBeInTheDocument()
  })

  it("KHÔNG hiện gauge hay band cho một sổ đã đứng yên", () => {
    renderBlock()
    expect(screen.queryByTestId("cap7-gauge")).not.toBeInTheDocument()
    expect(screen.queryByTestId("cap7-band")).not.toBeInTheDocument()
  })

  it("nói rõ giờ giao dịch để user biết khi nào quay lại", () => {
    renderBlock()
    expect(screen.getByTestId("cap7-docsolenh").textContent).toMatch(/09:00/)
  })
})

describe("DocSoLenhBlock — trạng thái phiên LẤY TỪ SERVER, không từ đồng hồ máy", () => {
  it("đang hỏi server → chưa mở ô đoán (không đoán bừa là đang mở cửa)", () => {
    mockPhien({ isLoading: true })
    renderBlock()
    expect(screen.getByTestId("cap7-phien-loading")).toBeInTheDocument()
    expect(screen.queryByTestId("cap7-picker")).not.toBeInTheDocument()
  })

  it("không hỏi được server → nói thẳng, KHÔNG tự tính giờ mở cửa", () => {
    mockPhien({ isError: true })
    renderBlock()
    const note = screen.getByTestId("cap7-phien-error")
    expect(note.textContent).toMatch(/máy chủ/i)
    expect(screen.queryByTestId("cap7-picker")).not.toBeInTheDocument()
  })

  it("lỗi phiên KHÔNG chặn gì cả — khối chỉ là một lớp đọc thêm", () => {
    mockPhien({ isError: true })
    renderBlock()
    expect(screen.getByTestId("cap7-docsolenh").textContent).not.toMatch(/mới đặt được lệnh/i)
  })
})

describe("DocSoLenhBlock — chỉ số Lực + vì sao (spec §4, §C12c)", () => {
  it("hiện tổng dư MUA và BÁN theo định dạng en-US", () => {
    renderBlock()
    const tong = screen.getByTestId("cap7-tong-du")
    expect(tong.textContent).toContain("1,240,000")
    expect(tong.textContent).toContain("640,000")
  })

  it("hiện tỷ lệ và tên band của server (≈ 1.9 : 1 → Cầu áp đảo)", () => {
    renderBlock()
    const band = screen.getByTestId("cap7-band")
    expect(band.textContent).toContain("Cầu áp đảo")
    expect(band.textContent).toContain("1.9 : 1")
  })

  it("gauge vẽ đúng ví dụ của spec: 7 ô sáng / 10", () => {
    renderBlock()
    expect(screen.getByTestId("cap7-gauge").textContent).toBe("▓▓▓▓▓▓▓░░░")
  })

  it("hiện câu 'vì sao' NGUYÊN VĂN của server — không bao giờ số trơ", () => {
    renderBlock()
    expect(screen.getByTestId("cap7-vi-sao").textContent).toContain(GIAI_THICH_CAU_AP_DAO)
  })

  it("★ hiện NGƯỠNG CỦA SERVER cho band đang bật (FE không tự đặt ngưỡng)", () => {
    renderBlock()
    expect(screen.getByTestId("cap7-nguong").textContent).toContain("Lực ≥ 1.50 : 1")
  })

  it("★ ngưỡng đổi ở server thì band hiện ra đổi theo", () => {
    mockPhien({
      data: {
        ...TRONG_PHIEN,
        quy_tac: {
          ...QUY_TAC,
          nguong_cau_ap_dao: 3,
          nguong_cung_ap_dao: 1 / 3,
          bands: QUY_TAC.bands.map((b) =>
            b.ma === "can_bang" ? { ...b, dieu_kien_text: "0.33 : 1 < Lực < 3.00 : 1" } : b,
          ),
        },
      },
    })
    renderBlock()
    // Cùng sổ 1.9 : 1 — với ngưỡng 3.0 thì đây là "Cân bằng", không phải áp đảo.
    expect(screen.getByTestId("cap7-band").textContent).toContain("Cân bằng")
    expect(screen.getByTestId("cap7-nguong").textContent).toContain("3.00 : 1")
  })

  it("nói rõ sẽ chấm thế nào, nguyên văn câu của server (§C12c)", () => {
    renderBlock()
    expect(screen.getByTestId("cap7-cham-note").textContent).toContain(CHAM_GIAI_THICH)
  })
})

describe("DocSoLenhBlock — user TỰ đoán, hệ KHÔNG quyết thay (spec §4)", () => {
  it("đúng 3 lựa chọn của spec, đúng thứ tự", () => {
    renderBlock()
    const picker = screen.getByTestId("cap7-picker")
    const buttons = within(picker).getAllByRole("button")
    expect(buttons.map((b) => b.getAttribute("data-testid"))).toEqual([
      "cap7-doc-manh",
      "cap7-doc-can",
      "cap7-doc-yeu",
    ])
    expect(buttons.map((b) => b.textContent)).toEqual(["Cầu mạnh", "Cân bằng", "Cầu yếu"])
  })

  it("chọn → báo lên panel, nút đó thành trạng thái đang chọn", () => {
    renderBlock()
    fireEvent.click(screen.getByTestId("cap7-doc-yeu"))
    expect(screen.getByTestId("state").textContent).toBe("yeu|-")
    expect(screen.getByTestId("cap7-doc-yeu")).toHaveAttribute("aria-pressed", "true")
  })

  it("KHÔNG chọn sẵn / KHÔNG gợi ý đáp án theo band — user tự chốt", () => {
    renderBlock()
    for (const id of ["cap7-doc-manh", "cap7-doc-can", "cap7-doc-yeu"]) {
      expect(screen.getByTestId(id)).toHaveAttribute("aria-pressed", "false")
    }
  })

  it("bắn cap7Events.onLucDoc khi user chốt (analytics §8)", async () => {
    const onLucDoc = vi.fn()
    renderBlock({ onLucDoc })
    fireEvent.click(screen.getByTestId("cap7-doc-manh"))
    await waitFor(() => expect(onLucDoc).toHaveBeenCalledWith("manh"))
  })

  it("bắn cap7Events.onLucShown MỘT lần cho mỗi mã (analytics §8)", async () => {
    const onLucShown = vi.fn()
    renderBlock({ onLucShown })
    await waitFor(() => expect(onLucShown).toHaveBeenCalledTimes(1))
    expect(onLucShown).toHaveBeenCalledWith("VCB", expect.closeTo(1.9375, 4))
  })
})

describe("DocSoLenhBlock — sổ quá mỏng để đọc (★ không bao giờ Infinity)", () => {
  beforeEach(() => renderBlock({ ask: [] }))

  it("nói thẳng là sổ quá mỏng, KHÔNG bịa band", () => {
    expect(screen.getByTestId("cap7-mong").textContent).toMatch(/mỏng/i)
    expect(screen.queryByTestId("cap7-band")).not.toBeInTheDocument()
    expect(screen.queryByTestId("cap7-gauge")).not.toBeInTheDocument()
  })

  it("KHÔNG hiện Infinity / NaN ở bất cứ đâu", () => {
    const text = screen.getByTestId("cap7-docsolenh").textContent ?? ""
    expect(text).not.toMatch(/Infinity/i)
    expect(text).not.toMatch(/NaN/)
    expect(text).not.toMatch(/∞/)
  })

  it("KHÔNG mở ô đoán (không ghi được thì đừng bắt đoán)", () => {
    expect(screen.queryByTestId("cap7-picker")).not.toBeInTheDocument()
  })
})

describe("DocSoLenhBlock — cờ cảnh giác lệnh treo lớn (spec §5)", () => {
  it("có mức KL lớn bất thường → hiện cờ, gọi đúng tên giá và khối lượng", () => {
    renderBlock({ bid: BID_CO_TUONG })
    const co = screen.getByTestId("cap7-co")
    expect(co.textContent).toContain("62,000")
    expect(co.textContent).toContain("5,000,000")
  })

  it("hiện copy §5 NGUYÊN VĂN của server", () => {
    renderBlock({ bid: BID_CO_TUONG })
    expect(screen.getByTestId("cap7-co-copy").textContent).toContain(COPY_CO_CANH_GIAC)
  })

  it("nói rõ đây là heuristic hình dạng sổ, kèm hệ số của server", () => {
    renderBlock({ bid: BID_CO_TUONG })
    const honesty = screen.getByTestId("cap7-co-honesty")
    expect(honesty.textContent).toMatch(/3×|3 ×|3x/)
    expect(honesty.textContent).toMatch(/không kết luận|chưa kết luận/i)
  })

  it("sổ đều → KHÔNG có cờ (không kêu oan)", () => {
    renderBlock()
    expect(screen.queryByTestId("cap7-co")).not.toBeInTheDocument()
  })

  it("nút [Tôi hiểu — chờ xác nhận] ghi hành vi 'cho_xac_nhan'", async () => {
    const onCoHanhVi = vi.fn()
    renderBlock({ bid: BID_CO_TUONG, onCoHanhVi })
    fireEvent.click(screen.getByTestId("cap7-co-cho-xac-nhan"))
    expect(screen.getByTestId("state").textContent).toBe("-|cho_xac_nhan")
    await waitFor(() => expect(onCoHanhVi).toHaveBeenCalledWith("cho_xac_nhan"))
  })

  it("nói trước là mua luôn sẽ được ghi 'mua đuổi' — và KHÔNG bị phạt", () => {
    renderBlock({ bid: BID_CO_TUONG })
    const co = screen.getByTestId("cap7-co")
    expect(co.textContent).toMatch(/mua đuổi/i)
    expect(co.textContent).toMatch(/không phạt|không bị phạt/i)
  })

  it("bắn cap7Events.onCoShown một lần (analytics §8)", async () => {
    const onCoShown = vi.fn()
    renderBlock({ bid: BID_CO_TUONG, onCoShown })
    await waitFor(() => expect(onCoShown).toHaveBeenCalledTimes(1))
    // Giá đi kèm event ở đơn vị VND, giống mọi event giá khác của app.
    expect(onCoShown).toHaveBeenCalledWith("VCB", 62_000, 5_000_000)
  })

  it("ngoài giờ giao dịch KHÔNG hiện cờ (sổ tĩnh, không có gì đang treo)", () => {
    mockPhien({ data: NGOAI_PHIEN })
    renderBlock({ bid: BID_CO_TUONG })
    expect(screen.queryByTestId("cap7-co")).not.toBeInTheDocument()
  })
})

describe("★ DocSoLenhBlock — KHÔNG BAO GIỜ khẳng định đã phát hiện lệnh giả (spec §9)", () => {
  it("không có chữ 'lệnh giả' ở bất kỳ đâu trong khối khi cờ đang bật", () => {
    renderBlock({ bid: BID_CO_TUONG })
    const text = screen.getByTestId("cap7-docsolenh").textContent ?? ""
    expect(text).not.toMatch(/lệnh giả/i)
    expect(text).not.toMatch(/lệnh ảo/i)
    expect(text).not.toMatch(/giả mạo/i)
  })

  it("không tuyên bố 'phát hiện' / 'xác định' / 'chắc chắn' bất cứ điều gì", () => {
    renderBlock({ bid: BID_CO_TUONG })
    const text = screen.getByTestId("cap7-docsolenh").textContent ?? ""
    expect(text).not.toMatch(/phát hiện/i)
    expect(text).not.toMatch(/xác định được/i)
    expect(text).not.toMatch(/chắc chắn/i)
    expect(text).not.toMatch(/đang bị thao túng/i)
  })

  /**
   * ★ REGRESSION (fix wave FE-2). Bản cũ khớp `/chưa chắc/i` trên TOÀN khối, và
   * cụm đó đến từ `co_canh_giac_copy` của FIXTURE (câu của server), không phải từ
   * một chuỗi nào của frontend. Câu TỰ VIẾT của FE (`cap7-co-honesty`) nói "IQX
   * không kết luận gì" và không chứa "chưa chắc" — nên **xoá hẳn câu đó của FE
   * vẫn để test xanh**. Test này khoá đúng câu của FE.
   */
  it("★ FE tự nói: đây là cảnh giác theo HÌNH DẠNG sổ lệnh, IQX không kết luận gì", () => {
    renderBlock({ bid: BID_CO_TUONG })
    const honesty = screen.getByTestId("cap7-co-honesty").textContent!
    expect(honesty).toContain("HÌNH DẠNG sổ lệnh")
    expect(honesty).toContain("IQX không kết luận gì về lệnh treo đó")
    expect(honesty).toContain("chỉ nhắc bạn nhìn kỹ")
    // Ngưỡng in ra phải là của SERVER (`co_canh_giac_he_so = 3`), không phải một
    // con số FE tự khai.
    expect(honesty).toContain("3× trung bình các mức còn lại")
    // …và nó KHÔNG được chỉ là bản sao câu của server.
    expect(honesty).not.toBe(COPY_CO_CANH_GIAC)
  })

  it("câu NGUYÊN VĂN của server vẫn hiện đủ, cạnh câu của FE (§C12c)", () => {
    renderBlock({ bid: BID_CO_TUONG })
    expect(screen.getByTestId("cap7-co-copy").textContent).toBe(COPY_CO_CANH_GIAC)
  })
})

describe("★ DocSoLenhBlock — KHÔNG BAO GIỜ chặn MUA (spec §9)", () => {
  it("không có câu cổng cứng nào trong khối, kể cả khi chưa đoán gì", () => {
    renderBlock()
    const text = screen.getByTestId("cap7-docsolenh").textContent ?? ""
    expect(text).not.toMatch(/mới đặt được lệnh/i)
    expect(text).not.toMatch(/bắt buộc/i)
    expect(text).not.toMatch(/phải đọc/i)
  })

  it("nói rõ đọc lực là TÙY, bỏ qua vẫn đặt lệnh bình thường", () => {
    renderBlock()
    expect(screen.getByTestId("cap7-docsolenh").textContent).toMatch(/không bắt buộc|bỏ qua/i)
  })

  it("cờ đang bật vẫn KHÔNG chặn: không nút nào bị vô hiệu hoá", () => {
    renderBlock({ bid: BID_CO_TUONG })
    const buttons = within(screen.getByTestId("cap7-docsolenh")).getAllByRole("button")
    expect(buttons.length).toBeGreaterThan(0)
    for (const b of buttons) expect(b).not.toBeDisabled()
  })

  it("KHÔNG dùng đọc lực làm lý do mua chính (spec §9) — nhắc nó chỉ là thời điểm", () => {
    renderBlock()
    expect(screen.getByTestId("cap7-docsolenh").textContent).toMatch(/thời điểm/i)
  })
})
