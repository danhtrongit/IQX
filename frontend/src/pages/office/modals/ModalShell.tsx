import { X } from "lucide-react"
import { useEffect, useId, useRef, type ReactNode } from "react"

const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "a[href]",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(", ")

function getFocusableElements(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (el) =>
      el.getAttribute("aria-hidden") !== "true" &&
      !el.closest("[hidden]") &&
      el.style.display !== "none" &&
      el.style.visibility !== "hidden"
  )
}

export interface OfficeQueryErrorProps {
  message?: string
  onRetry: () => void
}

export function OfficeQueryError({
  message = "Không tải được dữ liệu. Vui lòng thử lại.",
  onRetry,
}: OfficeQueryErrorProps) {
  return (
    <div className="of-err of-err-retry" role="alert">
      <span>{message}</span>
      <button type="button" className="of-btn is-ghost" onClick={onRetry}>
        Tải lại
      </button>
    </div>
  )
}

export interface ModalShellProps {
  title: string
  subtitle?: string
  size?: "large" | "small"
  headerExtra?: ReactNode
  bodyClassName?: string
  testId?: string
  onClose: () => void
  children: ReactNode
}

export function ModalShell({
  title,
  subtitle,
  size = "large",
  headerExtra,
  bodyClassName,
  testId,
  onClose,
  children,
}: ModalShellProps) {
  const titleId = useId()
  const boardRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    const previousActive =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null
    const board = boardRef.current

    if (board && !board.contains(document.activeElement)) {
      const focusables = getFocusableElements(board)
      const firstTarget = focusables[0] ?? board
      firstTarget.focus()
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault()
        onCloseRef.current()
        return
      }
      if (event.key !== "Tab" || !board) return

      const focusables = getFocusableElements(board)
      if (focusables.length === 0) {
        event.preventDefault()
        board.focus()
        return
      }

      const first = focusables[0]!
      const last = focusables[focusables.length - 1]!
      const active = document.activeElement

      if (event.shiftKey) {
        if (active === first || active === board || !board.contains(active)) {
          event.preventDefault()
          last.focus()
        }
      } else if (active === last || !board.contains(active)) {
        event.preventDefault()
        first.focus()
      }
    }

    window.addEventListener("keydown", onKeyDown)
    return () => {
      window.removeEventListener("keydown", onKeyDown)
      if (previousActive && previousActive.isConnected) {
        previousActive.focus()
      }
    }
  }, [])

  return (
    <div
      className="of-ov"
      data-testid={testId ? `${testId}-backdrop` : "office-modal-backdrop"}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose()
        }
      }}
    >
      <div
        ref={boardRef}
        className={size === "small" ? "of-board of-board-sm" : "of-board"}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        data-testid={testId}
      >
        <div className="of-bh">
          <h2 id={titleId}>{title}</h2>
          {subtitle && <span className="of-bh-sub">{subtitle}</span>}
          <span className="of-bh-sp" aria-hidden="true" />
          {headerExtra && <div className="of-bh-extra">{headerExtra}</div>}
          <button
            type="button"
            className="of-bh-close"
            aria-label="Đóng"
            onClick={onClose}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <div className={bodyClassName ? `of-bb ${bodyClassName}` : "of-bb"}>
          {children}
        </div>
      </div>
    </div>
  )
}
