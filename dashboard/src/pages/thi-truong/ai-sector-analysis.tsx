import { useState, useEffect } from "react"
import { BrainCircuit, Loader2 } from "lucide-react"
import { api } from "@/lib/api"
import { ScrollArea } from "@/components/ui/scroll-area"

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

export function AiSectorAnalysis() {
  const [sectors, setSectors] = useState<SectorAnalysis[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<SectorAnalysis | null>(null)

  useEffect(() => {
    const load = async () => {
      try {
        const res = await api.get("ai-dashboard/sectors/HOSE").json<any>()
        const list: SectorAnalysis[] = res.data?.sectors || []
        setSectors(list)
        if (list.length > 0) setSelected(list[0])
      } catch {
        setSectors([])
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  return (
    <div className="bg-card rounded-lg border border-border flex flex-col" style={{ minHeight: 300 }}>
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-border">
        <BrainCircuit className="size-3.5 text-primary" />
        <h3 className="text-xs font-semibold text-foreground">AI Phân tích ngành</h3>
      </div>
      {loading ? (
        <div className="flex-1 flex justify-center items-center"><Loader2 className="size-4 animate-spin text-primary" /></div>
      ) : sectors.length === 0 ? (
        <div className="flex-1 flex justify-center items-center text-xs text-muted-foreground">Chưa có dữ liệu AI</div>
      ) : (
        <div className="flex flex-1 min-h-0">
          {/* Sector list */}
          <ScrollArea className="w-[110px] border-r border-border shrink-0">
            <div className="p-1 space-y-0.5">
              {sectors.filter(s => s.analysis).map((s) => (
                <button
                  key={s.icbCode}
                  onClick={() => setSelected(s)}
                  className={`w-full text-left px-2 py-1.5 rounded text-[10px] transition-colors truncate ${
                    selected?.icbCode === s.icbCode ? "bg-primary/20 text-primary font-semibold" : "text-muted-foreground hover:bg-muted/40"
                  }`}
                >
                  {s.icbName || `ICB ${s.icbCode}`}
                </button>
              ))}
            </div>
          </ScrollArea>
          {/* Analysis content */}
          <ScrollArea className="flex-1">
            {selected?.analysis ? (
              <div className="p-3 space-y-1.5">
                <div className="text-xs font-semibold text-foreground mb-2">{selected.icbName}</div>
                {Object.entries(selected.analysis).map(([key, val]) => (
                  <div key={key} className="flex gap-2">
                    <span className="text-[10px] font-semibold text-primary shrink-0 w-[60px]">{FIELD_LABELS[key] || key}:</span>
                    <span className="text-[11px] text-muted-foreground leading-relaxed">{val}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex justify-center items-center h-full text-xs text-muted-foreground p-4">Chọn ngành để xem phân tích</div>
            )}
          </ScrollArea>
        </div>
      )}
    </div>
  )
}
