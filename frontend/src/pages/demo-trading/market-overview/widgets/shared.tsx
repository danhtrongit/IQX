import { useEffect, useState, type AnchorHTMLAttributes, type ReactNode } from "react"
import { Link } from "react-router"
import type {
  PriceTone,
  SignedTone,
  WidgetDataMap,
  WidgetSlug,
  WidgetStateMap,
} from "../types"

export interface WidgetSnapshotMeta {
  asOf: string
  sessionDate: string
  isMarketOpen: boolean
  stale: boolean
}

export interface WidgetControlsProps<W extends WidgetSlug> {
  state: WidgetStateMap[W]
  onStateChange: (patch: Partial<WidgetStateMap[W]>) => void
}

export interface WidgetBodyProps<W extends WidgetSlug> {
  state: WidgetStateMap[W]
  data: WidgetDataMap[W] | undefined
  meta: WidgetSnapshotMeta | undefined
  isNarrow: boolean
  onStateChange: (patch: Partial<WidgetStateMap[W]>) => void
}

export interface MoSegmentOption<T extends string> {
  readonly value: T
  readonly label: string
  readonly title?: string
}

export interface MoSegmentedControlProps<T extends string> {
  options: readonly MoSegmentOption<T>[]
  value: T
  onChange: (value: T) => void
  ariaLabel?: string
  className?: string
}

export function MoSegmentedControl<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  className,
}: MoSegmentedControlProps<T>) {
  return (
    <div
      className={className ? `mo-seg ${className}` : "mo-seg"}
      role="group"
      aria-label={ariaLabel}
      data-no-drag="true"
    >
      {options.map((option) => {
        const isActive = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            className={isActive ? "on" : undefined}
            aria-pressed={isActive}
            title={option.title}
            data-no-drag="true"
            onClick={() => {
              if (!isActive) onChange(option.value)
            }}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

export interface MoSubTabOption<T extends string> {
  readonly value: T
  readonly label: string
}

export interface MoSubTabsProps<T extends string> {
  options: readonly MoSubTabOption<T>[]
  value: T
  onChange: (value: T) => void
  ariaLabel?: string
  className?: string
  rightSlot?: ReactNode
}

export function MoSubTabs<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  className,
  rightSlot,
}: MoSubTabsProps<T>) {
  return (
    <div
      className={className ? `mo-tabs2 ${className}` : "mo-tabs2"}
      role="tablist"
      aria-label={ariaLabel}
      data-no-drag="true"
    >
      {options.map((option) => {
        const isActive = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={isActive}
            className={isActive ? "on" : undefined}
            data-no-drag="true"
            onClick={() => {
              if (!isActive) onChange(option.value)
            }}
          >
            {option.label}
          </button>
        )
      })}
      {rightSlot}
    </div>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function toneToMoClass(tone: PriceTone | SignedTone | undefined): string {
  switch (tone) {
    case "ce":
      return "mo-ce"
    case "fl":
      return "mo-fl"
    case "up":
      return "mo-up"
    case "dn":
      return "mo-dn"
    case "ref":
      return "mo-rf"
    default:
      return ""
  }
}

export interface MoTickerLinkProps
  extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> {
  symbol: string
  tone?: PriceTone | SignedTone
  children?: ReactNode
}

export function MoTickerLink({
  symbol,
  tone,
  className,
  title,
  children,
  ...rest
}: MoTickerLinkProps) {
  const toneClass = toneToMoClass(tone)
  const classes = ["no-underline hover:underline", toneClass, className]
    .filter(Boolean)
    .join(" ")

  return (
    <Link
      to={`/co-phieu/${encodeURIComponent(symbol)}`}
      data-no-drag="true"
      className={classes}
      title={title ?? `Xem chi tiết ${symbol}`}
      {...rest}
    >
      {children ?? symbol}
    </Link>
  )
}

const FLASH_DURATION_MS = 600
const FLASH_EPSILON = 1e-9

interface FlashTrackerState {
  prev: number | null | undefined
  resetKey: string | number | undefined
  dir: "up" | "dn" | null
  seq: number
}

/**
 * Tracks live numeric updates and returns `"up"` or `"dn"` for 0.6s when the value changes.
 * Does not flash on initial mount, initial hydration (`undefined -> number`), or `resetKey` switch.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function useValueFlash(
  value: number | null | undefined,
  resetKey?: string | number,
): "up" | "dn" | null {
  const [tracker, setTracker] = useState<FlashTrackerState>({
    prev: value,
    resetKey,
    dir: null,
    seq: 0,
  })

  if (!Object.is(tracker.resetKey, resetKey)) {
    setTracker({
      prev: value,
      resetKey,
      dir: null,
      seq: tracker.seq + 1,
    })
  } else if (!Object.is(tracker.prev, value)) {
    let nextDir: "up" | "dn" | null = null
    if (
      tracker.prev != null &&
      value != null &&
      Number.isFinite(tracker.prev) &&
      Number.isFinite(value)
    ) {
      if (value > tracker.prev + FLASH_EPSILON) {
        nextDir = "up"
      } else if (value < tracker.prev - FLASH_EPSILON) {
        nextDir = "dn"
      }
    }

    setTracker({
      prev: value,
      resetKey,
      dir: nextDir,
      seq: nextDir !== null ? tracker.seq + 1 : tracker.seq,
    })
  }

  useEffect(() => {
    if (tracker.dir === null) return
    const currentSeq = tracker.seq
    const timer = window.setTimeout(() => {
      setTracker((curr) =>
        curr.seq === currentSeq ? { ...curr, dir: null } : curr,
      )
    }, FLASH_DURATION_MS)
    return () => window.clearTimeout(timer)
  }, [tracker.dir, tracker.seq])

  return tracker.dir
}

// eslint-disable-next-line react-refresh/only-export-components
export function flashClass(dir: "up" | "dn" | null): string {
  if (dir === "up") return "mo-flash-up"
  if (dir === "dn") return "mo-flash-dn"
  return ""
}

export interface MoEmptyDataProps {
  message?: string
  className?: string
  children?: ReactNode
}

export function MoEmptyData({
  message = "Không có dữ liệu",
  className,
  children,
}: MoEmptyDataProps) {
  return (
    <div className={className ? `mo-state ${className}` : "mo-state"}>
      <span className="mo-note">{message}</span>
      {children}
    </div>
  )
}

export interface MoFlashValueProps {
  value: number | null | undefined
  formatted: string
  resetKey?: string | number
  className?: string
}

export function MoFlashValue({
  value,
  formatted,
  resetKey,
  className,
}: MoFlashValueProps) {
  const dir = useValueFlash(value, resetKey)
  const classes = ["rounded px-0.5", flashClass(dir), className]
    .filter(Boolean)
    .join(" ")
  return <span className={classes}>{formatted}</span>
}
