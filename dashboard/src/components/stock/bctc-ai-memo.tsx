import { useEffect, useState } from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { Loader2, AlertTriangle, Sparkles } from "lucide-react"
import { api } from "@/lib/api"
import { usePremiumStatus } from "@/hooks/use-premium-status"
import { hasAnyAi, type BctcAi } from "./bctc-ai"

const MD_CLS =
  "text-muted-foreground [&_p]:text-sm [&_p]:leading-relaxed [&_p]:mb-2 [&_strong]:text-foreground [&_strong]:font-semibold [&_ul]:list-disc [&_ul]:pl-5 [&_li]:text-sm [&_table]:w-full [&_th]:text-left [&_th]:text-xs [&_td]:text-sm"

type AiResp = { data?: { analysis?: BctcAi } } | { analysis?: BctcAi }

export function useBctcAi(symbol: string) {
  const { isPremium } = usePremiumStatus()
  const [ai, setAi] = useState<BctcAi | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")
  useEffect(() => {
    if (!isPremium) return
    let alive = true
    setIsLoading(true)
    setError("")
    api
      .get(`ai/bctc/${symbol.toUpperCase()}`, { searchParams: { term_type: 1 } })
      .json<AiResp>()
      .then((res) => {
        if (!alive) return
        const a = (res as { data?: { analysis?: BctcAi } })?.data?.analysis ?? (res as { analysis?: BctcAi })?.analysis
        setAi(a ?? null)
      })
      .catch(() => alive && setError("Không tải được nhận định AI"))
      .finally(() => alive && setIsLoading(false))
    return () => {
      alive = false
    }
  }, [symbol, isPremium])
  return { ai, isLoading, error }
}

export function BctcAiMemo({ ai, isLoading, error }: { ai: BctcAi | null; isLoading: boolean; error: string }) {
  if (isLoading)
    return (
      <div className="flex items-center gap-2 text-muted-foreground text-xs">
        <Loader2 className="size-4 animate-spin" /> Đang tạo nhận định AI…
      </div>
    )
  if (error)
    return (
      <div className="flex items-center gap-2 text-muted-foreground text-xs">
        <AlertTriangle className="size-4" /> {error}
      </div>
    )
  if (!hasAnyAi(ai) || !ai?.memo?.trim())
    return <div className="text-xs text-muted-foreground">Chưa có nhận định AI.</div>
  return (
    <div className="bg-card border border-border border-l-2 border-l-primary rounded-lg p-4">
      <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase text-primary mb-2">
        <Sparkles className="size-3" /> AI Memo
      </div>
      <article className={MD_CLS}>
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{ai.memo}</ReactMarkdown>
      </article>
    </div>
  )
}

export function BctcModuleNote({ note }: { note: string }) {
  if (!note?.trim()) return null
  return (
    <div className="mt-2 bg-primary/5 border-l-2 border-primary/40 rounded p-2 text-xs text-muted-foreground [&_p]:mb-1">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{note}</ReactMarkdown>
    </div>
  )
}
