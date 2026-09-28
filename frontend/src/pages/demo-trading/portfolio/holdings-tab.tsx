/**
 * Tab "Nắm giữ" — vị thế cổ phiếu của tài khoản Sân tập (port từ tab Nắm giữ
 * của `features/watchlist`, dựng lại bằng shadcn).
 *
 * Số liệu lấy từ `GET /virtual-trading/portfolio` (server tính giá thị trường,
 * NAV và lãi/lỗ tạm tính tại thời điểm gọi) nên giá vốn / giá thị trường / lãi
 * lỗ trong cùng một hàng luôn nhất quán. Giá thiếu → "—", không suy diễn 0.
 *
 * Hành động: mỗi hàng mở mã đó sang panel Đặt lệnh (`onSymbolChange` +
 * `onNavigate("trading")`) — không đặt lệnh tại chỗ để giữ một luồng duy nhất.
 */
import { useState } from "react"
import { ArrowUpRight } from "lucide-react"
import { cn } from "cn"

import { PanelState } from "@/components/layout/panel-state"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { useTradingPortfolio } from "@/hooks/use-trading"
import { errorMessage } from "@/lib/api"
import { formatMoney, formatNumber, formatPercent } from "@/lib/format"
import type { TradingPosition } from "@/pages/demo-trading/types"
import { PortfolioAnalysisButton } from "./analysis-report"

export type HoldingsFilter = "all" | "profit" | "loss"

const FILTERS: { value: HoldingsFilter; label: string }[] = [
  { value: "all", label: "Tất cả" },
  { value: "profit", label: "Có lãi" },
  { value: "loss", label: "Đang lỗ" },
]

/** Bộ lọc của tab Nắm giữ — panel giữ state để toolbar và danh sách cùng nhìn. */
export function useHoldingsFilter() {
  const [filter, setFilter] = useState<HoldingsFilter>("all")
  return { filter, setFilter }
}

function matchesFilter(position: TradingPosition, filter: HoldingsFilter): boolean {
  if (filter === "all") return true
  if (position.unrealized_pnl_vnd == null) return false
  return filter === "profit" ? position.unrealized_pnl_vnd > 0 : position.unrealized_pnl_vnd < 0
}

/** Lãi/lỗ tạm tính theo % giá vốn; `null` khi thiếu giá vốn. */
function pnlPercent(position: TradingPosition): number | null {
  const cost = position.avg_cost_vnd * position.quantity_total
  if (position.unrealized_pnl_vnd == null || cost <= 0) return null
  return (position.unrealized_pnl_vnd / cost) * 100
}

function toneClass(value: number | null | undefined): string {
  if (value == null || value === 0) return "text-foreground"
  return value > 0 ? "text-price-up" : "text-price-down"
}

/** Thanh công cụ của tab — lọc + số mã + nút phân tích AI. */
export function HoldingsToolbar({
  filter,
  setFilter,
}: {
  filter: HoldingsFilter
  setFilter: (filter: HoldingsFilter) => void
}) {
  const { data: portfolio } = useTradingPortfolio()
  const positions = portfolio?.positions ?? []
  const shown = portfolio ? positions.filter((position) => matchesFilter(position, filter)).length : null

  return (
    <div className="flex min-w-0 items-center gap-2">
      <ToggleGroup
        type="single"
        size="sm"
        variant="outline"
        value={filter}
        onValueChange={(value) => value && setFilter(value as HoldingsFilter)}
      >
        {FILTERS.map((option) => (
          <ToggleGroupItem key={option.value} value={option.value} className="text-[11px]">
            {option.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <span className="ml-auto shrink-0 text-[10px] text-muted-foreground tabular-nums">
        {shown == null ? "—" : `${shown} mã`}
      </span>
      <PortfolioAnalysisButton />
    </div>
  )
}

export function HoldingsTab({
  filter,
  symbol,
  onSymbolChange,
  onNavigate,
}: {
  filter: HoldingsFilter
  symbol: string
  onSymbolChange: (symbol: string) => void
  onNavigate: (panel: string, symbol?: string) => void
}) {
  const { data: portfolio, isLoading, isError, error, refetch } = useTradingPortfolio()

  if (isLoading) {
    return (
      <div className="space-y-2">
        <div className="grid grid-cols-2 gap-2">
          {[0, 1, 2, 3].map((key) => (
            <Skeleton key={key} className="h-12 w-full" />
          ))}
        </div>
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    )
  }

  if (isError) {
    return (
      <PanelState
        title="Không tải được danh mục nắm giữ"
        description={errorMessage(error)}
        action={{ label: "Thử lại", onClick: () => void refetch() }}
      />
    )
  }

  if (!portfolio) {
    return (
      <PanelState
        title="Chưa có tài khoản Sân tập"
        description="Tài khoản giao dịch mô phỏng được mở khi bạn bắt đầu ở panel Đặt lệnh."
        action={{ label: "Sang Đặt lệnh", onClick: () => onNavigate("trading") }}
      />
    )
  }

  const positions = portfolio.positions.filter((position) => matchesFilter(position, filter))
  const totalMarketValue = positions.every((position) => position.market_value_vnd != null)
    ? positions.reduce((sum, position) => sum + (position.market_value_vnd as number), 0)
    : null

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <SummaryCard label="Tổng tài sản (NAV)" value={formatMoney(portfolio.nav_vnd)} />
        <SummaryCard label="Tiền mặt khả dụng" value={formatMoney(portfolio.account.cash_available_vnd)} />
        <SummaryCard
          label="Lãi/Lỗ tạm tính"
          value={formatMoney(portfolio.total_unrealized_pnl_vnd)}
          tone={toneClass(portfolio.total_unrealized_pnl_vnd)}
        />
        <SummaryCard
          label="Hiệu suất"
          value={formatPercent(portfolio.return_pct)}
          tone={toneClass(portfolio.return_pct)}
        />
      </div>

      {(portfolio.account.cash_pending_vnd > 0 || portfolio.account.cash_reserved_vnd > 0) && (
        <p className="px-1 text-[10px] text-muted-foreground tabular-nums">
          Tiền chờ về {formatMoney(portfolio.account.cash_pending_vnd)} · đang phong toả{" "}
          {formatMoney(portfolio.account.cash_reserved_vnd)}
        </p>
      )}

      {portfolio.refresh_warnings.length > 0 && (
        <p className="px-1 text-[10px] text-price-ref">
          Chưa cập nhật được giá cho: {portfolio.refresh_warnings.join(", ")}
        </p>
      )}

      {positions.length === 0 ? (
        <PanelState
          title={filter === "all" ? "Chưa nắm giữ cổ phiếu nào" : "Không có mã phù hợp bộ lọc"}
          description={
            filter === "all"
              ? "Mua cổ phiếu ở panel Đặt lệnh để bắt đầu một vòng nắm giữ."
              : "Đổi bộ lọc để xem các mã còn lại."
          }
          action={filter === "all" ? { label: "Sang Đặt lệnh", onClick: () => onNavigate("trading") } : undefined}
        />
      ) : (
        <ul className="space-y-1">
          {positions.map((position) => (
            <HoldingRow
              key={position.symbol}
              position={position}
              active={position.symbol === symbol}
              onSelect={() => onSymbolChange(position.symbol)}
              onTrade={() => onNavigate("trading", position.symbol)}
            />
          ))}
        </ul>
      )}

      {positions.length > 0 && (
        <div className="flex items-center justify-between border-t border-border px-1 pt-2 text-[11px] tabular-nums">
          <span className="text-muted-foreground">Tổng giá trị thị trường</span>
          <span className="font-semibold">{totalMarketValue == null ? "—" : formatMoney(totalMarketValue)}</span>
        </div>
      )}
    </div>
  )
}

function SummaryCard({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <Card size="sm" className="gap-0 py-2">
      <CardContent className="px-2.5">
        <p className="truncate text-[10px] text-muted-foreground">{label}</p>
        <p className={cn("mt-0.5 truncate text-xs font-bold tabular-nums", tone)}>{value}</p>
      </CardContent>
    </Card>
  )
}

function HoldingRow({
  position,
  active,
  onSelect,
  onTrade,
}: {
  position: TradingPosition
  active: boolean
  onSelect: () => void
  onTrade: () => void
}) {
  const percent = pnlPercent(position)
  const hasReserved = position.quantity_reserved > 0
  const hasPending = position.quantity_pending > 0

  return (
    <li
      className={cn(
        "rounded-sm border border-border px-2 py-1.5 transition-colors hover:bg-muted/50",
        active && "bg-muted/60 ring-1 ring-border",
      )}
    >
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={onSelect}
          className="flex min-w-0 flex-1 items-baseline gap-1.5 text-left focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <span className="text-xs font-bold">{position.symbol}</span>
          <span className="truncate text-[10px] text-muted-foreground">
            vốn {formatNumber(position.avg_cost_vnd)}
          </span>
        </button>
        <span className="shrink-0 text-xs font-semibold tabular-nums">
          {formatMoney(position.current_price_vnd)}
        </span>
        <Button
          type="button"
          variant="outline"
          size="icon-xs"
          aria-label={`Giao dịch ${position.symbol}`}
          title="Sang Đặt lệnh"
          onClick={onTrade}
        >
          <ArrowUpRight />
        </Button>
      </div>

      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground tabular-nums">
        <span>
          SL <b className="font-medium text-foreground">{formatNumber(position.quantity_total)}</b>
        </span>
        <span>
          Khả dụng{" "}
          <b className="font-medium text-foreground">{formatNumber(position.quantity_sellable)}</b>
        </span>
        {hasReserved && (
          <span>
            Phong toả{" "}
            <b className="font-medium text-foreground">{formatNumber(position.quantity_reserved)}</b>
          </span>
        )}
        {hasPending && (
          <span>
            Chờ về{" "}
            <b className="font-medium text-foreground">{formatNumber(position.quantity_pending)}</b>
          </span>
        )}
        <span className={cn("ml-auto font-semibold", toneClass(position.unrealized_pnl_vnd))}>
          {formatMoney(position.unrealized_pnl_vnd)}
          {percent !== null && ` · ${formatPercent(percent)}`}
        </span>
      </div>
    </li>
  )
}
