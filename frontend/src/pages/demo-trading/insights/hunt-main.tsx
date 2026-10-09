/**
 * «Săn mã» main view: the result table of the selected hunt group.
 *
 * - The five groups, their ranking and every number come from the server; an
 *   empty result is only called empty when the filter actually ran.
 * - Theo dõi is one persistent row per mã in the account's watch list
 *   (`/watchlists`). The checkbox updates optimistically, rolls back on error
 *   and reports the failure inline - it never announces a success the server
 *   did not give.
 * - "Đặt lệnh" only opens the manual order form with that mã; it never orders.
 */
import { useMemo, useState } from "react"
import { useSearchParams } from "react-router"

import { useWorkspaceFrame } from "@/components/layout/workspace-frame-context"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { useAuth } from "@/hooks/use-auth"
import { errorMessage } from "@/lib/api"
import { cn } from "@/lib/utils"
import { useAddToWatchlist, useRemoveFromWatchlist, useWatchlist } from "../portfolio/hooks"
import { huntFilterDef, formatInt, formatSignedRate } from "./copy"
import { HUNT_TOP_NOTE, describeHuntBaoPhu, describeHuntTotal, splitLocSan } from "./derive"
import { HUNT_PARAM, parseHuntFilter } from "./hunt-url"
import { useHuntResult } from "./hooks"
import { ErrorLine, HintLine, LoadingLine, NoteLine } from "./ui"

/** Watch-list state + optimistic toggle shared by the rows of one result table. */
function useWatchToggle() {
  const { isAuthenticated, openAuth } = useAuth()
  const watchlist = useWatchlist()
  const add = useAddToWatchlist()
  const remove = useRemoveFromWatchlist()
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const watched = useMemo(() => new Set((watchlist.data ?? []).map((item) => item.symbol)), [watchlist.data])

  async function toggle(symbol: string, next: boolean) {
    if (!isAuthenticated) {
      openAuth("login")
      return
    }
    setError(null)
    setPending((current) => new Set(current).add(symbol))
    try {
      await (next ? add : remove).mutateAsync(symbol)
    } catch (failure) {
      setError(`${symbol}: ${errorMessage(failure)}`)
    } finally {
      setPending((current) => {
        const copy = new Set(current)
        copy.delete(symbol)
        return copy
      })
    }
  }

  return { watched, pending, error, toggle, ready: watchlist.data != null, loadFailed: watchlist.isError, reload: () => void watchlist.refetch() }
}

export function HuntMain({
  symbol,
  onSymbolChange,
  onNavigate,
}: {
  symbol: string
  onSymbolChange: (symbol: string) => void
  onNavigate: (panel: string, symbol?: string) => void
}) {
  const { isAuthenticated, isLoading } = useAuth()
  const frame = useWorkspaceFrame()
  const [params] = useSearchParams()
  const filter = parseHuntFilter(params.get(HUNT_PARAM))
  const def = huntFilterDef(filter)
  const hunt = useHuntResult(filter)
  const watch = useWatchToggle()
  const result = hunt.data
  const coverage = result ? describeHuntBaoPhu(result) : null
  const locSan = result ? splitLocSan(result.loc_san) : null

  return (
    <div className="space-y-3">
      <Card className="gap-1 p-4">
        <h2 className="font-heading text-base font-bold">{def?.ten}</h2>
        <p className="text-xs text-muted-foreground">
          Tích Theo dõi để lưu mã vào danh sách quan sát. Danh sách này không thay danh mục mua mới của Bot.
        </p>
        {def && <p className="text-xs text-muted-foreground">{def.dieu_kien}</p>}
      </Card>

      <Card className="gap-0 overflow-hidden p-0">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
          <h3 className="text-sm font-semibold">Kết quả bộ lọc</h3>
          {result?.kha_dung && <span className="text-xs text-muted-foreground">{formatInt(result.items.length)} mã</span>}
        </div>

        <div className="space-y-2 p-4">
          {!isLoading && !isAuthenticated ? (
            <NoteLine>Đăng nhập để xem kết quả Săn mã và dùng Theo dõi.</NoteLine>
          ) : hunt.isPending ? (
            <LoadingLine label="Đang lọc…" />
          ) : hunt.isError ? (
            <ErrorLine text="Không lấy được kết quả bộ lọc từ máy chủ." onRetry={() => void hunt.refetch()} />
          ) : result == null ? (
            <NoteLine>Chưa có dữ liệu Săn mã cho nhóm này.</NoteLine>
          ) : !result.kha_dung ? (
            <NoteLine tone="warn">
              {`Chưa đủ dữ liệu để chạy bộ lọc này. ${result.ly_do_chua_kha_dung ?? "Máy chủ chưa nói rõ vì sao - chưa có kết quả nào để hiện."}`}
            </NoteLine>
          ) : (
            <>
              {def && <p className="text-xs">{describeHuntTotal(result, def)}</p>}
              {coverage && (
                <p className={cn("text-xs leading-snug", coverage.trangThai === "day_du" ? "text-muted-foreground" : "text-price-ref")}>
                  {coverage.text}
                </p>
              )}
              {locSan && (
                <>
                  <HintLine>
                    {locSan.apDung.length > 0
                      ? `Đã lọc: ${locSan.apDung.join(" · ")}`
                      : "Máy chủ chưa cho biết điều kiện lọc sàn nào đã được áp dụng."}
                  </HintLine>
                  {locSan.chuaApDung.length > 0 && (
                    <NoteLine tone="warn">{`Chưa lọc được: ${locSan.chuaApDung.join(" · ")} - máy chủ chưa có dữ liệu.`}</NoteLine>
                  )}
                </>
              )}
              {watch.loadFailed && (
                <ErrorLine text="Chưa tải được danh mục theo dõi nên chưa rõ mã nào đã được theo dõi." onRetry={watch.reload} />
              )}
              {watch.error && <ErrorLine text={watch.error} />}
            </>
          )}
        </div>

        {result?.kha_dung && (
          result.items.length === 0 ? (
            <p className="px-4 pb-4 text-xs text-muted-foreground">Hôm nay không mã nào thỏa điều kiện này.</p>
          ) : (
            <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Bảng kết quả Săn mã">
              <table className="w-full min-w-[640px] border-separate border-spacing-0 text-xs whitespace-nowrap">
                <thead>
                  <tr className="bg-muted/60 text-left text-[11px] font-semibold text-muted-foreground">
                    <th scope="col" className="border-y border-border px-4 py-2">Theo dõi</th>
                    <th scope="col" className="border-y border-border px-2 py-2">Mã</th>
                    <th scope="col" className="border-y border-border px-2 py-2">Tín hiệu</th>
                    <th scope="col" className="border-y border-border px-2 py-2 text-right">Giá</th>
                    <th scope="col" className="border-y border-border px-2 py-2 text-right">Thay đổi</th>
                    <th scope="col" className="border-y border-border px-4 py-2 text-right"><span className="sr-only">Hành động</span></th>
                  </tr>
                </thead>
                <tbody>
                  {result.items.map((item) => {
                    const code = item.symbol.toUpperCase()
                    const checked = watch.watched.has(code)
                    const change = item.pct_thay_doi
                    return (
                      <tr key={code} className={cn("hover:bg-muted/40", symbol.toUpperCase() === code && "bg-muted/60")}>
                        <td className="border-b border-border px-4 py-2">
                          <Checkbox
                            checked={checked}
                            disabled={watch.pending.has(code) || (isAuthenticated && !watch.ready)}
                            onCheckedChange={(next) => void watch.toggle(code, next === true)}
                            aria-label={`Theo dõi ${code}`}
                          />
                        </td>
                        <td className="border-b border-border px-2 py-2">
                          <button
                            type="button"
                            className="font-bold text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
                            onClick={() => onSymbolChange(code)}
                          >
                            {code}
                          </button>
                        </td>
                        <td className="max-w-[16rem] truncate border-b border-border px-2 py-2" title={item.tin_hieu}>
                          {item.tin_hieu}
                        </td>
                        <td className="border-b border-border px-2 py-2 text-right tabular-nums">
                          {item.gia_vnd == null ? "-" : formatInt(item.gia_vnd)}
                        </td>
                        <td
                          className={cn(
                            "border-b border-border px-2 py-2 text-right tabular-nums",
                            change == null ? "text-muted-foreground" : change > 0 ? "text-price-up" : change < 0 ? "text-price-down" : ""
                          )}
                        >
                          {formatSignedRate(change)}
                        </td>
                        <td className="border-b border-border px-4 py-2 text-right">
                          <Button
                            type="button"
                            size="xs"
                            variant="outline"
                            onClick={() => {
                              onNavigate("trading", code)
                              // The order form lives in the panel: bring it forward when the panel is a layer.
                              frame?.revealPanel()
                            }}
                          >
                            Đặt lệnh
                          </Button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )
        )}
        {result?.kha_dung && <p className="border-t border-border px-4 py-3 text-xs text-muted-foreground">{HUNT_TOP_NOTE}</p>}
      </Card>
    </div>
  )
}
