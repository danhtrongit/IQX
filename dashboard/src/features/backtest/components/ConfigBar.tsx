import { DatePicker, Input, InputNumber } from "@arco-design/web-react"

interface Props {
  symbol: string
  start: string
  end: string
  capital: number
  onSymbol: (s: string) => void
  onStart: (s: string) => void
  onEnd: (s: string) => void
  onCapital: (n: number) => void
}

const labelCls = "mb-1.5 block text-[10.5px] font-semibold uppercase tracking-wide text-[var(--color-text-3)]"

export function ConfigBar({ symbol, start, end, capital, onSymbol, onStart, onEnd, onCapital }: Props) {
  return (
    <div className="grid grid-cols-1 items-end gap-4 rounded-lg border border-[var(--color-border-2)] bg-[var(--color-bg-2)] p-4 md:grid-cols-[2fr_1fr_1fr_1.2fr]">
      <div>
        <label className={labelCls}>Cổ phiếu</label>
        <Input
          value={symbol}
          onChange={(v) => onSymbol(v.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
          placeholder="FPT"
          style={{ fontFamily: "var(--font-mono, monospace)", fontWeight: 700, letterSpacing: "0.04em" }}
        />
      </div>
      <div>
        <label className={labelCls}>Từ ngày</label>
        <DatePicker
          value={start}
          onChange={(v) => v && onStart(v)}
          format="YYYY-MM-DD"
          allowClear={false}
          style={{ width: "100%" }}
        />
      </div>
      <div>
        <label className={labelCls}>Đến ngày</label>
        <DatePicker
          value={end}
          onChange={(v) => v && onEnd(v)}
          format="YYYY-MM-DD"
          allowClear={false}
          style={{ width: "100%" }}
        />
      </div>
      <div>
        <label className={labelCls}>Vốn ban đầu (VND)</label>
        <InputNumber
          value={capital}
          onChange={(v) => onCapital(v ?? 0)}
          min={0}
          step={1_000_000}
          formatter={(value) => `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}
          parser={(value) => value.replace(/,/g, "")}
          style={{ width: "100%" }}
        />
      </div>
    </div>
  )
}
