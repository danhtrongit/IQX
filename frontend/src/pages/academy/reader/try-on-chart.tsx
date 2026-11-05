import { ChartCandlestick } from "lucide-react"
import { Link } from "react-router"

import { Button } from "@/components/ui/button"
import { tryIndicatorHref } from "@/pages/charts/chart/try-indicator-param"

import { indicatorOfLesson } from "../lesson-indicator"

/**
 * "Thử trên biểu đồ" (docs/iqline-design.md §13): in a lesson that teaches an indicator, opens the market chart
 * (`/bieu-do?chi-bao=<id>`) with that indicator on. A lesson that teaches none shows nothing.
 */
export function TryOnChart({ lessonId }: { lessonId: string }) {
  const indicator = indicatorOfLesson(lessonId)
  if (!indicator) return null
  return (
    <div className="mt-3">
      <Button asChild variant="outline" size="sm">
        <Link to={tryIndicatorHref(indicator)} data-academy-try-on-chart={indicator}>
          <ChartCandlestick aria-hidden="true" />
          Thử trên biểu đồ
        </Link>
      </Button>
    </div>
  )
}
