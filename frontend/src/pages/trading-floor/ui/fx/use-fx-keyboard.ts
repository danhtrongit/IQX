/**
 * Shared mobile keyboard & focus utilities for FX cards (Gáy, Khấn, Tán lộc):
 * tracks `visualViewport` keyboard overlap into `--fx-kb` so mobile bottom sheets
 * stay visible above the software keyboard alongside `dvh` sizing.
 */
import { useEffect, type RefObject } from "react"

export function useFxKeyboardLift(cardRef: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const vv = typeof window !== "undefined" ? window.visualViewport : null
    const el = cardRef.current
    if (!vv || !el) return

    const apply = (): void => {
      const active = document.activeElement
      const editing =
        !!active &&
        el.contains(active) &&
        (active.tagName === "INPUT" || active.tagName === "TEXTAREA")
      const layoutH = Math.max(
        window.innerHeight,
        document.documentElement.clientHeight
      )
      const covered = Math.round(layoutH - vv.height - vv.offsetTop)
      el.style.setProperty(
        "--fx-kb",
        `${editing && covered > 80 ? covered : 0}px`
      )
    }

    const schedule = (): void => {
      if (typeof requestAnimationFrame === "function") {
        requestAnimationFrame(apply)
      } else {
        apply()
      }
    }

    apply()
    vv.addEventListener("resize", apply)
    vv.addEventListener("scroll", apply)
    el.addEventListener("focusin", schedule)
    el.addEventListener("focusout", schedule)
    return () => {
      vv.removeEventListener("resize", apply)
      vv.removeEventListener("scroll", apply)
      el.removeEventListener("focusin", schedule)
      el.removeEventListener("focusout", schedule)
      el.style.removeProperty("--fx-kb")
    }
  }, [cardRef])
}

/** Keeps the focused input visible when a phone keyboard slides up. */
export function scrollFieldIntoView(el: HTMLElement | null): void {
  if (!el || typeof el.scrollIntoView !== "function") return
  const reduced =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  try {
    el.scrollIntoView({
      block: "nearest",
      behavior: reduced ? "auto" : "smooth",
    })
  } catch {
    el.scrollIntoView()
  }
}

/** Stops both React synthetic and native DOM keydown propagation so WASD never moves the avatar. */
export function stopFxKeyPropagation(e: {
  stopPropagation: () => void
  nativeEvent?: { stopPropagation?: () => void }
}): void {
  e.stopPropagation()
  e.nativeEvent?.stopPropagation?.()
}
