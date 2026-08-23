import { useEffect, useState } from "react"
import { LOP_DEFS } from "@/features/cap4/doc5Lop"
import type { Lop } from "@/features/cap4/types"
import { TourLaunchButton } from "@/features/tour"
import { cn } from "@/shared/lib/cn"
import { useCap6Events } from "./Cap6Context"
import { useMauThuanCap6 } from "./hooks"
import type { ConflictLevel, MauThuanCap6 } from "./mauThuanTypes"
import {
  CAU_CHOT_MAU_THUAN,
  CHU_THICH_DIEM_TRU,
  CHU_THICH_KHUNG_THAM_KHAO,
  CHU_THICH_PHU_QUYET,
  CONFLICT_LEVEL_OPTIONS,
  coBangMauThuan,
  feedbackNhanDinh,
} from "./nhanDinhCap6"

/**
 * Cấp 6 «Bậc thầy» — khối **"Toàn cảnh 5 lớp gọn + bảng mâu thuẫn + ô nhận
 * định"** trong panel đặt lệnh (spec §5/§6, mockup `iqx-cap6-datlenh.html`).
 *
 * ★ Nó **THAY** khối "đọc 5 lớp" của Cấp 4-5 (spec §5.2 / checklist §14 dòng 1),
 * không phải thêm vào bên cạnh: ở Cấp 6 user không tự chấm từng lớp nữa, user
 * đọc bản đọc 5 lớp rồi nhận định mức độ MÂU THUẪN. Mọi khối còn lại của Cấp
 * 1-5 (vùng mua, cắt lỗ/chốt lời 2 cách, khẩu vị/tự tin/khối lượng) GIỮ NGUYÊN.
 *
 * ★★ **KHÔNG cổng cứng, KHÔNG chỉnh khối lượng hộ** (spec §4.2). Ô nhận định chỉ
 * ghi lại *cách user đọc*; nút ĐẶT LỆNH MUA không bao giờ bị khoá bởi khối này,
 * và khối này không sờ vào ô Khối lượng. Giá trị của nó đến ở Kết sổ / Phân tích
 * danh mục, khi nhận định được đặt cạnh hành động thật.
 *
 * ★ Ba trạng thái, ba câu KHÁC NHAU (luật số 7 — "chưa biết" ≠ 0):
 *   · `chua_du_du_lieu` → nói thẳng chưa đọc đủ 5 lớp cho mã này + câu của
 *     server (AI Insight KHÔNG chạy cho mã user chưa từng xem, spec §11);
 *   · không mâu thuẫn (5 lớp cùng chiều) → chỉ còn dòng toàn cảnh, KHÔNG bảng;
 *   · có mâu thuẫn → bảng 2 phe + cảnh báo + ô nhận định.
 *
 * ★ Mọi phân loại (phe nào, lớp nào PHỦ QUYẾT, bậc nào là "rất xấu") do SERVER
 * gửi và câu cảnh báo in NGUYÊN VĂN (§C12c) — FE không giữ bản sao thứ hai của
 * một quan điểm đầu tư mà spec §12.1 còn để mở.
 */
export interface MauThuanBlockProps {
  symbol: string
  /** Mức nhận định user đã chọn (state do `TradingPanel` giữ để gửi kèm lệnh). */
  nhanDinh: ConflictLevel | null
  onNhanDinh: (level: ConflictLevel) => void
  /** Mở lại tour «Xử lý mâu thuẫn» từ nút "?" (spec §10 ghi chú kỹ thuật). */
  onOpenTour?: () => void
}

const LOP_BY_KEY = Object.fromEntries(LOP_DEFS.map((d) => [d.lop, d])) as Record<
  Lop,
  (typeof LOP_DEFS)[number]
>

function lopIcon(lop: Lop): string {
  return LOP_BY_KEY[lop]?.icon ?? ""
}

function lopLabel(lop: Lop): string {
  return LOP_BY_KEY[lop]?.label ?? lop
}

type Phe = "ung_ho" | "nguoc" | "trung_tinh"

/** Phe của từng lớp, theo đúng ba mảng server gửi (không suy diễn thêm). */
function pheOf(mauThuan: MauThuanCap6): Map<Lop, Phe> {
  const map = new Map<Lop, Phe>()
  for (const r of mauThuan.ung_ho) map.set(r.lop, "ung_ho")
  for (const r of mauThuan.nguoc) map.set(r.lop, "nguoc")
  for (const r of mauThuan.trung_tinh) map.set(r.lop, "trung_tinh")
  return map
}

const PHE_MARK: Record<Phe, string> = {
  ung_ho: "✅",
  nguoc: "❌",
  trung_tinh: "⚪",
}

/** Nhãn server đã gửi cho từng lớp — dùng để dựng hàng chi tiết. */
function nhanOf(mauThuan: MauThuanCap6): Map<Lop, string> {
  const map = new Map<Lop, string>()
  for (const r of mauThuan.ung_ho) map.set(r.lop, r.nhan)
  for (const r of mauThuan.nguoc) map.set(r.lop, r.nhan)
  for (const r of mauThuan.trung_tinh) map.set(r.lop, r.nhan)
  return map
}

function bacOf(mauThuan: MauThuanCap6): Map<Lop, string | number | null> {
  const map = new Map<Lop, string | number | null>()
  for (const r of mauThuan.ung_ho) map.set(r.lop, r.bac)
  for (const r of mauThuan.nguoc) map.set(r.lop, r.bac)
  for (const r of mauThuan.trung_tinh) map.set(r.lop, null)
  return map
}

export function MauThuanBlock({
  symbol,
  nhanDinh,
  onNhanDinh,
  onOpenTour,
}: MauThuanBlockProps) {
  const cap6Events = useCap6Events()
  const { data: mauThuan, isLoading, isError } = useMauThuanCap6(symbol)
  const [chiTiet, setChiTiet] = useState(false)

  const coBang = coBangMauThuan(mauThuan)

  /**
   * Analytics `cap6_conflict_shown(symbol, veto_layers)` (spec §11) — bắn ĐÚNG
   * MỘT LẦN cho mỗi mã có bảng mâu thuẫn. Không bắn khi chưa đủ dữ liệu hay khi
   * 5 lớp cùng chiều: chẳng có bảng nào được hiện ra cả.
   */
  useEffect(() => {
    if (!coBang || !mauThuan) return
    cap6Events.onMauThuanShown?.(symbol, mauThuan.lop_phu_quyet_xau)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coBang, symbol])

  if (isLoading) {
    return (
      <div className="op-cf-state" data-testid="cap6-mauthuan-loading">
        {"Đang đọc 5 lớp của mã này…"}
      </div>
    )
  }

  // Lỗi mạng/404 "chưa vào Cấp 6" — nói thẳng là chưa đọc được, KHÔNG khẳng
  // định "không có mâu thuẫn" và KHÔNG chặn đặt lệnh.
  if (isError || !mauThuan) {
    return (
      <div className="op-cf-state" data-testid="cap6-mauthuan-error">
        {"Chưa đọc được bản 5 lớp của mã này lúc này — bảng mâu thuẫn tạm vắng. Bạn vẫn đặt lệnh bình thường; hãy tự soi lại các lớp trước khi quyết."}
      </div>
    )
  }

  const phe = pheOf(mauThuan)
  const nhan = nhanOf(mauThuan)
  const bac = bacOf(mauThuan)
  const daBiet = LOP_DEFS.filter((d) => phe.has(d.lop))

  return (
    <div className="op-cf-wrap" data-testid="cap6-mauthuan-block">
      <span className="op-field-label">
        {"1. Toàn cảnh 5 lớp — chú ý các lớp mâu thuẫn"}
      </span>

      {/* Dòng tóm tắt 5 lớp (kế thừa Cấp 5) — bấm để mở từng lớp. */}
      <button
        type="button"
        className="op-ls"
        onClick={() => setChiTiet((v) => !v)}
        aria-expanded={chiTiet}
        data-testid="cap6-toancanh"
        data-tour-id="tour-cap6-toancanh"
      >
        <span className="op-ls-icons" data-testid="cap6-toancanh-icons">
          {daBiet.map((d) => `${d.icon}${PHE_MARK[phe.get(d.lop) as Phe]}`).join(" ")}
        </span>
        <span className="op-ls-score" data-testid="cap6-toancanh-score">
          {`${mauThuan.ung_ho.length} ủng hộ · ${mauThuan.nguoc.length} ngược · ${mauThuan.trung_tinh.length} trung tính`}
        </span>
        <span className="op-ls-toggle">{chiTiet ? "thu gọn ▴" : "chi tiết ▾"}</span>
      </button>

      {chiTiet && (
        <div className="op-ls-detail" data-testid="cap6-toancanh-detail">
          {daBiet.map((d) => {
            const p = phe.get(d.lop) as Phe
            return (
              <div className="op-ld-row" key={d.lop} data-testid={`cap6-ld-${d.lop}`}>
                <span className="op-ld-nm">
                  {`${d.icon} ${d.label} `}
                  <b
                    className={cn(
                      p === "ung_ho" && "op-tone-up",
                      p === "nguoc" && "op-tone-down",
                      p === "trung_tinh" && "op-ld-neu",
                    )}
                    data-bac={bac.get(d.lop) == null ? undefined : String(bac.get(d.lop))}
                  >
                    {nhan.get(d.lop)}
                  </b>
                </span>
                <span className="op-ld-src">{d.source}</span>
              </div>
            )
          })}
        </div>
      )}

      {/* ★ Chưa đọc đủ 5 lớp ≠ "không có mâu thuẫn" (luật số 7). */}
      {mauThuan.chua_du_du_lieu && (
        <p className="op-cf-state" data-testid="cap6-mauthuan-chuadu">
          {mauThuan.ly_do_chua_du ??
            "Chưa đọc đủ 5 lớp cho mã này, nên IQX chưa nói được là có mâu thuẫn hay không."}
        </p>
      )}

      {/* 5 lớp cùng chiều → KHÔNG bảng (spec §5.1). Nói một câu để user biết vì
          sao khối mâu thuẫn vắng, thay vì để một khoảng trống không lời. */}
      {!mauThuan.chua_du_du_lieu && !coBang && (
        <p className="op-cf-state" data-testid="cap6-khong-mau-thuan">
          {"Các lớp của mã này không mâu thuẫn nhau — không có bảng mâu thuẫn nào cho lệnh này."}
        </p>
      )}

      {coBang && (
        <>
          <div className="op-cf" data-testid="cap6-bang-mau-thuan" data-tour-id="tour-cap6-bang">
            <div className="op-cf-head">
              <span>{"⚔ Các lớp đang mâu thuẫn"}</span>
              {onOpenTour && (
                <TourLaunchButton onClick={onOpenTour} label="Hướng dẫn" />
              )}
            </div>

            <div className="op-cf-side">
              <div className="op-cf-side-lb">{"Ủng hộ mua"}</div>
              <div className="op-cf-chips" data-testid="cap6-phe-ungho">
                {mauThuan.ung_ho.map((r) => (
                  <span className="op-cf-chip op-cf-chip--ok" key={r.lop}>
                    {`${lopIcon(r.lop)} ${lopLabel(r.lop)} · ${r.nhan}`}
                  </span>
                ))}
              </div>
            </div>

            <div className="op-cf-side">
              <div className="op-cf-side-lb">{"Ngược chiều"}</div>
              <div className="op-cf-chips" data-testid="cap6-phe-nguoc">
                {mauThuan.nguoc.map((r) => (
                  <span className="op-cf-chip op-cf-chip--bad" key={r.lop}>
                    {`${lopIcon(r.lop)} ${lopLabel(r.lop)} · ${r.nhan}`}
                    {r.la_phu_quyet && (
                      <span
                        className="op-cf-veto"
                        data-testid={`cap6-veto-${r.lop}`}
                        data-tour-id="tour-cap6-phuquyet"
                      >
                        {"PHỦ QUYẾT"}
                      </span>
                    )}
                  </span>
                ))}
              </div>
            </div>

            {/* Dòng cảnh báo của server — NGUYÊN VĂN (§C12c). */}
            {mauThuan.canh_bao && (
              <div className="op-cf-verdict" data-testid="cap6-canh-bao">
                <span className="op-cf-verdict-ic">{"🚨"}</span>
                <span className="op-cf-verdict-tx">{mauThuan.canh_bao}</span>
              </div>
            )}

            <div className="op-cf-note">{CAU_CHOT_MAU_THUAN}</div>
          </div>

          {/* Ô nhận định 4 mức — thuần nhận định (spec §6). */}
          <div className="op-sr" data-testid="cap6-nhandinh" data-tour-id="tour-cap6-nhandinh">
            <div className="op-sr-q">{"Bạn đọc mức độ mâu thuẫn này thế nào?"}</div>
            <div className="op-sr-opts">
              {CONFLICT_LEVEL_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className={cn("op-sr-opt", nhanDinh === opt.value && "op-sr-opt--on")}
                  aria-pressed={nhanDinh === opt.value}
                  onClick={() => {
                    onNhanDinh(opt.value)
                    // Analytics `cap6_conflict_rated(symbol, level)` (spec §11).
                    cap6Events.onNhanDinhPicked?.(symbol, opt.value)
                  }}
                  data-testid={`cap6-nhandinh-${opt.value}`}
                >
                  <span className="op-sr-ic">{opt.icon}</span>
                  <span className="op-sr-lb">
                    <b>{opt.title}</b>
                    <span>{opt.desc}</span>
                  </span>
                </button>
              ))}
            </div>
            {nhanDinh && (
              <div className="op-sr-after" data-testid="cap6-nhandinh-feedback">
                {feedbackNhanDinh(nhanDinh)}
              </div>
            )}
          </div>

          {/* Chú thích phân loại lớp (spec §5.2 mục 3). */}
          <div className="op-cf-legend" data-testid="cap6-chu-thich">
            <div>{CHU_THICH_PHU_QUYET}</div>
            <div>{CHU_THICH_DIEM_TRU}</div>
            <div className="op-cf-legend-note">{CHU_THICH_KHUNG_THAM_KHAO}</div>
          </div>
        </>
      )}
    </div>
  )
}
