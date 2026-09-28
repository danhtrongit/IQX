/**
 * /admin/ipn — nhật ký IPN thô của SePay (port từ
 * `admin/src/features/premium/IpnLogsPage.vue`).
 *
 * - Danh sách `GET /admin/ipn` không trả `raw_body`/`raw_headers`; chỉ endpoint
 *   chi tiết mới có, nên payload thô được tải khi mở hộp thoại.
 * - "Thử lại" gọi `POST /admin/ipn/{id}/retry`: backend chỉ chấp nhận khi
 *   `secret_key_valid = true`, `result_status != "processed"` và có `raw_body`.
 *   Nút bị vô hiệu hoá đúng theo ba điều kiện đó (kèm giải thích) thay vì để
 *   người dùng bấm rồi nhận 400; lỗi server vẫn hiện nguyên văn.
 * - Retry tạo một bản ghi IPN mới giữ lịch sử, không sửa bản ghi cũ.
 */
import { useState } from "react"
import { Link } from "react-router"
import { RotateCcw, Search } from "lucide-react"
import { toast } from "sonner"

import { PanelState } from "@/components/layout/panel-state"
import { WorkspacePage } from "@/components/layout/workspace-page"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { errorMessage } from "@/lib/api"
import { formatDateTime } from "@/lib/format"
import type { IpnLog, IpnResultStatus } from "./api"
import { ipnResultLabel, ipnTone } from "./display"
import { useIpnLog, useIpnLogs, useRetryIpnLog } from "./queries"
import {
  ActionDialog,
  DetailList,
  DetailRow,
  FilterField,
  JsonBlock,
  StatusBadge,
  TableLoadingRows,
  TableNoticeRow,
  TablePager,
} from "./ui"

const ALL = "all"

/** Đúng các giá trị `result_status` mà backend ghi vào `sepay_ipn_logs`. */
const RESULT_OPTIONS: IpnResultStatus[] = [
  "processed",
  "ignored",
  "already_processed",
  "order_not_found",
  "amount_mismatch",
  "amount_invalid",
  "currency_mismatch",
  "secret_invalid",
  "invalid_json",
  "invalid_payload",
  "retried",
]

type FilterState = {
  search: string
  resultStatus: string
  secretKeyValid: string
}

const EMPTY_FILTERS: FilterState = { search: "", resultStatus: ALL, secretKeyValid: ALL }

export function IpnLogsPage() {
  const [draft, setDraft] = useState<FilterState>(EMPTY_FILTERS)
  const [applied, setApplied] = useState<FilterState>(EMPTY_FILTERS)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [retryTarget, setRetryTarget] = useState<IpnLog | null>(null)

  const ipnQuery = useIpnLogs({
    page,
    page_size: pageSize,
    search: applied.search.trim() || undefined,
    result_status: applied.resultStatus === ALL ? undefined : applied.resultStatus,
    secret_key_valid: applied.secretKeyValid === ALL ? undefined : applied.secretKeyValid === "true",
  })

  const rows = ipnQuery.data?.items ?? []
  const total = ipnQuery.data?.total ?? 0

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
      title="Nhật ký IPN"
      description="Mọi callback SePay nhận được, kể cả callback sai secret key. Bản ghi là append-only: thử lại sẽ tạo bản ghi mới."
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
                placeholder="Mã giao dịch SePay, kết quả..."
                onChange={(event) => setDraft({ ...draft, search: event.target.value })}
                onKeyDown={(event) => event.key === "Enter" && applyFilters()}
              />
            </div>
          </FilterField>

          <FilterField label="Kết quả">
            <Select
              value={draft.resultStatus}
              onValueChange={(value) => setDraft({ ...draft, resultStatus: value })}
            >
              <SelectTrigger aria-label="Lọc theo kết quả xử lý" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Tất cả</SelectItem>
                {RESULT_OPTIONS.map((status) => (
                  <SelectItem key={status} value={status}>
                    {ipnResultLabel(status)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterField>

          <FilterField label="Secret key">
            <Select
              value={draft.secretKeyValid}
              onValueChange={(value) => setDraft({ ...draft, secretKeyValid: value })}
            >
              <SelectTrigger aria-label="Lọc theo secret key" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Tất cả</SelectItem>
                <SelectItem value="true">Key hợp lệ</SelectItem>
                <SelectItem value="false">Key sai</SelectItem>
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

      {ipnQuery.isError ? (
        <PanelState
          title="Không tải được nhật ký IPN"
          description={errorMessage(ipnQuery.error)}
          action={{ label: "Thử lại", onClick: () => void ipnQuery.refetch() }}
        />
      ) : (
        <Card className="gap-0 overflow-hidden py-0">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-3">Thời điểm nhận</TableHead>
                <TableHead>Secret key</TableHead>
                <TableHead>Kết quả</TableHead>
                <TableHead>Đơn hàng</TableHead>
                <TableHead>SePay TX</TableHead>
                <TableHead>Lỗi</TableHead>
                <TableHead className="pr-3 text-right">Thao tác</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ipnQuery.isLoading ? (
                <TableLoadingRows colSpan={7} />
              ) : rows.length === 0 ? (
                <TableNoticeRow colSpan={7}>Không có bản ghi IPN nào khớp bộ lọc.</TableNoticeRow>
              ) : (
                rows.map((log) => {
                  const retryDisabledReason = !log.secret_key_valid
                    ? "Secret key không hợp lệ nên backend từ chối xử lý lại"
                    : log.result_status === "processed"
                      ? "IPN đã xử lý thành công, không cần thử lại"
                      : undefined
                  return (
                    <TableRow key={log.id}>
                      <TableCell className="pl-3 text-muted-foreground tabular-nums">
                        {formatDateTime(log.received_at)}
                      </TableCell>
                      <TableCell>
                        <StatusBadge
                          label={log.secret_key_valid ? "Key hợp lệ" : "Key sai"}
                          tone={log.secret_key_valid ? "success" : "danger"}
                        />
                      </TableCell>
                      <TableCell>
                        <StatusBadge label={ipnResultLabel(log.result_status)} tone={ipnTone(log.result_status)} />
                      </TableCell>
                      <TableCell>
                        {log.matched_order_id ? (
                          <Link
                            to={`/admin/payments/${log.matched_order_id}`}
                            className="font-mono text-[11px] text-primary hover:underline"
                          >
                            {log.matched_order_id}
                          </Link>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-[11px]">
                        {log.sepay_transaction_id ?? "—"}
                      </TableCell>
                      <TableCell className="max-w-[280px] whitespace-normal text-muted-foreground">
                        {log.error_message ?? "—"}
                      </TableCell>
                      <TableCell className="pr-3">
                        <div className="flex justify-end gap-1">
                          <Button
                            type="button"
                            variant="outline"
                            size="xs"
                            onClick={() => setDetailId(log.id)}
                          >
                            Chi tiết
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="xs"
                            disabled={!!retryDisabledReason}
                            title={retryDisabledReason}
                            onClick={() => setRetryTarget(log)}
                          >
                            Thử lại
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
          <TablePager
            page={page}
            pageSize={pageSize}
            total={total}
            isFetching={ipnQuery.isFetching && !ipnQuery.isLoading}
            onPageChange={setPage}
            onPageSizeChange={(size) => {
              setPageSize(size)
              setPage(1)
            }}
          />
        </Card>
      )}

      <IpnDetailDialog logId={detailId} onClose={() => setDetailId(null)} />
      <RetryIpnDialog log={retryTarget} onClose={() => setRetryTarget(null)} />
    </WorkspacePage>
  )
}

function IpnDetailDialog({ logId, onClose }: { logId: string | null; onClose: () => void }) {
  const detailQuery = useIpnLog(logId)
  const log = detailQuery.data

  return (
    <ActionDialog
      open={logId !== null}
      onOpenChange={(open) => !open && onClose()}
      title="Chi tiết IPN"
      description={logId ?? undefined}
      confirmLabel="Đóng"
      className="sm:max-w-[900px]"
      hideCancel
      onConfirm={onClose}
    >
      {detailQuery.isError ? (
        <PanelState
          title="Không tải được bản ghi IPN"
          description={errorMessage(detailQuery.error)}
          action={{ label: "Thử lại", onClick: () => void detailQuery.refetch() }}
        />
      ) : detailQuery.isLoading || !log ? (
        <PanelState title="Đang tải bản ghi…" loading />
      ) : (
        <div className="space-y-3">
          <DetailList>
            <DetailRow label="Thời điểm nhận">
              <span className="tabular-nums">{formatDateTime(log.received_at)}</span>
            </DetailRow>
            <DetailRow label="Secret key">
              <StatusBadge
                label={log.secret_key_valid ? "Key hợp lệ" : "Key sai"}
                tone={log.secret_key_valid ? "success" : "danger"}
              />
            </DetailRow>
            <DetailRow label="Kết quả">
              <StatusBadge label={ipnResultLabel(log.result_status)} tone={ipnTone(log.result_status)} />
            </DetailRow>
            <DetailRow label="Đơn hàng khớp">
              {log.matched_order_id ? (
                <Link
                  to={`/admin/payments/${log.matched_order_id}`}
                  className="font-mono text-[11px] text-primary hover:underline"
                >
                  {log.matched_order_id}
                </Link>
              ) : (
                "—"
              )}
            </DetailRow>
            <DetailRow label="SePay TX">
              <span className="font-mono text-[11px]">{log.sepay_transaction_id ?? "—"}</span>
            </DetailRow>
            <DetailRow label="Lỗi">
              <span className="whitespace-pre-wrap">{log.error_message ?? "—"}</span>
            </DetailRow>
          </DetailList>
          <div className="space-y-1">
            <p className="text-xs font-medium">Headers thô</p>
            <JsonBlock value={log.raw_headers ?? null} />
          </div>
          <div className="space-y-1">
            <p className="text-xs font-medium">Body thô</p>
            <JsonBlock value={log.raw_body ?? null} />
          </div>
        </div>
      )}
    </ActionDialog>
  )
}

function RetryIpnDialog({ log, onClose }: { log: IpnLog | null; onClose: () => void }) {
  const retry = useRetryIpnLog()
  const [serverError, setServerError] = useState<string | null>(null)

  async function submit() {
    if (!log) return
    setServerError(null)
    try {
      const result = await retry.mutateAsync(log.id)
      toast.success("Đã thử lại IPN", { description: result.message, duration: 10000 })
      onClose()
    } catch (error) {
      setServerError(errorMessage(error))
    }
  }

  return (
    <ActionDialog
      open={log !== null}
      onOpenChange={(open) => {
        if (!open) {
          setServerError(null)
          onClose()
        }
      }}
      title="Thử lại IPN này?"
      description={log ? `Bản ghi ${log.id}` : undefined}
      confirmLabel="Thử lại"
      pending={retry.isPending}
      error={serverError}
      onConfirm={() => void submit()}
    >
      <p className="text-sm text-muted-foreground">
        Backend xử lý lại <span className="font-medium">body thô</span> của bản ghi này (khớp đơn, kiểm tra số tiền, kích
        hoạt Premium nếu hợp lệ) và ghi thêm một bản ghi IPN mới — bản ghi cũ không bị sửa.
      </p>
    </ActionDialog>
  )
}
