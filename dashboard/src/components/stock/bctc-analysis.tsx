import { useEffect, useState } from "react"
import { Loader2, AlertTriangle } from "lucide-react"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  fmtPercent, fmtMultiple, fmtNumber,
  statusColorClass, statusLabel, type BctcStatus,
} from "./bctc-format"
import { PremiumGate } from "@/components/premium/premium-gate"
import { useBctcAi, BctcAiMemo, BctcModuleNote } from "./bctc-ai-memo"
import { moduleNote } from "./bctc-ai"

const API_BASE = import.meta.env.VITE_API_URL || "/api/v1"

type SnapshotCell = { key: string; label: string; unit: string; value: number | null; status: BctcStatus }
type ModuleBlock = { id: string; title: string; type: string; data: Record<string, number | null> }
type BctcPayload = {
  template: "A" | "B"
  sector: string
  periods: string[]
  snapshot: SnapshotCell[]
  modules: ModuleBlock[]
  forensic: { green: string[]; red: string[] }
  flags: { level: string; code: string; message: string }[]
  trinity?: { altman_z: number | null; piotroski_f?: { score: number | null }; beneish_m: number | null }
  subsector?: { label: string; metrics: Record<string, number | null> } | null
  blind_spots?: string[]
}

function fmtCell(c: SnapshotCell): string {
  if (c.unit === "%") return fmtPercent(c.value)
  if (c.unit === "x") return fmtMultiple(c.value)
  return fmtNumber(c.value, 2)
}

const PCT_KEYS = new Set(["cogs_pct", "selling_pct", "admin_pct", "nii_pct", "fee_pct", "cir", "cost_of_risk", "provision_ppop", "yield_ea", "cost_of_funds", "spread", "fcf_margin", "sloan_accrual", "roe", "roa", "nii_to_ta", "non_nii_to_ta", "opex_to_ta", "provision_to_ta", "tax_to_ta", "trading_pct", "other_pct"])
const MARGIN_SUFFIX = ["margin"]
const DAYS_KEYS = new Set(["dso", "dio", "dpo", "ccc"])

function fmtModuleValue(key: string, v: number | null): string {
  if (key === "cfo_ni") return fmtMultiple(v)
  if (PCT_KEYS.has(key) || MARGIN_SUFFIX.some((s) => key.endsWith(s))) return fmtPercent(v)
  if (DAYS_KEYS.has(key)) return fmtNumber(v, 0)
  // Số tiền lớn (VND) -> hiển thị theo tỷ.
  if (v != null && Math.abs(v) >= 1e9) return `${fmtNumber(v / 1e9, 1)} tỷ`
  return fmtNumber(v, 2)
}

export function BctcAnalysis({ symbol }: { symbol: string }) {
  const [data, setData] = useState<BctcPayload | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState("")
  const { ai, isLoading: aiLoading, error: aiError } = useBctcAi(symbol)

  useEffect(() => {
    let alive = true
    setIsLoading(true)
    setError("")
    fetch(`${API_BASE}/market-data/bctc/${symbol.toUpperCase()}?term_type=1`)
      .then((r) => r.json())
      .then((res) => {
        if (!alive) return
        setData((res?.data ?? res) as BctcPayload)
      })
      .catch(() => alive && setError("Không tải được dữ liệu phân tích BCTC"))
      .finally(() => alive && setIsLoading(false))
    return () => { alive = false }
  }, [symbol])

  if (isLoading)
    return <div className="flex h-full items-center justify-center"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>
  if (error || !data)
    return <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground"><AlertTriangle className="size-6" /><span className="text-xs">{error || "Không có dữ liệu"}</span></div>

  return (
    <ScrollArea className="h-full">
      <div className="mx-auto max-w-[1080px] px-4 py-4 space-y-6">
        <section>
          <h3 className="font-serif text-base font-bold mb-3">① Thẻ Snapshot · {data.template === "B" ? "Ngân hàng" : (data.subsector?.label ?? "Standard")}</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-px bg-border/30 rounded-lg overflow-hidden">
            {data.snapshot.map((c) => (
              <div key={c.key} className="bg-card p-3">
                <div className="flex items-start justify-between">
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{c.label}</span>
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${statusColorClass(c.status)}`}>{statusLabel(c.status)}</span>
                </div>
                <div className="font-sans text-2xl font-bold mt-2 tabular-nums">{fmtCell(c)}</div>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h3 className="font-serif text-base font-bold mb-3">② AI Memo tổng</h3>
          <div className="relative min-h-[160px]">
            <PremiumGate featureName="Nhận định AI BCTC" description="AI Memo và ghi chú từng module phân tích báo cáo tài chính.">
              <BctcAiMemo ai={ai} isLoading={aiLoading} error={aiError} />
            </PremiumGate>
          </div>
        </section>

        <section className="space-y-4">
          <h3 className="font-serif text-base font-bold">③ Modules phân tích</h3>
          {data.modules.map((mod) => (
            <div key={mod.id} className="bg-card border border-border rounded-lg p-4">
              <div className="font-serif text-lg font-bold mb-2">{mod.title}</div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {Object.entries(mod.data).map(([k, v]) => (
                  <div key={k} className="flex flex-col">
                    <span className="text-[10px] uppercase text-muted-foreground">{k}</span>
                    <span className="font-sans tabular-nums">{fmtModuleValue(k, v)}</span>
                  </div>
                ))}
              </div>
              <BctcModuleNote note={moduleNote(ai, mod.id)} />
            </div>
          ))}
        </section>

        <section>
          <h3 className="font-serif text-base font-bold mb-3">④ Bảng Forensic</h3>
          <div className="grid md:grid-cols-2 gap-px bg-border/30 rounded-lg overflow-hidden">
            <div className="bg-emerald-500/5 p-4">
              <div className="text-xs font-bold text-emerald-400 mb-2 uppercase">▲ Tín hiệu Xanh</div>
              {data.forensic.green.length ? data.forensic.green.map((s, i) => (
                <div key={i} className="text-sm text-muted-foreground mb-1.5">✓ {s}</div>
              )) : <div className="text-xs text-muted-foreground">—</div>}
            </div>
            <div className="bg-red-500/5 p-4">
              <div className="text-xs font-bold text-red-400 mb-2 uppercase">▼ Cờ Vàng / Đỏ</div>
              {data.forensic.red.map((s, i) => (
                <div key={i} className="text-sm text-muted-foreground mb-1.5">! {s}</div>
              ))}
            </div>
          </div>
        </section>

        {data.trinity && (
          <section className="mt-4">
            <h3 className="font-serif text-base font-bold mb-3">Bộ ba Forensic</h3>
            <div className="relative min-h-[90px]">
              <PremiumGate featureName="Bộ ba Forensic" description="Altman Z, Piotroski F, Beneish M.">
                <div className="grid grid-cols-3 gap-px bg-border/30 rounded-lg overflow-hidden">
                  <div className="bg-card p-3 text-center">
                    <div className="text-[10px] uppercase text-muted-foreground">Altman Z'</div>
                    <div className="font-sans text-xl font-bold tabular-nums">{fmtNumber(data.trinity.altman_z, 2)}</div>
                  </div>
                  <div className="bg-card p-3 text-center">
                    <div className="text-[10px] uppercase text-muted-foreground">Piotroski F</div>
                    <div className="font-sans text-xl font-bold tabular-nums">{data.trinity.piotroski_f?.score ?? "—"}<span className="text-xs text-muted-foreground">/9</span></div>
                  </div>
                  <div className="bg-card p-3 text-center">
                    <div className="text-[10px] uppercase text-muted-foreground">Beneish M</div>
                    <div className="font-sans text-xl font-bold tabular-nums">{fmtNumber(data.trinity.beneish_m, 2)}</div>
                  </div>
                </div>
              </PremiumGate>
            </div>
          </section>
        )}

        {data.blind_spots && data.blind_spots.length > 0 && (
          <section className="mt-4">
            <h3 className="font-serif text-base font-bold mb-2">Điểm mù dữ liệu (cần bản Pro)</h3>
            <div className="relative min-h-[80px]">
              <PremiumGate featureName="Điểm mù ngân hàng" description="Chỉ tiêu cần thuyết minh chi tiết (NPL nhóm, CASA, CAR).">
                <div className="bg-amber-500/5 border border-amber-500/20 rounded-lg p-3">
                  {data.blind_spots.map((s, i) => (
                    <div key={i} className="text-xs text-muted-foreground mb-1">• {s}</div>
                  ))}
                </div>
              </PremiumGate>
            </div>
          </section>
        )}

        {data.flags.length > 0 && (
          <div className="text-[10px] text-amber-400/80">{data.flags.map((f) => f.message).join(" · ")}</div>
        )}
      </div>
    </ScrollArea>
  )
}
