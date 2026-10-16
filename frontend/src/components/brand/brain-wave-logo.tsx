import { Link } from "react-router"
import { cn } from "@/lib/utils"

export type BrainWaveLogoSize = "xs" | "sm" | "md" | "lg" | "xl" | number

export interface BrainWaveLogoProps {
  size?: BrainWaveLogoSize
  showText?: boolean
  textClassName?: string
  className?: string
  href?: string
  asLink?: boolean
  alt?: string
  "aria-hidden"?: boolean | "true" | "false"
  imageClassName?: string
}

const SIZE_MAP: Record<"xs" | "sm" | "md" | "lg" | "xl", number> = {
  xs: 18,
  sm: 24,
  md: 32,
  lg: 40,
  xl: 48,
}

const TEXT_SIZE_MAP: Record<"xs" | "sm" | "md" | "lg" | "xl", string> = {
  xs: "text-xs",
  sm: "text-sm",
  md: "text-base",
  lg: "text-lg",
  xl: "text-xl",
}

function resolveDimension(size: BrainWaveLogoSize = "md"): number {
  if (typeof size === "number") return size
  return SIZE_MAP[size] ?? 32
}

function resolveTextSize(size: BrainWaveLogoSize = "md"): string {
  if (typeof size === "number") {
    if (size <= 20) return "text-xs"
    if (size <= 28) return "text-sm"
    if (size <= 36) return "text-base"
    if (size <= 44) return "text-lg"
    return "text-xl"
  }
  return TEXT_SIZE_MAP[size] ?? "text-base"
}

export function BrainWaveLogo({
  size = "md",
  showText = false,
  textClassName,
  className,
  href,
  asLink = false,
  alt = "IQX Brain Wave Logo",
  "aria-hidden": ariaHiddenProp,
  imageClassName,
}: BrainWaveLogoProps) {
  const dimension = resolveDimension(size)
  const isHidden = ariaHiddenProp === true || ariaHiddenProp === "true"

  const imageElement = (
    <picture aria-hidden={isHidden ? "true" : undefined} className="inline-flex shrink-0">
      <source srcSet="/brand/logo-mark.webp" type="image/webp" />
      <img
        src="/brand/logo-mark.png"
        alt={isHidden ? "" : alt}
        aria-hidden={isHidden ? "true" : undefined}
        width={dimension}
        height={dimension}
        style={{ width: `${dimension}px`, height: `${dimension}px` }}
        className={cn("shrink-0 object-contain select-none", imageClassName)}
        loading="eager"
        decoding="async"
      />
    </picture>
  )

  const content = (
    <span
      data-testid="brain-wave-logo"
      className={cn("inline-flex items-center gap-2", className)}
      aria-hidden={isHidden ? "true" : undefined}
    >
      {imageElement}
      {showText && (
        <span
          className={cn(
            "font-heading font-bold tracking-tight text-foreground",
            resolveTextSize(size),
            textClassName
          )}
        >
          IQX
        </span>
      )}
    </span>
  )

  if (asLink || href) {
    return (
      <Link
        to={href ?? "/"}
        className={cn("inline-flex items-center gap-2 transition-opacity hover:opacity-90", className)}
        aria-label={isHidden ? undefined : "IQX - Trang chủ"}
      >
        {imageElement}
        {showText && (
          <span
            className={cn(
              "font-heading font-bold tracking-tight text-foreground",
              resolveTextSize(size),
              textClassName
            )}
          >
            IQX
          </span>
        )}
      </Link>
    )
  }

  return content
}
