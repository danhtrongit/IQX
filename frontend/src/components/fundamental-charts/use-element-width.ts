import { useCallback, useState, type RefCallback } from "react"

/** Độ rộng trước lần đo đầu và khi khung chưa có bố cục (jsdom, khung ẩn). */
export const FALLBACK_WIDTH = 520
/** Không vẽ hẹp hơn mức này: dưới 300px nhãn trục bắt đầu đè nhau. */
export const MIN_WIDTH = 280

/**
 * Đo độ rộng khung vẽ và vẽ lại khi đổi kích thước (spec §4.2). Khung chưa có
 * bố cục (độ rộng 0) giữ độ rộng dự phòng thay vì bóp méo hình.
 */
export function useElementWidth(): [RefCallback<HTMLElement>, number] {
  const [width, setWidth] = useState(FALLBACK_WIDTH)
  const ref = useCallback<RefCallback<HTMLElement>>((element) => {
    if (!element) return
    const measure = () => {
      const measured = Math.round(element.clientWidth)
      if (measured > 0) setWidth(Math.max(MIN_WIDTH, measured))
    }
    measure()
    if (typeof ResizeObserver === "undefined") return
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  return [ref, width]
}
