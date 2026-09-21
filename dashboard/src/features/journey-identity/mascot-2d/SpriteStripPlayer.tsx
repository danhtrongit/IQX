import { useEffect, useRef, useState } from "react"
import type { MascotStateManifest } from "./mascotManifest"
import { useSpritePreload } from "./useSpritePreload"

export interface SpriteStripPlayerProps {
  src: string
  animation: MascotStateManifest
  paused?: boolean
  reducedMotion?: boolean
  onComplete?: () => void
  onReady?: () => void
  onError?: () => void
}

/** A new src/state is a new play; visibility changes keep the exact remaining hold. */
export function SpriteStripPlayer(props: SpriteStripPlayerProps) {
  return <StripPlayback key={`${props.src}:${!!props.reducedMotion}`} {...props} />
}
function StripPlayback({ src, animation, paused = false, reducedMotion = false, onComplete, onReady, onError }: SpriteStripPlayerProps) {
  const asset = useSpritePreload(src)
  const ready = !asset?.error && !!asset?.width && asset.width === 640 * animation.columns && asset.height === 640 * animation.rows
  const invalid = !!asset && !ready
  const [frame, setFrame] = useState(reducedMotion ? animation.reducedMotionFrame ?? 0 : 0)
  const [hidden, setHidden] = useState(document.visibilityState !== "visible")
  const cursor = useRef({ frame: reducedMotion ? animation.reducedMotionFrame ?? 0 : 0, remaining: -1, complete: false })
  const callbacks = useRef({ onComplete, onReady, onError })
  useEffect(() => { callbacks.current = { onComplete, onReady, onError } }, [onComplete, onReady, onError])
  useEffect(() => {
    const update = () => setHidden(document.visibilityState !== "visible")
    document.addEventListener("visibilitychange", update)
    return () => document.removeEventListener("visibilitychange", update)
  }, [])
  useEffect(() => { if (ready) callbacks.current.onReady?.() }, [ready])
  useEffect(() => { if (invalid) callbacks.current.onError?.() }, [invalid])
  const timingKey = JSON.stringify(animation)
  useEffect(() => {
    if (!ready || paused || hidden || cursor.current.complete || (reducedMotion && animation.loop)) return
    let timer: ReturnType<typeof setTimeout>, started = 0, waiting = 0, live = true
    const clock = cursor.current
    const duration = () => reducedMotion ? 300 : animation.durationsMs[clock.frame] +
      (clock.frame === animation.frameCount - 1 ? animation.loop ? animation.loopDelayMs ?? 0 : animation.holdLastFrameMs ?? 0 : 0)
    const schedule = () => {
      waiting = clock.remaining >= 0 ? clock.remaining : duration()
      started = performance.now()
      timer = setTimeout(() => {
        if (!live) return
        clock.remaining = -1
        if (reducedMotion || clock.frame === animation.frameCount - 1) {
          if (!animation.loop) { clock.complete = true; callbacks.current.onComplete?.(); return }
          clock.frame = 0
        } else clock.frame += 1
        setFrame(clock.frame)
        schedule()
      }, waiting)
    }
    schedule()
    return () => {
      live = false; clearTimeout(timer)
      if (!clock.complete) clock.remaining = Math.max(0, waiting - (performance.now() - started))
    }
    // The serialized manifest prevents parent renders from restarting a frame.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, paused, hidden, reducedMotion, timingKey])
  return <div className="mascot-sprite-viewport" data-testid="mascot-sprite" data-frame={frame} data-ready={ready} aria-hidden="true">
    {ready && <img src={src} alt="" draggable={false} decoding="async" className="mascot-sprite-strip"
      style={{ width: `${animation.columns * 100}%`, height: `${animation.rows * 100}%`,
        transform: `translate3d(${-100 * (frame % animation.columns) / animation.columns}%, ${-100 * Math.floor(frame / animation.columns) / animation.rows}%, 0)` }} />}
  </div>
}
