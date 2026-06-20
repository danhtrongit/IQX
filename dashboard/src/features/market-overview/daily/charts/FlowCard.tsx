// ─── FlowCard ──────────────────────────────────────────────────────────────
// Reusable "dòng tiền" card shell matching terminal `.flow-*` markup.
// Used by ForeignFlowCard and PropFlowCard — no data-fetching here.

import type { ReactNode } from "react"
import { ChartCard } from "./ChartCard"

// ── Types ─────────────────────────────────────────────────────────────────

export interface FlowTopItem {
  ticker: string
  value: number        // tỷ VND, signed (negative = sell, positive = buy)
  anomaly?: boolean
}

export interface FlowCardProps {
  title: string
  buyLabel?: string        // default "Mua ròng"
  sellLabel?: string       // default "Bán ròng"
  buyValue: number         // tỷ VND, positive
  sellValue: number        // tỷ VND, positive (absolute), shown with − prefix
  streakBars: number[]     // up to 12 daily net values, signed; last = today
  streakLabel: ReactNode
  topSell: FlowTopItem[]   // values negative
  topBuy: FlowTopItem[]    // values positive; may have anomaly
  topSellHeading?: string  // default "▼ TOP BÁN"
  topBuyHeading?: string   // default "▲ TOP MUA"
}

// ── Helpers ───────────────────────────────────────────────────────────────

function fmtBillion(val: number): string {
  return Math.abs(val).toLocaleString("vi-VN", { maximumFractionDigits: 0 })
}

function StreakBars({ bars }: { bars: number[] }) {
  if (bars.length === 0) return null
  const maxAbs = Math.max(...bars.map((b) => Math.abs(b)), 1)
  return (
    <div
      style={{
        display: "flex",
        gap: 1.5,
        alignItems: "flex-end",
        height: 22,
        flex: 1,
      }}
    >
      {bars.map((v, i) => {
        const isToday = i === bars.length - 1
        const heightPct = Math.max((Math.abs(v) / maxAbs) * 100, 8)
        return (
          <div
            key={i}
            style={{
              flex: 1,
              height: `${heightPct}%`,
              background: v >= 0 ? "#10b981" : "#ef4444",
              opacity: isToday ? 1 : 0.5,
              borderRadius: "1px 1px 0 0",
            }}
          />
        )
      })}
    </div>
  )
}

function TopList({
  items,
  isPositive,
}: {
  items: FlowTopItem[]
  isPositive: boolean
}) {
  const maxAbs = Math.max(...items.map((it) => Math.abs(it.value)), 1)
  return (
    <div>
      {items.map((item) => {
        const widthPct = (Math.abs(item.value) / maxAbs) * 100
        const color = isPositive ? "#10b981" : "#ef4444"
        return (
          <div
            key={item.ticker}
            style={{
              display: "grid",
              gridTemplateColumns: "40px 1fr 56px",
              alignItems: "center",
              gap: 6,
              padding: item.anomaly ? "4px 6px" : "4px 0",
              fontSize: 11,
              borderRadius: item.anomaly ? 4 : 0,
              background: item.anomaly
                ? "rgba(255,179,71,0.13)"
                : undefined,
              margin: item.anomaly ? "2px -6px" : undefined,
              position: "relative",
            }}
          >
            {/* Ticker */}
            <span
              style={{
                fontWeight: 700,
                fontSize: 11,
                color: "var(--color-text-1)",
              }}
            >
              {item.ticker}
            </span>

            {/* Bar track */}
            <div
              style={{
                height: 4,
                background: "var(--color-fill-2)",
                borderRadius: 2,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${widthPct}%`,
                  height: "100%",
                  background: color,
                  borderRadius: 2,
                }}
              />
            </div>

            {/* Value */}
            <div
              style={{
                fontFamily: "monospace",
                fontSize: 10,
                textAlign: "right",
                fontWeight: 600,
                color,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {isPositive ? "+" : ""}
              {fmtBillion(item.value)} tỷ
            </div>

            {/* Anomaly badge */}
            {item.anomaly && (
              <span
                style={{
                  position: "absolute",
                  right: 60,
                  top: "50%",
                  transform: "translateY(-50%)",
                  fontSize: 8,
                  color: "#FFB347",
                  background: "var(--color-bg-2)",
                  padding: "1px 4px",
                  borderRadius: 3,
                  letterSpacing: "0.04em",
                  fontWeight: 700,
                  whiteSpace: "nowrap",
                  pointerEvents: "none",
                }}
              >
                BẤT THƯỜNG
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────

export function FlowCard({
  title,
  buyLabel = "Mua ròng",
  sellLabel = "Bán ròng",
  buyValue,
  sellValue,
  streakBars,
  streakLabel,
  topSell,
  topBuy,
  topSellHeading = "▼ TOP BÁN",
  topBuyHeading = "▲ TOP MUA",
}: FlowCardProps) {
  return (
    <ChartCard title={title}>
      {/* ── Summary cells — bleed to card edges via negative margin ── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 1,
          background: "var(--color-border-1)",
          margin: "-16px -16px 12px",
        }}
      >
        {/* Mua ròng */}
        <div
          style={{
            background: "var(--color-bg-2)",
            padding: "11px 12px",
            textAlign: "center",
          }}
        >
          <div
            style={{
              fontSize: 9,
              color: "var(--color-text-2)",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              marginBottom: 4,
              fontWeight: 600,
            }}
          >
            {buyLabel}
          </div>
          <div
            style={{
              fontFamily: "monospace",
              fontSize: 16,
              fontWeight: 600,
              color: "#10b981",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            +{fmtBillion(buyValue)} tỷ
          </div>
        </div>

        {/* Bán ròng */}
        <div
          style={{
            background: "var(--color-bg-2)",
            padding: "11px 12px",
            textAlign: "center",
          }}
        >
          <div
            style={{
              fontSize: 9,
              color: "var(--color-text-2)",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              marginBottom: 4,
              fontWeight: 600,
            }}
          >
            {sellLabel}
          </div>
          <div
            style={{
              fontFamily: "monospace",
              fontSize: 16,
              fontWeight: 600,
              color: "#ef4444",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            −{fmtBillion(sellValue)} tỷ
          </div>
        </div>
      </div>

      {/* ── Streak row ── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 10px",
          background: "var(--color-fill-2)",
          borderRadius: 6,
          marginBottom: 12,
        }}
      >
        <StreakBars bars={streakBars} />
        <div
          style={{
            fontSize: 10,
            color: "var(--color-text-2)",
            whiteSpace: "nowrap",
            lineHeight: 1.5,
          }}
        >
          {streakLabel}
        </div>
      </div>

      {/* ── Two-column top lists ── */}
      <div
        style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}
      >
        {/* Left: TOP BÁN */}
        <div>
          <div
            style={{
              fontSize: 9,
              color: "var(--color-text-2)",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              marginBottom: 8,
              paddingBottom: 6,
              borderBottom: "1px solid var(--color-border-1)",
              fontWeight: 600,
            }}
          >
            {topSellHeading}
          </div>
          <TopList items={topSell} isPositive={false} />
        </div>

        {/* Right: TOP MUA */}
        <div>
          <div
            style={{
              fontSize: 9,
              color: "var(--color-text-2)",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              marginBottom: 8,
              paddingBottom: 6,
              borderBottom: "1px solid var(--color-border-1)",
              fontWeight: 600,
            }}
          >
            {topBuyHeading}
          </div>
          <TopList items={topBuy} isPositive />
        </div>
      </div>
    </ChartCard>
  )
}
