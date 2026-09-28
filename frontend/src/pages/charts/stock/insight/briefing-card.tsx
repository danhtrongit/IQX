/**
 * Hero briefing card — the six blocks of the daily AI briefing:
 *   1 eyebrow + xu hướng / trạng thái / khung phân tích
 *   2 narrative
 *   3 so với phiên trước
 *   4 quan sát theo 5 góc
 *   5 mốc theo dõi
 *   6 gợi ý hôm nay
 */
import { cn } from "@/lib/utils"

import type { BriefingCard as BriefingCardData, NarrativeFragment } from "../types"

import { formatInsightTime } from "./masthead"
import { NarrativeText } from "./narrative-text"

const VERDICT_TONE: Record<BriefingCardData["recommendation"], string> = {
  "Chờ điểm mua": "text-price-up",
  "Có thể mua thử": "text-price-up",
  "Quan sát thêm": "text-price-ref",
  "Nên giảm bớt": "text-price-down",
  "Bán bớt": "text-price-down",
}

const STATUS_TONE: Record<BriefingCardData["statusVariant"], string> = {
  bull: "text-price-up",
  warn: "text-price-ref",
  bear: "text-price-down",
  neutral: "text-foreground",
}

const EYEBROW_CLASS = "text-xs font-semibold tracking-widest uppercase"

export function BriefingCard({ data }: { data: BriefingCardData }) {
  const observations = data.observations
  // Every block renders (even when its payload is empty): the product tour and
  // the L6 layout both address these blocks by `data-tour-id`, so a missing
  // upstream field must not remove the element — it shows "—" instead.
  const observationRows: { label: string; fragments?: NarrativeFragment[] }[] = [
    { label: "Thanh khoản", fragments: observations?.liquidity },
    { label: "Dòng tiền", fragments: observations?.moneyFlow },
    { label: "Nội bộ", fragments: observations?.insider },
    { label: "Tin tức", fragments: observations?.news },
    { label: "Hỗ trợ & Kháng cự", fragments: observations?.supportResistance },
  ]

  const watchLevels = (data.watchLevels ?? []).filter((level) => level != null)
  const diff = data.diff
  const isFirstAnalysis = !diff || diff.isFirstAnalysis

  return (
    <article className="relative flex flex-col gap-5 overflow-hidden rounded-lg border-0 bg-card px-5 py-6">
      <span className="absolute top-0 left-0 h-[3px] w-20 bg-price-ref" aria-hidden="true" />

      {/* Khối 1 */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className={cn(EYEBROW_CLASS, "text-price-ref")}>BẢN BRIEFING HÔM NAY</span>
          <span className="text-xs text-muted-foreground tabular-nums">
            Cập nhật {formatInsightTime(data.updatedAt)}
          </span>
        </div>

        <div
          data-tour-id="tour-phantich-trend"
          className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-border pb-4"
        >
          <div className="flex items-center gap-2">
            <span className="text-xs tracking-wide text-muted-foreground uppercase">Xu hướng</span>
            <span className="text-xs font-medium">{data.trend}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs tracking-wide text-muted-foreground uppercase">Trạng thái</span>
            <span
              className={cn(
                "text-xs font-medium",
                STATUS_TONE[data.statusVariant] ?? "text-foreground",
              )}
            >
              {data.status}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs tracking-wide text-muted-foreground uppercase">
              Khung phân tích
            </span>
            <span className="text-xs font-medium text-muted-foreground">{data.timeframe}</span>
          </div>
        </div>
      </div>

      {/* Khối 2 */}
      <p
        data-tour-id="tour-phantich-narrative"
        className="font-heading text-base leading-7"
      >
        <NarrativeText fragments={data.narrative} />
      </p>

      {/* Khối 3 */}
      <div
        data-tour-id="tour-phantich-diff"
        className="flex items-start gap-3.5 border-l-2 border-l-price-ref bg-price-ref/5 px-4 py-3"
      >
        <span
          className={cn(
            EYEBROW_CLASS,
            "shrink-0 pt-px whitespace-nowrap",
            isFirstAnalysis ? "text-muted-foreground" : "text-price-ref",
          )}
        >
          SO VỚI PHIÊN TRƯỚC
        </span>
        <span className="text-xs leading-5">
          {isFirstAnalysis ? (
            "Lần đầu phân tích — chưa có dữ liệu để so sánh"
          ) : (
            <NarrativeText fragments={diff?.text} />
          )}
        </span>
      </div>

      {/* Khối 4 */}
      <div data-tour-id="tour-phantich-observations">
        <p className={cn(EYEBROW_CLASS, "mb-3 border-b border-border pb-1.5 text-muted-foreground")}>
          QUAN SÁT THEO 5 GÓC
        </p>
        <div className="flex flex-col gap-3">
          {observationRows.map((row) => (
            <div
              key={row.label}
              className="grid grid-cols-1 gap-0.5 text-xs leading-5 md:grid-cols-[130px_1fr] md:gap-5"
            >
              <span className="pt-px text-xs font-medium tracking-wide text-muted-foreground uppercase">
                {row.label}
              </span>
              <span>
                {(row.fragments ?? []).length > 0 ? (
                  <NarrativeText fragments={row.fragments} />
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Khối 5 */}
      <div
        data-tour-id="tour-phantich-levels"
        className="rounded-md border-t border-t-price-ref bg-muted px-4 py-3"
      >
        <p className={cn(EYEBROW_CLASS, "mb-2 text-price-ref")}>MỐC THEO DÕI</p>
        {watchLevels.length === 0 ? (
          <p className="text-xs leading-5 text-muted-foreground">Chưa có mốc theo dõi.</p>
        ) : (
          <div className="flex flex-col gap-2.5">
            {watchLevels.map((level, index) => (
              <div
                key={`${level.tag}-${index}`}
                className="grid grid-cols-[auto_1fr] items-baseline gap-3.5 text-xs leading-5"
              >
                <span className="font-semibold tracking-wide text-muted-foreground uppercase">
                  {level.tag}
                </span>
                <span>{level.description}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Khối 6 */}
      <div
        data-tour-id="tour-phantich-verdict"
        className="flex flex-wrap items-baseline justify-between gap-3 border-t-2 border-t-price-ref pt-5"
      >
        <span className={cn(EYEBROW_CLASS, "text-muted-foreground")}>GỢI Ý HÔM NAY</span>
        <span
          className={cn(
            "font-heading text-2xl leading-none font-medium",
            VERDICT_TONE[data.recommendation] ?? "text-muted-foreground",
          )}
        >
          {data.recommendation}
        </span>
      </div>
    </article>
  )
}
