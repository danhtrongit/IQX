/**
 * «Săn mã» + «Theo dõi» - the Cấp 5 hunt panel.
 *
 * Two tabs on one surface: the five server-owned filters (with real
 * availability + coverage) and the watchlist with its 5-layer consensus and
 * per-symbol provenance. Nothing here invents a number: a filter the server
 * cannot run is disabled with its own reason, an empty result is only called
 * empty when the filter actually ran, and a missing consensus score is "-/5".
 */
import { useState } from "react"
import { ArrowRight, Ban, ChartColumn, Funnel, LoaderCircle, Search, Star, Trash, TriangleAlert } from "lucide-react"

import { SidebarPanel } from "@/components/layout/sidebar-panel"
import { PanelState } from "@/components/layout/panel-state"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"
import { HUNT_FILTERS, HUNT_FILTER_ORDER, NOTABLE_MIN_LOP, TONG_SO_LOP, formatInt, formatSignedRate, huntFilterLabel, levelName } from "./copy"
import { HUNT_TOP_NOTE, WATCH_STATUS_LABEL, countWatchTabs, describeConsensus, describeConsensusFreshness, describeConsensusTrend, describeHuntBaoPhu, describeHuntTotal, describeHuntSource, huntFilterAvailability, lopIconRow, splitLocSan, watchStatus } from "./derive"
import { useAddToWatchlist, useCap5Progress, useCap5Watchlist, useHuntResult, useInsightsLevel, useRemoveFromWatchlist, useSanMaIndex } from "./hooks"
import { ErrorLine, HintLine, LoadingLine, LopMarkIcon, NoteLine, SectionCard, StatTile } from "./ui"

export function HuntPanel({
  symbol,
  onSymbolChange,
  onNavigate,
}: {
  symbol: string
  onSymbolChange?: (symbol: string) => void
  onNavigate: (panel: string, symbol?: string) => void
}) {
  const { level } = useInsightsLevel()
  const [filter, setFilter] = useState<string | null>(null)
  const [tab, setTab] = useState("san-ma")
  const [actionError, setActionError] = useState<string | null>(null)

  const index = useSanMaIndex()
  const progress = useCap5Progress()
  const hunt = useHuntResult(filter)
  const watchlist = useCap5Watchlist()
  const addToWatchlist = useAddToWatchlist()
  const removeFromWatchlist = useRemoveFromWatchlist()

  if (level < 5) {
    return (
      <SidebarPanel title="Săn mã" description={`Cấp ${level} «${levelName(level)}»`}>
        <PanelState
          title="Săn mã mở từ Cấp 5 «Lão luyện»"
          description="Cấp 5 dạy cách tự tìm mã trước khi mua: lọc theo dòng tiền, khối lượng và đỉnh giá, rồi theo dõi mã trong Watchlist trước khi vào lệnh."
        />
      </SidebarPanel>
    )
  }

  const selected = HUNT_FILTERS.find((item) => item.ma === filter) ?? null
  const firstHuntSymbol = hunt.data?.items[0]?.symbol ?? ""
  const coverage = hunt.data ? describeHuntBaoPhu(hunt.data) : null
  const locSan = hunt.data ? splitLocSan(hunt.data.loc_san) : null
  const indexLocSan = index.data ? splitLocSan(index.data.loc_san) : null
  const watchRows = watchlist.data?.items ?? []
  const counts = countWatchTabs(watchRows)
  const watchKnown = !watchlist.isPending && !watchlist.isError && watchlist.data != null
  const addedSymbols = new Set(watchRows.map((item) => item.symbol.toUpperCase()))
  const soMaDaSan = progress.data?.so_ma_da_san ?? 0
  const soMaMua = progress.data?.so_ma_mua_tu_watchlist ?? 0

  const openTrading = (target: string) => {
    if (target.length === 0) return
    // One atomic navigation: the shell writes view + symbol in a single update.
    onNavigate("trading", target)
  }

  const handleAdd = async (target: string, tinHieu: string) => {
    setActionError(null)
    try {
      await addToWatchlist.mutateAsync({ symbol: target, hunt_filter: filter, hunt_signal: tinHieu })
    } catch (error) {
      setActionError(`${target}: ${error instanceof Error ? error.message : "không thêm được vào Theo dõi"}`)
    }
  }

  const handleRemove = async (target: string) => {
    setActionError(null)
    try {
      await removeFromWatchlist.mutateAsync(target)
    } catch (error) {
      setActionError(`${target}: ${error instanceof Error ? error.message : "không bỏ được khỏi Theo dõi"}`)
    }
  }

  return (
    <SidebarPanel title="Săn mã" description="Cấp 5 «Lão luyện» · chọn mã trước khi mua">
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="san-ma">Săn mã</TabsTrigger>
          <TabsTrigger value="theo-doi">{`Theo dõi (${watchKnown ? formatInt(counts.tatCa) : "-"})`}</TabsTrigger>
        </TabsList>

        <TabsContent value="san-ma" className="space-y-3">
          <SectionCard title="Tiến trình săn mã">
            {progress.isPending ? (
              <LoadingLine label="Đang tải tiến trình Cấp 5…" />
            ) : progress.isError ? (
              <ErrorLine text="Chưa lấy được tiến trình Cấp 5 từ máy chủ." onRetry={() => void progress.refetch()} />
            ) : (
              <>
                <div className="grid min-w-0 grid-cols-2 gap-2">
                  {/* `progress === null` = Cấp 5 not entered: "0/10" would claim a real
                      count of zero, so the counters show "-" until the level is open. */}
                  <StatTile
                    label="Đã săn vào Watchlist"
                    value={progress.data == null ? "-" : `${formatInt(soMaDaSan)}/${formatInt(progress.data.muc_tieu_so_ma_san)}`}
                    sub="mã"
                    tone="accent"
                  />
                  <StatTile
                    label="Đã mua từ Watchlist"
                    value={progress.data == null ? "-" : `${formatInt(soMaMua)}/${formatInt(progress.data.muc_tieu_so_ma_mua)}`}
                    sub="mã"
                    tone="accent"
                  />
                </div>
                <HintLine>{progress.data?.best_filter_ten ? `Bộ lọc mạnh nhất (hệ thống chốt): ${progress.data.best_filter_ten}.` : "Bộ lọc mạnh nhất: chưa đủ dữ liệu để chốt."}</HintLine>
              </>
            )}
          </SectionCard>

          <SectionCard title="Năm bộ lọc săn mã">
            {index.isPending ? (
              <LoadingLine label="Đang tải tình trạng bộ lọc…" />
            ) : index.isError ? (
              <ErrorLine text="Chưa lấy được tình trạng bộ lọc từ máy chủ." onRetry={() => void index.refetch()} />
            ) : index.data == null ? (
              <NoteLine>Chưa vào Cấp 5 - danh sách bộ lọc chỉ hiện sau khi cấp này được mở.</NoteLine>
            ) : (
              <>
                {indexLocSan && (
                  <div className="space-y-0.5">
                    <HintLine>{indexLocSan.apDung.length > 0 ? `Đã lọc sàn: ${indexLocSan.apDung.join(" · ")}` : "Máy chủ chưa cho biết điều kiện lọc sàn nào đã được áp dụng."}</HintLine>
                    {indexLocSan.chuaApDung.length > 0 && (
                      <NoteLine tone="warn">{`Chưa lọc được: ${indexLocSan.chuaApDung.join(" · ")} - máy chủ chưa có dữ liệu.`}</NoteLine>
                    )}
                  </div>
                )}
                <div className="space-y-1.5">
                  {HUNT_FILTERS.map((item) => {
                    const availability = huntFilterAvailability(index.data, item.ma)
                    const disabled = availability.kha_dung === false
                    const Icon = item.Icon
                    return (
                      <button
                        key={item.ma}
                        type="button"
                        disabled={disabled}
                        aria-disabled={disabled}
                        onClick={() => setFilter(item.ma)}
                        className={cn(
                          "flex w-full items-center gap-2 rounded-md border border-border bg-background/40 px-2 py-1.5 text-left transition-colors",
                          disabled ? "cursor-not-allowed opacity-60" : "hover:border-primary/45 hover:bg-muted",
                          filter === item.ma && "border-primary/60 bg-muted"
                        )}
                      >
                        <Icon className="size-4 shrink-0 text-muted-foreground" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-xs font-medium">{item.ten}</span>
                          <span className="block truncate text-xs text-muted-foreground">{item.dieu_kien}</span>
                          {disabled && <span className="block text-xs text-price-ref">{availability.ly_do ?? "Chưa đủ dữ liệu để chạy bộ lọc này"}</span>}
                        </span>
                        {!disabled && <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" />}
                      </button>
                    )
                  })}
                  <div className="flex items-center gap-2 rounded-md border border-dashed border-border px-2 py-1.5 opacity-70">
                    <Ban className="size-4 shrink-0 text-muted-foreground" />
                    <span>
                      <span className="block text-xs font-medium">Bộ lọc nâng cao</span>
                      <span className="block text-xs text-muted-foreground">Kết hợp nhiều điều kiện - mở khóa ở các cấp sau</span>
                    </span>
                  </div>
                </div>
              </>
            )}
          </SectionCard>

          <SectionCard title={selected ? `Kết quả bộ lọc: ${selected.ten}` : "Kết quả bộ lọc"}>
            {!selected ? (
              <NoteLine>Chọn một bộ lọc ở trên để xem top 10 mã hôm nay. Bộ lọc chưa đủ dữ liệu sẽ bị vô hiệu hóa kèm lý do.</NoteLine>
            ) : hunt.isPending ? (
              <LoadingLine label="Đang lọc…" />
            ) : hunt.isError ? (
              <ErrorLine text="Không lấy được kết quả bộ lọc từ máy chủ." onRetry={() => void hunt.refetch()} />
            ) : hunt.data == null ? (
              <NoteLine>Chưa vào Cấp 5 - kết quả săn mã chỉ hiện sau khi cấp này được mở.</NoteLine>
            ) : !hunt.data.kha_dung ? (
              <NoteLine tone="warn">
                {`Chưa đủ dữ liệu để chạy bộ lọc này. ${hunt.data.ly_do_chua_kha_dung ?? "Máy chủ chưa nói rõ vì sao - chưa có kết quả nào để hiện."}`}
              </NoteLine>
            ) : (
              <>
                <p className="text-xs">{describeHuntTotal(hunt.data, selected)}</p>
                {coverage && (
                  <p className={cn("text-xs leading-snug", coverage.trangThai === "day_du" ? "text-muted-foreground" : "text-price-ref")}>{coverage.text}</p>
                )}
                {locSan && (
                  <>
                    <HintLine>{locSan.apDung.length > 0 ? `Đã lọc: ${locSan.apDung.join(" · ")}` : "Máy chủ chưa cho biết điều kiện lọc sàn nào đã được áp dụng."}</HintLine>
                    {locSan.chuaApDung.length > 0 && <NoteLine tone="warn">{`Chưa lọc được: ${locSan.chuaApDung.join(" · ")} - máy chủ chưa có dữ liệu.`}</NoteLine>}
                  </>
                )}

                {actionError && <ErrorLine text={actionError} />}

                {hunt.data.items.length === 0 ? (
                  <NoteLine>Hôm nay không mã nào thỏa điều kiện này.</NoteLine>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="whitespace-normal w-8">#</TableHead>
                        <TableHead className="whitespace-normal">Mã</TableHead>
                        <TableHead className="whitespace-normal">Tín hiệu</TableHead>
                        <TableHead className="whitespace-normal text-right">Giá</TableHead>
                        <TableHead className="whitespace-normal text-right">Theo dõi</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {hunt.data.items.map((item) => {
                        const added = addedSymbols.has(item.symbol.toUpperCase())
                        return (
                          <TableRow key={item.symbol} className={cn(symbol.toUpperCase() === item.symbol.toUpperCase() && "bg-muted/60")}>
                            <TableCell className="text-muted-foreground">{formatInt(item.hang)}</TableCell>
                            <TableCell>
                              <button type="button" className="font-medium hover:text-primary" onClick={() => (onSymbolChange ? onSymbolChange(item.symbol) : openTrading(item.symbol))}>
                                {item.symbol}
                              </button>
                            </TableCell>
                            <TableCell className="max-w-[9rem] truncate" title={item.tin_hieu}>
                              {item.tin_hieu}
                            </TableCell>
                            <TableCell className="text-right">
                              {item.gia_vnd == null ? (
                                "-"
                              ) : (
                                <span className={item.pct_thay_doi == null ? "" : item.pct_thay_doi > 0 ? "text-price-up" : item.pct_thay_doi < 0 ? "text-price-down" : ""}>
                                  {`${formatInt(item.gia_vnd)} ${formatSignedRate(item.pct_thay_doi)}`}
                                </span>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              <Button
                                size="xs"
                                variant={added ? "secondary" : "outline"}
                                disabled={added || addToWatchlist.isPending}
                                onClick={() => void handleAdd(item.symbol, item.tin_hieu)}
                              >
                                {added ? "Đã thêm" : "Theo dõi"}
                              </Button>
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                )}
                <HintLine>{HUNT_TOP_NOTE}</HintLine>
                {firstHuntSymbol.length > 0 && (
                  <Button size="xs" variant="ghost" onClick={() => openTrading(firstHuntSymbol)}>
                    <Search className="size-3" />
                    Đặt lệnh mã đầu danh sách
                  </Button>
                )}
              </>
            )}
          </SectionCard>
        </TabsContent>

        <TabsContent value="theo-doi" className="space-y-3">
          <SectionCard title="Theo dõi">
            <HintLine>{`Các mã bạn đã săn, đang quan sát. Mã lên ≥${NOTABLE_MIN_LOP}/${TONG_SO_LOP} lớp ủng hộ sẽ được đánh dấu “Đáng chú ý”.`}</HintLine>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">{`Đáng chú ý: ${watchKnown ? formatInt(counts.dangChuY) : "-"}/${watchKnown ? formatInt(counts.tatCa) : "-"}`}</span>
              <Button size="xs" variant="outline" onClick={() => setTab("san-ma")}>
                <Funnel className="size-3" />
                Săn thêm
              </Button>
            </div>
            {actionError && <ErrorLine text={actionError} />}

            {watchlist.isPending ? (
              <LoadingLine label="Đang tải Theo dõi…" />
            ) : watchlist.isError ? (
              <ErrorLine text="Chưa lấy được Theo dõi từ máy chủ - chưa rõ bạn đang theo dõi những mã nào." onRetry={() => void watchlist.refetch()} />
            ) : watchlist.data == null ? (
              <NoteLine>Chưa vào Cấp 5 - Watchlist chỉ hiện sau khi cấp này được mở.</NoteLine>
            ) : watchRows.length === 0 ? (
              <NoteLine>Chưa có mã nào trong Theo dõi. Sang tab Săn mã để tìm mã đáng chú ý.</NoteLine>
            ) : (
              <div className="space-y-2">
                {watchRows.map((item) => {
                  const status = watchStatus(item)
                  const notable = status === "notable"
                  const consensus = describeConsensus(item)
                  const freshness = describeConsensusFreshness(item)
                  const trend = describeConsensusTrend(item)
                  const marks = lopIconRow(item)
                  const change = item.percent_change
                  return (
                    <div key={item.symbol} className={cn("space-y-1.5 rounded-md border p-2", notable ? "border-primary/50 bg-primary/5" : "border-border bg-background/40")}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-heading text-sm font-bold">{item.symbol}</span>
                        <span className={cn("text-xs tabular-nums", change == null ? "text-muted-foreground" : change > 0 ? "text-price-up" : change < 0 ? "text-price-down" : "")}>
                          {item.current_price_vnd == null ? "-" : `${formatInt(item.current_price_vnd)} ${formatSignedRate(change)}`}
                        </span>
                        <Badge variant={notable ? "default" : "outline"} className="h-4 px-1.5 text-[11px]">
                          {WATCH_STATUS_LABEL[status]}
                        </Badge>
                      </div>

                      <div className="flex items-center gap-2 text-xs">
                        <span className="flex items-center gap-1">
                          {marks.map((mark) => (
                            <LopMarkIcon key={mark.lop} mark={mark.mark} />
                          ))}
                        </span>
                        <span className={cn("font-semibold tabular-nums", notable ? "text-price-up" : "")}>{consensus.text}</span>
                        <span className={cn("text-xs", trend.tone === "up" ? "text-price-up" : trend.tone === "down" ? "text-price-down" : "text-muted-foreground")}>{trend.text}</span>
                      </div>

                      {consensus.canhBao && <NoteLine tone="warn">{consensus.canhBao}</NoteLine>}
                      {freshness && (
                        <HintLine>
                          {item.consensus_het_han && <TriangleAlert className="mr-1 inline size-3 text-price-ref" />}
                          {freshness}
                        </HintLine>
                      )}

                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs text-muted-foreground">{describeHuntSource(item)}</span>
                        <span className="flex items-center gap-1">
                          <Button size="xs" variant={notable ? "default" : "outline"} onClick={() => openTrading(item.symbol)}>
                            {notable ? "Đặt lệnh" : "Xem 5 lớp"}
                            <ArrowRight className="size-3" />
                          </Button>
                          <Button size="icon-xs" variant="ghost" aria-label={`Bỏ ${item.symbol} khỏi Theo dõi`} disabled={removeFromWatchlist.isPending} onClick={() => void handleRemove(item.symbol)}>
                            <Trash className="size-3" />
                          </Button>
                        </span>
                      </div>

                      {notable && <HintLine>{item.nhac ?? `${consensus.text} lớp đang ủng hộ - đáng để bạn xem kỹ. Quyết định mua vẫn là của bạn.`}</HintLine>}
                    </div>
                  )
                })}
              </div>
            )}
            <HintLine>{`Điểm đồng thuận do máy chủ chấm theo mẻ 1 lần/ngày sau phiên; ô “-” nghĩa là lớp đó chưa có dữ liệu.`}</HintLine>
          </SectionCard>

          <SectionCard title="Thứ tự bộ lọc">
            <div className="flex flex-wrap gap-1.5">
              {HUNT_FILTER_ORDER.map((ma) => (
                <Badge key={ma} variant="outline" className="h-4 px-1.5 text-[11px]">
                  {huntFilterLabel(ma) ?? ma}
                </Badge>
              ))}
            </div>
            <HintLine>
              <ChartColumn className="mr-1 inline size-3" />
              Bộ lọc nào ra mã thắng nhiều nhất được đo ở panel Phân tích danh mục (Cấp 5) bằng kết quả lệnh thật.
            </HintLine>
          </SectionCard>
        </TabsContent>
      </Tabs>

      {addToWatchlist.isPending && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <LoaderCircle className="size-3 animate-spin" />
          Đang cập nhật Theo dõi…
        </p>
      )}
      {watchKnown && counts.dangChuY > 0 && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Star className="size-3" />
          {`${formatInt(counts.dangChuY)} mã đã đạt ≥${NOTABLE_MIN_LOP}/${TONG_SO_LOP} lớp ủng hộ.`}
        </p>
      )}
    </SidebarPanel>
  )
}
