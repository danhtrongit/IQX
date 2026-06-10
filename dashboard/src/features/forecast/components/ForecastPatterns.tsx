import { IconCheckCircle, IconExclamationCircle } from "@arco-design/web-react/icon"
import type { PatternItem, PatternKind, PatternSignal } from "../api"
import { useForecastPatterns } from "../hooks"
import { IconTrendingUp } from "../icons"
import { CandlePatternIllustration, ChartPatternIllustration } from "./PatternIllustration"

const SIGNAL_LABEL: Record<PatternSignal, string> = {
  bullish: "Bullish",
  bearish: "Bearish",
  neutral: "Trung tính",
}

const SIGNAL_PILL: Record<PatternSignal, string> = {
  bullish: "bg-up/15 text-up border-up/40",
  bearish: "bg-down/15 text-down border-down/40",
  neutral: "bg-reference/15 text-reference border-reference/40",
}

function stateColor(kind: PatternKind, state: string | null): string {
  if (!state) return "bg-[var(--color-fill-2)] text-[var(--color-text-3)] border-[var(--color-border-2)]"
  const s = state.toLowerCase()
  if (kind === "candles") {
    if (s.includes("cao") || s.includes("mạnh")) return "bg-up/15 text-up border-up/40"
    if (s.includes("thấp") || s.includes("yếu")) return "bg-down/15 text-down border-down/40"
    return "bg-reference/15 text-reference border-reference/40"
  }
  if (s.includes("breakout") && !s.includes("fail")) return "bg-up/15 text-up border-up/40"
  if (s.includes("fail")) return "bg-down/15 text-down border-down/40"
  return "bg-reference/15 text-reference border-reference/40"
}

export function ForecastPatterns({ symbol }: { symbol: string | null }) {
  const { data, isFetching } = useForecastPatterns(symbol)
  const candles = data?.candles ?? null
  const charts = data?.charts ?? null

  if (!symbol) return null

  if (isFetching && !candles && !charts) {
    return (
      <div className="rounded-xl border border-[var(--color-border-1)] bg-[var(--color-bg-2)] p-3 py-6 text-center text-[11px] text-[var(--color-text-3)]">
        Đang phân tích mẫu hình...
      </div>
    )
  }

  if (!candles && !charts) {
    return (
      <div className="inline-flex w-full items-center justify-center gap-1 rounded-xl border border-[var(--color-border-1)] bg-[var(--color-bg-2)] p-3 py-6 text-[11px] text-[var(--color-text-3)]">
        <IconExclamationCircle className="text-[rgb(var(--warning-6))]" style={{ fontSize: 12 }} />
        Chưa có pattern cho {symbol}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      {candles && <PatternCard kind="candles" item={candles} kindLabel="AI Mẫu nến" />}
      {charts && <PatternCard kind="charts" item={charts} kindLabel="AI Mẫu giá" />}
    </div>
  )
}

function PatternCard({
  kind,
  item,
  kindLabel,
}: {
  kind: PatternKind
  item: PatternItem
  kindLabel: string
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-[var(--color-border-1)] bg-[var(--color-bg-2)]">
      <div className="flex items-center justify-between border-b border-[var(--color-border-1)] px-3 py-2">
        <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--color-text-3)]">
          {kindLabel}
        </span>
        <div className="flex items-center gap-1.5">
          <span
            className={`rounded-full border px-2 py-0.5 text-[9px] font-semibold ${SIGNAL_PILL[item.signal]}`}
          >
            Tín hiệu: {SIGNAL_LABEL[item.signal]}
          </span>
          {item.state && (
            <span
              className={`rounded-full border px-2 py-0.5 text-[9px] font-semibold ${stateColor(kind, item.state)}`}
            >
              Mức độ: {item.state}
            </span>
          )}
        </div>
      </div>
      <div className="flex gap-3 p-3">
        {/* Illustration */}
        <div className="flex shrink-0 flex-col items-center gap-1">
          <h4 className="text-base font-extrabold leading-none text-[var(--color-text-1)]">
            {item.name}
          </h4>
          <div className="h-[120px] w-[160px] rounded-md border border-[var(--color-border-1)] bg-[var(--color-fill-1)] p-1">
            {kind === "candles" ? (
              <CandlePatternIllustration name={item.name} signal={item.signal} />
            ) : (
              <ChartPatternIllustration name={item.name} />
            )}
          </div>
          <p className="text-[9px] italic text-[var(--color-text-3)]">
            {kind === "candles" ? "Nến lớn bao trùm nến nhỏ" : "Cốc + tay cầm"}
          </p>
        </div>

        {/* Side info */}
        <div className="min-w-0 flex-1 space-y-2">
          {item.meaning && (
            <div className="rounded-md border border-up/20 bg-up/5 px-2 py-1.5">
              <div className="mb-0.5 inline-flex items-center gap-1 text-[10px] font-semibold text-up">
                <IconCheckCircle style={{ fontSize: 12 }} />
                Ý nghĩa
              </div>
              <p className="text-[10px] leading-snug text-[var(--color-text-2)]">{item.meaning}</p>
            </div>
          )}
          {item.action && (
            <div className="rounded-md border border-[rgb(var(--primary-6))]/20 bg-[rgb(var(--primary-6))]/5 px-2 py-1.5">
              <div className="mb-0.5 inline-flex items-center gap-1 text-[10px] font-semibold text-[rgb(var(--primary-6))]">
                <IconTrendingUp style={{ fontSize: 12 }} />
                Hành động đề xuất
              </div>
              <p className="text-[10px] leading-snug text-[var(--color-text-2)]">{item.action}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
