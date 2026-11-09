import { Download } from "lucide-react"

import { PanelState } from "@/components/layout/panel-state"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

import { bulletinFileHref, pickBulletinFile, type PublicBulletin } from "./bulletin-api"
import { bulletinDownloadName, formatBulletinNumber, formatSignedPercent, formatWeekdayDate } from "./bulletin-format"
import { useBulletinArchive } from "./bulletin-hooks"
import { useWideScreen } from "./use-wide-screen"

function ArchiveRow({ bulletin, wide, onView }: { bulletin: PublicBulletin; wide: boolean; onView: (date: string) => void }) {
  const file = pickBulletinFile(bulletin, wide ? "desktop" : "mobile")
  const summary = bulletin.summary
  const tone = !summary || summary.change_pct === 0 ? "text-muted-foreground" : summary.change_pct > 0 ? "text-price-up" : "text-price-down"
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 border border-border bg-card px-4 py-3">
      <div className="min-w-0">
        <div className="text-sm font-semibold text-foreground">{formatWeekdayDate(bulletin.trade_date)}</div>
        <div className="mt-0.5 text-xs text-muted-foreground tabular-nums">
          {summary ? (
            <>
              VN-Index {formatBulletinNumber(summary.close)}{" "}
              <span className={cn("font-medium", tone)}>({formatSignedPercent(summary.change_pct)})</span>
              {" · "}
              {summary.pick_count} mã trong 3 bộ lọc
            </>
          ) : (
            "Chưa có số liệu tóm tắt"
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button type="button" size="sm" variant="outline" onClick={() => onView(bulletin.trade_date)}>
          Xem
        </Button>
        {file && (
          <Button size="sm" variant="outline" asChild>
            <a href={bulletinFileHref(file.download_url)} download={bulletinDownloadName(bulletin.trade_date, file.variant)}>
              <Download aria-hidden="true" />
              Tải PDF
            </a>
          </Button>
        )}
      </div>
    </li>
  )
}

/**
 * Tab "Bản tin cũ": các bản Public trong 6 tháng gần nhất, mới nhất trước. Hiện 15 dòng, mỗi lần
 * Xem thêm là 20 dòng. "Xem" mở ngày đó ở tab Bản tin.
 */
export function ArchiveTab({ onView }: { onView: (date: string) => void }) {
  const wide = useWideScreen()
  const query = useBulletinArchive()

  if (query.isPending) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }, (_, index) => (
          <Skeleton key={index} className="h-16 w-full" />
        ))}
      </div>
    )
  }

  if (query.isError) {
    return (
      <PanelState
        title="Không thể tải danh sách bản tin"
        description="Vui lòng thử lại sau ít phút."
        action={{ label: "Thử lại", onClick: () => void query.refetch() }}
      />
    )
  }

  const items = query.data.pages.flatMap((page) => page.items)
  const total = query.data.pages[0]?.total ?? items.length

  return (
    <div className="space-y-4" data-tour-id="tour-bantin-archive">
      <p className="text-sm leading-6 text-muted-foreground">
        Lưu bản tin của 6 tháng gần nhất ({total} phiên). Tải PDF: máy tính tải bản máy tính, điện thoại tải bản điện thoại.
      </p>
      {items.length === 0 ? (
        <PanelState title="Chưa có bản tin." />
      ) : (
        <ul className="space-y-2">
          {items.map((bulletin) => (
            <ArchiveRow key={bulletin.trade_date} bulletin={bulletin} wide={wide} onView={onView} />
          ))}
        </ul>
      )}
      {query.hasNextPage && (
        <div className="flex justify-center">
          <Button type="button" variant="outline" disabled={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>
            {query.isFetchingNextPage ? "Đang tải..." : "Xem thêm"}
          </Button>
        </div>
      )}
    </div>
  )
}
