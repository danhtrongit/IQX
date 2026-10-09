/**
 * Lightweight picture of a mascot for Shop cards, rows and the purchase modal:
 * the poster that ships with the existing 2D renderer
 * (`/assets/mascots-2d/v2/<slug>/poster.webp`), never a new artwork.
 *
 * A failed picture only affects the picture: it falls back to the renderer's
 * shared placeholder, then to a neutral block, and offers a reload. Ownership,
 * balance and the chosen mascot are never touched by an image error.
 */
import { useState } from "react"
import { ImageOff, RefreshCw } from "lucide-react"

import { cn } from "@/lib/utils"
import { MASCOT_PLACEHOLDER, mascotAssetUrl } from "../journey/mascot-2d/mascotManifest"
import { isMascotId } from "./shop-model"

type Stage = "poster" | "placeholder" | "none"

function ArtInner({ mascotId, name, decorative, showReload, className, imageClassName }: {
  mascotId: string
  name: string
  decorative: boolean
  showReload: boolean
  className?: string
  imageClassName?: string
}) {
  const known = isMascotId(mascotId)
  const [stage, setStage] = useState<Stage>(known ? "poster" : "placeholder")
  const [attempt, setAttempt] = useState(0)
  const src = stage === "poster" && known
    ? `${mascotAssetUrl(mascotId, "poster.webp")}${attempt ? `&reload=${attempt}` : ""}`
    : stage === "placeholder" ? MASCOT_PLACEHOLDER : null

  function onError() {
    setStage((current) => (current === "poster" ? "placeholder" : "none"))
  }

  return (
    <div className={cn("relative flex items-center justify-center", className)} data-testid={`mascot-art-${mascotId}`} data-art-stage={stage}>
      {src ? (
        <img
          key={src}
          src={src}
          alt={decorative ? "" : `Linh thú ${name}`}
          draggable={false}
          loading="lazy"
          decoding="async"
          onError={onError}
          className={cn("size-full object-contain select-none", imageClassName)}
        />
      ) : (
        <div role={decorative ? undefined : "img"} aria-label={decorative ? undefined : `Linh thú ${name}`} aria-hidden={decorative || undefined} className="grid size-1/2 place-items-center rounded-full border border-border bg-muted/70 text-muted-foreground">
          <ImageOff className="size-1/3" aria-hidden="true" />
        </div>
      )}
      {showReload && stage !== "poster" && known && (
        <button
          type="button"
          onClick={() => {
            setAttempt((value) => value + 1)
            setStage("poster")
          }}
          className="absolute bottom-2 left-1/2 inline-flex -translate-x-1/2 items-center gap-1 rounded-sm border border-border bg-background/90 px-2 py-1 text-[11px] font-medium text-foreground hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none"
        >
          <RefreshCw className="size-3" aria-hidden="true" />
          Tải lại hình
        </button>
      )}
    </div>
  )
}

export function MascotArt(props: {
  mascotId: string
  name: string
  /** Pure decoration next to the mascot's name (no alt text). */
  decorative?: boolean
  showReload?: boolean
  className?: string
  imageClassName?: string
}) {
  const { mascotId, decorative = false, showReload = true } = props
  // A different mascot starts again from its own poster.
  return <ArtInner key={mascotId} {...props} decorative={decorative} showReload={showReload} />
}
