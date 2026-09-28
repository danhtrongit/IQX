/**
 * Năm tab dữ liệu của một tài khoản giao dịch ảo: vị thế, lệnh, giao dịch, sổ
 * cái, thanh toán T+N.
 *
 * Bốn tab cuối phân trang và lọc **trên server** (`page`/`page_size` ≤ 200 cùng
 * tham số lọc riêng của từng endpoint). Tab vị thế không phân trang vì
 * `GET /admin/vt/accounts/{id}/positions` trả về toàn bộ vị thế hiện tại.
 *
 * Mỗi tab chỉ được mount khi được chọn (điều kiện `activeTab`), nên không có
 * truy vấn thừa cho những tab chưa mở.
 */
import { useState, type ReactNode } from "react"
import { X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { DatePicker } from "@/components/ui/date-picker"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { errorMessage } from "@/lib/api"
import { formatDateTime, formatMoney, formatNumber } from "@/lib/format"
import { cn } from "@/lib/utils"
import type {
  VtLedgerFilters,
  VtOrderFilters,
  VtOrderStatus,
  VtSettlementFilters,
  VtSettlementStatus,
  VtTradeFilters,
} from "../api"
import { formatDateOnly, formatVndSigned } from "../format"
import { useVtLedger, useVtOrders, useVtPositions, useVtSettlements, useVtTrades } from "../hooks"
import {
  LEDGER_KIND_LABEL,
  LEDGER_KIND_OPTIONS,
  ORDER_STATUS_LABEL,
  ORDER_STATUS_TONE,
  ORDER_TYPE_LABEL,
  PRICE_SOURCE_LABEL,
  SETTLEMENT_AMOUNT_UNIT,
  SETTLEMENT_KIND_LABEL,
  SETTLEMENT_STATUS_LABEL,
  SETTLEMENT_STATUS_TONE,
  SIDE_LABEL,
  SIDE_TEXT_TONE,
} from "../labels"
import { FilterField, HintLine, StatusBadge, TableLoadingRows, TableNoticeRow, TablePager } from "./ui"

const ALL = "all"

const ORDER_STATUS_OPTIONS: { value: VtOrderStatus | typeof ALL; label: string }[] = [
  { value: ALL, label: "Tất cả trạng thái" },
  ...(Object.keys(ORDER_STATUS_LABEL) as VtOrderStatus[]).map((value) => ({
    value,
    label: ORDER_STATUS_LABEL[value],
  })),
]

const SETTLEMENT_STATUS_OPTIONS: { value: VtSettlementStatus | typeof ALL; label: string }[] = [
  { value: ALL, label: "Tất cả trạng thái" },
  ...(Object.keys(SETTLEMENT_STATUS_LABEL) as VtSettlementStatus[]).map((value) => ({
    value,
    label: SETTLEMENT_STATUS_LABEL[value],
  })),
]

/** Hàng chờ dữ liệu dùng chung cho bảng của cả năm tab. */
function TabRows<T>({
  colSpan,
  query,
  rows,
  emptyText,
  children,
}: {
  colSpan: number
  query: { isLoading: boolean; isError: boolean; error: unknown; refetch: () => void }
  rows: T[]
  emptyText: string
  children: (row: T) => ReactNode
}) {
  if (query.isLoading) return <TableLoadingRows colSpan={colSpan} />
  if (query.isError) {
    return (
      <TableNoticeRow colSpan={colSpan} tone="danger" onRetry={query.refetch}>
        {errorMessage(query.error)}
      </TableNoticeRow>
    )
  }
  if (rows.length === 0) return <TableNoticeRow colSpan={colSpan}>{emptyText}</TableNoticeRow>
  return <>{rows.map(children)}</>
}

/* ── Vị thế ──────────────────────────────────────────────────────────────── */

export function PositionsTab({ accountId }: { accountId: string }) {
  const positions = useVtPositions(accountId)
  const rows = positions.data ?? []
  const totals = rows.reduce(
    (accumulator, row) => ({
      shares: accumulator.shares + row.quantityTotal,
      cost: accumulator.cost + row.quantityTotal * row.avgCostVnd,
    }),
    { shares: 0, cost: 0 },
  )

  return (
    <Card className="gap-0 overflow-hidden py-0">
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2.5">
        <h2 className="font-heading text-sm font-semibold">{positions.data ? `${rows.length} mã đang nắm giữ` : "Vị thế"}</h2>
        <Button
          type="button"
          variant="outline"
          size="xs"
          disabled={positions.isFetching}
          onClick={() => void positions.refetch()}
        >
          {positions.isFetching ? "Đang tải…" : "Làm mới"}
        </Button>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Mã</TableHead>
            <TableHead className="text-right">Tổng KL</TableHead>
            <TableHead className="text-right">Bán được</TableHead>
            <TableHead className="text-right">Chờ khớp</TableHead>
            <TableHead className="text-right">Đang giữ</TableHead>
            <TableHead className="text-right">Giá vốn TB</TableHead>
            <TableHead className="text-right">Giá trị theo giá vốn</TableHead>
            <TableHead>Cập nhật</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TabRows
            colSpan={8}
            query={positions}
            rows={rows}
            emptyText="Tài khoản chưa nắm giữ cổ phiếu nào."
          >
            {(row) => (
              <TableRow key={row.id}>
                <TableCell className="font-medium">{row.symbol}</TableCell>
                <TableCell className="text-right">{formatNumber(row.quantityTotal)}</TableCell>
                <TableCell className="text-right">{formatNumber(row.quantitySellable)}</TableCell>
                <TableCell className="text-right">{formatNumber(row.quantityPending)}</TableCell>
                <TableCell className="text-right">{formatNumber(row.quantityReserved)}</TableCell>
                <TableCell className="text-right">{formatMoney(row.avgCostVnd)}</TableCell>
                <TableCell className="text-right">{formatMoney(row.quantityTotal * row.avgCostVnd)}</TableCell>
                <TableCell>{formatDateTime(row.createdAt)}</TableCell>
              </TableRow>
            )}
          </TabRows>
        </TableBody>
        {rows.length > 0 && (
          <TableFooter>
            <TableRow className="hover:bg-transparent">
              <TableCell className="font-medium">Tổng</TableCell>
              <TableCell className="text-right font-medium">{formatNumber(totals.shares)}</TableCell>
              <TableCell colSpan={4} />
              <TableCell className="text-right font-medium">{formatMoney(totals.cost)}</TableCell>
              <TableCell />
            </TableRow>
          </TableFooter>
        )}
      </Table>
      <HintLine className="px-3 py-2">
        Đang giữ = phần khối lượng bị khoá bởi lệnh bán đang chờ. Cột “Giá trị theo giá vốn” = tổng KL × giá vốn trung
        bình, tính ngay trên màn hình từ hai số của backend.
      </HintLine>
    </Card>
  )
}

/* ── Lệnh ────────────────────────────────────────────────────────────────── */

export function OrdersTab({ accountId }: { accountId: string }) {
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)
  const [status, setStatus] = useState<VtOrderStatus | typeof ALL>(ALL)
  const [symbolDraft, setSymbolDraft] = useState("")
  const [symbol, setSymbol] = useState("")
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")

  const filters: VtOrderFilters = {
    page,
    pageSize,
    status: status === ALL ? undefined : status,
    symbol: symbol || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
  }
  const orders = useVtOrders(accountId, filters)
  const rows = orders.data?.items ?? []

  const filterField = (
    <div className="flex flex-wrap items-end gap-3 border-b border-border px-3 py-2.5">
      <FilterField label="Trạng thái">
        <Select
          value={status}
          onValueChange={(value) => {
            setStatus(value as VtOrderStatus | typeof ALL)
            setPage(1)
          }}
        >
          <SelectTrigger size="sm" className="w-40 text-xs" aria-label="Lọc theo trạng thái lệnh">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ORDER_STATUS_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FilterField>
      <FilterField label="Mã">
        <div className="flex items-center gap-1">
          <Input
            value={symbolDraft}
            onChange={(event) => setSymbolDraft(event.target.value.toUpperCase())}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                setSymbol(symbolDraft.trim())
                setPage(1)
              }
            }}
            placeholder="FPT"
            className="h-8 w-28 uppercase"
            aria-label="Lọc theo mã cổ phiếu"
          />
          <Button
            type="button"
            variant="outline"
            size="xs"
            onClick={() => {
              setSymbol(symbolDraft.trim())
              setPage(1)
            }}
          >
            Áp dụng
          </Button>
        </div>
      </FilterField>
      <FilterField label="Ngày giao dịch từ">
        <DatePicker
          id="admin-trades-date-from"
          value={dateFrom}
          onChange={(value) => {
            setDateFrom(value)
            setPage(1)
          }}
          className="h-8 w-40"
          aria-label="Ngày giao dịch từ"
        />
      </FilterField>
      <FilterField label="Đến">
        <DatePicker
          id="admin-trades-date-to"
          value={dateTo}
          onChange={(value) => {
            setDateTo(value)
            setPage(1)
          }}
          className="h-8 w-40"
          aria-label="Ngày giao dịch đến"
        />
      </FilterField>
      {(status !== ALL || symbol || dateFrom || dateTo) && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            setStatus(ALL)
            setSymbolDraft("")
            setSymbol("")
            setDateFrom("")
            setDateTo("")
            setPage(1)
          }}
        >
          Xoá bộ lọc
        </Button>
      )}
    </div>
  )

  return (
    <Card className="gap-0 overflow-hidden py-0">
      {filterField}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Mã</TableHead>
            <TableHead>Chiều</TableHead>
            <TableHead>Loại</TableHead>
            <TableHead className="text-right">KL</TableHead>
            <TableHead className="text-right">Giá LO</TableHead>
            <TableHead className="text-right">Giá khớp</TableHead>
            <TableHead className="text-right">Tiền</TableHead>
            <TableHead className="text-right">Phí</TableHead>
            <TableHead className="text-right">Thuế</TableHead>
            <TableHead className="text-right">Ròng</TableHead>
            <TableHead>Trạng thái</TableHead>
            <TableHead>Ngày GD</TableHead>
            <TableHead>Đặt lúc</TableHead>
            <TableHead>Lý do</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TabRows colSpan={14} query={orders} rows={rows} emptyText="Không có lệnh nào khớp bộ lọc.">
            {(row) => (
              <TableRow key={row.id}>
                <TableCell className="font-medium">{row.symbol}</TableCell>
                <TableCell className={cn("font-medium", SIDE_TEXT_TONE[row.side])}>
                  {SIDE_LABEL[row.side] ?? row.side}
                </TableCell>
                <TableCell>{ORDER_TYPE_LABEL[row.orderType] ?? row.orderType}</TableCell>
                <TableCell className="text-right">{formatNumber(row.quantity)}</TableCell>
                <TableCell className="text-right">{row.limitPriceVnd === null ? "—" : formatMoney(row.limitPriceVnd)}</TableCell>
                <TableCell className="text-right">
                  {row.filledPriceVnd === null ? "—" : formatMoney(row.filledPriceVnd)}
                </TableCell>
                <TableCell className="text-right">
                  {row.grossAmountVnd === null ? "—" : formatMoney(row.grossAmountVnd)}
                </TableCell>
                <TableCell className="text-right">{row.feeVnd === null ? "—" : formatMoney(row.feeVnd)}</TableCell>
                <TableCell className="text-right">{row.taxVnd === null ? "—" : formatMoney(row.taxVnd)}</TableCell>
                <TableCell className="text-right">{row.netAmountVnd === null ? "—" : formatMoney(row.netAmountVnd)}</TableCell>
                <TableCell>
                  <StatusBadge
                    label={ORDER_STATUS_LABEL[row.status] ?? row.status}
                    tone={ORDER_STATUS_TONE[row.status] ?? ""}
                  />
                </TableCell>
                <TableCell>{formatDateOnly(row.tradingDate)}</TableCell>
                <TableCell>{formatDateTime(row.createdAt)}</TableCell>
                <TableCell className="max-w-[220px] truncate" title={row.rejectionReason ?? row.cancelReason ?? undefined}>
                  {row.rejectionReason ?? row.cancelReason ?? "—"}
                </TableCell>
              </TableRow>
            )}
          </TabRows>
        </TableBody>
      </Table>
      {orders.data && (
        <TablePager
          page={orders.data.page}
          pageSize={orders.data.page_size}
          total={orders.data.total}
          onPageChange={setPage}
          onPageSizeChange={(size) => {
            setPageSize(size)
            setPage(1)
          }}
          isFetching={orders.isFetching}
        />
      )}
      <HintLine className="px-3 py-2">
        “Tiền” là giá trị khớp trước phí/thuế; “Ròng” là số tiền thực cộng/trừ vào tiền mặt (âm với lệnh mua). Bộ lọc
        ngày áp lên <span className="font-medium">ngày giao dịch</span> (không phải thời điểm đặt lệnh).
      </HintLine>
    </Card>
  )
}

/* ── Giao dịch ───────────────────────────────────────────────────────────── */

export function TradesTab({ accountId }: { accountId: string }) {
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)
  const [symbolDraft, setSymbolDraft] = useState("")
  const [symbol, setSymbol] = useState("")

  const filters: VtTradeFilters = { page, pageSize, symbol: symbol || undefined }
  const trades = useVtTrades(accountId, filters)
  const rows = trades.data?.items ?? []
  const totals = rows.reduce(
    (accumulator, row) => ({
      quantity: accumulator.quantity + row.quantity,
      gross: accumulator.gross + row.grossAmountVnd,
      fee: accumulator.fee + row.feeVnd,
      tax: accumulator.tax + row.taxVnd,
      net: accumulator.net + row.netAmountVnd,
    }),
    { quantity: 0, gross: 0, fee: 0, tax: 0, net: 0 },
  )

  return (
    <Card className="gap-0 overflow-hidden py-0">
      <div className="flex flex-wrap items-end gap-3 border-b border-border px-3 py-2.5">
        <FilterField label="Mã">
          <div className="flex items-center gap-1">
            <Input
              value={symbolDraft}
              onChange={(event) => setSymbolDraft(event.target.value.toUpperCase())}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  setSymbol(symbolDraft.trim())
                  setPage(1)
                }
              }}
              placeholder="FPT"
              className="h-8 w-28 uppercase"
              aria-label="Lọc giao dịch theo mã"
            />
            <Button
              type="button"
              variant="outline"
              size="xs"
              onClick={() => {
                setSymbol(symbolDraft.trim())
                setPage(1)
              }}
            >
              Áp dụng
            </Button>
            {symbol && (
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label="Bỏ lọc mã"
                onClick={() => {
                  setSymbolDraft("")
                  setSymbol("")
                  setPage(1)
                }}
              >
                <X />
              </Button>
            )}
          </div>
        </FilterField>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Mã</TableHead>
            <TableHead>Chiều</TableHead>
            <TableHead className="text-right">KL</TableHead>
            <TableHead className="text-right">Giá khớp</TableHead>
            <TableHead className="text-right">Tiền</TableHead>
            <TableHead className="text-right">Phí</TableHead>
            <TableHead className="text-right">Thuế</TableHead>
            <TableHead className="text-right">Ròng</TableHead>
            <TableHead>Nguồn giá</TableHead>
            <TableHead>Khớp lúc</TableHead>
            <TableHead>Lệnh</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TabRows colSpan={11} query={trades} rows={rows} emptyText="Không có giao dịch nào khớp bộ lọc.">
            {(row) => (
              <TableRow key={row.id}>
                <TableCell className="font-medium">{row.symbol}</TableCell>
                <TableCell className={cn("font-medium", SIDE_TEXT_TONE[row.side])}>
                  {SIDE_LABEL[row.side] ?? row.side}
                </TableCell>
                <TableCell className="text-right">{formatNumber(row.quantity)}</TableCell>
                <TableCell className="text-right">{formatMoney(row.priceVnd)}</TableCell>
                <TableCell className="text-right">{formatMoney(row.grossAmountVnd)}</TableCell>
                <TableCell className="text-right">{formatMoney(row.feeVnd)}</TableCell>
                <TableCell className="text-right">{formatMoney(row.taxVnd)}</TableCell>
                <TableCell className={cn("text-right", row.netAmountVnd < 0 ? "text-price-down" : "text-price-up")}>
                  {formatVndSigned(row.netAmountVnd)}
                </TableCell>
                <TableCell>{PRICE_SOURCE_LABEL[row.priceSource] ?? row.priceSource}</TableCell>
                <TableCell>{formatDateTime(row.tradedAt)}</TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground" title={row.orderId}>
                  {row.orderId.slice(0, 8)}…
                </TableCell>
              </TableRow>
            )}
          </TabRows>
        </TableBody>
        {rows.length > 0 && (
          <TableFooter>
            <TableRow className="hover:bg-transparent">
              <TableCell className="font-medium" colSpan={2}>
                Tổng trang này
              </TableCell>
              <TableCell className="text-right font-medium">{formatNumber(totals.quantity)}</TableCell>
              <TableCell />
              <TableCell className="text-right font-medium">{formatMoney(totals.gross)}</TableCell>
              <TableCell className="text-right font-medium">{formatMoney(totals.fee)}</TableCell>
              <TableCell className="text-right font-medium">{formatMoney(totals.tax)}</TableCell>
              <TableCell className="text-right font-medium">{formatVndSigned(totals.net)}</TableCell>
              <TableCell colSpan={3} />
            </TableRow>
          </TableFooter>
        )}
      </Table>
      {trades.data && (
        <TablePager
          page={trades.data.page}
          pageSize={trades.data.page_size}
          total={trades.data.total}
          onPageChange={setPage}
          onPageSizeChange={(size) => {
            setPageSize(size)
            setPage(1)
          }}
          isFetching={trades.isFetching}
        />
      )}
      <HintLine className="px-3 py-2">
        Dòng “Tổng trang này” chỉ cộng các giao dịch đang hiển thị trên trang, không phải toàn bộ lịch sử.
      </HintLine>
    </Card>
  )
}

/* ── Sổ cái ──────────────────────────────────────────────────────────────── */

export function LedgerTab({ accountId }: { accountId: string }) {
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)
  const [kind, setKind] = useState<string>(ALL)

  const filters: VtLedgerFilters = { page, pageSize, kind: kind === ALL ? undefined : kind }
  const ledger = useVtLedger(accountId, filters)
  const rows = ledger.data?.items ?? []

  return (
    <Card className="gap-0 overflow-hidden py-0">
      <div className="flex flex-wrap items-end gap-3 border-b border-border px-3 py-2.5">
        <FilterField label="Loại bút toán">
          <Select
            value={kind}
            onValueChange={(value) => {
              setKind(value)
              setPage(1)
            }}
          >
            <SelectTrigger size="sm" className="w-56 text-xs" aria-label="Lọc theo loại bút toán">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Tất cả loại</SelectItem>
              {LEDGER_KIND_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterField>
        <HintLine className="max-w-md">
          Sổ cái là dấu vết tiền mặt: kích hoạt, đặt lại, điều chỉnh của quản trị và dòng tiền ròng của từng giao dịch.
        </HintLine>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Loại</TableHead>
            <TableHead className="text-right">Số tiền</TableHead>
            <TableHead className="text-right">Số dư sau</TableHead>
            <TableHead>Tham chiếu</TableHead>
            <TableHead>Ghi chú</TableHead>
            <TableHead>Ghi lúc</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TabRows colSpan={6} query={ledger} rows={rows} emptyText="Không có bút toán nào khớp bộ lọc.">
            {(row) => (
              <TableRow key={row.id}>
                <TableCell>{LEDGER_KIND_LABEL[row.kind] ?? row.kind}</TableCell>
                <TableCell className={cn("text-right font-medium", row.amountVnd < 0 ? "text-price-down" : "text-price-up")}>
                  {formatVndSigned(row.amountVnd)}
                </TableCell>
                <TableCell className="text-right">{formatMoney(row.balanceAfterVnd)}</TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {row.referenceType ? `${row.referenceType}${row.referenceId ? ` · ${row.referenceId.slice(0, 8)}…` : ""}` : "—"}
                </TableCell>
                <TableCell className="max-w-[280px] truncate" title={row.note ?? undefined}>
                  {row.note ?? "—"}
                </TableCell>
                <TableCell>{formatDateTime(row.createdAt)}</TableCell>
              </TableRow>
            )}
          </TabRows>
        </TableBody>
      </Table>
      {ledger.data && (
        <TablePager
          page={ledger.data.page}
          pageSize={ledger.data.page_size}
          total={ledger.data.total}
          onPageChange={setPage}
          onPageSizeChange={(size) => {
            setPageSize(size)
            setPage(1)
          }}
          isFetching={ledger.isFetching}
        />
      )}
    </Card>
  )
}

/* ── Thanh toán T+N ──────────────────────────────────────────────────────── */

export function SettlementsTab({ accountId }: { accountId: string }) {
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)
  const [status, setStatus] = useState<VtSettlementStatus | typeof ALL>(ALL)

  const filters: VtSettlementFilters = { page, pageSize, status: status === ALL ? undefined : status }
  const settlements = useVtSettlements(accountId, filters)
  const rows = settlements.data?.items ?? []

  return (
    <Card className="gap-0 overflow-hidden py-0">
      <div className="flex flex-wrap items-end gap-3 border-b border-border px-3 py-2.5">
        <FilterField label="Trạng thái">
          <Select
            value={status}
            onValueChange={(value) => {
              setStatus(value as VtSettlementStatus | typeof ALL)
              setPage(1)
            }}
          >
            <SelectTrigger size="sm" className="w-44 text-xs" aria-label="Lọc theo trạng thái tất toán">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SETTLEMENT_STATUS_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterField>
        <HintLine className="max-w-md">
          Chỉ tài khoản giao dịch ở chế độ T2 mới sinh bản ghi T+N. Khối lượng giải phóng tính bằng cổ phiếu, tiền bán
          tính bằng VND.
        </HintLine>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Loại</TableHead>
            <TableHead className="text-right">Giá trị</TableHead>
            <TableHead>Mã</TableHead>
            <TableHead>Đến hạn</TableHead>
            <TableHead>Trạng thái</TableHead>
            <TableHead>Tất toán lúc</TableHead>
            <TableHead>Giao dịch</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TabRows colSpan={7} query={settlements} rows={rows} emptyText="Không có bản ghi T+N nào khớp bộ lọc.">
            {(row) => (
              <TableRow key={row.id}>
                <TableCell>{SETTLEMENT_KIND_LABEL[row.kind] ?? row.kind}</TableCell>
                <TableCell className="text-right font-medium">
                  {SETTLEMENT_AMOUNT_UNIT[row.kind] === "shares" ? `${formatNumber(row.amount)} CP` : formatMoney(row.amount)}
                </TableCell>
                <TableCell>{row.symbol ?? "—"}</TableCell>
                <TableCell>{formatDateOnly(row.dueDate)}</TableCell>
                <TableCell>
                  <StatusBadge
                    label={SETTLEMENT_STATUS_LABEL[row.status] ?? row.status}
                    tone={SETTLEMENT_STATUS_TONE[row.status] ?? ""}
                  />
                </TableCell>
                <TableCell>{row.settledAt ? formatDateTime(row.settledAt) : "—"}</TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground" title={row.tradeId}>
                  {row.tradeId.slice(0, 8)}…
                </TableCell>
              </TableRow>
            )}
          </TabRows>
        </TableBody>
      </Table>
      {settlements.data && (
        <TablePager
          page={settlements.data.page}
          pageSize={settlements.data.page_size}
          total={settlements.data.total}
          onPageChange={setPage}
          onPageSizeChange={(size) => {
            setPageSize(size)
            setPage(1)
          }}
          isFetching={settlements.isFetching}
        />
      )}
      <HintLine className="px-3 py-2">
        “Đến hạn” là ngày giao dịch thứ hai sau ngày khớp (đã trừ cuối tuần và ngày nghỉ trong cấu hình). Bản ghi chỉ
        được giải phóng khi tiến trình tất toán của backend chạy.
      </HintLine>
    </Card>
  )
}
