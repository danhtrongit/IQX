import { cn } from "@/lib/utils"

import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

import { fmtChange, fmtIndex, fmtMillion, fmtTimeOfDay, fmtValueBil, signTone } from "../../market/format"
import { useIndices } from "../../market/hooks"
import { MAIN_INDEX_ORDER, type MarketIndexQuote } from "../../market/types"

function SummaryRow({ name, index }: { name: string; index: MarketIndexQuote | null }) {
  const tone = index ? signTone(index.change) : "text-muted-foreground"
  return (
    <TableRow className="cursor-default hover:bg-transparent">
      <TableCell className="px-2.5 py-1 font-semibold text-foreground">{name}</TableCell>
      <TableCell className={cn("px-2 py-1 text-right font-semibold tabular-nums", tone)}>
        {fmtIndex(index?.value)}
      </TableCell>
      <TableCell className={cn("px-2 py-1 text-right tabular-nums", tone)}>
        {index ? fmtChange(index.change) : "—"}
      </TableCell>
      <TableCell className="px-2 py-1 text-right tabular-nums text-muted-foreground">
        {fmtMillion(index?.volume)}
      </TableCell>
      <TableCell className="px-2 py-1 text-right tabular-nums text-muted-foreground">
        {fmtValueBil(index?.totalValue)}
      </TableCell>
      <TableCell className="px-2 py-1 text-right tabular-nums whitespace-nowrap">
        <span className="text-price-up">↑{index?.advances ?? "—"}</span>{" "}
        <span className="text-price-ref">—{index?.noChange ?? "—"}</span>{" "}
        <span className="text-price-down">↓{index?.declines ?? "—"}</span>
      </TableCell>
    </TableRow>
  )
}

/**
 * Bảng tóm tắt các chỉ số chính (điểm, mức thay đổi, thanh khoản, độ rộng thị
 * trường) kèm thời điểm dữ liệu — chỉ hiện từ breakpoint xl trở lên.
 */
export function IndexSummaryTable() {
  const { indices, updatedAt } = useIndices()

  return (
    <div className="hidden w-[420px] shrink-0 self-stretch flex-col overflow-hidden rounded-lg border border-border bg-card xl:flex">
      <div className="flex items-center justify-between gap-2 border-b border-border px-2.5 py-2">
        <span className="text-xs font-semibold text-foreground">Chỉ số thị trường</span>
        <span className="text-xs tabular-nums text-muted-foreground">
          Cập nhật {fmtTimeOfDay(updatedAt)}
        </span>
      </div>
      <table className="w-full border-collapse text-xs">
        <TableHeader>
          <TableRow className="border-b border-border hover:bg-transparent">
            <TableHead className="px-2.5 py-1.5 font-medium">Chỉ số</TableHead>
            <TableHead className="px-2 py-1.5 text-right font-medium">Điểm</TableHead>
            <TableHead className="px-2 py-1.5 text-right font-medium">+/-</TableHead>
            <TableHead className="px-2 py-1.5 text-right font-medium">KLGD (triệu)</TableHead>
            <TableHead className="px-2 py-1.5 text-right font-medium">GTGD (tỷ)</TableHead>
            <TableHead className="px-2 py-1.5 text-right font-medium">CK tăng/giảm</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {MAIN_INDEX_ORDER.map((name) => (
            <SummaryRow
              key={name}
              name={name}
              index={indices.find((candidate) => candidate.name === name) ?? null}
            />
          ))}
        </TableBody>
      </table>
    </div>
  )
}
