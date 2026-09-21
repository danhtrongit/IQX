import { useState } from "react"
import type { MascotId } from "../types"
import { MASCOT_PLACEHOLDER, mascotAssetUrl } from "./mascotManifest"

/** Static avatars only: lists and panels never mount another animation player. */
export function MascotAvatar({ mascotId, variant = "head", size = 48, className = "" }: {
  mascotId: MascotId; variant?: "head" | "body"; size?: number; className?: string
}) {
  return <AvatarImage key={`${mascotId}:${variant}`} mascotId={mascotId} variant={variant} size={size} className={className} />
}
function AvatarImage({ mascotId, variant, size, className }: { mascotId: MascotId; variant: "head" | "body"; size: number; className: string }) {
  const [failed, setFailed] = useState(false)
  return <img className={`mascot-avatar ${className}`} src={failed ? MASCOT_PLACEHOLDER : mascotAssetUrl(mascotId, `avatar-${variant}.webp`)}
    alt="" width={size} height={size} loading="lazy" decoding="async" onError={() => setFailed(true)} />
}
