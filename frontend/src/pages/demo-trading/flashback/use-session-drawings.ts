/**
 * Hình vẽ của một ván trên biểu đồ IQLine (`?iqline=1`), phía trang. Tương đương `use-chart-drawings.ts` của biểu đồ SVG cũ:
 * giữ trạng thái công cụ, hình và hình đang chọn, nút Xoá kèm thông báo, và phím tắt (Esc huỷ vẽ, Delete và Backspace xoá hình
 * đang chọn). Trạng thái nằm ở `SessionDrawingController` của thư viện (chỉ trong bộ nhớ của trình duyệt); hook này chỉ nối nó
 * với React, toast và bàn phím.
 */
import { useCallback, useEffect, useState, useSyncExternalStore } from "react"
import { toast } from "sonner"

import { createSessionDrawings, type SessionDrawingController, type SessionDrawingsSnapshot } from "@/lib/iqline/react/session-drawings"
import type { DrawingTool } from "@/lib/iqline/types"

export type SessionDrawings = {
  controller: SessionDrawingController
  snapshot: SessionDrawingsSnapshot
  toggleTool: (tool: DrawingTool) => void
  /** Nút Xoá: hình đang chọn, không thì tất cả, kèm thông báo (v2.1 §7.4). */
  clear: () => void
}

function isTyping(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null
  if (!element || typeof element.tagName !== "string") return false
  return ["INPUT", "TEXTAREA", "SELECT"].includes(element.tagName) || element.isContentEditable
}

/** `enabled` tắt phím tắt khi có hộp thoại mở. Không bắt phím khi người chơi đang gõ vào ô nhập. */
export function useSessionDrawings(enabled: boolean): SessionDrawings {
  // Một controller cho cả ván: màn chơi gắn `key` theo ID ván nên sang ván mới là controller mới.
  const [controller] = useState(createSessionDrawings)
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot)

  const toggleTool = useCallback((tool: DrawingTool) => controller.toggleTool(tool), [controller])
  const clear = useCallback(() => toast.info(controller.clear().message), [controller])

  useEffect(() => {
    if (!enabled) return undefined
    function onKeyDown(event: KeyboardEvent) {
      // Khi biểu đồ đang có focus, chính nó đã xử lý phím (và chặn mặc định): không làm lần nữa.
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || isTyping(event.target)) return
      if (event.key === "Escape") {
        controller.cancel()
        return
      }
      if (event.key === "Delete" || event.key === "Backspace") {
        if (controller.removeSelected()) event.preventDefault()
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [controller, enabled])

  return { controller, snapshot, toggleTool, clear }
}
