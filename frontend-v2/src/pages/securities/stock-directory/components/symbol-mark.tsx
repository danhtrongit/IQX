import { useState } from "react"

import { cn } from "@/lib/utils"

/** Logo CDN used by the legacy directory when a row carries no `logo_url`. */
const LOGO_CDN = "https://cdn.simplize.vn/simplizevn/logo"

/**
 * Ticker mark: the row's logo when the backend provides one (else the legacy
 * CDN), falling back to a tinted monogram when the image is missing.
 */
export function SymbolMark({
  symbol,
  logoUrl,
  className,
}: {
  symbol: string
  logoUrl?: string | null
  className?: string
}) {
  const [failed, setFailed] = useState(false)

  if (failed || !symbol) {
    return (
      <span
        aria-hidden
        className={cn(
          "flex size-7 shrink-0 items-center justify-center rounded-sm bg-secondary text-xs font-bold text-primary",
          className,
        )}
      >
        {symbol.slice(0, 2) || "?"}
      </span>
    )
  }

  return (
    <img
      src={logoUrl || `${LOGO_CDN}/${symbol.toUpperCase()}.jpeg`}
      alt=""
      width={28}
      height={28}
      loading="lazy"
      onError={() => setFailed(true)}
      className={cn(
        "size-7 shrink-0 rounded-sm border border-border bg-card object-contain p-px",
        className,
      )}
    />
  )
}
