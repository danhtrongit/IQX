/**
 * Thanh cấu hình chung của backtest — port từ
 * `dashboard/src/features/backtest/components/ConfigBar.tsx`.
 *
 * Bốn trường: mã cổ phiếu, khoảng thời gian và vốn ban đầu. Ngày dùng
 * `<input type="date">` (giá trị ISO `YYYY-MM-DD` — đúng định dạng backend nhận)
 * và hiển thị theo locale người dùng; vốn hiển thị nhóm nghìn khi gõ.
 */
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { DatePicker } from "@/components/ui/date-picker"

import { parseMoney } from "../format"

const LABEL_CLASS = "text-[10.5px] font-semibold tracking-wide text-muted-foreground uppercase"

export function ConfigBar({
  symbol,
  start,
  end,
  capital,
  onSymbol,
  onStart,
  onEnd,
  onCapital,
}: {
  symbol: string
  start: string
  end: string
  capital: number
  onSymbol: (symbol: string) => void
  onStart: (start: string) => void
  onEnd: (end: string) => void
  onCapital: (capital: number) => void
}) {
  return (
    <div className="grid grid-cols-1 items-end gap-4 rounded-lg bg-card p-4 md:grid-cols-[2fr_1fr_1fr_1.2fr]">
      <div className="space-y-1.5">
        <Label htmlFor="backtest-symbol" className={LABEL_CLASS}>
          Cổ phiếu
        </Label>
        <Input
          id="backtest-symbol"
          value={symbol}
          onChange={(event) => onSymbol(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
          placeholder="FPT"
          autoComplete="off"
          spellCheck={false}
          className="font-mono font-bold tracking-wider"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="backtest-start" className={LABEL_CLASS}>
          Từ ngày
        </Label>
        <DatePicker
          id="backtest-start"
          clearable={false}
          value={start}
          max={end || undefined}
          onChange={onStart}
          aria-label="Từ ngày"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="backtest-end" className={LABEL_CLASS}>
          Đến ngày
        </Label>
        <DatePicker
          id="backtest-end"
          clearable={false}
          value={end}
          min={start || undefined}
          onChange={onEnd}
          aria-label="Đến ngày"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="backtest-capital" className={LABEL_CLASS}>
          Vốn ban đầu (VND)
        </Label>
        <Input
          id="backtest-capital"
          inputMode="numeric"
          value={capital > 0 ? capital.toLocaleString("en-US") : ""}
          onChange={(event) => onCapital(parseMoney(event.target.value))}
          placeholder="100,000,000"
          className="font-mono tabular-nums"
        />
      </div>
    </div>
  )
}
