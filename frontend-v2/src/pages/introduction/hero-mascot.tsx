import { useEffect, useRef, useState, type RefObject } from "react"

const MASCOT_ROOT = "/assets/mascots-2d/v2/thanh-long"
const GREET_DURATIONS = [100, 180, 220, 220, 220, 260]

type HeroMascotProps = { hostRef: RefObject<HTMLElement | null> }

export function HeroMascot({ hostRef }: HeroMascotProps) {
  const [ready, setReady] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [frame, setFrame] = useState(0)
  const [visible, setVisible] = useState(true)
  const [motionAllowed, setMotionAllowed] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)")
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection
    const sync = () => {
      const allowed = !motion.matches && !connection?.saveData
      setMotionAllowed(allowed)
      if (!allowed) setPlaying(false)
    }
    sync()
    motion.addEventListener("change", sync)
    return () => motion.removeEventListener("change", sync)
  }, [])

  useEffect(() => {
    if (!motionAllowed) return
    let live = true
    const sprite = new Image()
    sprite.onload = () => { if (live) setReady(sprite.naturalWidth === 3840 && sprite.naturalHeight === 640) }
    sprite.onerror = () => { if (live) setReady(false) }
    sprite.src = `${MASCOT_ROOT}/greet-strip.webp`
    return () => { live = false; sprite.onload = null; sprite.onerror = null }
  }, [motionAllowed])

  useEffect(() => {
    const button = buttonRef.current
    if (!button) return
    const intersection = new IntersectionObserver(([entry]) => {
      setVisible(entry.isIntersecting)
      if (!entry.isIntersecting) setPlaying(false)
    })
    const pageVisibility = () => {
      const shown = !document.hidden && button.getBoundingClientRect().width > 0
      setVisible(shown)
      if (!shown) setPlaying(false)
    }
    intersection.observe(button)
    document.addEventListener("visibilitychange", pageVisibility)
    return () => { intersection.disconnect(); document.removeEventListener("visibilitychange", pageVisibility) }
  }, [hostRef])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const greet = () => {
      if (!ready || !motionAllowed || document.hidden || !visible) return
      setFrame(0)
      setPlaying(true)
    }
    host.addEventListener("pointerenter", greet)
    return () => host.removeEventListener("pointerenter", greet)
  }, [hostRef, motionAllowed, ready, visible])

  useEffect(() => {
    if (!playing || !visible || !motionAllowed) return
    const timer = window.setTimeout(() => {
      if (frame === GREET_DURATIONS.length - 1) setPlaying(false)
      else setFrame((current) => current + 1)
    }, GREET_DURATIONS[frame] + (frame === GREET_DURATIONS.length - 1 ? 120 : 0))
    return () => window.clearTimeout(timer)
  }, [frame, playing, visible, motionAllowed])

  const replay = () => {
    if (!ready || !motionAllowed || !visible || document.hidden) return
    setFrame(0)
    setPlaying(true)
  }

  return (
    <button
      ref={buttonRef}
      type="button"
      className="intro-mascot-trigger"
      aria-label="Thanh Long vẫy chào"
      onFocus={replay}
      onClick={replay}
    >
      <img
        src={`${MASCOT_ROOT}/hero-sharp-v1.webp`}
        alt="Thanh Long, linh thú đồng hành của IQX"
        width={1254}
        height={1254}
        fetchPriority="high"
        className="intro-mascot"
        style={{ visibility: playing && ready ? "hidden" : "visible" }}
      />
      {playing && ready && (
        <span
          className="intro-mascot-greet"
          aria-hidden="true"
          data-frame={frame}
          style={{ backgroundPosition: `${frame * 20}% 0` }}
        />
      )}
    </button>
  )
}
