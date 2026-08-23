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
    /* Áo theo `demo-trading/LEVEL 2/iqx-cap2-datlenh.html` (`.sltp-label` /
       `.two-way` / `.way`). Mockup KHÔNG bọc cụm này trong một thẻ có viền —
       nhãn nằm trần rồi tới thẳng lưới 2 thẻ. */
    <div>
      <div className="op-sltp-label">
        <span>{"3. Cắt lỗ / Chốt lời"}</span>
        <span className="op-sltp-req">{"chọn 1 trong 2 cách"}</span>
      </div>

      <div className="op-way-grid">
        {cards.map((card, i) => {
          const isSelected = selected === card.method
          const disabled = card.result == null
          return (
            <div
              key={card.method}
              data-testid={card.testId}
              data-selected={isSelected ? "true" : "false"}
              className={cn(
                "op-way",
                i === 0 ? "op-way--c1" : "op-way--c2",
                isSelected && "op-way--on",
              )}
            >
              <div className="op-way-title flex items-center gap-1">
                <span>
                  {card.icon} {card.title}
                </span>
                <Tooltip content={card.tooltip}>
                  <IconQuestionCircle className="op-way-k" />
                </Tooltip>
              </div>

              {disabled ? (
                <p className="op-way-k text-[10.5px]">{card.reason}</p>
              ) : (
                <>
                  {card.extraLines.map((line) => (
                    <p key={line} className="op-way-row op-way-k">
                      {line}
                    </p>
                  ))}
                  <p className="op-way-row op-way-sl">
                    {"🛑 Cắt lỗ: "}
                    {fmtVnd(card.result!.catLo)}
                    {` (${fmtPct(card.result!.catLoPct)})`}
                  </p>
                  <p className="op-way-row op-way-tp">
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
                className={cn("op-way-pick", disabled && "cursor-not-allowed opacity-50")}
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
