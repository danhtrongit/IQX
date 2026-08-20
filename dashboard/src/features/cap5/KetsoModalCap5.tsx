import { useEffect, useState } from "react"
import { Modal } from "@arco-design/web-react"
import { cn } from "@/shared/lib/cn"
import { useRecordKetso } from "@/features/cap1/hooks"
import {
  countCalendarDays,
  countTradingSessions,
  isLenhCoChuyen,
} from "@/features/cap1/KetsoModalCap1"
import type { CoachParamsCap1, CoachSituationCap1 } from "@/features/cap1/coachTemplateCap1"
import {
  LY_DO_OPTIONS,
  type CamXuc,
  type Cap1Progress,
  type LyDo,
  type TrangThaiLucDat,
} from "@/features/cap1/types"
import type { Cap1TradeRecord } from "@/features/cap1/tradeLog"
import { useRecordKetsoCap2 } from "@/features/cap2/hooks"
import type { CoachSituationCap2 } from "@/features/cap2/coachTemplateCap2"
import type { PhuongPhapSlTp } from "@/features/cap2/types"
import { MUC_TU_TIN_LABEL, type CoachSituationCap3 } from "@/features/cap3/coachTemplateCap3"
import { KHAU_VI_PCT } from "@/features/cap3/khoiLuong"
import { CACH_KHOI_LUONG_LABEL } from "@/features/cap3/portfolioAnalysisCap3"
import type { KhauViLoai } from "@/features/cap3/types"
import { lopKhacAiCap4, lopLabelCap4, type CoachSituationCap4 } from "@/features/cap4/coachTemplateCap4"
import {
  countCungGocNhin,
  countDongThuan,
  countKhacAi,
  LOP_KEYS,
  NHAN_DINH_LABEL,
} from "@/features/cap4/doc5Lop"
import type { KetsoDataCap4 } from "@/features/cap4/KetsoModalCap4"
import { useCap5Events } from "./Cap5Context"
import { composeCoachCap5, splitEmphasis, type CoachSituationCap5 } from "./coachTemplateCap5"
import { useCap5TradeLog, type Cap5TradeRecord } from "./tradeLogCap5"
import { huntFilterTen, type HuntFilter } from "./types"
// Kết sổ Cấp 5 = Kết sổ Cấp 4's content (đối chiếu Cấp 1 + CAM KẾT vs THỰC TẾ
// Cấp 2 + Quản lý vốn Cấp 3 + Đọc 5 lớp Cấp 4 + khối cảm xúc + 4 lớp coach +
// HỒ SƠ + count-up) — CỘNG dòng "mã săn từ bộ lọc nào" (§8) và lớp coach
// "NHÌN LẠI · SĂN MÃ". Dùng lại đúng bộ CSS shell Cấp 0/1/2/3/4 đã dựng, chỉ
// thêm `cap5.css`.
import "@/features/cap0/cap0.css"
import "@/features/cap1/cap1.css"
import "@/features/cap2/cap2-ketso.css"
import "@/features/cap3/cap3-ketso.css"
import "@/features/cap4/cap4-ketso.css"
import "./cap5.css"

/**
 * Màn Kết sổ Cấp 5 (spec `IQX-Cap5-Spec.md` §8, mockup `iqx-cap5-ketso.html`).
 *
 * ★★ **KHỐI PHÂN LOẠI 4 Ô ĐÃ NGHỈ HƯU** cùng toàn bộ Cấp 5 cũ, và cùng với nó
 * là: CỔNG "chốt verdict mới đóng được kết sổ", `POST /cap5/ketso`,
 * `GET /cap5/verdict/{id}` và LỐI RA khẩn cấp mà cái cổng đó bắt buộc phải có.
 * Kết sổ Cấp 5 giờ CHỈ THÊM một dòng đọc (nguồn săn) + một đoạn coach — nghĩa là
 * nút "Đóng kết sổ ✓" **không còn điều kiện nào** ngoài `closing`. Đây là cách
 * đúng: modal `closable={false}` mà cổng phụ thuộc một request có thể lỗi chính
 * là lớp lỗi "nhốt vĩnh viễn user" repo này đã phải sửa hai lần.
 *
 * DESIGN DECISION — **mirror, KHÔNG compose `KetsoModalCap4` làm con** (đọc file
 * đó trước rồi mới quyết): `KetsoModalCap4` render một `<Modal>` TRỌN GÓI (tag
 * header, %lãi lỗ count-up, bảng đối chiếu, CAM KẾT vs THỰC TẾ, Quản lý vốn,
 * bảng Đọc 5 lớp, khối cảm xúc, 4 coach, HỒ SƠ, nút "Đóng kết sổ ✓" — cùng 1
 * cây JSX, không export mảnh nào, không có chỗ cắm slot) và nút đóng của nó tự
 * `mutate` + tự ghi nhật ký Cấp 4 rồi gọi `onClose`. Bọc nó làm con sẽ:
 *  1. tạo 2 `<Modal>` lồng nhau (2 overlay/backdrop, focus-trap vỡ);
 *  2. không đặt được dòng nguồn săn vào GIỮA thân modal (mockup đặt nó dưới các
 *     khối kế thừa đã thu gọn, TRÊN coach) — bất khả thi từ ngoài;
 *  3. ghi 1 bản ghi vào nhật ký Cấp 4 + gọi `PATCH /cap4/task` cho một lệnh Cấp
 *     5 — sai cấp.
 * Đây đúng là tiền lệ Cấp 4 đã ghi khi nó KHÔNG bọc `KetsoModalCap3` (và Cấp 3
 * KHÔNG bọc `KetsoModalCap2`…): mirror cùng khung JSX + import lại CSS chung.
 *
 * PHẦN LOGIC THÌ TÁI SỬ DỤNG THẬT (không mirror):
 *  - Coach: `composeCoachCap5` → `composeCoachCap4` → Cấp 3 → Cấp 2 → Cấp 1. CẢ
 *    5 đoạn text đều do module cấp dưới sinh ra, Cấp 5 chỉ thêm đoạn 5.
 *  - Helper thuần của Cấp 1: `countTradingSessions`, `countCalendarDays`,
 *    `isLenhCoChuyen`; đếm 5 lớp của Cấp 4: `countDongThuan`/`countKhacAi`/
 *    `countCungGocNhin` + `lopKhacAiCap4`.
 *  - Kiểu dữ liệu: `KetsoDataCap5 = KetsoDataCap4` + 3 trường NGUỒN SĂN.
 *
 * ★ **NGUỒN SĂN KHÔNG BAO GIỜ ĐƯỢC BỊA** (luật 1 + spec §8). Cả ba trường tới
 * từ chính lệnh; `huntFilter === null` ⇒ dòng §8 nói THẲNG "mã này không đến từ
 * săn mã" thay vì nêu một bộ lọc, và `huntSoLopLucVao === null` ⇒ "chưa chấm
 * được", KHÔNG phải "0 lớp".
 *
 * ★ **Thứ tự POST lúc đóng** — cấp dưới trước, đúng quy ước Cấp 2/3/4. Cấp 1
 * (cảm xúc) await trước rồi Cấp 2 (7 cờ kỷ luật) fire-and-forget; 409 "Lệnh này
 * đã kết sổ" là trạng thái BÌNH THƯỜNG ở các cấp trên nên bị bỏ qua có chủ đích.
 * KHÔNG còn call nào của riêng Cấp 5 — 2 nhiệm vụ Cấp 5 được server suy ra từ
 * `watchlist` + `order_kehoach.from_watchlist`, không từ màn Kết sổ.
 */
/**
 * Dữ liệu Kết sổ Cấp 5 = của Cấp 4 + NGUỒN SĂN của lệnh (spec §8).
 *
 * Cả 3 trường đều `null`-able và `Cap*TradingPage` của Cấp 6/7/8 (vốn dựng
 * object này mà chưa có dữ liệu săn) truyền `null` — nghĩa là chúng rơi đúng vào
 * nhánh "không đến từ săn mã", trung thực, thay vì hiện một bộ lọc bịa.
 */
export interface KetsoDataCap5 extends KetsoDataCap4 {
  /** Bộ lọc đã săn ra mã. `null` = mã user tự gõ. */
  huntFilter: HuntFilter | null
  /** Số phiên mã chờ trong Watchlist trước khi vào lệnh. `null` = không đo được. */
  huntSoPhienCho: number | null
  /** Số lớp ủng hộ (0-5) lúc vào lệnh. `null` = CHƯA BIẾT, không phải 0. */
  huntSoLopLucVao: number | null
}

export interface KetsoModalCap5Props {
  /** `null` → modal đóng/không mount. */
  data: KetsoDataCap5 | null
  /** Hồ sơ Cấp 1 — cho 3 dòng "HỒ SƠ CỦA BẠN" (giữ nguyên). */
  progress: Cap1Progress | null
  /** Nhật ký lệnh đã đóng (Cấp 1) — cho dòng thống kê theo lý do (giữ nguyên). */
  trades: Cap1TradeRecord[]
  onClose: () => void
  /**
   * Gọi 1 lần với bản ghi Cấp 5 của lệnh này. Modal ĐÃ tự ghi vào nhật ký Cấp 5
   * (`useCap5TradeLog`); callback này để caller ghi thêm vào nhật ký Cấp 1-4
   * (bản ghi Cấp 5 là siêu tập của cả bốn nên truyền thẳng được).
   */
  onRecorded?: (record: Cap5TradeRecord) => void
}

const TRANG_THAI_LABEL: Record<TrangThaiLucDat, string> = {
  ung_ho: "✅ Ủng hộ",
  trung_tinh: "⚪ Trung tính",
  can_chu_y: "⚠ Cần chú ý",
  nguoc_chieu: "❌ Ngược chiều",
}

const CAM_XUC_OPTIONS: readonly { value: CamXuc; label: string }[] = [
  { value: "binh_tinh", label: "😌 Bình tĩnh" },
  { value: "so", label: "😰 Sợ" },
  { value: "hoi_tiec", label: "😔 Hối tiếc" },
  { value: "khong_ro", label: "🤔 Không rõ" },
] as const

const METHOD_LABEL: Record<PhuongPhapSlTp, string> = {
  ho_tro_khang_cu: "Hỗ trợ/Kháng cự",
  bien_do_dao_dong: "Biên độ dao động",
}

const KHAU_VI_LABEL: Record<KhauViLoai, string> = {
  than_trong: "Thận trọng",
  can_bang: "Cân bằng",
  tan_cong: "Tấn công",
}

function lyDoLabel(lyDo: LyDo): string {
  const opt = LY_DO_OPTIONS.find((o) => o.value === lyDo)
  return opt ? `${opt.icon} ${opt.label}` : lyDo
}

function fmtVnd(n: number): string {
  return Math.round(n).toLocaleString("en-US")
}

/** `+5.3%` / `−4.2%` / `0.0%` — dấu trừ typographic "−" (U+2212), như Cấp 0-4. */
function fmtPct(pct: number): string {
  const rounded = Math.round(pct * 10) / 10
  const sign = rounded > 0 ? "+" : rounded < 0 ? "−" : ""
  return `${sign}${Math.abs(rounded).toFixed(1)}%`
}

function fmtVndSigned(n: number): string {
  const rounded = Math.round(n)
  const sign = rounded > 0 ? "+" : rounded < 0 ? "−" : ""
  return `${sign}${fmtVnd(Math.abs(rounded))} ₫`
}

/** "Thực tế" của hàng cắt lỗ trong CAM KẾT vs THỰC TẾ (giữ nguyên Cấp 2/3/4). */
function describeSlThucTe(
  flags: KetsoDataCap5["flags"],
  exitPrice: number,
  catLo: number,
): string {
  const touched = Boolean(
    flags.cham_SL_cat_dung_phien_ke ||
      flags.cham_SL_khong_cat ||
      flags.cham_SL_cuoi_phien ||
      (catLo > 0 && exitPrice <= catLo),
  )
  if (!touched) return "Chưa chạm cắt lỗ"
  if (flags.cham_SL_khong_cat) {
    const n = flags.giu_cham_SL_bao_nhieu_phien
    return n != null && n > 0 ? `Có chạm — cắt trễ ${n} phiên ⚠` : "Có chạm — cắt trễ ⚠"
  }
  return "Có chạm — cắt đúng phiên ✅"
}

/** "Thực tế" của hàng chốt lời trong CAM KẾT vs THỰC TẾ (giữ nguyên Cấp 2/3/4). */
function describeTpThucTe(
  flags: KetsoDataCap5["flags"],
  exitPrice: number,
  chotLoi: number,
): string {
  const touched = Boolean(flags.cham_TP_giu_lam_hut || (chotLoi > 0 && exitPrice >= chotLoi))
  if (!touched) return "Chưa chạm chốt lời"
  if (flags.cham_TP_giu_lam_hut) return "Có chạm — giữ tiếp, hụt lời ⚠"
  return "Có chạm — chốt đúng ✅"
}

const TARGET_ORDERS = 10
const MIN_TRADES_FOR_STAT = 2
const COUNT_UP_MS = 1000
const COUNT_UP_STEP_MS = 40

export function KetsoModalCap5({
  data,
  progress,
  trades,
  onClose,
  onRecorded,
}: KetsoModalCap5Props) {
  const cap5Events = useCap5Events()
  const recordKetsoCap1 = useRecordKetso()
  const recordKetsoCap2 = useRecordKetsoCap2()
  const { record: recordCap5Trade } = useCap5TradeLog()
  const [emotion, setEmotion] = useState<CamXuc | null>(null)
  const [displayPct, setDisplayPct] = useState(0)
  const [closing, setClosing] = useState(false)

  const entryPrice = data?.entryPrice ?? 0
  const exitPrice = data?.exitPrice ?? 0
  const quantity = data?.quantity ?? 0
  const pnlPct = entryPrice > 0 ? ((exitPrice - entryPrice) / entryPrice) * 100 : 0
  const pnlVnd = (exitPrice - entryPrice) * quantity

  // Reset + count-up ~1s mỗi khi MỘT kết sổ mới mở (giữ nguyên Cấp 1/2/3/4).
  useEffect(() => {
    if (!data) {
      setDisplayPct(0)
      return
    }
    setEmotion(null)
    setClosing(false)
    const start = Date.now()
    let timer: ReturnType<typeof setTimeout>
    const tick = () => {
      const t = Math.min(1, (Date.now() - start) / COUNT_UP_MS)
      setDisplayPct(pnlPct * t)
      if (t < 1) timer = setTimeout(tick, COUNT_UP_STEP_MS)
    }
    tick()
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.n, data?.orderId])

  if (!data) return null

  const {
    n,
    orderId,
    symbol,
    vungMua,
    lyDo,
    trangThaiLucDat,
    buyDate,
    sellDate,
    catLo,
    chotLoi,
    phuongPhapSlTp,
    flags,
    giaSauKhiCat,
    khauVi,
    mucTuTin,
    cachKhoiLuong,
    khoiLuong,
    pctVon,
    doc5Lop,
    ai5Lop,
    huntFilter,
    huntSoPhienCho,
    huntSoLopLucVao,
  } = data
  const soPhienGiu = countTradingSessions(buyDate, sellDate)
  const soNgayLich = countCalendarDays(buyDate, sellDate)
  const pnlPositive = pnlVnd > 0
  const tax = Math.round(exitPrice * quantity * 0.001)
  const coChuyen = isLenhCoChuyen({ pnlPct, soPhienGiu })

  const cap1Situation: CoachSituationCap1 = { pnlPositive, trangThaiLucDat, soPhienGiu }
  const cap1Params: CoachParamsCap1 = { pnlPct, lyDo, soPhienGiu, emotion }
  const cap2Situation: CoachSituationCap2 = {
    phuongPhapSlTp,
    catLo,
    chotLoi,
    flags,
    giaSauKhiCat,
  }
  const cap3Situation: CoachSituationCap3 = {
    mucTuTin,
    pnlPositive,
    pnlPct,
    cachKhoiLuong,
    khoiLuong,
    pctVon,
  }
  const cap4Situation: CoachSituationCap4 = { doc5Lop, ai5Lop, pnlPositive, pnlPct }
  // Đoạn coach Cấp 5 LUÔN có (kể cả mã không đến từ săn mã — mẫu `khong_san`
  // nói thẳng điều đó). Nó chỉ đọc lại chính 3 trường nguồn săn của lệnh, không
  // request gì, nên không có trạng thái "đang tải" nào phải xử lý.
  const cap5Situation: CoachSituationCap5 = {
    huntFilter,
    huntSoPhienCho,
    huntSoLopLucVao,
    pnlPct,
  }
  const tenBoLoc = huntFilterTen(huntFilter)
  const coach = composeCoachCap5(
    cap1Situation,
    cap1Params,
    cap2Situation,
    cap3Situation,
    cap4Situation,
    cap5Situation,
  )

  const slThucTe = describeSlThucTe(flags, exitPrice, catLo)
  const tpThucTe = describeTpThucTe(flags, exitPrice, chotLoi)

  // ── Khối Quản lý vốn (Cấp 3 §7, giữ nguyên) ────────────────────────────
  const tienThucTe = khoiLuong * entryPrice

  // ── Bảng "Đọc 5 lớp — nhìn lại" (Cấp 4 §6, giữ nguyên) ─────────────────
  const lopKhacAi = new Set(lopKhacAiCap4(doc5Lop, ai5Lop))
  const soDongThuan = countDongThuan(ai5Lop)
  const soKhacAi = countKhacAi(doc5Lop, ai5Lop)
  const soCungGocNhin = countCungGocNhin(doc5Lop, ai5Lop)

  // ── 3 dòng "HỒ SƠ CỦA BẠN" (giữ nguyên Cấp 1) ──────────────────────────
  const soLenh = progress?.so_lenh_thuc_chien ?? 0
  const conLai = Math.max(0, TARGET_ORDERS - soLenh)
  const line1 =
    conLai > 0
      ? `Đây là lệnh Thực chiến thứ ${soLenh}/${TARGET_ORDERS} — còn ${conLai} lệnh nữa để xét tốt nghiệp Cấp 1.`
      : `Đây là lệnh Thực chiến thứ ${soLenh} — bạn đã vượt mốc 10 lệnh của Cấp 1 từ lâu.`

  const usedLyDo = new Set<LyDo>([...trades.map((t) => t.lyDo), lyDo])
  const missing = LY_DO_OPTIONS.filter((o) => !usedLyDo.has(o.value))
  const daDung = Math.max(progress?.so_ly_do_da_dung ?? 0, usedLyDo.size)
  const line2 =
    missing.length > 0
      ? `Bạn đã dùng ${daDung}/5 lý do. Chưa thử: ${missing.map((o) => `${o.icon} ${o.label}`).join(", ")}.`
      : `Bạn đã dùng đủ 5/5 lý do.`

  const sameLyDo = trades.filter((t) => t.lyDo === lyDo)
  const sameLyDoWins = sameLyDo.filter((t) => t.pnlPct > 0).length
  const line3 =
    sameLyDo.length >= MIN_TRADES_FOR_STAT
      ? `Với lý do ${lyDoLabel(lyDo)}, bạn có ${sameLyDoWins}/${sameLyDo.length} lệnh lãi.`
      : `Còn ${MIN_TRADES_FOR_STAT - sameLyDo.length} lệnh nữa để hệ thống tìm mẫu riêng của bạn.`

  /**
   * Bản ghi nhật ký Cấp 5 của lệnh này — 3 trường nguồn săn chép NGUYÊN từ lệnh,
   * không suy diễn. Chỉ còn MỘT đường đóng, nên hàm này không nhận tham số nào.
   */
  const buildRecord = (): Cap5TradeRecord => ({
    orderId,
    lyDo,
    trangThaiLucDat,
    pnlPct,
    pnlVnd,
    closedAt: new Date(`${sellDate.slice(0, 10)}T00:00:00Z`).toISOString(),
    chamSlKhongCat: Boolean(flags.cham_SL_khong_cat),
    chamTpGiuLamHut: Boolean(flags.cham_TP_giu_lam_hut),
    banSomKhiLoNhe: Boolean(flags.ban_som_khi_lo_nhe),
    nhoiLenhKhiLo: Boolean(flags.nhoi_lenh_khi_lo),
    ghiChuNhinLai: null,
    khauVi,
    mucTuTin,
    cachKhoiLuong,
    khoiLuong,
    pctVon,
    doc_5_lop: doc5Lop,
    ai_5_lop: ai5Lop,
    // Chưa lộ AI → để NULL đúng như backend, KHÔNG quy về 0 (giữ nguyên Cấp 4).
    so_lop_dong_thuan: ai5Lop ? soDongThuan : null,
    so_lop_khac_ai: ai5Lop ? soKhacAi : null,
    huntFilter,
    huntSoPhienCho,
    huntSoLopLucVao,
  })

  const handleClose = async () => {
    if (closing) return
    setClosing(true)

    // Cấp 1 (cảm xúc) — await TRƯỚC, đúng quy ước cấp dưới trước. 409 "Lệnh này
    // đã kết sổ" là trạng thái BÌNH THƯỜNG ở các cấp trên (trang cấp đã kết sổ
    // Cấp 1 ngay lúc lệnh bán khớp) nên bị bỏ qua có chủ đích.
    try {
      await recordKetsoCap1.mutateAsync({ order_id: orderId, cam_xuc: emotion })
    } catch {
      // Đã kết sổ Cấp 1 trước đó — không có gì để sửa, đi tiếp.
    }
    // Cấp 2 (7 cờ kỷ luật) — fire-and-forget đúng như Cấp 2/3/4 làm.
    recordKetsoCap2.mutate({ ...flags, order_id: orderId })

    const record = buildRecord()
    recordCap5Trade(record)
    onRecorded?.(record)
    cap5Events.onKetsoClosed?.(symbol, huntFilter)
    onClose()
  }

  return (
    <Modal
      visible
      footer={null}
      title={null}
      closable={false}
      maskClosable={false}
      escToExit={false}
      autoFocus={false}
      className="cap0"
      style={{
        width: 480,
        maxWidth: "calc(100vw - 32px)",
        background: "var(--bg2)",
        border: "1px solid var(--bd)",
        borderRadius: 16,
      }}
    >
      <div className="cap0-debrief-tag">{`KẾT SỔ LỆNH · #${n} · THỰC CHIẾN`}</div>

      <div
        className={cn(
          "cap0-display cap0-debrief-pnl tabular-nums",
          pnlPositive ? "text-up" : "text-down",
        )}
      >
        {fmtPct(displayPct)}
      </div>

      <div className="cap0-debrief-sub">
        {`${fmtVndSigned(pnlVnd)} · MUA ${quantity} ${symbol} → BÁN · Giữ ${soPhienGiu} phiên`}
      </div>

      <table className="cap0-debrief-table" data-testid="cap5-ketso-doichieu">
        <thead>
          <tr>
            <th></th>
            <th>Kế hoạch</th>
            <th>Thực tế</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Lý do</td>
            <td>{lyDoLabel(lyDo)}</td>
            <td>—</td>
          </tr>
          <tr>
            <td>Trạng thái lớp lúc đặt</td>
            <td>{TRANG_THAI_LABEL[trangThaiLucDat]}</td>
            <td>—</td>
          </tr>
          <tr>
            <td>Vùng mua</td>
            <td>{fmtVnd(vungMua)}</td>
            <td>{fmtVnd(entryPrice)}</td>
          </tr>
          <tr>
            <td>Giá ra · thuế bán 0,1%</td>
            <td>—</td>
            <td>
              {fmtVnd(exitPrice)} · <span className="text-down">{fmtVnd(tax)}</span>
            </td>
          </tr>
          <tr>
            <td>Thời gian giữ lệnh</td>
            <td>—</td>
            <td>{`${soPhienGiu} phiên · ${soNgayLich} ngày`}</td>
          </tr>
        </tbody>
      </table>

      {/* ── CAM KẾT vs THỰC TẾ (giữ nguyên Cấp 2) ─────────────────────────── */}
      <div className="cap2-ketso-camket" data-testid="cap2-ketso-camket">
        <div className="cap2-ketso-camket-title">CAM KẾT vs THỰC TẾ</div>
        <table className="cap0-debrief-table">
          <thead>
            <tr>
              <th></th>
              <th>Cam kết</th>
              <th>Thực tế</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Phương pháp</td>
              <td colSpan={2}>{METHOD_LABEL[phuongPhapSlTp]}</td>
            </tr>
            <tr>
              <td>Cắt lỗ</td>
              <td>{fmtVnd(catLo)}</td>
              <td>{slThucTe}</td>
            </tr>
            <tr>
              <td>Chốt lời</td>
              <td>{fmtVnd(chotLoi)}</td>
              <td>{tpThucTe}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* ── QUẢN LÝ VỐN (giữ nguyên Cấp 3) ────────────────────────────────── */}
      <div className="cap3-ketso-quanlyvon" data-testid="cap3-ketso-quanlyvon">
        <div className="cap3-ketso-quanlyvon-head">
          <span className="cap3-ketso-quanlyvon-title">QUẢN LÝ VỐN</span>
          <span className="cap3-ketso-badge">giữ từ Cấp 3</span>
        </div>
        <table className="cap0-debrief-table">
          <tbody>
            <tr>
              <td>Khẩu vị rủi ro</td>
              <td colSpan={2}>{`${KHAU_VI_LABEL[khauVi]} (trần ${KHAU_VI_PCT[khauVi]}%)`}</td>
            </tr>
            <tr className="cap3-ketso-tutin-row">
              <td>Mức tự tin</td>
              <td colSpan={2}>{MUC_TU_TIN_LABEL[mucTuTin]}</td>
            </tr>
            <tr>
              <td>Cách tính KL</td>
              <td colSpan={2}>{CACH_KHOI_LUONG_LABEL[cachKhoiLuong]}</td>
            </tr>
            <tr>
              <td>Khối lượng</td>
              <td colSpan={2}>
                {`${fmtVnd(khoiLuong)} cp · ${pctVon.toFixed(1)}% vốn (${fmtVnd(tienThucTe)} ₫)`}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* ── ĐỌC 5 LỚP — NHÌN LẠI (giữ nguyên Cấp 4) ───────────────────────── */}
      <div className="cap4-ketso-doc5lop" data-testid="cap4-ketso-doc5lop">
        <div className="cap4-ketso-doc5lop-head">
          <span className="cap4-ketso-doc5lop-title">ĐỌC 5 LỚP — NHÌN LẠI</span>
          <span className="cap4-ketso-badge">giữ từ Cấp 4</span>
        </div>
        <table className="cap0-debrief-table">
          <thead>
            <tr>
              <th>Lớp</th>
              <th>Bạn đọc</th>
              <th>AI đánh giá</th>
            </tr>
          </thead>
          <tbody>
            {LOP_KEYS.map((lop) => {
              const banMuc = doc5Lop[lop] ?? null
              const aiMuc = ai5Lop?.[lop] ?? null
              const diff = lopKhacAi.has(lop)
              return (
                <tr
                  key={lop}
                  className={cn(diff && "cap4-ketso-lr-row--diff")}
                  data-testid={`cap4-ketso-lr-${lop}`}
                  data-diff={diff ? "true" : "false"}
                >
                  <td>{lopLabelCap4(lop)}</td>
                  <td
                    className={cn(banMuc && `cap4-ketso-muc--${banMuc}`)}
                    data-testid={`cap4-ketso-lr-${lop}-ban`}
                  >
                    {banMuc ? NHAN_DINH_LABEL[banMuc] : "—"}
                  </td>
                  <td
                    className={cn(aiMuc && `cap4-ketso-muc--${aiMuc}`)}
                    data-testid={`cap4-ketso-lr-${lop}-ai`}
                  >
                    {aiMuc ? NHAN_DINH_LABEL[aiMuc] : "—"}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {/* §C12c — mọi con số kèm nguồn gốc; và nói THẲNG khi chưa có đối chiếu. */}
        <p className="cap4-ketso-doc5lop-sum" data-testid="cap4-ketso-doc5lop-sum">
          {ai5Lop
            ? `Đồng thuận: ${soDongThuan}/5 lớp AI đánh giá Ủng hộ · Bạn đọc khác AI ở ${soKhacAi}/5 lớp · cùng góc nhìn ở ${soCungGocNhin}/5 lớp. Hàng nền tím là lớp bạn đọc khác AI — góc nhìn khác cần kiểm chứng bằng kết quả, không phải lỗi.`
            : "Lệnh này chưa có đối chiếu AI — AI chỉ lộ khi bạn chấm đủ 5 lớp lúc đặt lệnh."}
        </p>
      </div>

      {coChuyen && (
        <div className="cap1-ketso-emotion">
          <div className="cap0-debrief-coach-tag">💭 TRƯỚC KHI BẤM BÁN, BẠN THẤY THẾ NÀO?</div>
          <div className="cap1-ketso-emotion-row">
            {CAM_XUC_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={cn(
                  "cap1-ketso-emotion-btn",
                  emotion === opt.value && "cap1-ketso-emotion-btn--on",
                )}
                aria-pressed={emotion === opt.value}
                onClick={() => setEmotion(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── DÒNG NGUỒN SĂN (Cấp 5 THÊM MỚI, spec §8 · mockup `.hunt-origin`) —
          DƯỚI mọi khối kế thừa, TRÊN toàn bộ chồng coach.

          ★ Mã KHÔNG đến từ săn mã thì NÓI THẲNG (nhánh dưới), tuyệt đối không
          nêu một bộ lọc. Hai vế phụ (số phiên chờ · số lớp lúc vào) chỉ xuất
          hiện khi ĐO ĐƯỢC: `null` là "chưa biết", không phải 0. */}
      {tenBoLoc != null ? (
        <div className="cap5-hunt-origin" data-testid="cap5-ketso-hunt-origin">
          🔍 Mã này bạn <strong>săn từ bộ lọc «{tenBoLoc}»</strong>
          {huntSoPhienCho != null && (
            <>
              {" · đưa vào Watchlist "}
              {huntSoPhienCho === 0
                ? "ngay trong phiên vào lệnh"
                : `${huntSoPhienCho.toLocaleString("en-US")} phiên trước`}
            </>
          )}
          {huntSoLopLucVao != null ? (
            <> · vào lệnh khi lên {huntSoLopLucVao}/5 lớp ủng hộ.</>
          ) : (
            <> · hệ chưa chấm được điểm 5 lớp của mã này lúc bạn vào lệnh.</>
          )}
        </div>
      ) : (
        <div
          className="cap5-hunt-origin cap5-hunt-origin--khong"
          data-testid="cap5-ketso-hunt-origin"
        >
          🔍 Mã này <strong>không đến từ săn mã</strong> — bạn tự chọn mã rồi vào lệnh, nên không
          có bộ lọc nào đứng sau nó để đối chiếu.
        </div>
      )}

      {/* Lớp coach 1 — Cấp 1 (lưới lý do × kết quả), giữ nguyên. */}
      <div className="cap0-debrief-coach">
        <div className="cap0-debrief-coach-tag">NHÌN LẠI</div>
        <p className="cap0-debrief-coach-body">{coach.cap1Text}</p>
      </div>

      {/* Lớp coach 2 — Cấp 2 (kỷ luật cắt lỗ/chốt lời), giữ nguyên. */}
      <div className="cap2-ketso-coach">
        <div className="cap2-ketso-coach-tag">KỶ LUẬT</div>
        <p className="cap2-ketso-coach-body">{coach.cap2.text}</p>
      </div>

      {/* Lớp coach 3 — Cấp 3 (tự tin vs kết quả), giữ nguyên. */}
      <div className="cap3-ketso-coach" data-testid="cap3-ketso-coach">
        <div className="cap3-ketso-coach-tag">TỰ TIN VS KẾT QUẢ</div>
        <p className="cap3-ketso-coach-body">{coach.cap3.text}</p>
      </div>

      {/* Lớp coach 4 — Cấp 4 (góc nhìn khác AI), giữ nguyên. */}
      <div className="cap4-ketso-coach" data-testid="cap4-ketso-coach">
        <div className="cap4-ketso-coach-tag">NHÌN LẠI · GÓC NHÌN KHÁC AI</div>
        <p className="cap4-ketso-coach-body">{coach.cap4.text}</p>
      </div>

      {/* Lớp coach 5 — Cấp 5 (săn mã), THÊM MỚI. Mẫu "vào lệnh khi mã chưa
          chín" mang style cảnh báo: nó KHÔNG phải lời khen. */}
      {coach.cap5 && (
        <div
          className={cn("cap5-ketso-coach", coach.cap5.canhBao && "cap5-coach--canhbao")}
          data-testid="cap5-ketso-coach"
        >
          <div className="cap5-ketso-coach-tag">
            NHÌN LẠI · SĂN MÃ
          </div>
          <p className="cap5-ketso-coach-body">
            {splitEmphasis(coach.cap5.text, coach.cap5.nhanManh).map((part, i) =>
              part.strong ? (
                <strong key={i}>{part.text}</strong>
              ) : (
                <span key={i}>{part.text}</span>
              ),
            )}
          </p>
        </div>
      )}

      <div className="cap1-ketso-profile" data-testid="cap5-ketso-profile">
        <div className="cap0-debrief-coach-tag">📊 HỒ SƠ CỦA BẠN SAU LỆNH NÀY</div>
        <ul className="cap1-ketso-profile-list">
          <li>{line1}</li>
          <li>{line2}</li>
          <li>{line3}</li>
        </ul>
      </div>

      {/* ★ KHÔNG CÒN CỔNG NÀO. Modal `closable={false}` + `visible` do caller
          giữ, nên mọi điều kiện thêm vào nút này đều là một cách nhốt user; điều
          kiện duy nhất còn lại là `closing` (chặn double-click trong lúc 2
          request cấp dưới đang bay), và nó tự nhả vì `handleClose` luôn kết thúc
          bằng `onClose()`. */}
      <button
        type="button"
        className="cap0-debrief-close"
        disabled={closing}
        onClick={handleClose}
        data-testid="cap5-ketso-close"
      >
        Đóng kết sổ ✓
      </button>
    </Modal>
  )
}
