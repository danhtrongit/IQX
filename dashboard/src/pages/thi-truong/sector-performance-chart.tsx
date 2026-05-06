import { useState, useEffect, useMemo } from "react"
import { BarChart3, Loader2 } from "lucide-react"
import { api } from "@/lib/api"
import { Bar, BarChart, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts"

interface SectorItem {
  icbCode: number
  icbName: string | null
  input: { D: number | null; W: number | null; VD: number | null }
}

export function SectorPerformanceChart() {
  const [items, setItems] = useState<SectorItem[]>([])
  const [loading, setLoading] = useState(true)
  const [mode, setMode] = useState<"perf" | "vol">("perf")

  useEffect(() => {
    const load = async () => {
      try {
        const res = await api.get("trading/sector-signals/all-levels", { searchParams: { group: "HOSE" } }).json<any>()
        setItems(res.data?.items || [])
      } catch { setItems([]) }
      finally { setLoading(false) }
    }
    load()
  }, [])

  const chartData = useMemo(() => {
    if (mode === "perf") {
      return items
        .filter((s) => s.input.D !== null)
        .sort((a, b) => (b.input.D || 0) - (a.input.D || 0))
        .slice(0, 15)
        .map((s) => ({
          name: (s.icbName || "").length > 12 ? (s.icbName || "").slice(0, 12) + "…" : s.icbName || "",
          value: +(s.input.D || 0).toFixed(2),
        }))
    }
    return items
      .filter((s) => s.input.VD !== null && s.input.VD! > 0)
      .sort((a, b) => (b.input.VD || 0) - (a.input.VD || 0))
      .slice(0, 15)
      .map((s) => ({
        name: (s.icbName || "").length > 12 ? (s.icbName || "").slice(0, 12) + "…" : s.icbName || "",
        value: +((s.input.VD || 0) / 1e9).toFixed(1),
      }))
  }, [items, mode])

  return (
    <div className="bg-card rounded-lg border border-border flex flex-col" style={{ minHeight: 300 }}>
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <div className="flex items-center gap-1.5">
          <BarChart3 className="size-3.5 text-primary" />
          <h3 className="text-xs font-semibold text-foreground">
            {mode === "perf" ? "Hiệu suất ngành (ngày)" : "KLGD ngành (tỷ)"}
          </h3>
        </div>
        <div className="flex gap-1">
          <button
            onClick={() => setMode("perf")}
            className={`text-[10px] px-2 py-0.5 rounded ${mode === "perf" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted/50"}`}
          >
            Hiệu suất
          </button>
          <button
            onClick={() => setMode("vol")}
            className={`text-[10px] px-2 py-0.5 rounded ${mode === "vol" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted/50"}`}
          >
            KLGD
          </button>
        </div>
      </div>
      <div className="flex-1 p-2">
        {loading ? (
          <div className="flex justify-center items-center h-full"><Loader2 className="size-4 animate-spin text-primary" /></div>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={chartData} layout="vertical" margin={{ left: 0, right: 8, top: 4, bottom: 4 }}>
              <XAxis type="number" tick={{ fontSize: 9, fill: "#888" }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 9, fill: "#aaa" }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ backgroundColor: "#1a1a2e", border: "1px solid #333", borderRadius: 6, fontSize: 11 }}
                labelStyle={{ color: "#ccc" }}
                formatter={(v: any) => mode === "perf" ? `${v}%` : `${v} tỷ`}
              />
              <Bar dataKey="value" radius={[0, 3, 3, 0]} maxBarSize={16}>
                {chartData.map((entry, i) => (
                  <Cell key={i} fill={mode === "perf" ? (entry.value >= 0 ? "#10b981" : "#ef4444") : "#3b82f6"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}
