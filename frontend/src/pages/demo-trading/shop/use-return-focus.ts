import { useCallback, useLayoutEffect, useRef } from "react"

/**
 * Focus return for a dialog that has no `DialogTrigger` (it is opened from state):
 * Radix only restores focus to its own trigger, so the control that was focused when
 * the dialog opened is remembered here and focused again on close - or, when that
 * control is gone or disabled (the Mua button becomes a disabled "Đang sử dụng"), the
 * fallback element. Pass the result to `onCloseAutoFocus`.
 */
export function useReturnFocus(active: boolean, fallback?: () => HTMLElement | null) {
  const opener = useRef<HTMLElement | null>(null)
  const fallbackRef = useRef(fallback)
  useLayoutEffect(() => {
    fallbackRef.current = fallback
  })
  // Runs before the dialog moves focus into itself, so the opener is still the active element.
  useLayoutEffect(() => {
    if (!active) return
    const current = document.activeElement
    opener.current = current instanceof HTMLElement && current !== document.body ? current : null
  }, [active])

  return useCallback((event: Event) => {
    event.preventDefault()
    const target = opener.current
    const usable = !!target && target.isConnected && !(target instanceof HTMLButtonElement && target.disabled)
    if (usable) target.focus()
    else fallbackRef.current?.()?.focus()
  }, [])
}
