import { useState, useEffect, useCallback } from "react"
import { Layers, BrainCircuit, Loader2 } from "lucide-react"
import { api } from "@/lib/api"
import { ScrollArea } from "@/components/ui/scroll-area"

interface SectorItem {
  icbCode: number
  icbName: string | null
  icbLevel: number | null
  input: { D: number | null; W: number | null; M: number | null; VD: number | null }
  result: { label: string | null }
}

interface SectorAnalysis {
  icbCode: number
  icbName: string | null
  label: string | null
  analysis: {
    trang_thai: string
    hieu_suat: string
    dong_tien: string
    do_rong: string
    dan_dat: string
    diem_yeu: string
    co_hoi: string
    rui_ro: string
  } | null
}

const LABEL_COLORS: Record<string, string> = {
  "Dẫn sóng": "bg-emerald-500/20 text-emerald-400",
  "Hút tiền": "bg-blue-500/20 text-blue-400",
  "Tích lũy": "bg-amber-500/20 text-amber-400",
  "Phân phối": "bg-orange-500/20 text-orange-400",
  "Hồi kỹ thuật": "bg-purple-500/20 text-purple-400",
  "Suy yếu": "bg-red-500/20 text-red-400",
}

const FIELD_LABELS: Record<string, string> = {
  trang_thai: "Trạng thái",
  hieu_suat: "Hiệu suất",
  dong_tien: "Dòng tiền",
  do_rong: "Độ rộng",
  dan_dat: "Dẫn dắt",
  diem_yeu: "Điểm yếu",
  co_hoi: "Cơ hội",
  rui_ro: "Rủi ro",
}

export function SectorData() {
  const [items, setItems] = useState<SectorItem[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedCode, setSelectedCode] = useState<number | null>(null)

  // AI sector analysis state
  const [aiSectors, setAiSectors] = useState<SectorAnalysis[]>([])
  const [aiLoading, setAiLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      try {
        const res = await api.get("trading/sector-signals/all-levels", { searchParams: { group: "HOSE" } }).json<any>()
        const list = res.data?.items || []
        setItems(list)
        if (list.length > 0 && !selectedCode) setSelectedCode(list[0].icbCode)
      } catch {
        setItems([])
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  useEffect(() => {
    const load = async () => {
      try {
        const res = await api.get("ai-dashboard/sectors/HOSE").json<any>()
        const list: SectorAnalysis[] = res.data?.sectors || []
        setAiSectors(list)
      } catch {
        setAiSectors([])
      } finally {
        setAiLoading(false)
      }
    }
    load()
  }, [])

  const handleSelect = useCallback((code: number) => {
    setSelectedCode(code)
  }, [])

  const selectedAi = aiSectors.find((s) => s.icbCode === selectedCode) || null

  const fmtPct = (v: number | null) => {
    if (v === null) return "—"
    return `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`
  }
  const pctColor = (v: number | null) => {
    if (v === null) return "text-muted-foreground"
    return v > 0 ? "text-emerald-500" : v < 0 ? "text-red-500" : "text-amber-500"
  }

  return (
    <div className="bg-card rounded-lg border border-border flex flex-col lg:col-span-2" style={{ minHeight: 300 }}>
      {/* Header */}
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-border">
        <Layers className="size-3.5 text-primary" />
        <h3 className="text-xs font-semibold text-foreground">Dữ liệu ngành</h3>
        {selectedAi && (
          <>
            <span className="text-muted-foreground/30 mx-1">|</span>
            <BrainCircuit className="size-3.5 text-primary" />
            <span className="text-xs font-semibold text-foreground">AI Phân tích</span>
          </>
        )}
      </div>

      {/* Content: Left = Table, Right = AI Analysis */}
      <div className="flex flex-1 min-h-0">
        {/* Left: Sector data table */}
        <ScrollArea className="flex-1 min-w-0">
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="size-4 animate-spin text-primary" /></div>
          ) : (
            <table className="w-full">
              <thead className="sticky top-0 bg-card z-10">
                <tr className="text-[9px] text-muted-foreground/70">
                  <th className="text-left py-1.5 px-2 font-medium">Ngành</th>
                  <th className="text-center py-1.5 px-1 font-medium">Tín hiệu</th>
                  <th className="text-right py-1.5 px-1.5 font-medium">Ngày</th>
                  <th className="text-right py-1.5 px-1.5 font-medium">Tuần</th>
                  <th className="text-right py-1.5 px-1.5 font-medium">Tháng</th>
                </tr>
              </thead>
              <tbody>
                {items.map((s) => (
                  <tr
                    key={s.icbCode}
                    onClick={() => handleSelect(s.icbCode)}
                    className={`cursor-pointer transition-colors border-t border-border/30 ${
                      selectedCode === s.icbCode
                        ? "bg-primary/10 hover:bg-primary/15"
                        : "hover:bg-muted/30"
                    }`}
                  >
                    <td className="py-1.5 px-2">
                      <span className={`text-[11px] font-medium line-clamp-1 ${
                        selectedCode === s.icbCode ? "text-primary" : "text-foreground"
                      }`}>
                        {s.icbName || `ICB ${s.icbCode}`}
                      </span>
                    </td>
                    <td className="py-1.5 px-1 text-center">
                      {s.result.label ? (
                        <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded-full ${LABEL_COLORS[s.result.label] || "bg-muted text-muted-foreground"}`}>
                          {s.result.label}
                        </span>
                      ) : (
                        <span className="text-[9px] text-muted-foreground/50">—</span>
                      )}
                    </td>
                    <td className={`text-right py-1.5 px-1.5 text-[10px] font-medium tabular-nums ${pctColor(s.input.D)}`}>{fmtPct(s.input.D)}</td>
                    <td className={`text-right py-1.5 px-1.5 text-[10px] font-medium tabular-nums ${pctColor(s.input.W)}`}>{fmtPct(s.input.W)}</td>
                    <td className={`text-right py-1.5 px-1.5 text-[10px] font-medium tabular-nums ${pctColor(s.input.M)}`}>{fmtPct(s.input.M)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </ScrollArea>

        {/* Right: AI Analysis panel */}
        <div className="w-[280px] shrink-0 border-l border-border flex flex-col">
          {aiLoading ? (
            <div className="flex-1 flex justify-center items-center">
              <Loader2 className="size-4 animate-spin text-primary" />
            </div>
          ) : !selectedAi?.analysis ? (
            <div className="flex-1 flex justify-center items-center text-xs text-muted-foreground p-4 text-center">
              {selectedCode ? "Chưa có phân tích AI cho ngành này" : "Chọn ngành để xem phân tích"}
            </div>
          ) : (
            <ScrollArea className="flex-1">
              <div className="p-3 space-y-1.5">
                <div className="text-xs font-semibold text-foreground mb-2">{selectedAi.icbName}</div>
                {Object.entries(selectedAi.analysis).map(([key, val]) => (
                  <div key={key} className="flex gap-2">
                    <span className="text-[10px] font-semibold text-primary shrink-0 w-[60px]">{FIELD_LABELS[key] || key}:</span>
                    <span className="text-[11px] text-muted-foreground leading-relaxed">{val}</span>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </div>
      </div>
    </div>
  )
}
