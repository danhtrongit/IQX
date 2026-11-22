import { useState } from "react"
import { List, TriangleAlert } from "lucide-react"

import { Button } from "@/components/ui/button"

import { NativeSelect } from "../shared/controls"
import { DialogShell } from "../shared/dialog-shell"
import type { Universe, UniverseOptions } from "./api"
import { universeLabel } from "./draft"
import { listUniverse, symbolsOf } from "./universe"
import { LABEL, SUB_TEXT } from "./ui"

const valueOf = (universe: Universe, options: UniverseOptions | undefined) => {
  if (universe.type !== "saved_list") return universe.type
  const option = options?.saved_lists.find((item) => item.id === universe.list_id)
  return option && option.symbols_kept.join(",") === universe.symbols.join(",") ? `L:${option.id}` : "current"
}

/**
 * Ô Rổ mã (§4.1 item 3) and the line under the setup (item 4): name, count, first 10 symbols, `Xem danh sách`,
 * the symbols left out because they are not in the VN100 store, and the empty-basket stop (`UNIVERSE_EMPTY`).
 */
export function UniverseSelect({
  id,
  universe,
  options,
  readOnly,
  basketsOnly = false,
  onChange,
}: {
  id: string
  universe: Universe
  options: UniverseOptions | undefined
  readOnly: boolean
  /** Compose mode of a Chiến lược IQX: VN30 or VN100 only (§7.1). */
  basketsOnly?: boolean
  onChange: (next: { universe: Universe; excluded: string[] }) => void
}) {
  const value = valueOf(universe, options)
  return (
    <div className="min-w-0 space-y-1.5">
      <label htmlFor={id} className={LABEL}>Rổ mã</label>
      <NativeSelect
        id={id}
        value={value}
        disabled={readOnly}
        onChange={(event) => {
          const next = event.target.value
          if (next === "vn30" || next === "vn100") onChange({ universe: { type: next }, excluded: [] })
          else if (next.startsWith("L:")) {
            const option = options?.saved_lists.find((item) => `L:${item.id}` === next)
            if (option) onChange(listUniverse(option))
          }
        }}
      >
        <optgroup label="Rổ">
          <option value="vn30">VN30{options ? ` (${options.vn30.symbols.length} mã)` : ""}</option>
          <option value="vn100">VN100{options ? ` (${options.vn100.symbols.length} mã)` : ""}</option>
        </optgroup>
        {!basketsOnly && (
          <optgroup label="Danh mục đã lưu (Bộ lọc)">
            {value === "current" && universe.type === "saved_list" && <option value="current">{universe.list_name} ({universe.symbols.length} mã)</option>}
            {(options?.saved_lists ?? []).map((item) => (
              <option key={item.id} value={`L:${item.id}`}>
                {item.name} ({item.symbols_total} mã)
              </option>
            ))}
          </optgroup>
        )}
      </NativeSelect>
    </div>
  )
}

export function UniverseLine({ universe, excluded, options }: { universe: Universe; excluded: readonly string[]; options: UniverseOptions | undefined }) {
  const [open, setOpen] = useState(false)
  const symbols = symbolsOf(universe, options)
  const name = universeLabel(universe)
  return (
    <section aria-label="Rổ mã đang chọn" className="space-y-2 rounded-lg border border-border bg-card px-4 py-2.5 text-xs" data-testid="universe-line">
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
        <b className="text-foreground">{name}</b>
        <span className={`min-w-0 break-words ${SUB_TEXT}`}>
          · {symbols.length} mã{symbols.length > 0 ? ` · ${symbols.slice(0, 10).join(", ")}${symbols.length > 10 ? "…" : ""}` : ""}
        </span>
        <Button type="button" variant="link" size="xs" className="h-auto p-0" disabled={symbols.length === 0} onClick={() => setOpen(true)}>
          <List aria-hidden="true" />
          Xem danh sách
        </Button>
      </div>
      {excluded.length > 0 && symbols.length > 0 && (
        <p className="flex items-start gap-1.5 rounded-md border border-status-warning/50 bg-status-warning/10 px-2.5 py-1.5 leading-5" data-testid="universe-excluded">
          <TriangleAlert aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-status-warning" />
          <span>
            Bỏ {excluded.length} mã ngoài VN100 (không có trong kho dữ liệu): {excluded.join(", ")}. Backtest và Bot chỉ dùng {symbols.length} mã còn lại.
          </span>
        </p>
      )}
      {options && symbols.length === 0 && (
        <p role="alert" className="text-xs leading-5 text-destructive" data-testid="universe-empty">Danh mục này không có mã nào thuộc VN100.</p>
      )}
      {open && (
        <DialogShell title={`${name} · ${symbols.length} mã`} size="md" onClose={() => setOpen(false)} footer={<Button type="button" variant="outline" onClick={() => setOpen(false)}>Đóng</Button>}>
          <ul className="grid grid-cols-3 gap-1.5 text-xs font-semibold sm:grid-cols-6" aria-label="Danh sách mã">
            {symbols.map((symbol) => (
              <li key={symbol} className="rounded-sm border border-border px-2 py-1 text-center">{symbol}</li>
            ))}
          </ul>
          <p className={`text-xs leading-5 ${SUB_TEXT}`}>
            {universe.type === "saved_list"
              ? "Danh mục đã lưu: danh sách mã được chép vào chiến lược khi lưu và dùng cho cả quá khứ."
              : "Rổ dùng thành phần hiện tại cho cả quá khứ (chưa có dữ liệu thành phần rổ theo thời điểm)."}
          </p>
        </DialogShell>
      )}
    </section>
  )
}
