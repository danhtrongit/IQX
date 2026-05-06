import { useState, useEffect } from "react"
import { Landmark, Loader2, AlertCircle } from "lucide-react"
import { api } from "@/lib/api"

interface RateRaw {
  NormName: string
  NormValue: number | null
  GroupName: string
  UnitCode: string
  ReportTime: string
}

interface RateRow {
  term: string
  rate: number | null
  reportTime: string
}

// Thứ tự kỳ hạn mong muốn
const TERM_ORDER = [
  "Qua đêm",
  "1 tuần",
  "2 tuần",
  "1 tháng",
  "3 tháng",
  "6 tháng",
  "9 tháng",
  "12 tháng",
]

function parseRates(data: RateRaw[]): RateRow[] {
  // Lấy dữ liệu mới nhất (ReportTime lớn nhất) cho mỗi kỳ hạn
  const latest = new Map<string, RateRow>()

  for (const d of data) {
    if (!d.GroupName?.includes("Lãi suất bình quân liên ngân hàng")) continue
    const term = d.NormName?.trim()
    if (!term) continue

    // Chỉ giữ record mới nhất per term
    const existing = latest.get(term)
    if (!existing) {
      latest.set(term, { term, rate: d.NormValue, reportTime: d.ReportTime || "" })
    }
  }

  // Sort theo thứ tự chuẩn
  const rows: RateRow[] = []
  for (const t of TERM_ORDER) {
    // Tìm match chính xác hoặc partial
    const match = [...latest.entries()].find(([key]) => key.includes(t) || t.includes(key.trim()))
    if (match) {
      rows.push(match[1])
      latest.delete(match[0])
    }
  }

  // Thêm phần còn lại nếu có
  for (const [, v] of latest) {
    rows.push(v)
  }

  return rows
}

export function InterbankRates() {
  const [rates, setRates] = useState<RateRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [reportDate, setReportDate] = useState("")

  useEffect(() => {
    const load = async () => {
      try {
        const year = new Date().getFullYear()
        const res = await api
          .get("market-data/macro/indicator", {
            searchParams: {
              indicator: "interest_rate",
              type: "1",
              fromYear: String(year - 1),
              toYear: String(year),
            },
          })
          .json<any>()

        const data: RateRaw[] = res.data || []
        const parsed = parseRates(data)
        setRates(parsed)

        if (parsed.length > 0 && parsed[0].reportTime) {
          setReportDate(parsed[0].reportTime)
        }
      } catch {
        setError(true)
        setRates([])
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  return (
    <div className="bg-card rounded-lg border border-border flex flex-col" style={{ minHeight: 260 }}>
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <div className="flex items-center gap-1.5">
          <Landmark className="size-3.5 text-primary" />
          <h3 className="text-xs font-semibold text-foreground">Lãi suất VND liên ngân hàng</h3>
        </div>
        {reportDate && (
          <span className="text-[9px] text-muted-foreground/60 tabular-nums">{reportDate}</span>
        )}
      </div>
      <div className="flex-1 p-2">
        {loading ? (
          <div className="flex justify-center items-center h-full">
            <Loader2 className="size-4 animate-spin text-primary" />
          </div>
        ) : error || rates.length === 0 ? (
          <div className="flex flex-col justify-center items-center h-full gap-1.5">
            <AlertCircle className="size-4 text-muted-foreground" />
            <span className="text-[10px] text-muted-foreground">Không thể tải dữ liệu lãi suất</span>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="text-[9px] text-muted-foreground/70">
                <th className="text-left py-1 px-1.5 font-medium">Kỳ hạn</th>
                <th className="text-right py-1 px-1.5 font-medium">Lãi suất (%/năm)</th>
              </tr>
            </thead>
            <tbody>
              {rates.map((r) => (
                <tr key={r.term} className="hover:bg-muted/30 transition-colors">
                  <td className="py-1.5 px-1.5 text-[11px] font-medium text-foreground">{r.term}</td>
                  <td className="text-right py-1.5 px-1.5 text-[11px] font-semibold text-foreground tabular-nums">
                    {r.rate !== null ? r.rate.toFixed(2) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
