/**
 * Trạng thái thẻ nến của màn chơi Flashback (Candle Dojo spec v1.2 §9.3): danh sách thẻ đã gặp, thẻ vừa tới (để bật lên rồi bay vào khay),
 * khung đang được nhấn mạnh, ô khay đang chờ thẻ bay tới và ô vừa nhận thẻ.
 *
 * Danh sách thẻ lấy thẳng từ ảnh chụp ván (`snapshot.cards`): vào ván, tải lại trang hay nối lại đều dựng lại đủ khay; phản hồi "Phiên tiếp"
 * có thẻ thì `applyNext` thêm vào ảnh chụp. Sang ván mới thì màn chơi dựng lại (`key` theo ID ván) nên khay trống; hết ván khay giữ nguyên.
 * Thẻ chỉ "vừa tới" khi danh sách dài thêm và thẻ mới đúng là của phiên đang mở, nên lần vào ván hay tải lại không bật thẻ cũ lên.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import type { FlashbackSnapshot } from "./flashback-api"
import { FOCUS_MS, metCardsOf, type MetCard } from "./flashback-cards-model"

export type MatchCards = {
  /** Thẻ đã gặp theo thứ tự gặp: cũ nhất đầu tiên. */
  cards: readonly MetCard[]
  /** Thẻ của phiên vừa mở (null khi chưa có); mỗi lần đổi là một lần bật lên. */
  arrival: MetCard | null
  /** Phiên của thẻ có khung đang đậm. */
  focus: number | null
  /** Đậm khung một lúc rồi tự về như cũ (bấm thẻ trong khay). */
  flash: (playIdx: number) => void
  /** Đậm hoặc thôi đậm khung theo thẻ bật lên (không tự tắt). */
  setFocus: (playIdx: number | null) => void
  /** Phiên của ô khay để trống vì thẻ đang bay tới. */
  flying: number | null
  setFlying: (playIdx: number | null) => void
  /** Ô vừa nhận thẻ: nảy một lần mỗi `tick` mới. */
  landed: { playIdx: number; tick: number } | null
  land: (playIdx: number) => void
}

export function useMatchCards(raw: FlashbackSnapshot["cards"] | undefined, step: number): MatchCards {
  const cards = useMemo(() => metCardsOf(raw), [raw])

  // Danh sách dài thêm ở phiên đang mở: đó là thẻ vừa gặp. (Cập nhật trong lúc render, như khung đặt lệnh của bộ điều khiển.)
  const [seen, setSeen] = useState(cards.length)
  const [arrival, setArrival] = useState<MetCard | null>(null)
  if (cards.length !== seen) {
    setSeen(cards.length)
    const newest = cards[cards.length - 1]
    if (cards.length > seen && newest && newest.playIdx === step) setArrival(newest)
  }

  const [focus, setFocus] = useState<number | null>(null)
  const timer = useRef<number | null>(null)
  const clearTimer = useCallback(() => {
    if (timer.current !== null) window.clearTimeout(timer.current)
    timer.current = null
  }, [])
  useEffect(() => clearTimer, [clearTimer])
  const flash = useCallback(
    (playIdx: number) => {
      clearTimer()
      setFocus(playIdx)
      timer.current = window.setTimeout(() => {
        timer.current = null
        setFocus(null)
      }, FOCUS_MS)
    },
    [clearTimer],
  )

  const [flying, setFlying] = useState<number | null>(null)
  const [landed, setLanded] = useState<{ playIdx: number; tick: number } | null>(null)
  const land = useCallback((playIdx: number) => setLanded((previous) => ({ playIdx, tick: (previous?.tick ?? 0) + 1 })), [])

  return { cards, arrival, focus, flash, setFocus, flying, setFlying, landed, land }
}
