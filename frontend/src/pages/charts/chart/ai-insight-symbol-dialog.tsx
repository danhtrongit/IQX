/**
 * "AI Phân tích" entry point for `/bieu-do`.
 *
 * The dashboard charts an INDEX by default and AI Insight needs a single listed
 * stock, so — exactly like the legacy terminal — this asks for a ticker and then
 * hands over to `/co-phieu/{symbol}`, where the briefing runs.
 */
import { useState } from "react"
import { Sparkles } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

import { INDEX_SYMBOLS } from "./market-symbols"

export function AiInsightSymbolDialog({
  open,
  onOpenChange,
  onSelect,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelect: (symbol: string) => void
}) {
  const [term, setTerm] = useState("")
  const candidate = term.trim().toUpperCase()
  const isIndex = INDEX_SYMBOLS[candidate] === true
  const valid = /^[A-Z0-9]{2,10}$/.test(candidate) && !isIndex

  function submit() {
    if (!valid) return
    onOpenChange(false)
    setTerm("")
    onSelect(candidate)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-heading text-sm">
            <Sparkles className="size-4 text-primary" aria-hidden="true" />
            Phân tích AI cho 1 mã cổ phiếu
          </DialogTitle>
          <DialogDescription className="text-xs leading-5">
            AI Insight cần 1 mã cụ thể. Nhập mã (vd. VCB, HPG, FPT) để chạy phân tích 6 lớp.
          </DialogDescription>
        </DialogHeader>

        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            submit()
          }}
        >
          <Input
            autoFocus
            value={term}
            maxLength={10}
            placeholder="VD: VCB"
            aria-invalid={term !== "" && !valid}
            onChange={(event) => setTerm(event.target.value.toUpperCase())}
            className={cn("flex-1 font-medium tracking-wide uppercase")}
          />
          <Button type="submit" disabled={!valid}>
            Phân tích
          </Button>
        </form>

        {candidate !== "" && isIndex && (
          <p className="text-[11px] text-price-ref">
            {candidate} là chỉ số — AI Insight chỉ chạy cho cổ phiếu niêm yết.
          </p>
        )}
      </DialogContent>
    </Dialog>
  )
}
