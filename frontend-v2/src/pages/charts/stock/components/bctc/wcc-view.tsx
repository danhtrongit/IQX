import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"

import { fmtNumber } from "../../format"
import type { WccSeries } from "../../types"

function days(value: number | null): string {
  return value == null ? "—" : fmtNumber(value, 0)
}

/** A labelled formula chip: "DSO 89". */
function Chip({ label, value, className }: { label: string; value: string; className: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-sm px-2 py-1 text-[11px] font-bold text-primary-foreground",
        className,
      )}
    >
      <span className="opacity-80">{label}</span>
      <span className="tabular-nums">{value}</span>
    </span>
  )
}

/**
 * Working-capital cycle: DSO + DIO − DPO = CCC formula header (latest period)
 * over a multi-period table. The CCC row is emphasized.
 */
export function WccView({ data }: { data: WccSeries }) {
  const latest = data.latest
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Chip label="DSO" value={days(latest.dso)} className="bg-primary" />
        <span className="text-sm font-bold text-muted-foreground">+</span>
        <Chip label="DIO" value={days(latest.dio)} className="bg-chart-1" />
        <span className="text-sm font-bold text-muted-foreground">−</span>
        <Chip label="DPO" value={days(latest.dpo)} className="bg-accent" />
        <span className="text-sm font-bold text-muted-foreground">=</span>
        <Chip label="CCC" value={days(latest.ccc)} className="bg-chart-5" />
      </div>

      <ScrollArea className="w-full" orientation="horizontal" viewportClassName="pb-2">
        <table className="w-full min-w-max border-collapse text-xs">
          <thead>
            <tr className="border-b border-border text-[10px] tracking-wide text-muted-foreground uppercase">
              <th className="py-2 pr-3 text-left font-medium">Số ngày</th>
              {data.columns.map((column) => (
                <th key={column} className="py-2 pl-3 text-right font-medium tabular-nums">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row) => (
              <tr
                key={row.key}
                className={cn(
                  "border-b border-border/60 last:border-0",
                  row.key === "ccc" && "font-bold",
                )}
              >
                <td className="py-2 pr-3 text-left">{row.label}</td>
                {row.values.map((value, index) => (
                  <td
                    key={index}
                    className={cn(
                      "py-2 pl-3 text-right tabular-nums",
                      row.key !== "ccc" && "text-muted-foreground",
                    )}
                  >
                    {days(value)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </ScrollArea>
    </div>
  )
}
