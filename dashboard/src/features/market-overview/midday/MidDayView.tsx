// ─── MidDayView ──────────────────────────────────────────────────────────────
// Fetches the mid-day analysis and renders the full phiên sáng layout.
// Falls back to <MarketDailyPage/> (previous EOD) when data is absent or still
// being processed (midday_loading / no data), showing a small "processing" notice.
//
// Refetch control:
//   isLunch (11:30–13:00) → refetchInterval disabled (data frozen at end-of-AM)
//   Otherwise             → 30 s polling
// NOTE: useMidDayMarketAnalysis does not expose refetchInterval; we use the
// useQuery `refetchInterval` option by wiring it to the hook's `staleTime` default
// + calling queryClient.setQueryDefaults or — simpler for v1 — we use a second
// wrapper below. The hook accepts `enabled`; live refetch is handled by passing
// refetchInterval via useQuery inside this component via a direct useQuery call.

import { useState, useEffect } from "react"
import { useQuery } from "@tanstack/react-query"
import { Spin } from "@arco-design/web-react"
import { api } from "@/shared/http/client"
import { MarketDailyPage } from "../daily/MarketDailyPage"
import { ChartCard } from "../daily/charts/ChartCard"
import { TierLabel } from "../daily/charts/TierLabel"
import { BreadthChart } from "../daily/charts/BreadthChart"
import { ContributionChart } from "../daily/charts/ContributionChart"
import { ForeignFlowCard } from "../daily/charts/ForeignFlowCard"
import { PropFlowCard } from "../daily/charts/PropFlowCard"
import { HealthLineChart } from "../daily/charts/HealthLineChart"
import { RotationChart } from "../daily/charts/RotationChart"
import { MidDayArticle } from "./MidDayArticle"
import { MidDayPulseBar } from "./MidDayPulseBar"
import { MidDayTakeaway } from "./MidDayTakeaway"
import { localTodayIso } from "../home-analysis/localDate"
import type { MidDayAnalysis } from "./types"

// ─── Lunch window detection (11:30–13:00 local) ──────────────────────────────

function computeIsLunch(now: Date): boolean {
  const minutes = now.getHours() * 60 + now.getMinutes()
  return minutes >= 690 && minutes < 780 // 11:30 → 13:00
}

// ─── AM chart-block gating ────────────────────────────────────────────────────
// A degraded AM block arrives as {data_state:"unavailable"} — truthy, but every
// field the chart component dereferences is missing. Only "am_session" blocks
// are safe to mount.

function isAm(block?: { data_state?: string } | null): boolean {
  return block?.data_state === "am_session"
}

/** Placeholder shown in a chart slot whose AM data source degraded. */
function AmUnavailableCard({ title }: { title: string }) {
  return (
    <ChartCard title={title}>
      <div className="flex min-h-[120px] items-center justify-center px-4 py-6 text-center text-[13px] text-[var(--color-text-3)]">
        Đang xử lý · số đầy đủ có trong bản cuối ngày 16:30
      </div>
    </ChartCard>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function MidDayView() {
  const [isLunch, setIsLunch] = useState(() => computeIsLunch(new Date()))

  // Recompute isLunch every 30 s so the lunch banner appears/disappears correctly
  useEffect(() => {
    const id = setInterval(() => {
      setIsLunch(computeIsLunch(new Date()))
    }, 30_000)
    return () => clearInterval(id)
  }, [])

  // Own query with refetchInterval control based on lunch state.
  // During lunch the AM session is frozen → polling suppressed.
  const { data, isLoading } = useQuery<MidDayAnalysis>({
    queryKey: ["market-analysis", "midday", "latest"],
    queryFn: () => api.get("market-analysis/midday/latest").json<MidDayAnalysis>(),
    staleTime: 30 * 60 * 1000,
    refetchInterval: isLunch ? false : 30_000,
  })

  const charts = data?.charts

  // Loading spinner (first load only)
  if (isLoading && !data) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Spin tip="Đang tải nhận định phiên sáng…" />
      </div>
    )
  }

  // ─── Stale-brief gate ─────────────────────────────────────────────────────
  // Backend always returns the LATEST row (200), so `data` is truthy even when it
  // belongs to yesterday. On a weekday, yesterday's brief must NOT be shown as
  // live content — fall through to the same "processing" notice + EOD fallback.
  // On a weekend (getDay 0|6) we intentionally show the previous week's brief.
  const isWeekend = [0, 6].includes(new Date().getDay())
  const isDataForToday = !!data && data.session_date === localTodayIso()
  const isStaleOnWeekday = !!data && !isDataForToday && !isWeekend

  // Belt-and-suspenders: is the data actually for today (used to gate countdowns)
  const showCountdown = isDataForToday

  // No data yet (midday_loading / backend still processing) → EOD fallback
  if (!data || isStaleOnWeekday) {
    return (
      <div>
        {/* Processing notice */}
        <div
          className="mx-auto w-full max-w-[1280px] px-2 py-2 md:px-4"
          style={{ marginBottom: 8 }}
        >
          <div
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-[12px]"
            style={{
              background: "var(--color-fill-2)",
              border: "1px solid var(--color-border-2)",
              color: "var(--color-text-3)",
            }}
          >
            <span aria-hidden>⏱</span>
            <span>Bản phiên sáng đang xử lý — hiển thị nhận định cuối ngày hôm qua.</span>
          </div>
        </div>
        <MarketDailyPage />
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-[1280px] px-2 py-3 md:px-4">
      {/* ── AI article (phiên sáng) ── */}
      <MidDayArticle data={data} />

      {/* ── Pulse summary bar ── */}
      {data.pulse && (
        <div className="mt-3.5">
          <MidDayPulseBar data={data} isLunch={isLunch} />
        </div>
      )}

      {/* ── Takeaway (kịch bản phiên chiều + watchlist) ── */}
      <MidDayTakeaway data={data} showCountdown={showCountdown} />

      {/* ── Cấu trúc phiên (Breadth + Contribution) ──
          Per-card data_state gate: a degraded block arrives as
          {data_state:"unavailable"} — truthy but missing every field the chart
          dereferences (the 2026-07-02 prod crash: ForeignFlowCard read
          streak.direction of undefined). Only mount a card on "am_session";
          otherwise show the processing placeholder. */}
      {(isAm(charts?.breadth) || isAm(charts?.contribution)) && (
        <div>
          <TierLabel label="Cấu trúc phiên" />
          <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
            {isAm(charts?.breadth) ? (
              <BreadthChart data={charts!.breadth} />
            ) : (
              <AmUnavailableCard title="Độ rộng thị trường HOSE" />
            )}
            {isAm(charts?.contribution) ? (
              <ContributionChart data={charts!.contribution} />
            ) : (
              <AmUnavailableCard title="Top mã đóng góp ±" />
            )}
          </div>
        </div>
      )}

      {/* ── Dòng tiền (Foreign + Prop flow cards) ── */}
      {(isAm(charts?.foreign_detail) || isAm(charts?.prop_detail)) && (
        <div>
          <TierLabel label="Dòng tiền" />
          <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
            {isAm(charts?.foreign_detail) ? (
              <ForeignFlowCard data={charts!.foreign_detail} />
            ) : (
              <AmUnavailableCard title="Khối ngoại" />
            )}
            {isAm(charts?.prop_detail) ? (
              <PropFlowCard
                data={charts!.prop_detail}
                foreignNet={
                  isAm(charts?.foreign_detail)
                    ? charts!.foreign_detail.total_buy_vnd_billion -
                      charts!.foreign_detail.total_sell_vnd_billion
                    : undefined
                }
              />
            ) : (
              <AmUnavailableCard title="Tự doanh CTCK" />
            )}
          </div>
        </div>
      )}

      {/* ── Sức khỏe thị trường (FROZEN — EOD data, available after 16:30) ── */}
      {/* Gate on real prior-EOD data only. On cold-start (no prior EOD) these
          blocks come back as {data_state:"unavailable"} (truthy but missing
          trend_20d / sectors_today), which would crash HealthLineChart /
          RotationChart — so skip the tier unless both are "eod_previous". */}
      {charts?.market_health_detail?.data_state === "eod_previous" &&
        charts?.sector_rotation?.data_state === "eod_previous" && (
        <div>
          <TierLabel label="Sức khỏe thị trường" />
          <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
            <HealthLineChart
              data={charts.market_health_detail}
              classification={charts.breadth?.classification ?? ""}
              frozen
              dataTag="Cuối ngày hôm qua"
              frozenNote="Dữ liệu cuối ngày · Cập nhật sau 16:30"
            />
            <RotationChart
              data={charts.sector_rotation}
              frozen
              dataTag="Cuối ngày hôm qua"
              frozenNote="Dữ liệu cuối ngày · Cập nhật sau 16:30"
            />
          </div>
        </div>
      )}
    </div>
  )
}
