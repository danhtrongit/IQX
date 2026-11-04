/**
 * Trạng thái công cụ vẽ của một ván (spec v2.1 §7): hình, công cụ đang bật, điểm đầu đang chờ và hình
 * đang chọn. Hình chỉ nằm trong bộ nhớ của trình duyệt: màn chơi gắn `key` theo ID ván nên sang ván
 * mới là bắt đầu lại, còn "Xem lại biểu đồ" (đóng cửa sổ kết quả) thì giữ nguyên.
 */
import { useCallback, useEffect, useReducer, type Dispatch } from "react"
import { toast } from "sonner"

import {
  INITIAL_DRAWINGS,
  clearOutcome,
  drawingsReducer,
  type DrawingTool,
  type DrawingsAction,
  type DrawingsState,
} from "./flashback-drawings"

export type ChartDrawings = {
  state: DrawingsState
  dispatch: Dispatch<DrawingsAction>
  /** Bật công cụ; bấm lại công cụ đang sáng thì huỷ vẽ. */
  toggleTool: (tool: DrawingTool) => void
  /** Nút Xoá: hình đang chọn, không thì tất cả, kèm thông báo (v2.1 §7.4). */
  clear: () => void
}

function isTyping(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null
  if (!element || typeof element.tagName !== "string") return false
  return ["INPUT", "TEXTAREA", "SELECT"].includes(element.tagName) || element.isContentEditable
}

/**
 * `enabled` tắt phím tắt khi có hộp thoại mở: Esc huỷ vẽ, Delete và Backspace xoá hình đang chọn.
 * Không bắt phím khi người chơi đang gõ vào ô nhập.
 */
export function useChartDrawings(enabled: boolean): ChartDrawings {
  const [state, dispatch] = useReducer(drawingsReducer, INITIAL_DRAWINGS)
  const { selectedId } = state

  const toggleTool = useCallback((tool: DrawingTool) => dispatch({ type: "tool", tool }), [])

  const clear = useCallback(() => {
    const outcome = clearOutcome(state)
    if (outcome.action) dispatch(outcome.action)
    toast.info(outcome.message)
  }, [state])

  useEffect(() => {
    if (!enabled) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.ctrlKey || event.metaKey || event.altKey || isTyping(event.target)) return
      if (event.key === "Escape") {
        dispatch({ type: "cancel" })
        return
      }
      if ((event.key === "Delete" || event.key === "Backspace") && selectedId !== null) {
        event.preventDefault()
        dispatch({ type: "remove", id: selectedId })
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [enabled, selectedId])

  return { state, dispatch, toggleTool, clear }
}
