import { ExternalLink } from "lucide-react"
import { Link } from "react-router"

import { Button } from "@/components/ui/button"
import { formatBulletinDateTime, formatBulletinDayMonth } from "@/pages/market-workspace/market/bulletin-format"

import type { AdminBulletinDetail, AdminBulletinSlot } from "./bulletin-admin-api"
import { filterPageHref } from "./bulletin-admin-format"
import { StepCard } from "./bulletin-step-card"

function SlotCard({ entry, date, locked }: { entry: AdminBulletinSlot; date: string; locked: boolean }) {
  const snapshot = entry.snapshot
  const dayMonth = formatBulletinDayMonth(date)
  return (
    <div className="space-y-2 border border-border p-3" data-slot-card={entry.slot}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Bộ lọc {entry.slot}</div>
          <div className="text-sm font-medium">{snapshot ? snapshot.display_name : "Chưa đặt tên hiển thị"}</div>
        </div>
        <Button asChild size="sm" variant="outline">
          <Link to={filterPageHref(snapshot?.filter_id)}>
            <ExternalLink aria-hidden="true" />
            Mở trong Bộ lọc
          </Link>
        </Button>
      </div>

      {snapshot ? (
        <div className="space-y-1 text-xs leading-5 text-muted-foreground">
          <p>
            Đẩy lúc {formatBulletinDateTime(snapshot.pushed_at)} từ bộ lọc “{snapshot.filter_name}” · phiên bản {snapshot.filter_version}
          </p>
          {snapshot.passed_count === 0 ? (
            <p className="text-foreground">Phiên này không có mã đạt. Bản tin in câu này, không có biểu đồ.</p>
          ) : (
            <p>
              Kết quả phiên {dayMonth}: {snapshot.passed_count} mã đạt · chọn {snapshot.picks.length} mã:{" "}
              <span className="font-medium text-foreground">{snapshot.picks.map((pick) => pick.symbol).join(", ")}</span>
            </p>
          )}
        </div>
      ) : (
        <p className="text-xs leading-5 text-muted-foreground">
          Chưa đẩy kết quả phiên {dayMonth}. Vào Bộ lọc, chạy, chọn mã rồi bấm Đẩy vào bản tin.
        </p>
      )}
      {locked && <p className="text-xs font-medium text-foreground">Danh sách mã đã khoá khi Public.</p>}
    </div>
  )
}

/** Bước 3: ba bộ lọc đẩy từ trang Bộ lọc; ở đây chỉ xem trạng thái, không sửa tay. */
export function BulletinStepSlots({ detail }: { detail: AdminBulletinDetail }) {
  return (
    <StepCard step={3} title="Bộ lọc" tag="Lọc tay mỗi phiên" tourId="tour-bantin-admin-slots">
      <p className="text-sm leading-6 text-muted-foreground">
        Mỗi phiên: vào Chiến lược › Bộ lọc, chạy bộ lọc, chọn mã rồi bấm <strong className="font-semibold text-foreground">Đẩy vào bản tin</strong>. Hệ thống không tự lọc.
      </p>
      <div className="grid gap-3">
        {detail.slots.map((entry) => (
          <SlotCard key={entry.slot} entry={entry} date={detail.trade_date} locked={detail.slots_locked} />
        ))}
      </div>
    </StepCard>
  )
}
