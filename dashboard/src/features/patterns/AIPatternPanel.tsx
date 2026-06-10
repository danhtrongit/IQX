import { useEffect, useMemo, useRef, useState } from "react"
import {
  IconExclamationCircle,
  IconCheckCircle,
  IconInfoCircle,
} from "@arco-design/web-react/icon"
import { useSymbol } from "@/shared/contexts/symbol-context"
import { cn } from "@/shared/lib/cn"
import { IconCandlestick, IconTrendLineChart, IconSparkles } from "@/shared/icons"
import { usePatterns } from "./hooks"
import type { PatternKind, PatternSignal } from "./api"
import { CandlePatternIllustration, ChartPatternIllustration } from "./PatternIllustration"
import { AIAnalyzingOverlay } from "./AIAnalyzingOverlay"

const KIND_LABEL: Record<PatternKind, string> = {
  candles: "AI Mẫu nến",
  charts: "AI Mẫu hình giá",
}

const SIGNAL_TEXT: Record<PatternSignal, string> = {
  bullish: "Bullish",
  bearish: "Bearish",
  neutral: "Trung tính",
}

const SIGNAL_CLS: Record<PatternSignal, string> = {
  bullish: "text-up",
  bearish: "text-down",
  neutral: "text-reference",
}

// "Trung bình" / "Cao" / "Thấp" for candles, breakout state for charts.
function stateColor(kind: PatternKind, state: string | null): string {
  if (!state) return "text-[var(--color-text-3)]"
  const s = state.toLowerCase()
  if (kind === "candles") {
    if (s.includes("cao")) return "text-up"
    if (s.includes("thấp")) return "text-reference"
    return "text-reference"
  }
  // charts
  if (s.includes("breakout") && !s.includes("fail")) return "text-up"
  if (s.includes("fail")) return "text-down"
  if (s.includes("sẵn sàng")) return "text-floor"
  return "text-reference"
}

export function AIPatternPanel() {
  const { symbol } = useSymbol()
  const [kind, setKind] = useState<PatternKind>("candles")
  const [activeIdx, setActiveIdx] = useState(0)
  // Short "AI đang phân tích" overlay shown when the user picks a different
  // pattern from the detail list. Independent from the fetch loading state.
  const [analyzing, setAnalyzing] = useState(false)
  const analyzeTimerRef = useRef<number | null>(null)

  const { items, isLoading, isError } = usePatterns(kind, symbol || null)

  // Reset the active index whenever the result set changes.
  useEffect(() => {
    setActiveIdx(0)
  }, [items])

  const triggerAnalyzing = (durationMs = 750) => {
    if (analyzeTimerRef.current) window.clearTimeout(analyzeTimerRef.current)
    setAnalyzing(true)
    analyzeTimerRef.current = window.setTimeout(() => {
      setAnalyzing(false)
      analyzeTimerRef.current = null
    }, durationMs)
  }

  useEffect(() => {
    return () => {
      if (analyzeTimerRef.current) window.clearTimeout(analyzeTimerRef.current)
    }
  }, [])

  const selectPattern = (idx: number) => {
    if (idx === activeIdx) return
    setActiveIdx(idx)
    triggerAnalyzing()
  }

  const handleKindChange = (next: PatternKind) => {
    if (next === kind) return
    setKind(next)
    triggerAnalyzing(900)
  }

  const active = useMemo(
    () => (items.length > 0 ? items[Math.min(activeIdx, items.length - 1)] : null),
    [items, activeIdx],
  )

  return (
    <div className="flex flex-col h-full">
      {/* Header — segmented buttons to switch kind */}
      <div className="flex items-center gap-1.5 px-2 py-2 border-b border-[var(--color-border-2)] bg-[var(--color-bg-2)]">
        <div className="flex-1 inline-flex items-center rounded-md bg-[var(--color-fill-2)] p-0.5 gap-0.5">
          {(
            [
              { id: "candles" as const, icon: IconCandlestick, label: "AI Mẫu nến" },
              { id: "charts" as const, icon: IconTrendLineChart, label: "AI Mẫu giá" },
            ]
          ).map(({ id, icon: Icon, label }) => {
            const isActive = kind === id
            return (
              <button
                key={id}
                onClick={() => handleKindChange(id)}
                className={cn(
                  "flex-1 inline-flex items-center justify-center gap-1 h-7 rounded text-[11px] font-semibold transition-colors",
                  isActive
                    ? "bg-[var(--color-primary-light-1)] text-[rgb(var(--primary-6))]"
                    : "text-[var(--color-text-3)] hover:text-[var(--color-text-1)] hover:bg-[var(--color-fill-3)]",
                )}
              >
                <Icon />
                {label}
              </button>
            )
          })}
        </div>
        <span className="text-[10px] text-[var(--color-text-3)] tabular-nums shrink-0">
          {symbol}
        </span>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="p-3 space-y-3">
          {isLoading || analyzing ? (
            <AIAnalyzingOverlay
              label={isLoading ? `Đang phân tích ${KIND_LABEL[kind]}` : undefined}
            />
          ) : isError ? (
            <div className="flex flex-col items-center justify-center py-16 text-[var(--color-text-3)]">
              <IconExclamationCircle className="mb-2 text-reference text-base" />
              <span className="text-[10px]">Không thể tải dữ liệu pattern</span>
            </div>
          ) : !active ? (
            <div className="flex flex-col items-center justify-center py-16 text-[var(--color-text-3)]">
              <IconSparkles className="mb-2 opacity-30 text-base" />
              <span className="text-[10px]">Chưa có pattern cho {symbol}</span>
            </div>
          ) : (
            <>
              {/* Hero header — pattern name + signal/state badges */}
              <div className="flex items-start justify-between gap-2">
                <h2 className="text-2xl font-extrabold text-[var(--color-text-1)] leading-tight tracking-tight">
                  {active.name}
                </h2>
                <div className="flex flex-col gap-1.5 shrink-0">
                  <div className="text-[10px] flex items-center gap-1 px-2 py-1 rounded-md border border-[var(--color-success-light-3)] bg-[var(--color-success-light-1)]">
                    <span className="text-[var(--color-text-3)]">Tín hiệu:</span>
                    <span className={cn("font-bold", SIGNAL_CLS[active.signal])}>
                      {SIGNAL_TEXT[active.signal]}
                    </span>
                  </div>
                  {active.state && (
                    <div className="text-[10px] flex items-center gap-1 px-2 py-1 rounded-md border border-[var(--color-warning-light-3)] bg-[var(--color-warning-light-1)]">
                      <span className="text-[var(--color-text-3)]">
                        {kind === "candles" ? "Mức độ:" : "Trạng thái:"}
                      </span>
                      <span className={cn("font-bold", stateColor(kind, active.state))}>
                        {active.state}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Illustration — rendered inline as theme-aware SVG */}
              <div className="rounded-lg border border-[var(--color-border-2)] bg-[var(--color-fill-1)] p-3">
                <div className="flex items-center gap-1 text-[10px] text-[var(--color-text-3)] mb-2">
                  <span>
                    {kind === "candles"
                      ? `Minh họa nến ${active.name}`
                      : "Minh họa mô hình giá"}
                  </span>
                  <IconInfoCircle className="opacity-60" />
                </div>
                <div className="aspect-[4/3] w-full flex items-center justify-center">
                  {kind === "candles" ? (
                    <CandlePatternIllustration name={active.name} signal={active.signal} />
                  ) : (
                    <ChartPatternIllustration name={active.name} />
                  )}
                </div>
              </div>

              {/* Meaning card */}
              {active.meaning && (
                <div className="rounded-lg border border-[var(--color-border-2)] bg-[var(--color-fill-1)] p-3 space-y-1.5">
                  <div className="flex items-center gap-1.5 text-[11px] font-bold text-[var(--color-text-1)]">
                    <IconInfoCircle className="text-[rgb(var(--primary-6))]" />
                    <span>Ý nghĩa</span>
                  </div>
                  <p className="text-[11px] leading-relaxed text-[var(--color-text-2)]">
                    {active.meaning}
                  </p>
                </div>
              )}

              {/* Action card */}
              {active.action && (
                <div className="rounded-lg border border-[var(--color-success-light-3)] bg-[var(--color-success-light-1)] p-3 space-y-1.5">
                  <div className="flex items-center gap-1.5 text-[11px] font-bold text-up">
                    <IconCheckCircle />
                    <span>Hành động đề xuất</span>
                  </div>
                  <p className="text-[11px] leading-relaxed text-[var(--color-text-2)]">
                    {active.action}
                  </p>
                </div>
              )}

              {/* All patterns rendered inline. Scroll via parent. */}
              {items.length > 0 && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between px-1">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-3)]">
                      Tất cả pattern
                    </span>
                    <span className="text-[9px] text-[var(--color-text-3)]">
                      {items.length} pattern
                    </span>
                  </div>
                  {items.map((p, idx) => {
                    const isActive = idx === activeIdx
                    return (
                      <button
                        key={`${p.name}-${idx}`}
                        onClick={() => selectPattern(idx)}
                        className={cn(
                          "w-full text-left rounded-md border px-2.5 py-1.5 transition-colors",
                          isActive
                            ? "border-[var(--color-primary-light-3)] bg-[var(--color-primary-light-1)]"
                            : "border-[var(--color-border-2)] bg-[var(--color-fill-1)] hover:bg-[var(--color-fill-2)]",
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] font-semibold text-[var(--color-text-1)] truncate">
                            {p.name}
                          </span>
                          <span className={cn("text-[9px] font-bold shrink-0", SIGNAL_CLS[p.signal])}>
                            {SIGNAL_TEXT[p.signal]}
                          </span>
                        </div>
                        {p.state && (
                          <span className={cn("text-[9px]", stateColor(kind, p.state))}>
                            {p.state}
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
