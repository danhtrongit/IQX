/**
 * Màn kết quả của Flashback (spec v1.1 §2.8).
 *
 * Lợi nhuận, tổng tài sản, số lệnh, hạng tạm thời, dải 10 ô màu và phần xu. KHÔNG hiện tên mã,
 * giai đoạn hay so sánh "Mua và giữ".
 */
import { useMemo, useState } from "react"
import { Copy, Trophy } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { useFlashback } from "./flashback-context"
import {
  FLASHBACK_INITIAL_CASH,
  formatMoney,
  formatNumber,
  formatSignedPercent,
  navSeriesOf,
  orderCounts,
  resultStrip,
  rewardLabel,
  shareText,
  STRIP_EMOJI,
} from "./flashback-model"
import { useFlashbackLeaderboard } from "./use-flashback"

export function FlashbackResult({ onClose, onShowLeaderboard }: { onClose: () => void; onShowLeaderboard: () => void }) {
  const game = useFlashback()
  const leaderboard = useFlashbackLeaderboard("all", true)
  const [copied, setCopied] = useState(false)

  const entry = game.entry
  const counts = orderCounts(entry)
  const closes = useMemo(() => game.bars.map((bar) => bar.close), [game.bars])
  const series = useMemo(
    () =>
      navSeriesOf(
        entry?.orders ?? [],
        closes,
        game.historySessions,
        60,
        FLASHBACK_INITIAL_CASH,
      ),
    [entry?.orders, closes, game.historySessions],
  )
  const tones = useMemo(
    () => resultStrip(series.nav, series.held, game.historySessions, 60),
    [series, game.historySessions],
  )
  const totalPlayers = leaderboard.data?.total_players ?? null
  const pnlPct = entry?.pnl_percent ?? 0
  const rank = entry?.rank ?? null

  async function share() {
    const text = shareText(tones, pnlPct, rank, totalPlayers ?? 0)
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      toast.success("Đã sao chép kết quả")
    } catch {
      toast.success("Đã tạo nội dung chia sẻ")
    }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="sm:max-w-[520px]" data-testid="flashback-result">
        <DialogTitle className="font-heading text-lg font-bold">Hoàn thành đề</DialogTitle>
        <DialogDescription className="sr-only">
          Kết quả lượt chơi Flashback: lợi nhuận, tổng tài sản, số lệnh và hạng tạm thời.
        </DialogDescription>

        <div className="grid grid-cols-2 gap-2.5">
          <Tile label="Lợi nhuận của bạn" value={formatSignedPercent(pnlPct)} tone={pnlPct > 0 ? "up" : pnlPct < 0 ? "down" : undefined} />
          <Tile label="Tổng tài sản" value={formatMoney(entry?.final_nav ?? game.totalAssets)} />
          <Tile label="Số lệnh" value={`${counts.buys} mua · ${counts.sells} bán`} />
          <Tile
            label="Hạng tạm thời"
            value={rank == null ? "—" : `${formatNumber(rank)} / ${formatNumber(totalPlayers ?? 0)}`}
          />
        </div>

        <div className="flex gap-1" aria-label="Dải kết quả 10 ô">
          {tones.map((tone, index) => (
            <span
              key={index}
              className={cn(
                "h-6 flex-1 rounded-sm",
                tone === "up" ? "bg-price-up" : tone === "down" ? "bg-price-down" : "bg-muted",
              )}
              title={STRIP_EMOJI[tone]}
            />
          ))}
        </div>

        <div className="space-y-1.5 rounded-lg border border-chart-2/40 bg-chart-2/10 p-3">
          <Row label="Phí tham gia" value={game.round?.first_join_free ? "Miễn phí" : `−${formatNumber(game.round?.fee_xu ?? 100)} xu`} />
          <Row label={`Thưởng theo hạng tạm thời (${rewardLabel(rank)})`} value={`+${formatNumber(entry?.reward_xu ?? 0)} xu`} />
          <p className="text-[11px] leading-5 text-chart-2">Xu thưởng được cộng khi đề đóng, theo hạng cuối cùng</p>
        </div>

        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" onClick={() => void share()}>
            <Copy aria-hidden="true" />
            {copied ? "Đã sao chép" : "Chia sẻ kết quả"}
          </Button>
          <Button type="button" variant="outline" onClick={onShowLeaderboard}>
            <Trophy aria-hidden="true" />
            Xem bảng xếp hạng
          </Button>
          <Button type="button" variant="outline" onClick={onClose}>Đóng</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function Tile({ label, value, tone }: { label: string; value: string; tone?: "up" | "down" }) {
  return (
    <div className="min-w-0 rounded-lg border border-border bg-card p-3">
      <span className="block text-[11px] font-semibold text-muted-foreground">{label}</span>
      <b
        className={cn(
          "mt-1 block truncate font-heading text-lg font-bold tabular-nums",
          tone === "up" ? "text-price-up" : tone === "down" ? "text-price-down" : "text-foreground",
        )}
      >
        {value}
      </b>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <b className="text-right font-semibold tabular-nums text-foreground">{value}</b>
    </div>
  )
}
