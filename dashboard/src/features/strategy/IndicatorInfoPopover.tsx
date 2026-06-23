import React from "react"
import { Popover } from "@arco-design/web-react"
import { indicatorInfo } from "./indicatorInfo"
import { IndicatorChart } from "./charts/IndicatorChart"

interface IndicatorInfoPopoverProps {
  indicatorId: string
  label: string
  children: React.ReactNode
}

function PopoverContent({
  indicatorId,
  label,
}: {
  indicatorId: string
  label: string
}) {
  const info = indicatorInfo(indicatorId)
  if (!info) return null

  return (
    <div
      style={{
        maxWidth: 320,
        fontSize: 12,
        lineHeight: 1.5,
      }}
    >
      {/* Header */}
      <div
        style={{
          fontWeight: 700,
          fontSize: 13,
          color: "var(--color-text-1)",
          marginBottom: 2,
        }}
      >
        {label}
      </div>

      {/* Tagline */}
      <div
        style={{
          fontSize: 11,
          color: "var(--color-text-3)",
          marginBottom: 8,
          lineHeight: 1.4,
        }}
      >
        {info.tagline}
      </div>

      {/* Chart */}
      <div style={{ marginBottom: info.levels.length ? 8 : 0 }}>
        <IndicatorChart indicatorId={indicatorId} archetype={info.archetype} />
      </div>

      {/* Levels table */}
      {info.levels.length > 0 && (
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: 10.5,
          }}
        >
          <thead>
            <tr>
              {(["Vùng", "Trạng thái", "Hành động"] as const).map((h) => (
                <th
                  key={h}
                  style={{
                    textAlign: "left",
                    padding: "2px 4px",
                    color: "var(--color-text-3)",
                    fontWeight: 600,
                    borderBottom: "1px solid var(--color-border-2)",
                    whiteSpace: "nowrap",
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {info.levels.map((lvl, i) => (
              <tr key={i}>
                <td
                  style={{
                    padding: "2px 4px",
                    color: "var(--color-text-2)",
                    borderBottom: "1px solid var(--color-border-2)",
                    fontFamily: "monospace",
                    whiteSpace: "nowrap",
                  }}
                >
                  {lvl.range}
                </td>
                <td
                  style={{
                    padding: "2px 4px",
                    color: "var(--color-text-1)",
                    borderBottom: "1px solid var(--color-border-2)",
                  }}
                >
                  {lvl.state}
                </td>
                <td
                  style={{
                    padding: "2px 4px",
                    color: "var(--color-text-2)",
                    borderBottom: "1px solid var(--color-border-2)",
                  }}
                >
                  {lvl.action}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

export function IndicatorInfoPopover({
  indicatorId,
  label,
  children,
}: IndicatorInfoPopoverProps) {
  const info = indicatorInfo(indicatorId)

  if (!info) {
    return <>{children}</>
  }

  return (
    <Popover
      trigger="hover"
      position="right"
      content={<PopoverContent indicatorId={indicatorId} label={label} />}
    >
      {children}
    </Popover>
  )
}
