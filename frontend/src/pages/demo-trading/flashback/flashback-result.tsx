/**
 * Cửa sổ kết quả của Flashback v2 (spec v2 §7.3): tiêu đề do server quyết định, bảng xếp hạng
 * (hạng, avatar, tên, % lợi nhuận; CHỈ dòng người thắng có thêm số xu nhận), mã cổ phiếu và thời
 * gian của ván, rồi ba nút: Xem lại biểu đồ, Về sảnh, Chơi lại.
 */
import { ArrowRight } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { COIN_TEXT } from "../shop/shop-ui"
import type { FlashbackMatchResult } from "./flashback-api"
import type { MatchApi } from "./flashback-context"
import { PlayerAvatar } from "./flashback-avatar"
import { formatMatchDate, formatSignedPercent } from "./flashback-model"

export function FlashbackResult({ match, result }: { match: MatchApi; result: FlashbackMatchResult }) {
  return (
    <Dialog open={match.resultOpen} onOpenChange={(open) => !open && match.setResultOpen(false)}>
      <DialogContent showCloseButton={false} className="sm:max-w-[520px]" data-testid="flashback-result">
        <DialogTitle className="font-heading text-xl font-extrabold">{result.title}</DialogTitle>
        <DialogDescription className="sr-only">Kết quả ván Flashback</DialogDescription>

        <ol className="m-0 list-none space-y-1.5 p-0" aria-label="Bảng xếp hạng">
          {result.rows.map((row) => (
            <li
              key={row.user_id}
              data-me={row.is_me}
              className={cn(
                "grid grid-cols-[1.5rem_2rem_minmax(0,1fr)_auto] items-center gap-x-2.5 gap-y-0.5 rounded-md border bg-card px-2.5 py-2 tabular-nums sm:grid-cols-[1.75rem_2.5rem_minmax(0,1fr)_auto_auto]",
                row.is_me ? "border-primary" : "border-border",
              )}
            >
              <span className="text-center font-black">{row.rank}</span>
              <PlayerAvatar name={row.name} avatarUrl={row.avatar_url} seed={row.user_id} />
              <span className="truncate font-extrabold">{row.name}</span>
              <b
                className={cn(
                  "min-w-[72px] text-right",
                  row.pnl_percent > 0 ? "text-price-up" : row.pnl_percent < 0 ? "text-price-down" : "text-foreground",
                )}
              >
                {formatSignedPercent(row.pnl_percent)}
              </b>
              {row.is_winner && row.xu_label ? (
                <span className={cn("col-start-3 col-span-2 font-extrabold sm:col-span-1 sm:col-start-auto sm:min-w-[96px] sm:text-right", COIN_TEXT)}>
                  {row.xu_label}
                </span>
              ) : (
                <span className="hidden sm:block sm:min-w-[96px]" aria-hidden="true" />
              )}
            </li>
          ))}
        </ol>

        <dl className="m-0 grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 gap-y-1.5 rounded-lg border border-border bg-card p-3.5">
          <dt className="text-sm font-semibold text-text-secondary">Mã cổ phiếu</dt>
          <dd className="m-0 font-heading text-2xl font-black">{result.symbol}</dd>
          <dt className="text-sm font-semibold text-text-secondary">Thời gian</dt>
          <dd className="m-0 flex flex-wrap items-center gap-x-1.5 font-bold tabular-nums">
            <span>{formatMatchDate(result.start_date)}</span>
            <ArrowRight className="size-4 shrink-0" aria-hidden="true" />
            <span className="sr-only">đến</span>
            <span>{formatMatchDate(result.end_date)}</span>
          </dd>
        </dl>

        <div className="grid gap-2 sm:grid-cols-3">
          <Button type="button" variant="outline" onClick={() => match.setResultOpen(false)}>
            Xem lại biểu đồ
          </Button>
          <Button type="button" variant="outline" disabled={match.backBusy} onClick={match.backToLobby}>
            Về sảnh
          </Button>
          <Button type="button" disabled={match.playAgainBusy} onClick={match.playAgain}>
            Chơi lại
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
