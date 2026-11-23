import { useEffect, useMemo, useRef } from "react"

import {
  mountChibi3DPreview,
  renderChibiPortraitDataUrl,
  type Chibi3DPreviewHandle,
} from "./portrait-renderer.ts"
import type { ChibiAnimMode } from "./types.ts"

export interface ChibiAvatar3DPreviewProps {
  avatarId: string
  colorHex?: string | null
  size?: number
  anim?: ChibiAnimMode
  interactive?: boolean
  lite?: boolean
  className?: string
  label?: string
}

/**
 * Renders a live, gently spinning interactive 3D Three.js Chibi character preview
 * with an automatic instant fallback to a crisp HiDPI 2D Chibi portrait when WebGL is unavailable.
 */
export function ChibiAvatar3DPreview({
  avatarId,
  colorHex = null,
  size = 160,
  anim = "idle",
  interactive = true,
  lite = false,
  className,
  label,
}: ChibiAvatar3DPreviewProps) {
  const stageRef = useRef<HTMLDivElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)
  const handleRef = useRef<Chibi3DPreviewHandle | null>(null)
  const latestRef = useRef({ avatarId, colorHex, size, anim })

  const fallbackSrc = useMemo(
    () => renderChibiPortraitDataUrl(avatarId, colorHex, Math.max(160, size)),
    [avatarId, colorHex, size]
  )

  useEffect(() => {
    const el = stageRef.current
    const imgEl = imgRef.current
    if (!el) return

    const init = latestRef.current
    const handle = mountChibi3DPreview(el, {
      avatarId: init.avatarId,
      colorHex: init.colorHex,
      size: init.size,
      anim: init.anim,
      interactive,
      lite,
      onContextLost: () => {
        if (imgEl) imgEl.style.opacity = "1"
      },
    })
    handleRef.current = handle
    if (handle && imgEl) {
      imgEl.style.opacity = "0"
    }

    return () => {
      handle?.dispose()
      handleRef.current = null
      if (imgEl) imgEl.style.opacity = "1"
    }
  }, [interactive, lite])

  useEffect(() => {
    latestRef.current = { avatarId, colorHex, size, anim }
    handleRef.current?.update({ avatarId, colorHex, size, anim })
  }, [avatarId, colorHex, size, anim])

  return (
    <div
      className={className}
      role="img"
      aria-label={label ?? `Xem trước nhân vật ${avatarId}`}
      style={{
        position: "relative",
        width: `min(100%, ${size}px)`,
        height: `min(100%, ${size}px)`,
        aspectRatio: "1 / 1",
        borderRadius: "14px",
        overflow: "hidden",
        background:
          "radial-gradient(circle at 50% 35%, rgba(36, 59, 107, 0.92), rgba(13, 22, 44, 0.96))",
        userSelect: "none",
        touchAction: "none",
      }}
    >
      <img
        ref={imgRef}
        src={fallbackSrc}
        alt=""
        draggable={false}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "contain",
          pointerEvents: "none",
          transition: "opacity 160ms ease",
        }}
      />
      <div
        ref={stageRef}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
        }}
      />
    </div>
  )
}
