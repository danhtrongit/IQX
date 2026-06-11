import { useIndices, type IndexData } from "@/features/market-data"
import { cn } from "@/shared/lib/cn"
import { fmtBil, fmtChange, fmtIndex, fmtTrieu, signTone } from "./format"

/** Display order (theo tên hiển thị của IndexData). */
const ORDER = ["VN-Index", "VN30", "HNX30", "HNX-Index", "UPCOM"]

function SummaryRow({ name, index }: { name: string; index: IndexData | null }) {
  return (
    <tr className="border-b border-[var(--color-border-1)] last:border-b-0">
      <td className="px-2 py-1 font-semibold text-[var(--color-text-1)]">{name}</td>
      <td className={cn("px-2 py-1 text-right tabular-nums font-semibold", index ? signTone(index.change) : "text-[var(--color-text-3)]")}>
        {fmtIndex(index?.value)}
      </td>
      <td className={cn("px-2 py-1 text-right tabular-nums", index ? signTone(index.change) : "text-[var(--color-text-3)]")}>
        {index ? fmtChange(index.change) : "—"}
      </td>
      <td className="px-2 py-1 text-right tabular-nums text-[var(--color-text-2)]">
        {fmtTrieu(index?.volume)}
      </td>
      <td className="px-2 py-1 text-right tabular-nums text-[var(--color-text-2)]">
        {fmtBil(index?.totalValue)}
      </td>
      <td className="px-2 py-1 text-right tabular-nums whitespace-nowrap">
        <span className="text-up">↑{index?.advances ?? "—"}</span>{" "}
        <span className="text-reference">—{index?.noChange ?? "—"}</span>{" "}
        <span className="text-down">↓{index?.declines ?? "—"}</span>
      </td>
    </tr>
  )
}

/** Bảng tóm tắt các chỉ số chính — chỉ hiện từ breakpoint xl trở lên. */
export function IndexSummaryTable() {
  const { indices } = useIndices()

  return (
    <div className="hidden w-[400px] shrink-0 self-stretch overflow-hidden rounded-lg border border-[var(--color-border-2)] bg-[var(--color-bg-2)] xl:block">
      <table className="w-full border-collapse text-[11px]">
        <thead className="text-[10px] uppercase text-[var(--color-text-3)]">
          <tr className="border-b border-[var(--color-border-2)]">
            <th className="px-2 py-1.5 text-left">Chỉ số</th>
            <th className="px-2 py-1.5 text-right">Điểm</th>
            <th className="px-2 py-1.5 text-right">+/-</th>
            <th className="px-2 py-1.5 text-right">KLGD (triệu)</th>
            <th className="px-2 py-1.5 text-right">GTGD (tỷ)</th>
            <th className="px-2 py-1.5 text-right">CK tăng/giảm</th>
          </tr>
        </thead>
        <tbody>
          {ORDER.map((name) => (
            <SummaryRow
              key={name}
              name={name}
              index={indices.find((i) => i.name === name) ?? null}
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}
