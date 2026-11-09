import { lazy, Suspense } from "react"
import { Download } from "lucide-react"

import { PanelState } from "@/components/layout/panel-state"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { ApiError } from "@/lib/api"

import { bulletinFileHref, pickBulletinFile } from "./bulletin-api"
import { bulletinDownloadName, bulletinHeadline, formatBulletinDate } from "./bulletin-format"
import { useBulletin } from "./bulletin-hooks"
import { useWideScreen } from "./use-wide-screen"

const BulletinPdfViewer = lazy(() =>
  import("./bulletin-pdf-viewer").then((module) => ({ default: module.BulletinPdfViewer })),
)

function ViewerSkeleton() {
  return <Skeleton className="h-[70vh] w-full" />
}

/**
 * Tab "Bản tin": bản Public mới nhất (hoặc ngày được chọn từ "Bản tin cũ"). Máy tính (từ 900 px)
 * xem bản máy tính, điện thoại xem bản điện thoại; vượt ngưỡng thì đổi file, không cần tải lại.
 */
export function BulletinTab({ date, onShowLatest }: { date: string | null; onShowLatest: () => void }) {
  const wide = useWideScreen()
  const query = useBulletin(date)
  const bulletin = query.data?.bulletin ?? null

  if (query.isPending) return <ViewerSkeleton />

  if (query.isError) {
    if (query.error instanceof ApiError && query.error.status === 404) {
      return (
        <PanelState
          title={date ? `Chưa có bản tin phiên ${formatBulletinDate(date)}.` : "Chưa có bản tin."}
          action={date ? { label: "Xem bản tin mới nhất", onClick: onShowLatest } : undefined}
        />
      )
    }
    return (
      <PanelState
        title="Không thể tải bản tin"
        description="Vui lòng thử lại sau ít phút."
        action={{ label: "Thử lại", onClick: () => void query.refetch() }}
      />
    )
  }

  if (!bulletin) return <PanelState title="Chưa có bản tin." />

  const variant = wide ? "desktop" : "mobile"
  const file = pickBulletinFile(bulletin, variant)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3" data-tour-id="tour-bantin-header">
        <p className="min-w-0 text-sm font-medium text-foreground">{bulletinHeadline(bulletin)}</p>
        <div className="flex items-center gap-2">
          {date && (
            <Button type="button" variant="ghost" size="sm" onClick={onShowLatest}>
              Xem bản tin mới nhất
            </Button>
          )}
          {file && (
            <Button variant="outline" size="sm" asChild data-tour-id="tour-bantin-download">
              <a href={bulletinFileHref(file.download_url)} download={bulletinDownloadName(bulletin.trade_date, file.variant)}>
                <Download aria-hidden="true" />
                Tải PDF
              </a>
            </Button>
          )}
        </div>
      </div>

      {file ? (
        <Suspense fallback={<ViewerSkeleton />}>
          <BulletinPdfViewer
            src={bulletinFileHref(file.url)}
            variant={file.variant}
            pageCount={file.page_count}
            pageWidth={file.page_width}
            pageHeight={file.page_height}
          />
        </Suspense>
      ) : (
        <PanelState title="Chưa có file bản tin." description="Bản tin này chưa có file PDF để xem." />
      )}
    </div>
  )
}
