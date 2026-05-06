import { useState, useEffect } from "react"
import { ArrowLeftRight, Loader2, AlertCircle } from "lucide-react"
import { api } from "@/lib/api"

interface FxRaw {
  NormName: string
  NormValue: number | null
  GroupName: string
  UnitCode: string
  ReportTime: string
}

interface FxRow {
  label: string
  unit: string
  value: number | null
  reportTime: string
}

// Các chỉ tiêu FX quan tâm
const FX_FIELDS = [
  "Tỷ giá trung tâm",
  "Ngân hàng thương mại mua",
  "Ngân hàng thương mại bán",
  "Liên ngân hàng",
  "Tỷ giá tự do mua",
  "Tỷ giá tự do bán",
]

function parseFxData(data: FxRaw[]): FxRow[] {
  // Lấy dữ liệu mới nhất cho mỗi NormName
  const latest = new Map<string, FxRow>()

  for (const d of data) {
    const name = d.NormName?.trim()
    if (!name) continue

    if (!latest.has(name)) {
      latest.set(name, {
        label: name,
        unit: d.UnitCode || "USD/VNĐ",
        value: d.NormValue,
        reportTime: d.ReportTime || "",
      })
    }
  }

  // Sắp xếp theo thứ tự ưu tiên
  const rows: FxRow[] = []
  for (const field of FX_FIELDS) {
    const match = [...latest.entries()].find(
      ([key]) => key.includes(field) || field.includes(key),
    )
    if (match) {
      rows.push(match[1])
      latest.delete(match[0])
    }
  }

  // Thêm phần còn lại
  for (const [, v] of latest) {
    rows.push(v)
  }

  return rows
}

export function ExchangeRates() {
  const [rows, setRows] = useState<FxRow[]>([])
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
              indicator: "fx",
              type: "1",
              fromYear: String(year - 1),
              toYear: String(year),
            },
          })
          .json<any>()

        const data: FxRaw[] = res.data || []
        const parsed = parseFxData(data)
        setRows(parsed)

        if (parsed.length > 0 && parsed[0].reportTime) {
          setReportDate(parsed[0].reportTime)
        }
      } catch {
        setError(true)
        setRows([])
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
          <ArrowLeftRight className="size-3.5 text-primary" />
          <h3 className="text-xs font-semibold text-foreground">Tỷ giá USD/VNĐ</h3>
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
        ) : error || rows.length === 0 ? (
          <div className="flex flex-col justify-center items-center h-full gap-1.5">
            <AlertCircle className="size-4 text-muted-foreground" />
            <span className="text-[10px] text-muted-foreground">Không thể tải dữ liệu tỷ giá</span>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="text-[9px] text-muted-foreground/70">
                <th className="text-left py-1 px-1.5 font-medium">Loại tỷ giá</th>
                <th className="text-right py-1 px-1.5 font-medium">Giá trị</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.label} className="hover:bg-muted/30 transition-colors">
                  <td className="py-1.5 px-1.5">
                    <div className="text-[11px] font-medium text-foreground">{r.label}</div>
                    <div className="text-[8px] text-muted-foreground/50">{r.unit}</div>
                  </td>
                  <td className="text-right py-1.5 px-1.5 text-[11px] font-semibold text-foreground tabular-nums">
                    {r.value !== null ? r.value.toLocaleString("vi-VN") : "—"}
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
