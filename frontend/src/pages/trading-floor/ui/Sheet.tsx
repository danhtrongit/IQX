import { useEffect, useRef, type ReactNode } from "react"
import { cx } from "./utils.ts"

interface Props {
  title: string
  icon?: string
  onClose: () => void
  wide?: boolean
  /** Extra class on the body, e.g. a fixed-height chat. */
  bodyClass?: string
  children: ReactNode
}

/** A modal screen: centred card on desktop, bottom sheet on phones. Escape and the backdrop close it. */
export function Sheet({
  title,
  icon,
  onClose,
  wide,
  bodyClass,
  children,
}: Props) {
  const ref = useRef<HTMLElement>(null)

  useEffect(() => {
    ref.current?.focus()
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      // A dialog of the app on top (sign-in) handles Escape itself and marks the event.
      if (e.key === "Escape" && !e.defaultPrevented) onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  return (
    <div
      className="sheet-backdrop"
      onPointerDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <section
        ref={ref}
        className={cx("sheet", wide && "sheet-wide")}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
      >
        <header className="sheet-head">
          <h2>
            {icon && (
              <span className="sheet-icon" aria-hidden="true">
                {icon}
              </span>
            )}
            {title}
          </h2>
          <button
            type="button"
            className="icon-btn"
            onClick={onClose}
            aria-label="Đóng"
          >
            ✕
          </button>
        </header>
        <div className={cx("sheet-body", bodyClass)}>{children}</div>
      </section>
    </div>
  )
}
