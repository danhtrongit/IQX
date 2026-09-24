/**
 * /admin/payments — danh sách đơn thanh toán (port từ
 * `admin/src/features/premium/PaymentsPage.vue`).
 *
 * Lọc + phân trang chạy trên server (`GET /admin/payments`) với `search` (khớp
 * `invoice_number` hoặc email người dùng), `status` và `grant_type` theo đúng
 * enum backend. Backend còn nhận `user_id`, `plan_id`, `date_from`, `date_to`
 * nhưng legacy không mở ra ở UI (lọc theo người dùng đã có `search` theo email),
 * và DS chưa có primitive chọn ngày — nên các tham số đó không được gửi từ đây.
 *
 * Ba thao tác ghi nằm trong `payment-actions.tsx` và dùng chung với trang chi
 * tiết: xác nhận đã thanh toán (PENDING), đối chiếu IPN (PENDING > 30 phút), cấp
 * Premium thủ công (tạo đơn 0đ, không cần thanh toán).
 */
import { useState } from "react"
import { Link } from "react-router"
import { RotateCcw, Search } from "lucide-react"

import { PanelState } from "@/components/layout/panel-state"
import { WorkspacePage } from "@/components/layout/workspace-page"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { errorMessage } from "@/lib/api"
import { formatDateTime } from "@/lib/format"
import type { GrantType, PaymentBrief, PaymentStatus } from "./api"
import { formatAmount, grantTypeLabel, paymentStatusLabel, paymentTone } from "./display"
import { GrantPremiumDialog, MarkPaidDialog, ReconcileDialog } from "./payment-actions"
import { usePayments } from "./queries"
import { FilterField, StatusBadge, TableLoadingRows, TableNoticeRow, TablePager } from "./ui"

const ALL = "all"

const STATUS_OPTIONS: PaymentStatus[] = ["pending", "paid", "failed", "cancelled", "partially_refunded", "refunded"]

const GRANT_TYPE_OPTIONS: GrantType[] = ["payment", "admin_confirmed", "admin_grant"]

type FilterState = {
  search: string
  status: string
  grantType: string
}

const EMPTY_FILTERS: FilterState = { search: "", status: ALL, grantType: ALL }

type ActionTarget = { kind: "markPaid" | "reconcile" | "grant"; payment: PaymentBrief }

export function PaymentsPage() {
  const [draft, setDraft] = useState<FilterState>(EMPTY_FILTERS)
  const [applied, setApplied] = useState<FilterState>(EMPTY_FILTERS)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [action, setAction] = useState<ActionTarget | null>(null)

  const paymentsQuery = usePayments({
    page,
    page_size: pageSize,
    search: applied.search.trim() || undefined,
    status: applied.status === ALL ? undefined : applied.status,
    grant_type: applied.grantType === ALL ? undefined : applied.grantType,
  })

  const rows = paymentsQuery.data?.items ?? []
  const total = paymentsQuery.data?.total ?? 0

  function applyFilters() {
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
      title="Thanh toán"
      description="Đơn hàng Premium và bằng chứng thanh toán. Đối chiếu IPN chỉ chốt được đơn khi SePay đã gửi webhook hợp lệ."
    >
      <Card className="gap-3 p-3">
        <div className="flex flex-wrap items-end gap-3">
          <FilterField label="Tìm kiếm">
            <div className="relative">
              <Search
                className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                value={draft.search}
                className="pl-7"
                placeholder="Mã hóa đơn, email..."
                onChange={(event) => setDraft({ ...draft, search: event.target.value })}
                onKeyDown={(event) => event.key === "Enter" && applyFilters()}
              />
            </div>
          </FilterField>

          <FilterField label="Trạng thái">
            <Select value={draft.status} onValueChange={(value) => setDraft({ ...draft, status: value })}>
              <SelectTrigger aria-label="Lọc theo trạng thái đơn" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Tất cả</SelectItem>
                {STATUS_OPTIONS.map((status) => (
                  <SelectItem key={status} value={status}>
                    {paymentStatusLabel(status)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterField>

          <FilterField label="Nguồn xác nhận">
            <Select value={draft.grantType} onValueChange={(value) => setDraft({ ...draft, grantType: value })}>
              <SelectTrigger aria-label="Lọc theo nguồn xác nhận" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Tất cả</SelectItem>
                {GRANT_TYPE_OPTIONS.map((grantType) => (
                  <SelectItem key={grantType} value={grantType}>
                    {grantTypeLabel(grantType)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterField>

          <div className="flex items-center gap-2">
            <Button type="button" onClick={applyFilters}>
              Lọc
            </Button>
            <Button type="button" variant="outline" size="icon" aria-label="Xoá bộ lọc" onClick={resetFilters}>
              <RotateCcw />
            </Button>
          </div>
        </div>
      </Card>

      {paymentsQuery.isError ? (
        <PanelState
          title="Không tải được danh sách thanh toán"
          description={errorMessage(paymentsQuery.error)}
          action={{ label: "Thử lại", onClick: () => void paymentsQuery.refetch() }}
        />
      ) : (
        <Card className="gap-0 overflow-hidden py-0">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-3">Mã hóa đơn</TableHead>
                <TableHead>Người dùng</TableHead>
                <TableHead>Gói</TableHead>
                <TableHead className="text-right">Số tiền</TableHead>
                <TableHead>Trạng thái</TableHead>
                <TableHead>Nguồn xác nhận</TableHead>
                <TableHead className="text-right" title="Số bản ghi IPN khớp đơn này">
                  IPN
                </TableHead>
                <TableHead>Tạo lúc</TableHead>
                <TableHead className="pr-3 text-right">Thao tác</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paymentsQuery.isLoading ? (
                <TableLoadingRows colSpan={9} />
              ) : rows.length === 0 ? (
                <TableNoticeRow colSpan={9}>Không có đơn hàng nào khớp bộ lọc.</TableNoticeRow>
              ) : (
                rows.map((payment) => (
                  <TableRow key={payment.id}>
                    <TableCell className="pl-3">
                      <Link
                        to={`/admin/payments/${payment.id}`}
                        className="font-mono text-[11px] font-medium text-primary hover:underline"
                      >
                        {payment.invoice_number}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Link to={`/admin/users/${payment.user_id}`} className="text-primary hover:underline">
                        {payment.user_email ?? payment.user_id}
                      </Link>
                    </TableCell>
                    <TableCell className="max-w-[200px] whitespace-normal">
                      {payment.plan_name ?? payment.plan_code ?? "—"}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      <div>{formatAmount(payment.amount_vnd, payment.currency)}</div>
                      {payment.refunded_amount_vnd > 0 && <div className="text-xs font-normal text-muted-foreground">Đã hoàn {formatAmount(payment.refunded_amount_vnd, payment.currency)}</div>}
                    </TableCell>
                    <TableCell>
                      <StatusBadge label={paymentStatusLabel(payment.status)} tone={paymentTone(payment.status)} />
                    </TableCell>
                    <TableCell className="text-muted-foreground">{grantTypeLabel(payment.grant_type)}</TableCell>
                    <TableCell className="text-right tabular-nums">{payment.ipn_log_count}</TableCell>
                    <TableCell className="text-muted-foreground">{formatDateTime(payment.created_at)}</TableCell>
                    <TableCell className="pr-3">
                      <div className="flex justify-end gap-1">
                        {payment.status === "pending" && (
                          <>
                            <Button
                              type="button"
                              size="xs"
                              onClick={() => setAction({ kind: "markPaid", payment })}
                            >
                              Xác nhận đã thanh toán
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="xs"
                              onClick={() => setAction({ kind: "reconcile", payment })}
                            >
                              Đối chiếu IPN
                            </Button>
                          </>
                        )}
                        <Button
                          type="button"
                          variant="destructive"
                          size="xs"
                          onClick={() => setAction({ kind: "grant", payment })}
                        >
                          Cấp Premium
                        </Button>
                      </div>
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
            isFetching={paymentsQuery.isFetching && !paymentsQuery.isLoading}
            onPageChange={setPage}
            onPageSizeChange={(size) => {
              setPageSize(size)
              setPage(1)
            }}
          />
        </Card>
      )}

      <MarkPaidDialog
        key={`markPaid-${action?.kind === "markPaid" ? action.payment.id : "closed"}`}
        target={action?.kind === "markPaid" ? action.payment : null}
        onClose={() => setAction(null)}
      />
      <ReconcileDialog
        key={`reconcile-${action?.kind === "reconcile" ? action.payment.id : "closed"}`}
        target={action?.kind === "reconcile" ? action.payment : null}
        onClose={() => setAction(null)}
      />
      <GrantPremiumDialog
        key={`grant-${action?.kind === "grant" ? action.payment.id : "closed"}`}
        target={action?.kind === "grant" ? action.payment : null}
        onClose={() => setAction(null)}
      />
    </WorkspacePage>
  )
}
