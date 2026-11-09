/**
 * Đo chiều cao còn trống để biểu đồ Flashback gói gọn trong màn hình (spec v2.1 §8).
 *
 * Màn chơi nằm trong một khung cuộn (`ScrollArea`). Chiều cao còn trống của biểu đồ là chiều cao khung
 * cuộn trừ vị trí của biểu đồ bên trong nội dung (tính theo nội dung nên không đổi khi người chơi cuộn)
 * trừ phần bên dưới (đáy khung chứa biểu đồ, nút "Phiên tiếp", lề trang). Đo lại khi cửa sổ hoặc nội
 * dung đổi cỡ; giá trị không đổi thì không render lại.
 */
import { useCallback, useState, type RefCallback } from "react"

import { PAGE_NARROW_WIDTH } from "./flashback-chart-layout"
import { CARDS_TRAY_HEIGHT } from "./flashback-cards-model"

/** Nút "Phiên tiếp" cao 36px: trước Candle Dojo, hàng dưới biểu đồ chỉ cao bằng nút. */
const NEXT_BUTTON_HEIGHT = 36

/**
 * Phần bên dưới biểu đồ trên máy tính: lề dưới khung chứa (10) + viền (1) + khoảng cách (12) + hàng dưới biểu đồ + lề trang (20, màn rất
 * rộng). Hàng dưới biểu đồ giờ có nút "Phiên tiếp" và khối "Thẻ trong ván" (Candle Dojo §9.3) nên cao bằng khối thẻ (thẻ 52px cao 73px không
 * lọt vừa hàng cao 36px): 79 - 36 + chiều cao khối thẻ, để màn chơi vẫn vừa một màn hình (v2.1 §8). Hàng này không thêm hàng nào dưới
 * biểu đồ, và cao cố định kể cả khi chưa có thẻ nên biểu đồ không nhảy khi gặp thẻ đầu tiên.
 */
export const CHART_BOTTOM_RESERVE = 80 - NEXT_BUTTON_HEIGHT + CARDS_TRAY_HEIGHT

export type ChartFit = {
  /** Chiều cao còn trống cho biểu đồ (px); null khi chưa đo được. */
  available: number | null
  /** Cửa sổ hẹp: trang dùng bố cục điện thoại, biểu đồ cao cố định. */
  pageNarrow: boolean
}

const UNMEASURED: ChartFit = { available: null, pageNarrow: false }

const SCROLLER = '[data-slot="scroll-area-viewport"]'

/** Chiều cao còn trống tính từ vị trí của `element` tới đáy vùng nhìn thấy, trừ phần bên dưới. */
export function measureAvailableHeight(element: HTMLElement): number {
  const scroller = element.closest<HTMLElement>(SCROLLER)
  const elementRect = element.getBoundingClientRect()
  // Khung cuộn chưa có kích thước (chưa bố cục, jsdom) thì dùng chiều cao cửa sổ.
  if (scroller && scroller.clientHeight > 0) {
    const top = elementRect.top - scroller.getBoundingClientRect().top + scroller.scrollTop
    return scroller.clientHeight - top - CHART_BOTTOM_RESERVE
  }
  return window.innerHeight - (elementRect.top + window.scrollY) - CHART_BOTTOM_RESERVE
}

export function useChartFit(): [RefCallback<HTMLElement>, ChartFit] {
  const [fit, setFit] = useState<ChartFit>(UNMEASURED)
  const ref = useCallback<RefCallback<HTMLElement>>((element) => {
    if (!element) return
    const measure = () => {
      const next: ChartFit = {
        available: Math.floor(measureAvailableHeight(element)),
        pageNarrow: window.innerWidth <= PAGE_NARROW_WIDTH,
      }
      setFit((previous) =>
        previous.available === next.available && previous.pageNarrow === next.pageNarrow ? previous : next,
      )
    }
    measure()
    window.addEventListener("resize", measure)
    const scroller = element.closest<HTMLElement>(SCROLLER)
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure)
    // Nội dung phía trên biểu đồ đổi cao (thanh người chơi xuống dòng...) thì nội dung đổi cao theo.
    if (observer && scroller) {
      observer.observe(scroller)
      if (scroller.firstElementChild) observer.observe(scroller.firstElementChild)
    }
    return () => {
      window.removeEventListener("resize", measure)
      observer?.disconnect()
    }
  }, [])
  return [ref, fit]
}
