import { useEffect, useMemo, useRef, useState } from "react"
import { useSearchParams } from "react-router"
import { Info } from "lucide-react"

import { PanelState } from "@/components/layout/panel-state"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

import { hasStrategy, useBotSchedule } from "@/pages/strategy/shared/bot-schedule"

import { messageOf } from "../api"
import { useIndicatorRegistry, type BotPositionV2, type BotSessionV2, type BotTradeV2 } from "../api-v2"
import { useBotJournalSessions, useBotPositions, useBotTrades } from "../queries"
import { DetailDialog, type DetailRow } from "./detail-dialog"
import { HistoryTable } from "./history-table"
import { JournalTable } from "./journal-table"
import { PositionsTable } from "./positions-table"

type PortfolioTab = "positions" | "history" | "journal"

/** Nguyên tắc Bot (spec v2.0 §5.7): labels and values only. */
const PRINCIPLES: DetailRow[] = [
  { label: "Vốn khởi tạo", value: "100.000.000 đồng · tài khoản riêng" },
  { label: "Chiến lược", value: "Chọn ở Bot · tạo và sửa ở Backtest · Chiến lược IQX hoặc chiến lược của bạn" },
  { label: "Nguồn mua mới", value: "Rổ của chiến lược: VN30, VN100 hoặc danh mục đã lưu · chỉ mã VN100 · ưu tiên GTGD TB20 cao" },
  { label: "Mua", value: "AND các điều kiện Mua của chiến lược" },
  { label: "Bán", value: "Khi điều kiện Bán đạt hoặc hết thời gian giữ · mọi mã đang giữ" },
  { label: "Giữ tối đa", value: "Theo chiến lược · 3 đến 250 phiên · phiên mua là phiên 0" },
  { label: "Ngân sách mỗi lần mua", value: "12% giá trị danh mục tham chiếu, gồm phí" },
  { label: "Mua mới mỗi phiên", value: "Tối đa 2 lần mua thành công" },
  { label: "Tỷ trọng khi mua", value: "Tối đa 30% mỗi mã" },
  { label: "Mã đang nắm giữ", value: "Không mua thêm" },
  { label: "Khớp lệnh", value: "Giá đóng cửa cùng phiên" },
  { label: "Thanh toán", value: "T+2 · cổ phiếu mua phiên T bán được từ phiên T+2" },
  { label: "Đổi chiến lược", value: "Có hiệu lực từ phiên tới · không tạo lệnh ngay" },
  { label: "Cắt lỗ / chốt lời tự động", value: "Không sử dụng" },
  { label: "Thông báo", value: "Khi bản tin lên web và khi phiên Bot có lệnh khớp" },
]

function PrinciplesDialog({ disclosure, onClose }: { disclosure: string | null; onClose: () => void }) {
  return (
    <DetailDialog title="Nguyên tắc Bot" rows={PRINCIPLES} onClose={onClose}>
      {disclosure && <p className="rounded-md border border-border bg-muted/40 p-3 text-xs leading-5">{disclosure}</p>}
    </DetailDialog>
  )
}

function ListState({ loading, error, onRetry }: { loading: boolean; error: unknown; onRetry: () => void }) {
  if (loading) return <div className="space-y-2 p-3" aria-label="Đang tải"><Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-full" /></div>
  return (
    <div className="p-3">
      <PanelState title="Không tải được dữ liệu Bot" description={messageOf(error)} action={{ label: "Thử lại", onClick: onRetry }} />
    </div>
  )
}

/** `?bot_tab=` of a link (the bell opens Lịch sử with `bot_tab=lich-su`). */
const TAB_PARAM = "bot_tab"
const TAB_SLUG: Record<string, PortfolioTab> = { "dang-giu": "positions", "lich-su": "history", "nhat-ky": "journal" }

/**
 * «Danh mục Bot»: Đang giữ / Lịch sử / Nhật ký (spec v2.0 §5.5). Every tab shows what the server
 * computed: positions in one read, closed trades with their realized P&L and sessions with their
 * decisions through cursor pages that reach the whole record.
 */
export function PortfolioBlock({ disclosure }: { disclosure: string | null }) {
  const [params, setParams] = useSearchParams()
  const linked = TAB_SLUG[params.get(TAB_PARAM) ?? ""] ?? null
  const [tab, setTab] = useState<PortfolioTab>(linked ?? "positions")
  const [info, setInfo] = useState(false)
  const section = useRef<HTMLElement>(null)
  const positions = useBotPositions(true)
  const trades = useBotTrades(tab === "history")
  const sessions = useBotJournalSessions(tab === "journal")
  const schedule = useBotSchedule()
  const registry = useIndicatorRegistry(tab === "journal")
  const names = useMemo<Record<string, string>>(
    () => Object.fromEntries((registry.data?.indicators ?? []).map((indicator) => [indicator.id, indicator.name])),
    [registry.data],
  )
  const last = schedule.data?.last
  const strategy = hasStrategy(last) ? { name: last.name, maxHolding: last.content.max_holding } : null

  // A link to a tab (the bell's Bot notification) switches to it once and shows the block.
  const [seenLink, setSeenLink] = useState(linked)
  if (linked !== seenLink) {
    setSeenLink(linked)
    if (linked) setTab(linked)
  }
  useEffect(() => {
    if (!linked) return
    section.current?.scrollIntoView({ block: "start" })
    setParams((current) => {
      const next = new URLSearchParams(current)
      next.delete(TAB_PARAM)
      return next
    }, { replace: true })
  }, [linked, setParams])

  const tradeItems = useMemo(() => trades.data?.pages.flatMap((page) => page.items) ?? [], [trades.data])
  const sessionItems = useMemo(() => sessions.data?.pages.flatMap((page) => page.items) ?? [], [sessions.data])

  return (
    <section ref={section} aria-label="Danh mục Bot" className="scroll-mt-3 rounded-lg border border-border bg-card">
      <Tabs value={tab} onValueChange={(value) => setTab(value as PortfolioTab)} className="gap-0">
        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 border-b border-border px-3.5 py-2">
          <h2 className="shrink-0 font-heading text-sm font-bold">Danh mục Bot</h2>
          <div className="ml-auto flex items-center gap-1">
            <TabsList variant="line" aria-label="Danh mục Bot" className="h-8 gap-0 p-0">
              <TabsTrigger value="positions" className="h-8 flex-none px-2.5 text-xs">Đang giữ</TabsTrigger>
              <TabsTrigger value="history" className="h-8 flex-none px-2.5 text-xs">Lịch sử</TabsTrigger>
              <TabsTrigger value="journal" className="h-8 flex-none px-2.5 text-xs">Nhật ký</TabsTrigger>
            </TabsList>
            <Button type="button" variant="ghost" size="icon-sm" aria-label="Nguyên tắc Bot" onClick={() => setInfo(true)}>
              <Info aria-hidden="true" />
            </Button>
          </div>
        </div>

        <TabsContent value="positions">
          {positions.isPending || positions.isError ? (
            <ListState loading={positions.isPending} error={positions.error} onRetry={() => void positions.refetch()} />
          ) : (
            <PositionsTable positions={positions.data.items as BotPositionV2[]} valuationComplete={positions.data.valuation_complete} strategy={strategy} />
          )}
        </TabsContent>
        <TabsContent value="history">
          {trades.isError ? (
            <ListState loading={false} error={trades.error} onRetry={() => void trades.refetch()} />
          ) : (
            <HistoryTable trades={tradeItems as BotTradeV2[]} hasMore={trades.hasNextPage} loading={trades.isPending || trades.isFetchingNextPage} onLoadMore={() => void trades.fetchNextPage()} />
          )}
        </TabsContent>
        <TabsContent value="journal">
          {sessions.isError ? (
            <ListState loading={false} error={sessions.error} onRetry={() => void sessions.refetch()} />
          ) : (
            <JournalTable sessions={sessionItems as BotSessionV2[]} names={names} hasMore={sessions.hasNextPage} loading={sessions.isPending || sessions.isFetchingNextPage} onLoadMore={() => void sessions.fetchNextPage()} />
          )}
        </TabsContent>
      </Tabs>
      {info && <PrinciplesDialog disclosure={disclosure} onClose={() => setInfo(false)} />}
    </section>
  )
}
