import { useRef } from "react"

interface VideoPlayerProps {
  src: string
  initialPosition?: number | null
  onProgress?: (sec: number) => void
}

export function VideoPlayer({ src, initialPosition, onProgress }: VideoPlayerProps) {
  const ref = useRef<HTMLVideoElement>(null)
  const lastSaved = useRef(0)

  return (
    <video
      ref={ref}
      src={src}
      controls
      playsInline
      className="w-full max-h-[70vh] rounded-lg bg-black"
      onLoadedMetadata={() => {
        if (initialPosition && ref.current) {
          ref.current.currentTime = initialPosition
        }
      }}
      onTimeUpdate={() => {
        const t = ref.current?.currentTime ?? 0
        if (onProgress && Math.abs(t - lastSaved.current) >= 10) {
          lastSaved.current = t
          onProgress(Math.floor(t))
        }
      }}
    />
  )
}
