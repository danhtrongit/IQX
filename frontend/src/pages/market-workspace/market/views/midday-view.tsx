// ─── MidDayView — bản tin Giữa phiên (11:30) ─────────────────────────────────
// Ported from the legacy `midday/MidDayView`. Always renders ITS OWN latest brief
// — never falls back to the end-of-day (cuối phiên) report. When no brief exists
// at all, the "đang xử lý" notice is shown with a retry. When the latest brief
// isn't today's, a stale banner is shown instead and the afternoon countdown is
// suppressed (an old brief must never look live).
//
// Refetch control (legacy): 11:30–13:00 → polling off, the AM session is frozen
// at its close; otherwise 30 s. Reproduced with `refetchInterval` on the shared
// fetcher/key — `useMidDayMarketAnalysis` exposes no interval, and reusing its
// query key means the workspace's eager fetch and this view share one cache entry.
//
// Chart tiers are gated per block on `data_state`: a degraded block arrives as
// `{data_state:"unavailable"}` — truthy, but missing every field the chart
// dereferences (the 2026-07-02 prod crash read `streak.direction` of undefined).
// Only `am_session` (measured this morning) and `eod_previous` (yesterday's
// close, for the frozen health tier) may mount a chart.

import { useEffect, useState, type ReactNode } from "react"
import { useQuery } from "@tanstack/react-query"
import { Clock, LoaderCircle } from "lucide-react"

import { Button } from "@/components/ui/button"
import { errorMessage } from "@/lib/api"

import { fetchMidDayAnalysis } from "../api"
import { formatSessionDate, useLocalTodayIso } from "../date"
import { marketWorkspaceKeys } from "../keys"
import type { MidDayAnalysis } from "../types"
import { BreadthChart } from "./charts/breadth-chart"
import { ChartCard } from "./charts/chart-card"
import { ContributionChart } from "./charts/contribution-chart"
import { ForeignFlowCard } from "./charts/foreign-flow-card"
import { HealthLineChart } from "./charts/health-line-chart"
import { PropFlowCard } from "./charts/prop-flow-card"
import { RotationChart } from "./charts/rotation-chart"
import { TierLabel } from "./charts/tier-label"
import { MidDayArticle } from "./midday/midday-article"
import { MidDayPulseBar } from "./midday/midday-pulse-bar"
import { MidDayTakeaway } from "./midday/midday-takeaway"

const BRIEF_STALE_MS = 30 * 60 * 1000
const LIVE_POLL_MS = 30_000
const LUNCH_RECHECK_MS = 30_000

/** 11:30 → 13:00 local: the morning session is over, so live polling stops. */
function computeIsLunch(now: Date): boolean {
  const minutes = now.getHours() * 60 + now.getMinutes()
  return minutes >= 690 && minutes < 780
}

/**
 * A block measured in this morning's session. A degraded block is truthy, so a
 * truthiness check would mount a chart over missing fields — only the explicit
 * `data_state` may open a tier.
 */
function isAm<T extends { data_state?: string }>(
  block: T | null | undefined,
): block is T & { data_state: "am_session" } {
  return block?.data_state === "am_session"
}

/** A block that carries yesterday's close — the only safe source for the frozen tier. */
function isEod<T extends { data_state?: string }>(
  block: T | null | undefined,
): block is T & { data_state: "eod_previous" } {
  return block?.data_state === "eod_previous"
}

/** Slot placeholder for a chart whose data source is not computable yet. */
function AmUnavailableCard({ title }: { title: string }) {
  return (
    <ChartCard title={title}>
      <div className="flex min-h-[120px] items-center justify-center px-4 py-6 text-center text-[13px] text-muted-foreground">
        Đang xử lý · số đầy đủ có trong bản cuối ngày 16:30
      </div>
    </ChartCard>
  )
}

const FROZEN_NOTE = "Dữ liệu cuối ngày · Cập nhật sau 16:30"
const FROZEN_TAG = "Cuối ngày hôm qua"

/** Every stop the bản-tin tour spotlights in this view, in reading order. */
const TOUR_TARGETS = [
  ["tour-bantin-mid-header", "Bản Giữa phiên · đang tải dữ liệu…"],
  ["tour-bantin-mid-structure", "Cấu trúc phiên sáng · đang tải dữ liệu…"],
  ["tour-bantin-mid-flow", "Dòng tiền phiên sáng · đang tải dữ liệu…"],
  ["tour-bantin-mid-health", "Sức khỏe thị trường · cập nhật lúc 16:30"],
  ["tour-bantin-mid-confirm", "Điểm cần xác nhận trong phiên chiều · đang tải dữ liệu…"],
  ["tour-bantin-mid-pulse", "Pulse Bar · đang tải dữ liệu…"],
  ["tour-bantin-mid-takeaway", "Kịch bản và mã đáng quan sát · đang tải dữ liệu…"],
  ["tour-bantin-mid-breadth", "Độ rộng thị trường HOSE · đang tải dữ liệu…"],
  ["tour-bantin-mid-contribution", "Top mã đóng góp ± · đang tải dữ liệu…"],
  ["tour-bantin-mid-foreign", "Khối ngoại · đang tải dữ liệu…"],
  ["tour-bantin-mid-prop", "Tự doanh CTCK · đang tải dữ liệu…"],
  ["tour-bantin-mid-health-detail", "Sức khỏe thị trường chi tiết · cập nhật lúc 16:30"],
  ["tour-bantin-mid-rotation", "Dòng tiền chuyển nhóm · cập nhật lúc 16:30"],
] as const

export function MidDayView({ tourMode = false }: { tourMode?: boolean }): ReactNode {
  const [isLunch, setIsLunch] = useState(() => computeIsLunch(new Date()))
  const today = useLocalTodayIso()

  // Recompute the lunch window every 30 s so the freeze banner and the polling
  // switch both flip on their own.
  useEffect(() => {
    const id = window.setInterval(() => setIsLunch(computeIsLunch(new Date())), LUNCH_RECHECK_MS)
    return () => window.clearInterval(id)
  }, [])

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery<MidDayAnalysis>({
    queryKey: marketWorkspaceKeys.analysis.latest("midday", today),
    queryFn: ({ signal }) => fetchMidDayAnalysis(signal),
    staleTime: BRIEF_STALE_MS,
    refetchInterval: isLunch ? false : LIVE_POLL_MS,
  })

  // Loading spinner — first load only, and never in front of the tour.
  if (isLoading && !data && !tourMode) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center gap-2 text-muted-foreground">
        <LoaderCircle className="size-4 animate-spin" aria-hidden />
        <span className="text-[13px]">Đang tải nhận định phiên sáng…</span>
      </div>
    )
  }

  const charts = data?.charts
  const breadthBlock = charts?.breadth
  const contributionBlock = charts?.contribution
  const foreignBlock = charts?.foreign_detail
  const propBlock = charts?.prop_detail
  const healthBlock = charts?.market_health_detail
  const rotationBlock = charts?.sector_rotation

  if (!data) {
    // The tour still has to walk every stop, so the targets are laid out as
    // placeholders with their real labels.
    if (tourMode) {
      return (
        <div className="mx-auto w-full max-w-[1180px] space-y-3">
          {TOUR_TARGETS.map(([id, label]) => (
            <section
              key={id}
              data-tour-id={id}
              className="rounded-lg border border-dashed border-border bg-card p-6 text-[13px] text-muted-foreground"
            >
              {label}
            </section>
          ))}
        </div>
      )
    }

    return (
      <div className="mx-auto w-full max-w-[1180px]">
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-muted px-4 py-2 text-xs text-muted-foreground">
          <Clock className="size-4 shrink-0" aria-hidden />
          <span>Bản phiên sáng đang xử lý.</span>
          <Button variant="outline" className="ml-auto" onClick={() => void refetch()} disabled={isFetching}>
            {isFetching ? "Đang tải…" : "Thử lại"}
          </Button>
        </div>
        {isError && <p className="mt-2 text-xs text-destructive">{errorMessage(error)}</p>}
      </div>
    )
  }

  // The latest brief is always rendered — but when it isn't today's, it is
  // labelled as stale and the countdown is withheld.
  const isDataForToday = data.session_date === today

  return (
    <div className="mx-auto w-full max-w-[1180px] space-y-3.5">
      {!isDataForToday && (
        <div className="flex items-center gap-2 rounded-lg bg-muted px-4 py-2 text-xs text-muted-foreground">
          <Clock className="size-4 shrink-0" aria-hidden />
          <span>Bản gần nhất {formatSessionDate(data.session_date)} · chưa cập nhật hôm nay</span>
        </div>
      )}

      <MidDayArticle data={data} tourMode={tourMode} />

      {data.pulse ? (
        <div data-tour-id="tour-bantin-mid-pulse">
          <MidDayPulseBar data={data} isLunch={isLunch} />
        </div>
      ) : tourMode ? (
        <div
          data-tour-id="tour-bantin-mid-pulse"
          className="rounded-lg border border-dashed border-border p-6 text-[13px] text-muted-foreground"
        >
          Pulse Bar · đang tải dữ liệu…
        </div>
      ) : null}

      <MidDayTakeaway data={data} showCountdown={isDataForToday} />

      {/* ── Cấu trúc phiên (Breadth + Contribution) ────────────────────────── */}
      {(tourMode || isAm(breadthBlock) || isAm(contributionBlock)) && (
        <div>
          <TierLabel label="Cấu trúc phiên" />
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div data-tour-id="tour-bantin-mid-breadth">
              {isAm(breadthBlock) ? (
                <BreadthChart data={breadthBlock} />
              ) : (
                <AmUnavailableCard title="Độ rộng thị trường HOSE" />
              )}
            </div>
            <div data-tour-id="tour-bantin-mid-contribution">
              {isAm(contributionBlock) ? (
                <ContributionChart data={contributionBlock} />
              ) : (
                <AmUnavailableCard title="Top mã đóng góp ±" />
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Dòng tiền (Foreign + Prop flow) ────────────────────────────────── */}
      {(tourMode || isAm(foreignBlock) || isAm(propBlock)) && (
        <div>
          <TierLabel label="Dòng tiền" />
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div data-tour-id="tour-bantin-mid-foreign">
              {isAm(foreignBlock) ? (
                <ForeignFlowCard data={foreignBlock} />
              ) : (
                <AmUnavailableCard title="Khối ngoại" />
              )}
            </div>
            <div data-tour-id="tour-bantin-mid-prop">
              {isAm(propBlock) ? (
                <PropFlowCard
                  data={propBlock}
                  foreignNet={
                    isAm(foreignBlock)
                      ? foreignBlock.total_buy_vnd_billion - foreignBlock.total_sell_vnd_billion
                      : undefined
                  }
                />
              ) : (
                <AmUnavailableCard title="Tự doanh CTCK" />
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Sức khỏe thị trường (FROZEN — số cuối ngày, có sau 16:30) ──────── */}
      {(tourMode || (isEod(healthBlock) && isEod(rotationBlock))) && (
        <div>
          <TierLabel label="Sức khỏe thị trường" />
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div data-tour-id="tour-bantin-mid-health-detail">
              {isEod(healthBlock) ? (
                <HealthLineChart
                  data={healthBlock}
                  classification={breadthBlock?.classification ?? ""}
                  frozen
                  dataTag={FROZEN_TAG}
                  frozenNote={FROZEN_NOTE}
                />
              ) : (
                <AmUnavailableCard title="Sức khỏe thị trường" />
              )}
            </div>
            <div data-tour-id="tour-bantin-mid-rotation">
              {isEod(rotationBlock) ? (
                <RotationChart
                  data={rotationBlock}
                  frozen
                  dataTag={FROZEN_TAG}
                  frozenNote={FROZEN_NOTE}
                />
              ) : (
                <AmUnavailableCard title="Dòng tiền chuyển nhóm" />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
