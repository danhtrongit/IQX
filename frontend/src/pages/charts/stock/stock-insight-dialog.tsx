/**
 * AI Insight dialog for `/co-phieu/:symbol` — the briefing body (premium) behind
 * the same premium gate the legacy terminal used. The analysis only runs while
 * the dialog is open (the briefing triggers the request on mount).
 */
import { Sparkles } from "lucide-react"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useAuth } from "@/hooks/use-auth"

import { PremiumNotice } from "../premium-notice"
import { StockInsightBriefing } from "./insight"

export function StockInsightDialog({
  symbol,
  open,
  onOpenChange,
}: {
  symbol: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { isPremium } = useAuth()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(960px,94vw)] sm:max-w-[960px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-heading text-base">
            <Sparkles className="size-4 text-primary" aria-hidden="true" />
            AI Insight · {symbol}
          </DialogTitle>
          <DialogDescription className="text-xs">
            Bản tin 6 lớp: xu hướng, thanh khoản, dòng tiền, nội bộ, tin tức và khuyến nghị.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[74vh]">
          <div className="pr-3">
            {isPremium ? (
              <StockInsightBriefing symbol={symbol} />
            ) : (
              <PremiumNotice
                featureName="AI Insight"
                description="Phân tích AI đa lớp cho mã đang xem cần tài khoản Premium."
              />
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}
