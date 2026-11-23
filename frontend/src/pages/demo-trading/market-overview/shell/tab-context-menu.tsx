import { useEffect, useRef } from "react"
import { createPortal } from "react-dom"

export interface TabContextMenuProps {
  pageId: string | null
  anchorRect: DOMRect | null
  onRename: (pageId: string) => void
  onDuplicate: (pageId: string) => void
  onDelete: (pageId: string) => void
  onClose: () => void
}

const MENU_ESTIMATED_WIDTH = 168
const MENU_ESTIMATED_HEIGHT = 124

export function TabContextMenu({
  pageId,
  anchorRect,
  onRename,
  onDuplicate,
  onDelete,
  onClose,
}: TabContextMenuProps) {
  const menuRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!pageId || !anchorRect) return

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target
      if (target instanceof Node && menuRef.current?.contains(target)) {
        return
      }
      if (target instanceof Element && target.closest(".mo-tm")) {
        return
      }
      onClose()
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation()
        onClose()
      }
    }

    const handleScroll = () => {
      onClose()
    }

    document.addEventListener("pointerdown", handlePointerDown)
    document.addEventListener("keydown", handleKeyDown)
    document.addEventListener("scroll", handleScroll, true)

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown)
      document.removeEventListener("keydown", handleKeyDown)
      document.removeEventListener("scroll", handleScroll, true)
    }
  }, [pageId, anchorRect, onClose])

  if (!pageId || !anchorRect || typeof document === "undefined") {
    return null
  }

  const viewportW = typeof window !== "undefined" ? window.innerWidth : 1280
  const viewportH = typeof window !== "undefined" ? window.innerHeight : 720
  const left = Math.max(8, Math.min(viewportW - MENU_ESTIMATED_WIDTH - 8, anchorRect.left))
  const top = Math.max(
    8,
    Math.min(viewportH - MENU_ESTIMATED_HEIGHT - 8, anchorRect.bottom + 4),
  )

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      aria-label="Tuỳ chọn trang"
      className="mo-portal mo-menu"
      style={{ left: `${left}px`, top: `${top}px` }}
    >
      <button
        type="button"
        role="menuitem"
        onClick={() => {
          onClose()
          onRename(pageId)
        }}
      >
        Đổi tên
      </button>
      <button
        type="button"
        role="menuitem"
        onClick={() => {
          onClose()
          onDuplicate(pageId)
        }}
      >
        Nhân bản
      </button>
      <button
        type="button"
        role="menuitem"
        className="mo-dn"
        onClick={() => {
          onClose()
          onDelete(pageId)
        }}
      >
        Xoá trang
      </button>
    </div>,
    document.body,
  )
}
