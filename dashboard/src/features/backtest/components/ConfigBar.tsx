import { fmtMoney, parseMoney } from "../format"

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
const inputCls =
  "w-full rounded border border-[var(--color-border-2)] bg-[var(--color-bg-1)] px-2.5 py-2 text-[13px] text-[var(--color-text-1)] outline-none focus:border-[rgb(var(--primary-6))]"

export function ConfigBar({ symbol, start, end, capital, onSymbol, onStart, onEnd, onCapital }: Props) {
  return (
    <div className="grid grid-cols-1 items-end gap-4 rounded-lg border border-[var(--color-border-2)] bg-[var(--color-bg-2)] p-4 md:grid-cols-[2fr_1fr_1fr_1.2fr]">
      <div>
        <label className={labelCls}>Cổ phiếu</label>
        <input
          value={symbol}
          onChange={(e) => onSymbol(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
          placeholder="FPT"
          className={`${inputCls} font-mono text-[15px] font-bold tracking-wide`}
        />
      </div>
      <div>
        <label className={labelCls}>Từ ngày</label>
        <input type="date" value={start} onChange={(e) => onStart(e.target.value)} className={`${inputCls} font-mono`} />
      </div>
      <div>
        <label className={labelCls}>Đến ngày</label>
        <input type="date" value={end} onChange={(e) => onEnd(e.target.value)} className={`${inputCls} font-mono`} />
      </div>
      <div>
        <label className={labelCls}>Vốn ban đầu (VND)</label>
        <input
          value={fmtMoney(capital)}
          onChange={(e) => onCapital(parseMoney(e.target.value))}
          className={`${inputCls} font-mono`}
        />
      </div>
    </div>
  )
}
