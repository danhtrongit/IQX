import { ScrollText } from "lucide-react"

// MOCK DATA — backend chưa có endpoint riêng cho lãi suất trái phiếu chính phủ
// API hiện có: /market-data/macro/indicator?indicator=interest_rate chỉ trả lãi suất liên ngân hàng
const MOCK_BONDS = [
  { term: "1 năm", yield: 1.65, change: -0.02 },
  { term: "2 năm", yield: 1.78, change: +0.01 },
  { term: "3 năm", yield: 1.92, change: +0.03 },
  { term: "5 năm", yield: 2.15, change: +0.05 },
  { term: "7 năm", yield: 2.48, change: +0.02 },
  { term: "10 năm", yield: 2.82, change: -0.01 },
  { term: "15 năm", yield: 2.95, change: +0.04 },
  { term: "20 năm", yield: 3.05, change: +0.00 },
  { term: "30 năm", yield: 3.12, change: -0.03 },
]

export function BondYields() {
  return (
    <div className="bg-card rounded-lg border border-border flex flex-col" style={{ minHeight: 260 }}>
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <div className="flex items-center gap-1.5">
          <ScrollText className="size-3.5 text-primary" />
          <h3 className="text-xs font-semibold text-foreground">Lãi suất TPCP</h3>
        </div>
        <span className="text-[9px] font-medium px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-500">
          Mock
        </span>
      </div>
      <div className="flex-1 p-2">
        <table className="w-full">
          <thead>
            <tr className="text-[9px] text-muted-foreground/70">
              <th className="text-left py-1 px-1.5 font-medium">Kỳ hạn</th>
              <th className="text-right py-1 px-1.5 font-medium">Yield (%)</th>
              <th className="text-right py-1 px-1.5 font-medium">+/- (bps)</th>
            </tr>
          </thead>
          <tbody>
            {MOCK_BONDS.map((b) => (
              <tr key={b.term} className="hover:bg-muted/30 transition-colors">
                <td className="py-1.5 px-1.5 text-[11px] font-medium text-foreground">{b.term}</td>
                <td className="text-right py-1.5 px-1.5 text-[11px] font-semibold text-foreground tabular-nums">
                  {b.yield.toFixed(2)}
                </td>
                <td
                  className={`text-right py-1.5 px-1.5 text-[10px] font-medium tabular-nums ${b.change > 0 ? "text-emerald-500" : b.change < 0 ? "text-red-500" : "text-muted-foreground"}`}
                >
                  {b.change > 0 ? "+" : ""}
                  {(b.change * 100).toFixed(0)} bps
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
