import { useEffect, useState } from "react"

import { RESULT_LOCK_SECONDS } from "./flashback-model"

/**
 * Số giây còn khoá của Về sảnh và Chơi lại. Đếm từ lần đầu cửa sổ hiện và không bắt đầu lại khi đóng rồi
 * mở lại; hook nằm ở màn chơi (theo từng ván) nên đóng cửa sổ không làm mất mốc đếm.
 */
export function useResultLock(resultOpen: boolean): number {
  const [started, setStarted] = useState(false)
  const [remaining, setRemaining] = useState(RESULT_LOCK_SECONDS)
  if (resultOpen && !started) setStarted(true)
  useEffect(() => {
    if (!started || remaining <= 0) return
    const timer = setTimeout(() => setRemaining((value) => value - 1), 1000)
    return () => clearTimeout(timer)
  }, [started, remaining])
  return remaining
}
