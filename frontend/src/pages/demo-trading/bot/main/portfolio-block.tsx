import { useEffect, useMemo, useRef, useState } from "react"
import { Info } from "lucide-react"

import { PanelState } from "@/components/layout/panel-state"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

import { messageOf } from "../api"
import { useBotJournal, useBotPositions } from "../queries"
import { DetailDialog, type DetailRow } from "./detail-dialog"
import { HistoryTable } from "./history-table"
import { executionRows } from "./history"
import { groupJournal } from "./journal"
import { JournalTable } from "./journal-table"
import { PositionsTable } from "./positions-table"

type PortfolioTab = "positions" | "history" | "journal"

/** Execution rows the History tab tries to show before it stops loading by itself. */
const HISTORY_TARGET = 20
/** Journal pages the History tab loads on its own per visit; the button continues. */
const AUTO_PAGE_LIMIT = 10

const PRINCIPLES: DetailRow[] = [
  { label: "Vốn khởi tạo", value: "100.000.000 đồng · tài khoản riêng" },
  { label: "Nguồn mua mới", value: "VN30 hoặc danh mục đã áp dụng" },
  { label: "Mua", value: "AND các điều kiện Mua đang bật" },
  { label: "Bán", value: "AND các điều kiện Bán · mọi mã đang giữ" },
  { label: "Ngân sách mỗi lần mua", value: "12% giá trị danh mục tham chiếu, gồm phí" },
  { label: "Mua mới mỗi phiên", value: "Tối đa 2 lần mua thành công" },
  { label: "Tỷ trọng khi mua", value: "Tối đa 30% mỗi mã" },
  { label: "Mã đang nắm giữ", value: "Không mua thêm" },
  { label: "Cắt lỗ / chốt lời tự động", value: "Không sử dụng" },
  { label: "Giới hạn 60 phiên", value: "Chỉ ở Luyện tập, không áp vào Bot" },
]

function PrinciplesDialog({ disclosure, onClose }: { disclosure: string | null; onClose: () => void }) {
  return (
    <DetailDialog title="Nguyên tắc Bot" description="Cách Bot mua, bán và ghi sổ." rows={PRINCIPLES} onClose={onClose}>
      <p className="text-xs leading-5 text-muted-foreground">
        Lưu cấu hình hoặc áp dụng danh mục không tạo giao dịch ngay. Tài khoản Bot và tài khoản tự giao dịch được theo dõi riêng.
      </p>
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

/**
 * «Danh mục Bot»: Đang giữ / Lịch sử / Nhật ký. Real symbols and dates (only the
 * practice screens hide them). Positions come in one read; history and journal page
 * through the cursor until the whole record is reachable.
 */
export function PortfolioBlock({ disclosure, names }: { disclosure: string | null; names: Readonly<Record<string, string>> }) {
  const [tab, setTab] = useState<PortfolioTab>("positions")
  const [info, setInfo] = useState(false)
  const positions = useBotPositions(true)
  const journal = useBotJournal(tab !== "positions")

  const items = useMemo(() => journal.data?.pages.flatMap((page) => page.items) ?? [], [journal.data])
  const issues = journal.data?.pages[0]?.issues ?? []
  const executions = useMemo(() => executionRows(items), [items])
  const sessions = useMemo(() => groupJournal(items), [items])

  const autoPages = useRef(0)
  const { hasNextPage, isFetchingNextPage, isPending, fetchNextPage } = journal
  useEffect(() => {
    if (tab !== "history") {
      autoPages.current = 0
      return
    }
    if (isPending || isFetchingNextPage || !hasNextPage) return
    if (executions.length >= HISTORY_TARGET || autoPages.current >= AUTO_PAGE_LIMIT) return
    autoPages.current += 1
    void fetchNextPage()
  }, [tab, executions.length, hasNextPage, isFetchingNextPage, isPending, fetchNextPage])

  const loadingMore = journal.isFetchingNextPage || journal.isPending
  const onLoadMore = () => {
    autoPages.current = 0
    void journal.fetchNextPage()
  }

  return (
    <section aria-label="Danh mục Bot" className="rounded-lg border border-border bg-card">
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
            <PositionsTable positions={positions.data.items} valuationComplete={positions.data.valuation_complete} />
          )}
        </TabsContent>
        <TabsContent value="history">
          {journal.isError ? (
            <ListState loading={false} error={journal.error} onRetry={() => void journal.refetch()} />
          ) : (
            <HistoryTable rows={executions} names={names} hasMore={journal.hasNextPage} loading={loadingMore} onLoadMore={onLoadMore} />
          )}
        </TabsContent>
        <TabsContent value="journal">
          {journal.isError ? (
            <ListState loading={false} error={journal.error} onRetry={() => void journal.refetch()} />
          ) : (
            <JournalTable sessions={sessions} issues={issues} hasMore={journal.hasNextPage} loading={loadingMore} onLoadMore={onLoadMore} />
          )}
        </TabsContent>
      </Tabs>
      {info && <PrinciplesDialog disclosure={disclosure} onClose={() => setInfo(false)} />}
    </section>
  )
}
