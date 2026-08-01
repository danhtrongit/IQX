import { fireEvent, render, screen } from "@testing-library/react"
import React, { useState } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * Khối "Kiểm tra danh mục" (spec §4, 🟢 THÊM MỚI) — Cấp 8's ONE insertion into
 * the buy panel, right before xác nhận MUA.
 *
 * ★ The five invariants this file exists to protect:
 *   1. **Nothing here ever blocks MUA** (spec §9/§C8: cảnh báo MỀM). A failed
 *      check degrades OPEN — an honest note, and the order still goes through.
 *   2. **The three-choice row appears ONLY when a warning actually fired.** With
 *      no warning there is nothing to respond to, and the server rejects a
 *      `van_mua` on a clean order with 400.
 *   3. **"Vẫn mua" is a first-class choice**, never styled as the wrong answer.
 *   4. **The block computes NO measure of its own** — it renders the server's
 *      `giai_thich` strings verbatim.
 *   5. **An unknown is never rendered as a zero.** `tuong_quan_du_lieu = false`
 *      says "chưa đủ dữ liệu", never `0.00`; `so_vi_the_thieu_cat_lo` is stated
 *      out loud, not hidden behind a confident-looking total.
 */

const { kiemTraMock } = vi.hoisted(() => ({ kiemTraMock: vi.fn() }))
vi.mock("./hooks", () => ({
  useKiemTraCap8: (...args: unknown[]) => kiemTraMock(...args),
}))

import { Cap8Provider, useCap8Events } from "./Cap8Context"
import { KiemTraDanhMucBlock } from "./KiemTraDanhMucBlock"
import type { HanhViCanhBao, KiemTraCap8, LoaiCanhBao, QuyTacCap8 } from "./types"

/* ── Wire fixtures: exactly what the BE publishes today ───────────────────── */

const QUY_TAC: QuyTacCap8 = {
  nguong_don_nganh_pct: 40,
  nguong_tuong_quan: 0.7,
  tuong_quan_min_ty_trong_pct: 5,
  tuong_quan_min_phien: 60,
  so_phien_lich_su: 120,
  khau_vi_tran_pct: { than_trong: 10, can_bang: 20, tan_cong: 30 },
  cua_so_bat_chap: 15,
  bat_chap_toi_da: 2,
  so_lenh_kiem_tra_min: 15,
  cross_ref_pm:
    "Muốn phân tích sâu hơn (stress test, đóng góp lãi/lỗ)? Mở 'Phân tích danh mục' (Người quản lý danh mục).",
}

const GT_DON_NGANH =
  "Ngành Ngân hàng: 31.0% danh mục hiện tại → 46.0% sau lệnh này (tính trên NAV 1,000,000,000đ, theo ngành ICB của từng mã). Ngưỡng cảnh báo: trên 40%. Một cú sốc của ngành này sẽ chạm phần lớn danh mục cùng lúc."
const GT_TUONG_QUAN =
  "VCB đi cùng nhịp với MBB bạn đang giữ (hệ số 0.82, tính trên 120 phiên gần nhất; ngưỡng cảnh báo 0.7) — mua thêm không thật sự phân tán rủi ro."
const GT_TONG_RUI_RO =
  "Tổng vốn ở rủi ro: 12.0% → 17.0% sau lệnh này — tổng phần vốn sẽ mất nếu mọi cắt lỗ bị chạm (cộng tỷ trọng từng vị thế × khoảng cách tới cắt lỗ của chính nó)."
const GT_TRAN_KHAU_VI =
  "Trần khẩu vị Cân bằng: 20%. Lưu ý hai con số này KHÔNG cùng một nghĩa: 20% vốn là trần cho một lệnh (cách bạn đặt ở Cấp 3), còn tổng vốn ở rủi ro là phần vốn mất nếu mọi cắt lỗ bị chạm trên cả danh mục. Cấp 8 mượn lại chính con số đó làm mức trần cho cả danh mục."

const CANH_BAO_DON_NGANH = {
  ma: "don_nganh" as LoaiCanhBao,
  ten: "Dồn ngành",
  text: "Dồn ngành Ngân hàng: 46.0% danh mục sau lệnh này (ngưỡng 40%).",
}
const CANH_BAO_TUONG_QUAN = {
  ma: "tuong_quan" as LoaiCanhBao,
  ten: "Tương quan cao",
  text: "VCB đi cùng nhịp với MBB bạn đang giữ (hệ số 0.82) — mua thêm không thật sự phân tán rủi ro.",
}

/** A check where BOTH dồn ngành and tương quan fired. */
const CO_CANH_BAO: KiemTraCap8 = {
  symbol: "VCB",
  khoi_luong: 200,
  gia: 62_400,
  cat_lo: 60_400,
  gia_tri_lenh_vnd: 12_480_000,
  nav_vnd: 1_000_000_000,
  so_vi_the: 4,
  so_vi_the_thieu_cat_lo: 0,
  so_vi_the_thieu_gia: 0,
  nganh: "Ngân hàng",
  don_nganh_pct_truoc: 31,
  don_nganh_pct_sau: 46,
  don_nganh_canh_bao: true,
  tuong_quan: { symbol: "MBB", he_so: 0.82 },
  tuong_quan_canh_bao: true,
  tuong_quan_du_lieu: true,
  tong_rui_ro_pct_truoc: 12,
  tong_rui_ro_pct_sau: 17,
  tong_rui_ro_canh_bao: false,
  khau_vi: "can_bang",
  khau_vi_ten: "Cân bằng",
  tran_khau_vi_pct: 20,
  canh_bao: [CANH_BAO_DON_NGANH, CANH_BAO_TUONG_QUAN],
  giai_thich: {
    don_nganh: GT_DON_NGANH,
    tuong_quan: GT_TUONG_QUAN,
    tong_rui_ro: GT_TONG_RUI_RO,
    tran_khau_vi: GT_TRAN_KHAU_VI,
  },
  cross_ref_pm: QUY_TAC.cross_ref_pm,
  quy_tac: QUY_TAC,
}

/**
 * ★ The SAME check with NOTHING fired — the fixture varies exactly one thing
 * (the warning list + the two `*_canh_bao` flags that produced it), so a test
 * that passes on both is really testing the warning state and not some other
 * difference that came along for the ride.
 */
const KHONG_CANH_BAO: KiemTraCap8 = {
  ...CO_CANH_BAO,
  don_nganh_pct_sau: 22,
  don_nganh_canh_bao: false,
  tuong_quan: { symbol: "MBB", he_so: 0.31 },
  tuong_quan_canh_bao: false,
  canh_bao: [],
}

function mockCheck(
  state: Partial<{ data: KiemTraCap8 | undefined; isLoading: boolean; isError: boolean }>,
) {
  kiemTraMock.mockReturnValue({
    data: undefined,
    isLoading: false,
    isError: false,
    ...state,
  })
}

interface HarnessProps {
  onCheckShown?: (symbol: string, canhBao: LoaiCanhBao[]) => void
  onCheckHanhVi?: (hanhVi: HanhViCanhBao) => void
  onGiamKhoiLuong?: () => void
  onChonMaKhac?: () => void
  symbol?: string
}

/** Registers the bus handlers BEFORE the block, mirroring production. */
function Registrant(props: Pick<HarnessProps, "onCheckShown" | "onCheckHanhVi">) {
  const bus = useCap8Events()
  React.useEffect(() => {
    bus.registerHandlers({
      ...(props.onCheckShown ? { onCheckShown: props.onCheckShown } : {}),
      ...(props.onCheckHanhVi ? { onCheckHanhVi: props.onCheckHanhVi } : {}),
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return null
}

/** Controlled harness — `TradingPanel` owns the state, exactly as in the panel. */
function Harness({
  onCheckShown,
  onCheckHanhVi,
  onGiamKhoiLuong = () => {},
  onChonMaKhac = () => {},
  symbol = "VCB",
}: HarnessProps) {
  const [hanhVi, setHanhVi] = useState<HanhViCanhBao | null>(null)
  return (
    <>
      <Registrant onCheckShown={onCheckShown} onCheckHanhVi={onCheckHanhVi} />
      <KiemTraDanhMucBlock
        symbol={symbol}
        khoiLuong={200}
        gia={62_400}
        catLo={60_400}
        hanhVi={hanhVi}
        onHanhVi={setHanhVi}
        onGiamKhoiLuong={onGiamKhoiLuong}
        onChonMaKhac={onChonMaKhac}
      />
    </>
  )
}

function renderBlock(props: HarnessProps = {}) {
  return render(
    <Cap8Provider>
      <Harness {...props} />
    </Cap8Provider>,
  )
}

beforeEach(() => {
  kiemTraMock.mockReset()
  mockCheck({ data: CO_CANH_BAO })
})

describe("KiemTraDanhMucBlock — 3 thước đo, mỗi cái kèm 'vì sao' NGUYÊN VĂN (§C12c)", () => {
  it("hiện cả 3 giải thích của server, không sửa một chữ", () => {
    renderBlock()
    expect(screen.getByTestId("cap8-don-nganh")).toHaveTextContent(GT_DON_NGANH)
    expect(screen.getByTestId("cap8-tuong-quan")).toHaveTextContent(GT_TUONG_QUAN)
    expect(screen.getByTestId("cap8-tong-rui-ro")).toHaveTextContent(GT_TONG_RUI_RO)
  })

  it("★ hiện câu 'trần khẩu vị nghĩa gì' — hai con số không cùng một nghĩa", () => {
    renderBlock()
    expect(screen.getByTestId("cap8-tran-khau-vi")).toHaveTextContent(GT_TRAN_KHAU_VI)
  })

  it("cross-ref Người quản lý danh mục (spec §9: KHÔNG dựng lại PM)", () => {
    renderBlock()
    expect(screen.getByTestId("cap8-cross-ref")).toHaveTextContent(QUY_TAC.cross_ref_pm)
  })

  it("liệt kê đúng những cảnh báo THẬT SỰ bật, kèm câu của server", () => {
    renderBlock()
    expect(screen.getByTestId("cap8-canh-bao-don_nganh")).toHaveTextContent(
      CANH_BAO_DON_NGANH.text,
    )
    expect(screen.getByTestId("cap8-canh-bao-tuong_quan")).toHaveTextContent(
      CANH_BAO_TUONG_QUAN.text,
    )
    expect(screen.queryByTestId("cap8-canh-bao-tong_rui_ro")).not.toBeInTheDocument()
  })
})

describe("★ KiemTraDanhMucBlock — hàng 3 lựa chọn CHỈ khi có cảnh báo", () => {
  it("có cảnh báo → hiện đủ [Vẫn mua] [Giảm khối lượng] [Chọn mã khác]", () => {
    renderBlock()
    expect(screen.getByTestId("cap8-hanh-vi")).toBeInTheDocument()
    expect(screen.getByTestId("cap8-hanh-vi-van_mua")).toHaveTextContent("Vẫn mua")
    expect(screen.getByTestId("cap8-hanh-vi-giam_kl")).toHaveTextContent("Giảm khối lượng")
    expect(screen.getByTestId("cap8-hanh-vi-chon_ma_khac")).toHaveTextContent("Chọn mã khác")
  })

  it("★ KHÔNG cảnh báo nào → KHÔNG có hàng lựa chọn (server 400 nếu ghi 'van_mua')", () => {
    mockCheck({ data: KHONG_CANH_BAO })
    renderBlock()
    expect(screen.queryByTestId("cap8-hanh-vi")).not.toBeInTheDocument()
    expect(screen.queryByTestId("cap8-hanh-vi-van_mua")).not.toBeInTheDocument()
    // …nhưng 3 thước đo vẫn hiện đầy đủ: user vẫn học được ảnh hưởng của lệnh.
    expect(screen.getByTestId("cap8-don-nganh")).toHaveTextContent("Ngành Ngân hàng")
    expect(screen.getByTestId("cap8-khong-canh-bao")).toBeInTheDocument()
  })

  it("★ 'Vẫn mua' KHÔNG mang màu cảnh báo — nó là một lựa chọn hợp lệ (§C8)", () => {
    renderBlock()
    const vanMua = screen.getByTestId("cap8-hanh-vi-van_mua")
    // Cùng một class nền với hai nút kia: không có biến thể "sai" nào cho nó.
    expect(vanMua.className).toContain("cap8-hanh-vi-btn")
    expect(vanMua.className).not.toMatch(/canh-bao|nguy|warn|danger/)
    expect(vanMua.className.replace(/\s+/g, " ")).toBe(
      screen.getByTestId("cap8-hanh-vi-giam_kl").className.replace(/\s+/g, " "),
    )
  })

  it("bấm 'Giảm khối lượng' → gọi onGiamKhoiLuong và ghi lựa chọn", () => {
    const onGiamKhoiLuong = vi.fn()
    const onCheckHanhVi = vi.fn()
    renderBlock({ onGiamKhoiLuong, onCheckHanhVi })
    fireEvent.click(screen.getByTestId("cap8-hanh-vi-giam_kl"))
    expect(onGiamKhoiLuong).toHaveBeenCalledTimes(1)
    expect(onCheckHanhVi).toHaveBeenCalledWith("giam_kl")
    expect(screen.getByTestId("cap8-hanh-vi-giam_kl")).toHaveAttribute("aria-pressed", "true")
  })

  it("bấm 'Chọn mã khác' → gọi onChonMaKhac và ghi lựa chọn", () => {
    const onChonMaKhac = vi.fn()
    const onCheckHanhVi = vi.fn()
    renderBlock({ onChonMaKhac, onCheckHanhVi })
    fireEvent.click(screen.getByTestId("cap8-hanh-vi-chon_ma_khac"))
    expect(onChonMaKhac).toHaveBeenCalledTimes(1)
    expect(onCheckHanhVi).toHaveBeenCalledWith("chon_ma_khac")
  })

  it("bấm 'Vẫn mua' → chỉ ghi lựa chọn, KHÔNG đụng vào khối lượng hay mã", () => {
    const onGiamKhoiLuong = vi.fn()
    const onChonMaKhac = vi.fn()
    const onCheckHanhVi = vi.fn()
    renderBlock({ onGiamKhoiLuong, onChonMaKhac, onCheckHanhVi })
    fireEvent.click(screen.getByTestId("cap8-hanh-vi-van_mua"))
    expect(onCheckHanhVi).toHaveBeenCalledWith("van_mua")
    expect(onGiamKhoiLuong).not.toHaveBeenCalled()
    expect(onChonMaKhac).not.toHaveBeenCalled()
  })
})

describe("★ KiemTraDanhMucBlock — CHƯA BIẾT không bao giờ hiện thành 0", () => {
  it("tương quan chưa đủ dữ liệu → nói 'chưa tính được', KHÔNG hiện 0.00", () => {
    mockCheck({
      data: {
        ...KHONG_CANH_BAO,
        tuong_quan: null,
        tuong_quan_du_lieu: false,
        giai_thich: {
          ...KHONG_CANH_BAO.giai_thich,
          tuong_quan:
            "Chưa đủ dữ liệu giá để tính tương quan (cần ít nhất 60 phiên có cả hai mã). IQX để trống chỗ này thay vì hiện 0 — không tính được KHÔNG có nghĩa là hai mã không đi cùng nhịp.",
        },
      },
    })
    renderBlock()
    const box = screen.getByTestId("cap8-tuong-quan")
    expect(screen.getByTestId("cap8-tuong-quan-chua-du")).toBeInTheDocument()
    expect(box).toHaveTextContent("Chưa đủ dữ liệu giá để tính tương quan")
    expect(box.textContent).not.toMatch(/0\.00|0,00/)
    // Không có "viên" hệ số nào để đọc nhầm thành một con số đã tính.
    expect(screen.queryByTestId("cap8-tuong-quan-he-so")).not.toBeInTheDocument()
  })

  it("★★ hệ số 0.0 kèm du_lieu=false → VẪN là 'chưa tính được', KHÔNG hiện 0.00", () => {
    // Ca thù địch: `correlation()` dùng chung trả 0.0 cho thứ nó KHÔNG phán
    // được (chuỗi <2 điểm, hoặc phẳng). Nếu con số đó lọt ra ngoài, user đọc
    // thành "hai mã này không đi cùng nhịp" — một khẳng định không ai có cơ sở.
    // `tuong_quan_du_lieu` là thứ duy nhất phân biệt được hai trường hợp, nên
    // nó phải là điều kiện, không phải chỉ `tuong_quan != null`.
    mockCheck({
      data: {
        ...KHONG_CANH_BAO,
        tuong_quan: { symbol: "MBB", he_so: 0 },
        tuong_quan_du_lieu: false,
      },
    })
    renderBlock()
    expect(screen.getByTestId("cap8-tuong-quan-chua-du")).toBeInTheDocument()
    expect(screen.queryByTestId("cap8-tuong-quan-he-so")).not.toBeInTheDocument()
    expect(screen.getByTestId("cap8-tuong-quan").textContent).not.toMatch(/0\.00/)
  })

  it("có hệ số thật → hiện hệ số của server (0.82), không tự tính lại", () => {
    renderBlock()
    expect(screen.getByTestId("cap8-tuong-quan-he-so")).toHaveTextContent("MBB")
    expect(screen.getByTestId("cap8-tuong-quan-he-so")).toHaveTextContent("0.82")
    expect(screen.queryByTestId("cap8-tuong-quan-chua-du")).not.toBeInTheDocument()
  })

  it("★ vị thế thiếu cắt lỗ → nêu rõ số vị thế bị loại khỏi tổng", () => {
    mockCheck({ data: { ...CO_CANH_BAO, so_vi_the_thieu_cat_lo: 2 } })
    renderBlock()
    const caveat = screen.getByTestId("cap8-thieu-cat-lo")
    expect(caveat).toHaveTextContent("2 vị thế")
    expect(caveat).toHaveTextContent("chưa có cắt lỗ")
  })

  it("không vị thế nào thiếu cắt lỗ → không có dòng cảnh báo thừa", () => {
    renderBlock()
    expect(screen.queryByTestId("cap8-thieu-cat-lo")).not.toBeInTheDocument()
  })

  it("vị thế thiếu giá → cũng nêu rõ (tỷ trọng của chúng chưa biết)", () => {
    mockCheck({ data: { ...CO_CANH_BAO, so_vi_the_thieu_gia: 1 } })
    renderBlock()
    expect(screen.getByTestId("cap8-thieu-gia")).toHaveTextContent("1 vị thế")
  })

  it("chưa xác định được ngành → hiện câu 'chưa tính được' của server, không 0%", () => {
    mockCheck({
      data: {
        ...KHONG_CANH_BAO,
        nganh: null,
        don_nganh_pct_truoc: null,
        don_nganh_pct_sau: null,
        giai_thich: {
          ...KHONG_CANH_BAO.giai_thich,
          don_nganh:
            "Chưa xác định được ngành của VCB nên chưa tính được mức dồn ngành. IQX không đoán ngành — không có dữ liệu thì báo là chưa có, chứ không hiện 0%.",
        },
      },
    })
    renderBlock()
    expect(screen.getByTestId("cap8-don-nganh")).toHaveTextContent(
      "Chưa xác định được ngành của VCB",
    )
  })
})

describe("★ KiemTraDanhMucBlock — KHÔNG BAO GIỜ chặn MUA (spec §9/§C8)", () => {
  it("gọi API lỗi → nói thẳng là chưa kiểm tra được VÀ lệnh vẫn đặt được", () => {
    mockCheck({ isError: true })
    renderBlock()
    const note = screen.getByTestId("cap8-loi")
    expect(note.textContent).toMatch(/đặt lệnh vẫn bình thường/i)
    // Không có hàng lựa chọn nào bắt user phải bấm mới đi tiếp được.
    expect(screen.queryByTestId("cap8-hanh-vi")).not.toBeInTheDocument()
  })

  it("đang tải → chỉ là một dòng trạng thái, không khoá gì", () => {
    mockCheck({ isLoading: true })
    renderBlock()
    expect(screen.getByTestId("cap8-dang-tai")).toBeInTheDocument()
    expect(screen.queryByTestId("cap8-hanh-vi")).not.toBeInTheDocument()
  })

  it("có cảnh báo mà chưa bấm gì → khối vẫn nói rõ là không chặn lệnh", () => {
    renderBlock()
    expect(screen.getByTestId("cap8-khong-chan").textContent).toMatch(/không.*chặn/i)
  })
})

describe("KiemTraDanhMucBlock — analytics (spec §8)", () => {
  it("cap8_check_shown bắn kèm danh sách cảnh báo, một lần cho mỗi mã", () => {
    const onCheckShown = vi.fn()
    const { rerender } = renderBlock({ onCheckShown })
    expect(onCheckShown).toHaveBeenCalledWith("VCB", ["don_nganh", "tuong_quan"])
    onCheckShown.mockClear()
    rerender(
      <Cap8Provider>
        <Harness onCheckShown={onCheckShown} />
      </Cap8Provider>,
    )
    expect(onCheckShown).not.toHaveBeenCalled()
  })

  it("★ lệnh SẠCH cũng bắn event, với danh sách rỗng", () => {
    mockCheck({ data: KHONG_CANH_BAO })
    const onCheckShown = vi.fn()
    renderBlock({ onCheckShown })
    expect(onCheckShown).toHaveBeenCalledWith("VCB", [])
  })
})
