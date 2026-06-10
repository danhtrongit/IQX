import { useCallback, useState } from "react"
import { cn } from "@/shared/lib/cn"

const CDN_BASE = "https://cdn.simplize.vn/simplizevn/logo"

interface StockLogoProps {
  symbol: string
  size?: number
  className?: string
}

/**
 * Stock logo by ticker (CDN image with a tinted-initials fallback).
 * Ported from `dashboard-bak/src/components/stock/stock-logo.tsx`.
 */
export function StockLogo({ symbol, size = 24, className }: StockLogoProps) {
  const [hasError, setHasError] = useState(false)
  const handleError = useCallback(() => setHasError(true), [])

  if (hasError || !symbol) {
    return (
      <div
        className={cn(
          "flex shrink-0 items-center justify-center rounded-md",
          className,
        )}
        style={{
          width: size,
          height: size,
          background: "var(--color-primary-light-1)",
          color: "rgb(var(--primary-6))",
        }}
      >
        <span className="font-bold" style={{ fontSize: size * 0.38 }}>
          {symbol?.slice(0, 2) || "?"}
        </span>
      </div>
    )
  }

  return (
    <img
      src={`${CDN_BASE}/${symbol.toUpperCase()}.jpeg`}
      alt={symbol}
      width={size}
      height={size}
      onError={handleError}
      loading="lazy"
      className={cn(
        "box-border shrink-0 rounded-md bg-[var(--color-fill-2)] object-contain p-px",
        className,
      )}
    />
  )
}
