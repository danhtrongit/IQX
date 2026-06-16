import { fmtNumber } from "../../format"
import type { WccSeries } from "../../types"

function days(v: number | null): string {
  return v == null ? "—" : fmtNumber(v, 0)
}

/** A colored formula chip: "DSO 89". */
function Chip({ label, value, bg }: { label: string; value: string; bg: string }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-bold text-white"
      style={{ background: bg }}
    >
      <span className="opacity-80">{label}</span>
      <span className="tabular-nums">{value}</span>
    </span>
  )
}

/**
 * Working-capital cycle: a DSO + DIO − DPO = CCC formula header (latest period)
 * over a multi-period table. The CCC row is emphasized.
 */
export function WccView({ data }: { data: WccSeries }) {
  const L = data.latest
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Chip label="DSO" value={days(L.dso)} bg="rgb(var(--primary-6))" />
        <span className="text-sm font-bold text-[var(--color-text-3)]">+</span>
        <Chip label="DIO" value={days(L.dio)} bg="#3b82f6" />
        <span className="text-sm font-bold text-[var(--color-text-3)]">−</span>
        <Chip label="DPO" value={days(L.dpo)} bg="#b45309" />
        <span className="text-sm font-bold text-[var(--color-text-3)]">=</span>
        <Chip label="CCC" value={days(L.ccc)} bg="rgb(var(--primary-7))" />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-[var(--color-border-2)] text-[10px] uppercase text-[var(--color-text-3)]">
              <th className="py-2 pr-3 text-left font-medium">Số ngày</th>
              {data.columns.map((col) => (
                <th key={col} className="py-2 pl-3 text-right font-medium tabular-nums">
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row) => (
              <tr
                key={row.key}
                className={`border-b border-[var(--color-border-1)] last:border-0 ${
                  row.key === "ccc" ? "font-bold text-[var(--color-text-1)]" : ""
                }`}
              >
                <td className="py-2 pr-3 text-left">{row.label}</td>
                {row.values.map((v, i) => (
                  <td
                    key={i}
                    className={`py-2 pl-3 text-right tabular-nums ${
                      row.key === "ccc" ? "" : "text-[var(--color-text-2)]"
                    }`}
                  >
                    {days(v)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
