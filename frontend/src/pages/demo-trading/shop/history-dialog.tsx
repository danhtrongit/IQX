/**
 * "Lịch sử xu": the whole coin ledger of the account, newest first, loaded page
 * by page with the server's cursor. Rows are the server's commit order (not a
 * re-sort by time), the totals are the server's totals over the full history and
 * the amounts shown are exactly the ledger's delta and balance after each entry.
 */
import { useMemo } from "react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import type { LedgerItem } from "./shop-api"
import { SHOP_COPY, formatLedgerTime, formatSignedXu, formatXu, ledgerRowLabel } from "./shop-model"
import { COIN_TEXT, RegionError, RegionLoading } from "./shop-ui"
import { useReturnFocus } from "./use-return-focus"
import { useLessonNames, useShopLedger, useShopState } from "./use-shop"

function Tile({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 rounded-lg border border-border bg-background/40 px-2 py-2.5 sm:px-3 max-[650px]:px-2">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className="mt-1 text-base font-bold tabular-nums max-[650px]:text-sm">{children}</div>
    </div>
  )
}

function dedupe(pages: readonly { items: LedgerItem[] }[]): LedgerItem[] {
  const seen = new Set<string>()
  const rows: LedgerItem[] = []
  for (const page of pages) {
    for (const item of page.items) {
      if (seen.has(item.id)) continue
      seen.add(item.id)
      rows.push(item)
    }
  }
  return rows
}

export function HistoryDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const shop = useShopState()
  const ledger = useShopLedger(open)
  const names = useLessonNames(open)
  const restoreFocus = useReturnFocus(open)
  const rows = useMemo(() => dedupe(ledger.data?.pages ?? []), [ledger.data])
  const totals = shop.data?.totals
  const firstLoad = ledger.isPending && !ledger.data
  const firstError = ledger.isError && !ledger.data

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        data-testid="history-dialog"
        onCloseAutoFocus={restoreFocus}
        className="max-h-[calc(100dvh-2rem)] gap-4 overflow-y-auto p-4 sm:max-w-3xl sm:p-6"
      >
        <DialogTitle className="text-base font-bold">{SHOP_COPY.history}</DialogTitle>
        <DialogDescription className="sr-only">
          Toàn bộ xu đã nhận và đã dùng, mới nhất ở trên cùng. Mỗi dòng có thời gian, nội dung, số xu thay đổi và số dư sau bút toán.
        </DialogDescription>

        <div className="grid grid-cols-3 gap-2.5 max-[650px]:gap-1.5">
          <Tile label="Số dư">
            {shop.data ? <span className={COIN_TEXT}>{formatXu(shop.data.wallet.balance)} xu</span> : <span className="text-muted-foreground">—</span>}
          </Tile>
          <Tile label="Đã nhận">
            {totals ? <span className="text-price-up">+{formatXu(totals.earned_xu)} xu</span> : <span className="text-muted-foreground">—</span>}
          </Tile>
          <Tile label="Đã sử dụng">
            {totals ? <span>−{formatXu(totals.spent_xu)} xu</span> : <span className="text-muted-foreground">—</span>}
          </Tile>
        </div>

        {firstLoad ? (
          <RegionLoading label="Đang tải lịch sử xu…" />
        ) : firstError ? (
          <RegionError message="Chưa tải được lịch sử xu." onRetry={() => void ledger.refetch()} retrying={ledger.isFetching} />
        ) : rows.length === 0 ? (
          <p className="rounded-lg border border-border px-3 py-6 text-center text-xs text-muted-foreground">Chưa có lịch sử xu.</p>
        ) : (
          <div role="region" aria-label="Bảng lịch sử xu" tabIndex={0} className="overflow-x-auto rounded-lg border border-border focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none">
            <table className="w-full min-w-[300px] sm:min-w-[470px] border-separate border-spacing-0 text-xs">
              <caption className="sr-only">Lịch sử xu, mới nhất ở trên cùng</caption>
              <thead>
                <tr className="bg-muted/60 text-left text-[10px] font-semibold text-muted-foreground">
                  <th scope="col" className="px-2 py-2 sm:px-3">Thời gian</th>
                  <th scope="col" className="px-2 py-2 sm:px-3">Nội dung</th>
                  <th scope="col" className="px-2 py-2 text-right whitespace-nowrap sm:px-3">Xu</th>
                  <th scope="col" className="px-2 py-2 text-right whitespace-nowrap sm:px-3">Số dư</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((item) => {
                  const when = formatLedgerTime(item.created_at)
                  const label = ledgerRowLabel(item, names.data)
                  return (
                    <tr key={item.id} data-ledger-seq={item.seq}>
                      <td className="min-w-[84px] sm:min-w-[106px] border-t border-border px-2 py-2.5 sm:px-3 whitespace-nowrap text-muted-foreground">
                        {when.date}
                        {when.time && <small className="mt-0.5 block">{when.time}</small>}
                      </td>
                      <td className="border-t border-border px-2 py-2.5 sm:px-3">
                        {label.title}
                        {label.detail && <small className="mt-0.5 block text-muted-foreground">{label.detail}</small>}
                      </td>
                      <td className={cn("border-t border-border px-2 py-2.5 sm:px-3 text-right font-semibold whitespace-nowrap tabular-nums", item.delta > 0 ? "text-price-up" : "text-foreground")}>
                        {formatSignedXu(item.delta)}
                      </td>
                      <td className="border-t border-border px-2 py-2.5 sm:px-3 text-right whitespace-nowrap tabular-nums">{formatXu(item.balance_after)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {ledger.isFetchNextPageError && (
          <RegionError message="Chưa tải được trang tiếp theo của lịch sử xu." onRetry={() => void ledger.fetchNextPage()} retrying={ledger.isFetchingNextPage} />
        )}
        {ledger.hasNextPage && !ledger.isFetchNextPageError && (
          <div className="flex justify-center">
            <Button type="button" variant="outline" size="sm" disabled={ledger.isFetchingNextPage} onClick={() => void ledger.fetchNextPage()}>
              {ledger.isFetchingNextPage ? "Đang tải…" : "Xem thêm"}
            </Button>
          </div>
        )}

        <div className="flex justify-end">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Đóng</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
