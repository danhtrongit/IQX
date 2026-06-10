import type { ReactNode } from "react"
import { IconExclamationCircle, IconInfoCircle } from "@arco-design/web-react/icon"
import { useForecastRatio } from "../hooks"
import { fmtPctFraction, fmtRatioPlain, fmtVnd } from "../format"
import { IconSparkles } from "../icons"

export function ForecastRightRail({ symbol }: { symbol: string | null }) {
  const { data: ratio, isFetching, error } = useForecastRatio(symbol)

  if (!symbol) {
    return (
      <Frame>
        <div className="flex flex-col items-center justify-center py-8 text-[var(--color-text-3)]">
          <IconSparkles className="mb-2 opacity-30" style={{ fontSize: 20 }} />
          <span className="text-xs">Chọn 1 mã để xem chi tiết</span>
        </div>
      </Frame>
    )
  }

  if (isFetching && !ratio) {
    return (
      <Frame>
        <div className="py-6 text-center text-[11px] text-[var(--color-text-3)]">Đang tải...</div>
      </Frame>
    )
  }

  if (error || !ratio) {
    return (
      <Frame>
        <div className="inline-flex w-full items-center justify-center gap-1 py-6 text-center text-[11px] text-[var(--color-text-3)]">
          <IconExclamationCircle className="text-[rgb(var(--warning-6))]" style={{ fontSize: 12 }} />
          {error ? "Lỗi tải chỉ số" : "Không có dữ liệu"}
        </div>
      </Frame>
    )
  }

  return (
    <Frame>
      {/* Top row: P/E, P/B, EPS, BVPS */}
      <div className="grid grid-cols-4 gap-2">
        <RatioCell label="P/E" value={fmtRatioPlain(ratio.pe)} />
        <RatioCell label="P/B" value={fmtRatioPlain(ratio.pb)} />
        <RatioCell label="EPS" value={fmtVnd(ratio.eps)} />
        <RatioCell label="BVPS" value={fmtVnd(ratio.bvps)} />
      </div>
      {/* Bottom row: ROA, ROE, D/E */}
      <div className="mt-2 grid grid-cols-3 gap-2">
        <RatioCell label="ROA" value={fmtPctFraction(ratio.roa)} />
        <RatioCell label="ROE" value={fmtPctFraction(ratio.roe)} />
        <RatioCell label="D/E" value={fmtRatioPlain(ratio.de)} />
      </div>
    </Frame>
  )
}

function Frame({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-[var(--color-border-1)] bg-[var(--color-bg-2)] p-3">
      <div className="mb-2.5 flex items-center gap-1.5">
        <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--color-text-1)]">
          Chỉ số BCTC
        </span>
        <IconInfoCircle className="text-[var(--color-text-4)]" style={{ fontSize: 12 }} />
      </div>
      {children}
    </div>
  )
}

function RatioCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-[var(--color-border-1)] bg-[var(--color-bg-1)] px-2 py-2.5 text-center">
      <div className="text-sm font-extrabold uppercase tracking-wider text-[rgb(var(--primary-6))]">
        {label}
      </div>
      <div className="mt-1 text-base font-bold tabular-nums text-[var(--color-text-1)]">{value}</div>
    </div>
  )
}
