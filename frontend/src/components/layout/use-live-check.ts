import { useEffect, useRef, useState } from "react"

export type LiveCheck<T> =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "done"; result: T }
  | { status: "error"; error: unknown }

type Settled<T> = { key: string; outcome: { ok: true; result: T } | { ok: false; error: unknown } }

/**
 * Kiểm tra trực tiếp có debounce cho một ô nhập. `key` là giá trị đã chuẩn hoá, `null` khi
 * chưa đủ điều kiện để hỏi server (trống hoặc sai định dạng). Kết quả luôn gắn với đúng
 * `key` đã hỏi, nên một phản hồi chậm của giá trị cũ không bao giờ ghi đè giá trị mới.
 */
export function useLiveCheck<T>(
  key: string | null,
  check: (key: string, signal: AbortSignal) => Promise<T>,
  delayMs = 400,
): LiveCheck<T> {
  const [settled, setSettled] = useState<Settled<T> | null>(null)
  const checkRef = useRef(check)
  useEffect(() => { checkRef.current = check })

  useEffect(() => {
    if (key === null) return
    const controller = new AbortController()
    const timer = setTimeout(() => {
      checkRef.current(key, controller.signal).then(
        result => { if (!controller.signal.aborted) setSettled({ key, outcome: { ok: true, result } }) },
        (error: unknown) => { if (!controller.signal.aborted) setSettled({ key, outcome: { ok: false, error } }) },
      )
    }, delayMs)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [key, delayMs])

  if (key === null) return { status: "idle" }
  if (settled?.key !== key) return { status: "checking" }
  return settled.outcome.ok
    ? { status: "done", result: settled.outcome.result }
    : { status: "error", error: settled.outcome.error }
}
