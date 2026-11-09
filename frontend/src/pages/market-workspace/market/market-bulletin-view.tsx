// ─── Market bulletin view ─────────────────────────────────────────────────────
// "Phân tích thị trường": một bản tin cuối phiên (PDF) mỗi phiên, kèm bảng theo dõi các mã đã
// đề xuất và kho bản tin 6 tháng. Tab và ngày đang xem nằm trong URL (`?bt=` và `?date=`) nên tải
// lại trang hoặc gửi link vẫn về đúng chỗ; các tham số khác của trang chứa (view, symbol...) giữ nguyên.

import { useEffect, useRef } from "react"
import { useSearchParams } from "react-router"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

import { TourCompletionNotice } from "../tour/tour-completion-notice"
import { TourLaunchButton } from "../tour/tour-launch-button"
import { TourOverlay } from "../tour/tour-overlay"
import { banTinTour, BAN_TIN_TOUR_TABS } from "../tour/configs/ban-tin-tour"
import { useProductTour } from "../tour/use-product-tour"
import { ArchiveTab } from "./archive-tab"
import { BulletinTab } from "./bulletin-tab"
import { TrackingTab } from "./tracking-tab"

export type BulletinTabId = "ban-tin" | "theo-doi" | "ban-tin-cu"

const TAB_PARAM = "bt"
const DATE_PARAM = "date"

const TABS: { id: BulletinTabId; label: string }[] = [
  { id: "ban-tin", label: "Bản tin" },
  { id: "theo-doi", label: "Theo dõi" },
  { id: "ban-tin-cu", label: "Bản tin cũ" },
]

function parseTab(value: string | null): BulletinTabId {
  return TABS.some((tab) => tab.id === value) ? (value as BulletinTabId) : "ban-tin"
}

function parseDate(value: string | null): string | null {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null
}

export function MarketBulletinView({
  autoStartTour = false,
  onTourStarted,
}: {
  autoStartTour?: boolean
  onTourStarted?: () => void
}) {
  const [params, setParams] = useSearchParams()
  const tab = parseTab(params.get(TAB_PARAM))
  const date = parseDate(params.get(DATE_PARAM))
  const autoStarted = useRef(false)

  const update = (nextTab: BulletinTabId, nextDate: string | null) => {
    setParams(
      (previous) => {
        const next = new URLSearchParams(previous)
        if (nextTab === "ban-tin") next.delete(TAB_PARAM)
        else next.set(TAB_PARAM, nextTab)
        if (nextDate && nextTab === "ban-tin") next.set(DATE_PARAM, nextDate)
        else next.delete(DATE_PARAM)
        return next
      },
      { replace: true },
    )
  }

  const tour = useProductTour(banTinTour, "bantin", {
    // Mỗi bước của tour nằm trong một tab; chuyển tab trước khi làm nổi phần tử đích.
    onStepView: (index) => update(BAN_TIN_TOUR_TABS[index] ?? "ban-tin", null),
  })

  useEffect(() => {
    if (!autoStartTour || autoStarted.current) return
    autoStarted.current = true
    onTourStarted?.()
    tour.start()
  }, [autoStartTour, onTourStarted, tour])

  return (
    <div className="mx-auto w-full max-w-[1180px] space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="rounded-sm bg-primary/12 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-primary">
          Bản tin cuối phiên
        </span>
        <TourLaunchButton onClick={tour.start} label="Xem lại tour hướng dẫn" />
      </div>

      <Tabs value={tab} onValueChange={(value) => update(parseTab(value), null)} className="gap-4">
        <TabsList variant="line" className="h-9 w-full justify-start border-b border-border" data-tour-id="tour-bantin-tabs">
          {TABS.map((item) => (
            <TabsTrigger key={item.id} value={item.id} className="flex-none px-3 text-sm">
              {item.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="ban-tin">
          <BulletinTab date={date} onShowLatest={() => update("ban-tin", null)} />
        </TabsContent>
        <TabsContent value="theo-doi">
          <TrackingTab />
        </TabsContent>
        <TabsContent value="ban-tin-cu">
          <ArchiveTab onView={(selected) => update("ban-tin", selected)} />
        </TabsContent>
      </Tabs>

      <TourOverlay config={banTinTour} controller={tour} />
      <TourCompletionNotice
        pending={tour.completionPending}
        error={tour.completionError}
        onRetry={tour.retryCompletion}
      />
    </div>
  )
}
