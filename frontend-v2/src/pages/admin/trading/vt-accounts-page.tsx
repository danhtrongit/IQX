/**
 * `/admin/vt/accounts` — danh sách tài khoản giao dịch ảo (Sân tập).
 *
 * Bộ lọc và phân trang chạy trên server (`GET /virtual-trading/admin/accounts`
 * nhận `page`, `page_size` ≤ 200, `status`, `frozen_only`, `search`). Hàng hiển
 * thị đúng những gì endpoint trả về: endpoint danh sách **không** kèm thông tin
 * khoá (`frozen_at`/`freeze_reason`) nên cột trạng thái chỉ nói `active` /
 * `suspended`; chi tiết khoá nằm ở trang tài khoản.
 *
 * "Đặt lại tất cả" là thao tác phá huỷ toàn hệ thống: hộp thoại nêu rõ số tài
 * khoản sẽ bị xoá lệnh/giao dịch/vị thế/sổ cái và bắt gõ xác nhận.
 */
import { useState } from "react"
import { Link } from "react-router"
import { RotateCcw, Search, Settings2 } from "lucide-react"
import { toast } from "sonner"

import { WorkspacePage } from "@/components/layout/workspace-page"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { errorMessage } from "@/lib/api"
import { formatDateTime, formatMoney } from "@/lib/format"
import type { VtAccountFilters, VtAccountStatus } from "./api"
import { ActionDialog, ErrorLine, FilterField, HintLine, TableLoadingRows, TableNoticeRow, TablePager, StatusBadge } from "./components/ui"
import { useResetAllVtAccounts, useVtAccounts } from "./hooks"
import { ACCOUNT_STATUS_LABEL, ACCOUNT_STATUS_TONE } from "./labels"

const STATUS_OPTIONS: { value: VtAccountStatus | "all"; label: string }[] = [
  { value: "all", label: "Tất cả trạng thái" },
  { value: "active", label: ACCOUNT_STATUS_LABEL.active },
  { value: "suspended", label: ACCOUNT_STATUS_LABEL.suspended },
]

const FROZEN_OPTIONS = [
  { value: "all", label: "Tất cả" },
  { value: "frozen", label: "Chỉ tài khoản đã khoá" },
  { value: "unfrozen", label: "Chỉ tài khoản chưa khoá" },
] as const

const RESET_ALL_PHRASE = "ĐẶT LẠI TẤT CẢ"

export function VTAccountsPage() {
  const [searchDraft, setSearchDraft] = useState("")
  const [search, setSearch] = useState("")
  const [status, setStatus] = useState<VtAccountStatus | "all">("all")
  const [frozen, setFrozen] = useState<(typeof FROZEN_OPTIONS)[number]["value"]>("all")
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)
  const [resetOpen, setResetOpen] = useState(false)
  const [confirmText, setConfirmText] = useState("")

  const filters: VtAccountFilters = {
    page,
    pageSize,
    search: search || undefined,
    status: status === "all" ? undefined : status,
    frozenOnly: frozen === "all" ? undefined : frozen === "frozen",
  }
  const accounts = useVtAccounts(filters)
  const resetAll = useResetAllVtAccounts()

  const rows = accounts.data?.items ?? []
  const hasFilters = Boolean(search) || status !== "all" || frozen !== "all"

  const applyFilter = (next: () => void) => {
    next()
    setPage(1)
  }

  const openResetAll = () => {
    resetAll.reset()
    setConfirmText("")
    setResetOpen(true)
  }

  const confirmResetAll = () => {
    resetAll.mutate(undefined, {
      onSuccess: (result) => {
        toast.success(result.message)
        setResetOpen(false)
        setConfirmText("")
      },
    })
  }

  return (
    <WorkspacePage
      title="Tài khoản giao dịch ảo"
      description="Tài khoản Sân tập (tiền ảo VND) của người dùng. Nguồn: /api/v2/virtual-trading/admin/accounts và /api/v2/admin/vt. Mọi thao tác ghi đều được backend ghi audit."
      actions={
        <>
          <Button asChild variant="outline" size="sm">
            <Link to="/admin/vt/config">
              <Settings2 />
              Cấu hình VT
            </Link>
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={accounts.isFetching}
            onClick={() => void accounts.refetch()}
          >
            <RotateCcw />
            Làm mới
          </Button>
          <Button type="button" variant="destructive" size="sm" onClick={openResetAll}>
            Đặt lại tất cả…
          </Button>
        </>
      }
    >
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Bộ lọc</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <FilterField label="Tìm theo email hoặc tên">
            <div className="flex items-center gap-2">
              <Input
                value={searchDraft}
                onChange={(event) => setSearchDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") applyFilter(() => setSearch(searchDraft.trim()))
                }}
                placeholder="email@… hoặc tên"
                className="h-8 w-64"
                aria-label="Tìm theo email hoặc tên"
              />
              <Button type="button" size="sm" onClick={() => applyFilter(() => setSearch(searchDraft.trim()))}>
                <Search />
                Lọc
              </Button>
            </div>
          </FilterField>
          <FilterField label="Trạng thái">
            <Select
              value={status}
              onValueChange={(value) => applyFilter(() => setStatus(value as VtAccountStatus | "all"))}
            >
              <SelectTrigger size="sm" className="w-48 text-xs" aria-label="Lọc theo trạng thái tài khoản">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterField>
          <FilterField label="Khoá tài khoản">
            <Select
              value={frozen}
              onValueChange={(value) =>
                applyFilter(() => setFrozen(value as (typeof FROZEN_OPTIONS)[number]["value"]))
              }
            >
              <SelectTrigger size="sm" className="w-52 text-xs" aria-label="Lọc theo trạng thái khoá">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FROZEN_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterField>
          {hasFilters && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearchDraft("")
                setSearch("")
                setStatus("all")
                setFrozen("all")
                setPage(1)
              }}
            >
              Xoá bộ lọc
            </Button>
          )}
        </CardContent>
      </Card>

      {accounts.isError && <ErrorLine text={errorMessage(accounts.error)} onRetry={() => void accounts.refetch()} />}

      <Card className="gap-0 overflow-hidden py-0">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2.5">
          <h2 className="font-heading text-sm font-semibold">
            {accounts.data ? `${accounts.data.total} tài khoản` : "Danh sách tài khoản"}
          </h2>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Người dùng</TableHead>
              <TableHead>Tên</TableHead>
              <TableHead>Trạng thái</TableHead>
              <TableHead className="text-right">Vốn ban đầu</TableHead>
              <TableHead className="text-right">Tiền khả dụng</TableHead>
              <TableHead className="text-right">Tiền giữ</TableHead>
              <TableHead className="text-right">Tiền chờ</TableHead>
              <TableHead>Kích hoạt</TableHead>
              <TableHead>Đặt lại gần nhất</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {accounts.isLoading && <TableLoadingRows colSpan={10} />}
            {!accounts.isLoading && accounts.isError && (
              <TableNoticeRow colSpan={10} tone="danger" onRetry={() => void accounts.refetch()}>
                {errorMessage(accounts.error)}
              </TableNoticeRow>
            )}
            {!accounts.isLoading && !accounts.isError && rows.length === 0 && (
              <TableNoticeRow colSpan={10}>
                {hasFilters ? "Không có tài khoản nào khớp bộ lọc hiện tại." : "Chưa có tài khoản giao dịch ảo nào."}
              </TableNoticeRow>
            )}
            {rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="max-w-[240px] truncate">
                  <Link to={`/admin/vt/accounts/${row.id}`} className="font-medium text-primary hover:underline">
                    {row.userEmail ?? row.userId}
                  </Link>
                </TableCell>
                <TableCell className="max-w-[200px] truncate">{row.userName ?? "—"}</TableCell>
                <TableCell>
                  <StatusBadge
                    label={ACCOUNT_STATUS_LABEL[row.status] ?? row.status}
                    tone={ACCOUNT_STATUS_TONE[row.status] ?? ""}
                  />
                </TableCell>
                <TableCell className="text-right">{formatMoney(row.initialCashVnd)}</TableCell>
                <TableCell className="text-right font-medium">{formatMoney(row.cashAvailableVnd)}</TableCell>
                <TableCell className="text-right">{formatMoney(row.cashReservedVnd)}</TableCell>
                <TableCell className="text-right">{formatMoney(row.cashPendingVnd)}</TableCell>
                <TableCell>{row.activatedAt ? formatDateTime(row.activatedAt) : "—"}</TableCell>
                <TableCell>{row.resetAt ? formatDateTime(row.resetAt) : "—"}</TableCell>
                <TableCell>
                  <Button asChild variant="outline" size="xs">
                    <Link to={`/admin/vt/accounts/${row.id}`}>Mở</Link>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {accounts.data && (
          <TablePager
            page={accounts.data.page}
            pageSize={accounts.data.page_size}
            total={accounts.data.total}
            onPageChange={setPage}
            onPageSizeChange={(size) => applyFilter(() => setPageSize(size))}
            isFetching={accounts.isFetching}
          />
        )}
      </Card>

      <HintLine>
        Cột tiền: khả dụng (dùng được ngay) · giữ (đang chờ lệnh mua) · chờ (chờ tất toán T+N). Danh sách không kèm lý do
        khoá — mở chi tiết tài khoản để xem.
      </HintLine>

      <ActionDialog
        open={resetOpen}
        onOpenChange={setResetOpen}
        title="Đặt lại tất cả tài khoản giao dịch ảo?"
        description="Thao tác này xoá toàn bộ lệnh, giao dịch, vị thế, thanh toán T+N và sổ cái của MỌI tài khoản Sân tập, rồi đưa tiền mặt về mức vốn ban đầu trong cấu hình. Không thể hoàn tác."
        confirmLabel="Đặt lại tất cả"
        confirmVariant="destructive"
        pending={resetAll.isPending}
        confirmDisabled={confirmText.trim() !== RESET_ALL_PHRASE}
        error={resetAll.isError ? errorMessage(resetAll.error) : null}
        onConfirm={confirmResetAll}
      >
        <div className="space-y-3">
          <p className="text-sm">
            Thao tác áp dụng cho <span className="font-semibold">tất cả</span> tài khoản giao dịch ảo trong hệ thống,
            không theo bộ lọc đang xem (bộ lọc hiện hiển thị {accounts.data?.total ?? "—"} tài khoản).
          </p>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium" htmlFor="reset-all-confirm">
              Gõ “{RESET_ALL_PHRASE}” để bật nút xác nhận
            </label>
            <Input
              id="reset-all-confirm"
              value={confirmText}
              onChange={(event) => setConfirmText(event.target.value)}
              placeholder={RESET_ALL_PHRASE}
              autoComplete="off"
            />
          </div>
        </div>
      </ActionDialog>
    </WorkspacePage>
  )
}
