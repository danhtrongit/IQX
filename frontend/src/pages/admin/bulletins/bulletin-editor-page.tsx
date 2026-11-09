import { ArrowLeft } from "lucide-react"
import { Link, useParams } from "react-router"

import { PanelState } from "@/components/layout/panel-state"
import { WorkspacePage } from "@/components/layout/workspace-page"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { ApiError, errorMessage } from "@/lib/api"
import { formatWeekdayDate } from "@/pages/market-workspace/market/bulletin-format"

import { useAdminBulletin } from "./bulletin-admin-hooks"
import { BulletinEditor } from "./bulletin-editor"
import { BulletinStatusBadge } from "./bulletin-status-badge"

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

/** NỘI DUNG › Bản tin cuối phiên › một phiên: màn soạn 4 bước kèm xem trước. */
export function BulletinEditorPage() {
  const { date = "" } = useParams()
  const validDate = DATE_PATTERN.test(date)
  const query = useAdminBulletin(validDate ? date : null)

  const back = (
    <Button asChild variant="outline" size="sm">
      <Link to="/admin/market-bulletins">
        <ArrowLeft aria-hidden="true" />
        Danh sách
      </Link>
    </Button>
  )

  if (!validDate) {
    return (
      <WorkspacePage title="Bản tin cuối phiên" actions={back}>
        <PanelState title="Ngày phiên không hợp lệ" description="Mở lại bản tin từ danh sách." />
      </WorkspacePage>
    )
  }

  const detail = query.data
  return (
    <WorkspacePage
      title={`Bản tin phiên ${formatWeekdayDate(date)}`}
      description="Viết nhận định, đẩy mã từ Bộ lọc, kiểm tra rồi Public. Nội dung tự lưu."
      actions={
        <>
          {detail && <BulletinStatusBadge status={detail.status} />}
          {back}
        </>
      }
    >
      {query.isPending ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <Skeleton className="h-96" />
          <Skeleton className="h-96" />
        </div>
      ) : query.isError ? (
        query.error instanceof ApiError && query.error.status === 404 ? (
          <PanelState title="Chưa có bản nháp cho phiên này" description="Bản nháp được tạo tự động khi dữ liệu phiên đã chốt." />
        ) : (
          <PanelState
            title="Không thể tải bản tin"
            description={errorMessage(query.error)}
            action={{ label: "Thử lại", onClick: () => void query.refetch() }}
          />
        )
      ) : (
        <BulletinEditor key={date} detail={query.data} />
      )}
    </WorkspacePage>
  )
}
