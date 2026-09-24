/**
 * /admin/subscriptions — danh sách thuê bao Premium (port từ
 * `admin/src/features/premium/SubscriptionsPage.vue`).
 *
 * Lọc + phân trang chạy trên server (`GET /admin/subscriptions`). Bộ lọc dùng
 * đúng tham số backend hỗ trợ: `status` (chỉ 3 giá trị enum), `plan_id`,
 * `user_id` (UUID) và `expiring_within_days`. `user_id` được kiểm tra định dạng
 * UUID ngay trên client vì backend khai báo kiểu `uuid.UUID` — gửi chuỗi rác sẽ
 * chỉ nhận 422 vô nghĩa.
 */
import { useState } from "react"
import { Link } from "react-router"
import { RotateCcw } from "lucide-react"

import { PanelState } from "@/components/layout/panel-state"
import { WorkspacePage } from "@/components/layout/workspace-page"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { errorMessage } from "@/lib/api"
import type { SubscriptionStatus } from "./api"
import { formatDay, subscriptionStatusLabel, subscriptionTone } from "./display"
import { usePlans, useSubscriptions } from "./queries"
import { FilterField, StatusBadge, TableLoadingRows, TableNoticeRow, TablePager } from "./ui"

const ALL = "all"

const STATUS_OPTIONS: SubscriptionStatus[] = ["active", "expired", "cancelled"]

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type FilterState = {
  status: string
  planId: string
  userId: string
  expiringWithinDays: string
}

const EMPTY_FILTERS: FilterState = { status: ALL, planId: ALL, userId: "", expiringWithinDays: "" }

export function SubscriptionsPage() {
  const [draft, setDraft] = useState<FilterState>(EMPTY_FILTERS)
  const [applied, setApplied] = useState<FilterState>(EMPTY_FILTERS)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)

  const plansQuery = usePlans()
  const userId = applied.userId.trim()
  const expiringWithinDays = applied.expiringWithinDays.trim()

  const subscriptionsQuery = useSubscriptions({
    page,
    page_size: pageSize,
    status: applied.status === ALL ? undefined : applied.status,
    plan_id: applied.planId === ALL ? undefined : applied.planId,
    user_id: userId || undefined,
    expiring_within_days: expiringWithinDays ? Number(expiringWithinDays) : undefined,
  })

  const rows = subscriptionsQuery.data?.items ?? []
  const total = subscriptionsQuery.data?.total ?? 0
  const draftUserIdInvalid = draft.userId.trim().length > 0 && !UUID_PATTERN.test(draft.userId.trim())
  const expiringInvalid =
    draft.expiringWithinDays.trim().length > 0 &&
    !(Number.isInteger(Number(draft.expiringWithinDays)) && Number(draft.expiringWithinDays) >= 1)

  function applyFilters() {
    if (draftUserIdInvalid || expiringInvalid) return
    setApplied(draft)
    setPage(1)
  }

  function resetFilters() {
    setDraft(EMPTY_FILTERS)
    setApplied(EMPTY_FILTERS)
    setPage(1)
  }

  return (
    <WorkspacePage
      title="Thuê bao"
      description="Kỳ hạn Premium hiện tại của từng người dùng. Gia hạn và huỷ nằm trong trang chi tiết thuê bao."
    >
      <Card className="gap-3 p-3">
        <div className="flex flex-wrap items-end gap-3">
          <FilterField label="Trạng thái">
            <Select value={draft.status} onValueChange={(value) => setDraft({ ...draft, status: value })}>
              <SelectTrigger aria-label="Lọc theo trạng thái thuê bao" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Tất cả</SelectItem>
                {STATUS_OPTIONS.map((status) => (
                  <SelectItem key={status} value={status}>
                    {subscriptionStatusLabel(status)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterField>

          <FilterField label="Gói">
            <Select value={draft.planId} onValueChange={(value) => setDraft({ ...draft, planId: value })}>
              <SelectTrigger aria-label="Lọc theo gói" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Tất cả</SelectItem>
                {(plansQuery.data ?? []).map((plan) => (
                  <SelectItem key={plan.id} value={plan.id}>
                    {plan.name}
                    {plan.is_active ? "" : " (ngừng bán)"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterField>

          <FilterField label="ID người dùng">
            <Input
              value={draft.userId}
              placeholder="UUID người dùng"
              aria-invalid={draftUserIdInvalid}
              onChange={(event) => setDraft({ ...draft, userId: event.target.value })}
              onKeyDown={(event) => event.key === "Enter" && applyFilters()}
            />
          </FilterField>

          <FilterField label="Hết hạn trong (ngày)">
            <Input
              type="number"
              min={1}
              value={draft.expiringWithinDays}
              placeholder="VD: 7"
              aria-invalid={expiringInvalid}
              onChange={(event) => setDraft({ ...draft, expiringWithinDays: event.target.value })}
              onKeyDown={(event) => event.key === "Enter" && applyFilters()}
            />
          </FilterField>

          <div className="flex items-center gap-2">
            <Button type="button" onClick={applyFilters} disabled={draftUserIdInvalid || expiringInvalid}>
              Lọc
            </Button>
            <Button type="button" variant="outline" size="icon" aria-label="Xoá bộ lọc" onClick={resetFilters}>
              <RotateCcw />
            </Button>
          </div>
        </div>
        {(draftUserIdInvalid || expiringInvalid) && (
          <p className="text-[11px] text-destructive">
            {draftUserIdInvalid
              ? "ID người dùng phải là UUID hợp lệ."
              : "Số ngày phải là số nguyên lớn hơn hoặc bằng 1."}
          </p>
        )}
      </Card>

      {subscriptionsQuery.isError ? (
        <PanelState
          title="Không tải được danh sách thuê bao"
          description={errorMessage(subscriptionsQuery.error)}
          action={{ label: "Thử lại", onClick: () => void subscriptionsQuery.refetch() }}
        />
      ) : (
        <Card className="gap-0 overflow-hidden py-0">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-3">Người dùng</TableHead>
                <TableHead>Gói</TableHead>
                <TableHead>Trạng thái</TableHead>
                <TableHead>Bắt đầu</TableHead>
                <TableHead>Kết thúc</TableHead>
                <TableHead className="pr-3 text-right">Thao tác</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {subscriptionsQuery.isLoading ? (
                <TableLoadingRows colSpan={6} />
              ) : rows.length === 0 ? (
                <TableNoticeRow colSpan={6}>Không có thuê bao nào khớp bộ lọc.</TableNoticeRow>
              ) : (
                rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="pl-3">
                      <Link
                        to={`/admin/users/${row.user_id}`}
                        className="font-medium text-primary hover:underline"
                      >
                        {row.user_email ?? row.user_id}
                      </Link>
                    </TableCell>
                    <TableCell className="max-w-[220px] whitespace-normal">
                      {row.plan_name ?? row.plan_code ?? "—"}
                    </TableCell>
                    <TableCell>
                      <StatusBadge
                        label={subscriptionStatusLabel(row.status)}
                        tone={subscriptionTone(row.status)}
                      />
                    </TableCell>
                    <TableCell className="text-muted-foreground tabular-nums">
                      {formatDay(row.current_period_start)}
                    </TableCell>
                    <TableCell className="text-muted-foreground tabular-nums">
                      {formatDay(row.current_period_end)}
                    </TableCell>
                    <TableCell className="pr-3 text-right">
                      <Button type="button" variant="outline" size="xs" asChild>
                        <Link to={`/admin/subscriptions/${row.id}`}>Chi tiết</Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          <TablePager
            page={page}
            pageSize={pageSize}
            total={total}
            isFetching={subscriptionsQuery.isFetching && !subscriptionsQuery.isLoading}
            onPageChange={setPage}
            onPageSizeChange={(size) => {
              setPageSize(size)
              setPage(1)
            }}
          />
        </Card>
      )}

      <p className="text-[11px] text-muted-foreground">
        Mốc thời gian hiển thị theo giờ máy. Lọc “hết hạn trong N ngày” chỉ áp dụng cho thuê bao đang hoạt động.
      </p>
    </WorkspacePage>
  )
}
