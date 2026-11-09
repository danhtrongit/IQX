/**
 * Khối "Thẻ trong ván" (Candle Dojo spec v1.2 §9.3): các thẻ đã gặp trong ván theo thứ tự gặp, cũ nhất bên trái, mới nhất bên phải, dưới mỗi
 * thẻ ghi "Phiên N". Nhiều thẻ thì cuộn ngang trong khối và tự cuộn tới thẻ mới nhất. Máy tính: cùng hàng với nút "Phiên tiếp", chiếm phần
 * còn lại của hàng; điện thoại: một hàng ngay dưới biểu đồ (vị trí do màn chơi quyết định, khối chỉ lấp đầy chỗ được cấp).
 *
 * Bấm một thẻ thì khung của mẫu đó trên biểu đồ đậm lên một lúc (`onSelect`). Thẻ đang bay vào khay thì ô của nó để trống (`hidden`) và khi
 * thẻ chạm tới thì ô nảy nhẹ (`landed`). Hết ván khay giữ nguyên để xem lại.
 */
import { useEffect, useRef, type Ref } from "react"

import { cdCard } from "@/lib/candle-dojo/cards"
import { cn } from "@/lib/utils"

import { CandleCard } from "../candle-dojo/candle-card"
import { CARDS_TRAY_HEIGHT, TRAY_CARD_WIDTH, prefersReducedMotion, type MetCard } from "./flashback-cards-model"

const CARDS_TRAY_EMPTY = "Gặp mẫu nến trùng thẻ bạn có, thẻ sẽ hiện ở đây."

/** Ô nảy nhẹ khi thẻ chạm tới (bản mẫu `land`). */
const LAND_KEYFRAMES: Keyframe[] = [{ transform: "scale(.7)" }, { transform: "scale(1.12)", offset: 0.6 }, { transform: "none" }]
const LAND_OPTIONS: KeyframeAnimationOptions = { duration: 450, easing: "cubic-bezier(.2,1.5,.4,1)" }

export type FlashbackCardsTrayProps = {
  cards: readonly MetCard[]
  /** Phiên của thẻ đang bay (ô đích để trống); null là không có. */
  hidden: number | null
  /** Thẻ vừa chạm khay: ô nảy một lần mỗi `tick` mới. */
  landed: { playIdx: number; tick: number } | null
  onSelect: (playIdx: number) => void
  className?: string
  /** React 19: `ref` là một prop thường; màn chơi dùng để tìm ô đích của thẻ bay. */
  ref?: Ref<HTMLElement>
}

export function FlashbackCardsTray({ cards, hidden, landed, onSelect, className, ref }: FlashbackCardsTrayProps) {
  const rowRef = useRef<HTMLDivElement>(null)

  // Tự cuộn tới thẻ mới nhất (bên phải).
  const count = cards.length
  useEffect(() => {
    const row = rowRef.current
    if (row && count > 0) row.scrollLeft = row.scrollWidth
  }, [count])

  return (
    <section
      ref={ref}
      aria-label="Thẻ trong ván"
      data-testid="flashback-cards-tray"
      className={cn("flex min-w-0 flex-1 items-center gap-3 rounded-lg border border-border bg-card px-3 py-1", className)}
      style={{ height: CARDS_TRAY_HEIGHT }}
    >
      <div className="shrink-0 text-[11px] leading-tight font-bold text-foreground">
        Thẻ trong ván
        <b className="block font-heading text-base tabular-nums" data-testid="flashback-cards-count">
          {cards.length}
        </b>
      </div>
      {cards.length === 0 ? (
        <p className="min-w-0 flex-1 text-xs font-medium text-foreground" data-testid="flashback-cards-empty">
          {CARDS_TRAY_EMPTY}
        </p>
      ) : (
        <div
          ref={rowRef}
          className="flex min-w-0 flex-1 gap-2 overflow-x-auto px-0.5 pt-1 pb-1.5 [scrollbar-width:thin]"
          data-testid="flashback-cards-row"
        >
          {cards.map((card) => (
            <TraySlot
              key={card.playIdx}
              card={card}
              waiting={hidden === card.playIdx}
              bounceTick={landed && landed.playIdx === card.playIdx ? landed.tick : null}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </section>
  )
}

function TraySlot({
  card,
  waiting,
  bounceTick,
  onSelect,
}: {
  card: MetCard
  waiting: boolean
  bounceTick: number | null
  onSelect: (playIdx: number) => void
}) {
  const faceRef = useRef<HTMLSpanElement>(null)
  const name = cdCard(card.cardId)?.name ?? card.cardId

  useEffect(() => {
    if (bounceTick === null || prefersReducedMotion()) return
    const face = faceRef.current
    if (face && typeof face.animate === "function") face.animate(LAND_KEYFRAMES, LAND_OPTIONS)
  }, [bounceTick])

  return (
    <button
      type="button"
      data-card-slot={card.playIdx}
      data-card-id={card.cardId}
      data-waiting={waiting}
      aria-label={`${name}, Phiên ${card.playIdx}`}
      onClick={() => onSelect(card.playIdx)}
      className={cn(
        "flex shrink-0 flex-col items-center gap-px rounded-md focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none",
        waiting && "invisible",
      )}
    >
      <span ref={faceRef} className="block" data-card-face>
        <CandleCard card={card.cardId} width={TRAY_CARD_WIDTH} className="rounded-md! p-0.5! [&>div]:rounded-[4px]!" />
      </span>
      <small className="text-[10px] leading-3 font-semibold text-foreground">Phiên {card.playIdx}</small>
    </button>
  )
}
