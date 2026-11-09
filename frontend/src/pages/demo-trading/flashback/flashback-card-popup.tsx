/**
 * Thẻ bật lên rồi lướt vào khay (Candle Dojo spec v1.2 §9.3), mỗi khi phiên vừa mở có mẫu trùng thẻ người chơi sở hữu:
 *
 * 1. Thẻ (104px, điện thoại 84px) lật ra ngay phía trên mẫu nến vừa khớp trong 0,4 giây (phía dưới nếu phía trên không đủ chỗ), cùng lúc khung
 *    của mẫu đậm lên (`onFocus`).
 * 2. Giữ nguyên 0,9 giây.
 * 3. Thẻ lướt thẳng vào ô của nó trong khay, vừa bay vừa thu về 52px trong 0,6 giây. Ô đích để trống trong lúc bay (`onFlying`), thẻ chạm tới
 *    thì ô nảy nhẹ (`onLanded`) và khung hết đậm.
 *
 * Thẻ nằm ở `document.body`, `position: fixed`, không nhận con trỏ nên không chặn Phiên tiếp, Mua, Bán. Vị trí lấy bằng
 * `getBoundingClientRect` của khung (`[data-card-box]`) và ô khay (`[data-card-slot]`), nên dùng chung cho cả hai biểu đồ. Bấm Phiên tiếp
 * khi thẻ chưa bay xong thì `finish()` đưa thẻ vào khay ngay. Giảm chuyển động: không bay, thẻ vào khay ngay. Không có Web Animations API
 * (jsdom) thì không có hiệu ứng nhưng các bước và trạng thái vẫn chạy theo đúng thời gian.
 */
import { useCallback, useImperativeHandle, useLayoutEffect, useRef, useState, type RefObject, type Ref } from "react"
import { createPortal } from "react-dom"

import { cdCard } from "@/lib/candle-dojo/cards"

import { CandleCard } from "../candle-dojo/candle-card"
import {
  CARD_ASPECT,
  FLY_MS,
  HOLD_MS,
  POP_MS,
  flightVector,
  placePopup,
  popupWidthFor,
  prefersReducedMotion,
  type MetCard,
  type Rect,
} from "./flashback-cards-model"

export type CardPopupHandle = {
  /** Kết thúc ngay: thẻ vào khay, khung hết đậm. Không có thẻ đang bay thì không làm gì. */
  finish: () => void
}

export type FlashbackCardPopupProps = {
  /** Thẻ của phiên vừa mở; mỗi lần đổi là một lần bật lên. null là chưa có. */
  arrival: MetCard | null
  /** Khung chứa biểu đồ: nơi tìm `[data-card-box]` của mẫu. */
  chartRef: RefObject<HTMLElement | null>
  /** Khối "Thẻ trong ván": nơi tìm `[data-card-slot]` của ô đích. */
  trayRef: RefObject<HTMLElement | null>
  /** Nhấn mạnh (hoặc thôi nhấn mạnh với null) khung của mẫu. */
  onFocus: (playIdx: number | null) => void
  /** Ô đích để trống trong lúc thẻ bay (null: hết bay). */
  onFlying: (playIdx: number | null) => void
  /** Thẻ đã chạm khay. */
  onLanded: (playIdx: number) => void
  ref?: Ref<CardPopupHandle>
}

const POP_KEYFRAMES: Keyframe[] = [
  { transform: "perspective(600px) rotateY(160deg) scale(.35)", opacity: 0 },
  { transform: "none", opacity: 1 },
]
const POP_EASING = "cubic-bezier(.2,1.4,.4,1)"
const FLY_EASING = "cubic-bezier(.55,0,.25,1)"

function rectOf(element: Element): Rect {
  const box = element.getBoundingClientRect()
  return { left: box.left, top: box.top, width: box.width, height: box.height }
}

/** Chỗ thay khi chưa tìm thấy khung (biểu đồ chưa dựng): giữa phần trên của khung chứa biểu đồ, hoặc của cửa sổ. */
function fallbackTarget(chart: HTMLElement | null): Rect {
  if (chart) {
    const box = rectOf(chart)
    if (box.width > 0) return { left: box.left + box.width / 2, top: box.top + box.height / 3, width: 0, height: 0 }
  }
  return { left: window.innerWidth / 2, top: window.innerHeight / 3, width: 0, height: 0 }
}

export function FlashbackCardPopup({ arrival, chartRef, trayRef, onFocus, onFlying, onLanded, ref }: FlashbackCardPopupProps) {
  const elementRef = useRef<HTMLDivElement>(null)
  // Hàm gọi lại luôn là bản mới nhất mà không khởi động lại hiệu ứng khi màn chơi render lại.
  const callbacks = useRef({ onFocus, onFlying, onLanded })
  useLayoutEffect(() => {
    callbacks.current = { onFocus, onFlying, onLanded }
  })
  const [seen, setSeen] = useState<MetCard | null>(null)
  const [active, setActive] = useState<MetCard | null>(null)

  // Thẻ mới tới: dựng thẻ bật lên (trừ khi giảm chuyển động). Vị trí đo ở effect bên dưới, sau khi DOM đã có.
  if (arrival !== seen) {
    setSeen(arrival)
    setActive(arrival && !prefersReducedMotion() ? arrival : null)
  }

  useImperativeHandle(ref, () => ({ finish: () => setActive(null) }), [])

  // Giảm chuyển động: bỏ bay, thẻ vào khay ngay.
  useLayoutEffect(() => {
    if (arrival && prefersReducedMotion()) callbacks.current.onLanded(arrival.playIdx)
  }, [arrival])

  const run = useCallback(
    (card: MetCard) => {
      const element = elementRef.current
      if (!element) return undefined
      const timers: number[] = []
      let flight: Animation | undefined
      let intro: Animation | undefined

      const width = popupWidthFor(window.innerWidth)
      const size = { width, height: width * CARD_ASPECT }
      const box = chartRef.current?.querySelector(`[data-card-box="${card.playIdx}"]`)
      const target = box ? rectOf(box) : fallbackTarget(chartRef.current)
      const place = placePopup(target, size, { width: window.innerWidth, height: window.innerHeight })
      element.style.left = `${place.left}px`
      element.style.top = `${place.top}px`
      element.style.width = `${size.width}px`
      element.style.visibility = "visible"
      element.dataset.phase = "pop"
      element.dataset.placement = place.below ? "below" : "above"

      callbacks.current.onFocus(card.playIdx)
      callbacks.current.onFlying(card.playIdx)
      if (typeof element.animate === "function") intro = element.animate(POP_KEYFRAMES, { duration: POP_MS, easing: POP_EASING })

      timers.push(
        window.setTimeout(() => {
          element.dataset.phase = "hold"
        }, POP_MS),
        window.setTimeout(() => {
          element.dataset.phase = "fly"
          const slot = trayRef.current?.querySelector(`[data-card-slot="${card.playIdx}"] [data-card-face]`)
          const from: Rect = { left: place.left, top: place.top, width: size.width, height: size.height }
          const to = slot ? rectOf(slot) : { left: place.left, top: place.top, width: 0, height: 0 }
          const { dx, dy, scale } = flightVector(from, to)
          if (typeof element.animate === "function") {
            flight = element.animate(
              [{ transform: "none" }, { transform: `translate(${dx}px, ${dy}px) scale(${scale})` }],
              { duration: FLY_MS, easing: FLY_EASING, fill: "forwards" },
            )
          }
        }, POP_MS + HOLD_MS),
        window.setTimeout(() => {
          callbacks.current.onLanded(card.playIdx)
          setActive(null)
        }, POP_MS + HOLD_MS + FLY_MS),
      )

      return () => {
        for (const timer of timers) window.clearTimeout(timer)
        intro?.cancel()
        flight?.cancel()
        callbacks.current.onFocus(null)
        callbacks.current.onFlying(null)
      }
    },
    [chartRef, trayRef],
  )

  useLayoutEffect(() => (active ? run(active) : undefined), [active, run])

  if (!active || typeof document === "undefined") return null
  const name = cdCard(active.cardId)?.name ?? active.cardId
  return createPortal(
    <>
      <span role="status" className="sr-only">
        Phiên {active.playIdx}: gặp thẻ {name}
      </span>
      <div
        ref={elementRef}
        aria-hidden="true"
        data-testid="flashback-card-popup"
        data-card-id={active.cardId}
        data-play-idx={active.playIdx}
        className="pointer-events-none fixed z-[70] will-change-transform"
        style={{ left: 0, top: 0, visibility: "hidden", filter: "drop-shadow(0 14px 22px rgba(0,0,0,.45))" }}
      >
        <CandleCard card={active.cardId} />
      </div>
    </>,
    document.body,
  )
}
