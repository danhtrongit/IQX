import { useState, useEffect } from "react"
import { TrendingUp, TrendingDown, Globe, Loader2, AlertCircle } from "lucide-react"
import { api } from "@/lib/api"

interface MacroRaw {
  NormName: string
  NormValue: number | null
  GroupName: string
  UnitCode: string
  ReportTime: string
  NormGroupID: number
}

interface MacroItem {
  label: string
  value: string
  prevValue: number | null
  change: string
  up: boolean | null
  unit: string
  source: "api" | "mock"
}

// Fallback nếu API trả về rỗng cho một số chỉ tiêu hiếm
const MOCK_FALLBACKS: MacroItem[] = [
  { label: "PMI sản xuất", value: "51.2", prevValue: null, change: "+0.8", up: true, unit: "", source: "mock" },
]

function parseMacroData(gdpData: MacroRaw[], cpiData: MacroRaw[]): MacroItem[] {
  const items: MacroItem[] = []

  // GDP — lấy GDP tổng (NormName chứa "tổng" hoặc GroupName "Tốc độ tăng GDP")
  const gdpGrowth = gdpData.find(
    (d) => d.GroupName?.includes("Tốc độ tăng GDP") && d.NormName?.includes("Tổng") && d.NormValue !== null,
  )
  if (gdpGrowth) {
    items.push({
      label: `GDP ${gdpGrowth.ReportTime}`,
      value: `${gdpGrowth.NormValue}%`,
      prevValue: null,
      change: "",
      up: (gdpGrowth.NormValue || 0) > 0,
      unit: gdpGrowth.UnitCode,
      source: "api",
    })
  }

  // CPI tổng — "Chỉ số giá tiêu dùng" (GroupName rỗng hoặc cùng tên)
  const cpiTotal = cpiData.find(
    (d) => d.NormName?.includes("Chỉ số giá tiêu dùng") && !d.GroupName && d.NormValue !== null,
  )
  if (cpiTotal) {
    items.push({
      label: `CPI ${cpiTotal.ReportTime}`,
      value: `${cpiTotal.NormValue}%`,
      prevValue: null,
      change: "",
      up: (cpiTotal.NormValue || 0) > 0,
      unit: "%",
      source: "api",
    })
  }

  // CPI so cùng kỳ
  const cpiYoY = cpiData.find(
    (d) => d.NormName?.includes("So sánh với cùng kỳ") && d.NormValue !== null,
  )
  if (cpiYoY) {
    items.push({
      label: `CPI YoY ${cpiYoY.ReportTime}`,
      value: `${cpiYoY.NormValue}%`,
      prevValue: null,
      change: "so cùng kỳ",
      up: (cpiYoY.NormValue || 0) > 0,
      unit: "%",
      source: "api",
    })
  }

  // GDP components
  const gdpComponents = gdpData
    .filter(
      (d) =>
        d.GroupName?.includes("Tốc độ tăng GDP") &&
        !d.NormName?.includes("Tổng") &&
        d.NormValue !== null,
    )
    .slice(0, 5)

  for (const comp of gdpComponents) {
    items.push({
      label: comp.NormName?.trim() || "N/A",
      value: `${comp.NormValue}%`,
      prevValue: null,
      change: comp.ReportTime || "",
      up: (comp.NormValue || 0) > 0,
      unit: comp.UnitCode,
      source: "api",
    })
  }

  // Fill remaining slots with mock if we have fewer than 6
  if (items.length < 6) {
    for (const fb of MOCK_FALLBACKS) {
      if (items.length >= 8) break
      if (!items.some((i) => i.label === fb.label)) {
        items.push(fb)
      }
    }
  }

  return items.slice(0, 8)
}

export function MacroIndicators() {
  const [items, setItems] = useState<MacroItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [hasMock, setHasMock] = useState(false)

  useEffect(() => {
    const load = async () => {
      try {
        const now = new Date()
        const year = now.getFullYear()
        const [gdpRes, cpiRes] = await Promise.allSettled([
          api
            .get("market-data/macro/indicator", {
              searchParams: { indicator: "gdp", type: "3", fromYear: String(year - 2), toYear: String(year) },
            })
            .json<any>(),
          api
            .get("market-data/macro/indicator", {
              searchParams: { indicator: "cpi", type: "2", fromYear: String(year - 1), toYear: String(year) },
            })
            .json<any>(),
        ])

        const gdpData: MacroRaw[] = gdpRes.status === "fulfilled" ? gdpRes.value.data || [] : []
        const cpiData: MacroRaw[] = cpiRes.status === "fulfilled" ? cpiRes.value.data || [] : []

        const parsed = parseMacroData(gdpData, cpiData)
        setItems(parsed)
        setHasMock(parsed.some((i) => i.source === "mock"))
      } catch {
        setError(true)
        setItems([])
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  return (
    <div className="bg-card rounded-lg border border-border flex flex-col" style={{ minHeight: 280 }}>
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <div className="flex items-center gap-1.5">
          <Globe className="size-3.5 text-primary" />
          <h3 className="text-xs font-semibold text-foreground">Chỉ số vĩ mô</h3>
        </div>
        {hasMock && (
          <span className="text-[9px] font-medium px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-500">
            Mock
          </span>
        )}
      </div>
      <div className="flex-1 p-2">
        {loading ? (
          <div className="flex justify-center items-center h-full">
            <Loader2 className="size-4 animate-spin text-primary" />
          </div>
        ) : error || items.length === 0 ? (
          <div className="flex flex-col justify-center items-center h-full gap-1.5">
            <AlertCircle className="size-4 text-muted-foreground" />
            <span className="text-[10px] text-muted-foreground">Không thể tải dữ liệu vĩ mô</span>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-1.5">
            {items.map((item) => (
              <div key={item.label} className="bg-muted/30 rounded-md p-2 flex flex-col gap-0.5">
                <div className="flex items-center gap-1">
                  <span className="text-[10px] text-muted-foreground truncate flex-1">{item.label}</span>
                  {item.source === "mock" && (
                    <span className="text-[7px] font-medium px-1 py-px rounded bg-amber-500/15 text-amber-500 shrink-0">
                      Mock
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-foreground tabular-nums">{item.value}</span>
                  <div className="flex items-center gap-0.5">
                    {item.up !== null &&
                      (item.up ? (
                        <TrendingUp className="size-2.5 text-emerald-500" />
                      ) : (
                        <TrendingDown className="size-2.5 text-red-500" />
                      ))}
                    {item.change && (
                      <span
                        className={`text-[9px] font-medium tabular-nums ${
                          item.up === null
                            ? "text-muted-foreground"
                            : item.up
                              ? "text-emerald-500"
                              : "text-red-500"
                        }`}
                      >
                        {item.change}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
