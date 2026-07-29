import { useEffect } from "react"
import { Tooltip } from "@arco-design/web-react"
import { IconQuestionCircle } from "@arco-design/web-react/icon"
import { useStockAiInsight } from "@/features/stock"
import { cn } from "@/shared/lib/cn"
import {
  computeBienDoDaoDong,
  computeBienDoSlTp,
  computeHoTroKhangCuSlTp,
  extractHoTroKhangCu,
  type OhlcvBar,
  type SlTpResult,
} from "./slTp"
import type { PhuongPhapSlTp } from "./types"

function fmtVnd(n: number): string {
  return Math.round(n).toLocaleString("en-US")
}

function fmtPct(pct: number): string {
  return `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`
}

/**
 * Khối "Cắt lỗ / Chốt lời" (spec §5, THÊM MỚI) — chèn vào Form Kế hoạch ngay
 * sau Vùng mua, dưới một `isCap2Active` branch trong `TradingPanel`
 * (Cấp 1's form stays 100% intact — spec §0 "KHÔNG code lại panel từ đầu").
 *
 * Both thẻ derive their numbers from the SAME `useStockAiInsight(symbol)`
 * payload already used by `AiThanhTra` — no new data source:
 *  - 📈 Hỗ trợ/Kháng cự: `insight.layers.L1.fields` ("Hỗ trợ"/"Kháng cự"
 *    labels, spec §5.2).
 *  - 📊 Biên độ dao động: `insight.rawInput.trend.ohlcv` (spec §5.3 — average
 *    True Range over the last 14 bars, computed client-side; UI copy NEVER
 *    says "ATR" per `IQX-NguyenTac-Chung.md` §E's bảng thay từ).
 *
 * KHÔNG nhập tay tự do (spec §5.1/§5.4, "từ Cấp 3" only) — user picks exactly
 * one of the two cách; each card's numbers are read-only, computed values.
 * When the underlying data can't back a cách, that card disables itself with
 * a short reason instead of crashing or silently showing wrong numbers.
 */
export interface SlTpBlockProps {
  symbol: string
  /** "Giá vào" (spec §5.2/§5.3 example basis) — the Kế hoạch's Vùng mua
   * value, already resolved by the caller (falls back to giá hiện tại). */
  giaVao: number
  selected: PhuongPhapSlTp | null
  onSelect: (method: PhuongPhapSlTp, catLo: number, chotLoi: number) => void
}

interface CardSpec {
  method: PhuongPhapSlTp
  testId: string
  icon: string
  title: string
  tooltip: string
  result: SlTpResult | null
  reason: string
  extraLines: string[]
}

export function SlTpBlock({ symbol, giaVao, selected, onSelect }: SlTpBlockProps) {
  const { insight, analyze, isPending: insightPending, isError: insightError } =
    useStockAiInsight(symbol)

  // Fetch the 6-layer insight lazily, exactly once — mirrors `AiThanhTra`'s
  // own "fetch once on mount" pattern (spec §0 "KHÔNG dựng lại cái đã có").
  useEffect(() => {
    if (!insight && !insightPending && !insightError) analyze()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol])

  const l1Fields = insight?.layers?.L1?.fields ?? null
  const { hoTro, khangCu } = extractHoTroKhangCu(l1Fields)
  const hoTroKhangCuResult = computeHoTroKhangCuSlTp(hoTro, khangCu, giaVao)

  const ohlcv = (insight?.rawInput?.trend?.ohlcv as OhlcvBar[] | undefined) ?? null
  const bienDo = computeBienDoDaoDong(ohlcv)
  const bienDoResult = computeBienDoSlTp(bienDo, giaVao)

  const dataUnavailableReason = insightError
    ? "Không tải được dữ liệu AI Insight cho mã này ngay bây giờ."
    : insightPending || !insight
      ? "Đang tải dữ liệu…"
      : null

  const cards: CardSpec[] = [
    {
      method: "ho_tro_khang_cu",
      testId: "sltp-card-ho_tro_khang_cu",
      icon: "📈",
      title: "Theo Hỗ trợ / Kháng cự",
      tooltip:
        "Giá thường bật lại ở hỗ trợ, bị chặn ở kháng cự. Cắt lỗ dưới hỗ trợ = nếu thủng thì xu hướng đã hỏng, thoát. Chốt lời dưới kháng cự = bán trước khi bị chặn. Mốc lấy từ phân tích L1.",
      result: hoTroKhangCuResult,
      reason:
        dataUnavailableReason ?? "Không tìm được mốc hỗ trợ/kháng cự cho mã này ngay bây giờ.",
      extraLines:
        hoTro != null && khangCu != null
          ? [`Hỗ trợ: ${fmtVnd(hoTro)}`, `Kháng cự: ${fmtVnd(khangCu)}`]
          : [],
    },
    {
      method: "bien_do_dao_dong",
      testId: "sltp-card-bien_do_dao_dong",
      icon: "📊",
      title: "Theo Biên độ dao động",
      tooltip:
        "Con số đo mã dao động bao nhiêu đồng mỗi phiên. IQX tính tự động. Mã lắc mạnh → biên độ lớn → cắt lỗ rộng. Mã êm → biên độ nhỏ → cắt lỗ chặt. Cắt lỗ = 2× biên độ, chốt lời = 4× biên độ.",
      result: bienDoResult,
      reason: dataUnavailableReason ?? "Không đủ dữ liệu để tính biên độ dao động cho mã này.",
      extraLines: bienDo != null ? [`Biên độ: ${fmtVnd(bienDo)}`, "Hệ số: 2× / 4×"] : [],
    },
  ]

  return (
    <div className="mt-2 space-y-2 rounded-md border border-[var(--color-border-2)] bg-[var(--color-fill-2)] p-2.5">
      <div className="flex items-center justify-between">
        <div className="text-[9px] font-bold uppercase tracking-wider text-[rgb(var(--primary-6))]">
          {"3. Cắt lỗ / Chốt lời"}
        </div>
        <div className="text-[9px] text-[var(--color-text-3)]">{"chọn 1 trong 2 cách"}</div>
      </div>

      <div className="grid grid-cols-2 gap-1.5">
        {cards.map((card) => {
          const isSelected = selected === card.method
          const disabled = card.result == null
          return (
            <div
              key={card.method}
              data-testid={card.testId}
              data-selected={isSelected ? "true" : "false"}
              className={cn(
                "space-y-1 rounded-md border p-2 text-[10.5px]",
                isSelected
                  ? "border-[rgb(var(--primary-6))] bg-[rgb(var(--primary-6))]/10"
                  : "border-[var(--color-border-2)] bg-[var(--color-bg-2)]",
              )}
            >
              <div className="flex items-center gap-1 font-semibold text-[var(--color-text-1)]">
                <span>
                  {card.icon} {card.title}
                </span>
                <Tooltip content={card.tooltip}>
                  <IconQuestionCircle className="text-[var(--color-text-4)]" />
                </Tooltip>
              </div>

              {disabled ? (
                <p className="text-[var(--color-text-3)]">{card.reason}</p>
              ) : (
                <>
                  {card.extraLines.map((line) => (
                    <p key={line} className="text-[var(--color-text-3)]">
                      {line}
                    </p>
                  ))}
                  <p className="text-down">
                    {"🛑 Cắt lỗ: "}
                    {fmtVnd(card.result!.catLo)}
                    {` (${fmtPct(card.result!.catLoPct)})`}
                  </p>
                  <p className="text-up">
                    {"🎯 Chốt lời: "}
                    {fmtVnd(card.result!.chotLoi)}
                    {` (${fmtPct(card.result!.chotLoiPct)})`}
                  </p>
                </>
              )}

              <button
                type="button"
                disabled={disabled}
                onClick={() => {
                  if (!card.result) return
                  onSelect(card.method, card.result.catLo, card.result.chotLoi)
                }}
                className={cn(
                  "w-full rounded border px-2 py-1 text-[10px] font-medium transition-colors",
                  disabled
                    ? "cursor-not-allowed border-[var(--color-border-2)] text-[var(--color-text-4)]"
                    : isSelected
                      ? "border-[rgb(var(--primary-6))] bg-[rgb(var(--primary-6))] text-white"
                      : "border-[var(--color-border-2)] text-[var(--color-text-1)]",
                )}
              >
                {isSelected ? "Đã chọn" : "Chọn cách này"}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
