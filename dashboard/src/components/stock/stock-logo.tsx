import { useState, useCallback } from "react"

const CDN_BASE = "https://cdn.simplize.vn/simplizevn/logo"

interface StockLogoProps {
  symbol: string
  size?: number
  className?: string
}

export function StockLogo({ symbol, size = 24, className = "" }: StockLogoProps) {
  const [hasError, setHasError] = useState(false)

  const handleError = useCallback(() => setHasError(true), [])

  if (hasError || !symbol) {
    return (
      <div
        className={`flex items-center justify-center rounded-md bg-primary/10 text-primary shrink-0 ${className}`}
        style={{ width: size, height: size }}
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
      className={`rounded-md object-cover shrink-0 bg-muted ${className}`}
      loading="lazy"
    />
  )
}
