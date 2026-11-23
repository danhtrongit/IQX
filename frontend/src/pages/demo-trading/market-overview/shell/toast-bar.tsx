import { createPortal } from "react-dom"

export interface ToastState {
  id: string | number
  message: string
  actionLabel?: string
  onAction?: () => void
}

export interface ToastBarProps {
  toast: ToastState | null
  onDismiss?: () => void
}

export function ToastBar({ toast, onDismiss }: ToastBarProps) {
  if (!toast || typeof document === "undefined") {
    return null
  }

  return createPortal(
    <div className="mo-portal mo-toast" role="status" aria-live="polite">
      <span>{toast.message}</span>
      {toast.actionLabel && toast.onAction && (
        <button
          type="button"
          onClick={() => {
            toast.onAction?.()
            onDismiss?.()
          }}
        >
          {toast.actionLabel}
        </button>
      )}
    </div>,
    document.body,
  )
}
