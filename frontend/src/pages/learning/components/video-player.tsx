import { useRef } from "react"

/**
 * Trình phát video của bài học.
 *
 * - Mở lại bài đang xem dở thì tua tới `initialPosition` (giây) ngay khi có
 *   metadata.
 * - `onProgress` chỉ được gọi khi vị trí nhảy ≥ 10 giây, để tầng gọi tự debounce
 *   mà không dội API tiến độ.
 */
export function VideoPlayer({
  src,
  initialPosition,
  onProgress,
}: {
  src: string
  initialPosition?: number | null
  onProgress?: (seconds: number) => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const lastReported = useRef(0)

  return (
    <video
      ref={videoRef}
      src={src}
      controls
      playsInline
      preload="metadata"
      className="max-h-[70vh] w-full rounded-lg bg-black"
      onLoadedMetadata={() => {
        if (initialPosition && videoRef.current) videoRef.current.currentTime = initialPosition
      }}
      onTimeUpdate={() => {
        const seconds = videoRef.current?.currentTime ?? 0
        if (onProgress && Math.abs(seconds - lastReported.current) >= 10) {
          lastReported.current = seconds
          onProgress(Math.floor(seconds))
        }
      }}
    />
  )
}
