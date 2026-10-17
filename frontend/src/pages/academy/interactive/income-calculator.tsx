import { useId, useState } from "react"

import { Input } from "@/components/ui/input"
import type { InteractiveBlock } from "../content-types"

type IncomeCalculatorData = Extract<InteractiveBlock, { type: "income_calculator" }>

const vnd = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 })

/** Monthly income of the content's example policy; negative or empty inputs count as 0. */
function estimateIncome(block: Pick<IncomeCalculatorData, "fee_rate" | "share_rate">, clients: number, monthlyValueMillion: number): number {
  const safe = (value: number) => (Number.isFinite(value) ? Math.max(0, value) : 0)
  return Math.round(safe(clients) * safe(monthlyValueMillion) * 1e6 * block.fee_rate * block.share_rate)
}

/**
 * "Tự tính" of chapter 2 lesson 1: clients still trading × monthly value per client × fee × share.
 * The rates are lesson content, not code. Nothing is saved.
 */
export function IncomeCalculator({ block }: { block: IncomeCalculatorData }) {
  const baseId = useId()
  const [clients, setClients] = useState(String(block.clients.default))
  const [value, setValue] = useState(String(block.monthly_value_million.default))
  const income = estimateIncome(block, Number(clients), Number(value))
  return (
    <section aria-labelledby={`${baseId}-title`} className="my-4 rounded-lg border border-border bg-card p-4 sm:p-5">
      <h4 id={`${baseId}-title`} className="font-heading text-base font-semibold text-foreground">
        {block.title}
      </h4>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1.5 text-sm text-foreground">
          <span>{block.clients.label}</span>
          <Input type="number" inputMode="numeric" min={0} step={1} value={clients} onChange={(event) => setClients(event.target.value)} className="tabular-nums" />
        </label>
        <label className="grid gap-1.5 text-sm text-foreground">
          <span>{block.monthly_value_million.label}</span>
          <Input type="number" inputMode="decimal" min={0} value={value} onChange={(event) => setValue(event.target.value)} className="tabular-nums" />
        </label>
      </div>
      <div className="mt-4 flex flex-wrap items-baseline justify-between gap-2 rounded-md border border-border bg-muted/40 p-3">
        <span className="text-sm text-academy-subtle">{block.result_label}</span>
        <output aria-live="polite" className="font-heading text-xl font-bold text-foreground tabular-nums">
          {vnd.format(income)} đ
        </output>
      </div>
      {block.note && <p className="mt-2 text-xs leading-5 text-academy-subtle">{block.note}</p>}
    </section>
  )
}
