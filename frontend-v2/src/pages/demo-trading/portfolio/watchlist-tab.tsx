/**
 * Tab "Theo dõi" — danh sách mã yêu thích của user (port từ
 * `features/watchlist` của dashboard cũ, dựng lại bằng shadcn).
 *
 * - Thêm mã: kiểm tra thật bằng `GET /instruments/{symbol}` (chỉ nhận CỔ
 *   PHIẾU — chặn chỉ số/quỹ ngay trên client, backend vẫn là nơi chốt luật)
 *   rồi `POST /watchlists`.
 * - Bỏ theo dõi: nút ★ đang bật (một hành động rõ ràng, thêm lại được) hoặc
 *   mục "Bỏ theo dõi" trong menu ⋯.
 * - Đổi thứ tự: `PUT /watchlists/reorder` — thứ tự nằm ở server nên tải lại
 *   trang vẫn giữ nguyên.
 * - Cổng ★ của Cấp 0: chỉ gọi `journey.completeTask(1, "star")` SAU KHI đã có
 *   bằng chứng lệnh MUA đã khớp cho chính mã vừa thêm (server kiểm lại lần nữa,
 *   và từ chối nếu lệnh mua đó không kèm kế hoạch Cấp 0).
 */
import { useId, useMemo, useState } from "react"
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronUp,
  LoaderCircle,
  MoreHorizontal,
  Plus,
  Star,
  Trash2,
} from "lucide-react"
import { cn } from "cn"
import { toast } from "sonner"

import { PanelState } from "@/components/layout/panel-state"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { errorMessage } from "@/lib/api"
import { formatNumber, formatPercent } from "@/lib/format"
import { taskDone } from "@/pages/demo-trading/journey/journey-state"
import { useJourney } from "@/pages/demo-trading/journey/use-journey"
import { useQuote, quoteChange } from "@/pages/demo-trading/market/use-quote"
import { hasFilledBuyEvidence, validateStockSymbol, type WatchlistItem } from "./api"
import {
  useAddToWatchlist,
  useDailyCloses,
  useRemoveFromWatchlist,
  useReorderWatchlist,
  useSymbolInfo,
  useWatchlist,
} from "./hooks"
import { displayPrice, priceToneClass, QUOTE_TONE_CLASS } from "./quote"

/** Ô nhập + nút thêm mã; đặt ở footer của panel nên tách khỏi phần danh sách. */
export function useWatchlistAdd() {
  const add = useAddToWatchlist()
  const journey = useJourney()
  const [value, setValue] = useState("")

  async function submit() {
    const symbol = value.trim().toUpperCase()
    if (!symbol || add.isPending) return

    const invalid = await validateStockSymbol(symbol)
    if (invalid) {
      toast.warning(invalid)
      return
    }

    try {
      await add.mutateAsync(symbol)
    } catch (error) {
      toast.error(errorMessage(error))
      return
    }
    setValue("")
    toast.success(`Đã thêm ${symbol} vào danh mục theo dõi`)

    // Nhiệm vụ ① Cấp 0 = lý do mua + lệnh MUA đã khớp + ★. Hai điều kiện đầu do
    // server giữ; ở đây chỉ xác nhận có lệnh MUA đã khớp cho ĐÚNG mã vừa ★ rồi
    // mới báo hoàn thành. Không có bằng chứng (hoặc server từ chối) thì không
    // ghi gì — thanh Hành trình vẫn hiển thị đúng phần còn thiếu.
    if (journey.isLoading || journey.level !== 0 || !journey.progress) return
    if (taskDone(0, 1, journey.progress)) return
    try {
      if (!(await hasFilledBuyEvidence(symbol))) return
      await journey.completeTask(1, "star")
      toast.success("Đã ghi nhận nhiệm vụ 1 của Cấp 0")
    } catch {
      // Lệnh mua chưa kèm kế hoạch Cấp 0 (hoặc lỗi mạng) — bỏ qua.
    }
  }

  return { value, setValue, submit, pending: add.isPending }
}

export function WatchlistAddBar() {
  const { value, setValue, submit, pending } = useWatchlistAdd()
  return (
    <form
      className="space-y-1.5"
      onSubmit={(event) => {
        event.preventDefault()
        void submit()
      }}
    >
      <div className="flex items-center gap-2">
        <Input
          value={value}
          onChange={(event) => setValue(event.target.value.toUpperCase())}
          placeholder="Thêm mã cổ phiếu..."
          aria-label="Thêm mã cổ phiếu vào danh mục theo dõi"
          className="h-8"
          disabled={pending}
        />
        <Button type="submit" size="sm" disabled={!value.trim() || pending}>
          {pending ? <LoaderCircle className="animate-spin" /> : <Plus />}
          Thêm
        </Button>
      </div>
      <p className="text-[10px] text-muted-foreground">
        Chỉ nhận cổ phiếu — chỉ số và quỹ sẽ bị từ chối.
      </p>
    </form>
  )
}

export function WatchlistTab({
  symbol,
  onSymbolChange,
}: {
  symbol: string
  onSymbolChange: (symbol: string) => void
}) {
  const { data, isLoading, isError, error, refetch } = useWatchlist()
  const reorder = useReorderWatchlist()
  const items = useMemo(() => data ?? [], [data])
  const symbols = useMemo(() => items.map((item) => item.symbol), [items])

  function move(item: WatchlistItem, delta: number) {
    const next = [...symbols]
    const from = next.indexOf(item.symbol)
    const to = from + delta
    if (from < 0 || to < 0 || to >= next.length) return
    next.splice(from, 1)
    next.splice(to, 0, item.symbol)
    reorder.mutate(next, { onError: (mutationError) => toast.error(errorMessage(mutationError)) })
  }

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[0, 1, 2, 3, 4].map((key) => (
          <Skeleton key={key} className="h-9 w-full" />
        ))}
      </div>
    )
  }

  if (isError) {
    return (
      <PanelState
        title="Không tải được danh mục theo dõi"
        description={errorMessage(error)}
        action={{ label: "Thử lại", onClick: () => void refetch() }}
      />
    )
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 px-4 py-14 text-center">
        <Star className="size-6 text-muted-foreground/60" aria-hidden="true" />
        <p className="text-xs font-medium">Chưa có mã theo dõi</p>
        <p className="text-[11px] text-muted-foreground">
          Thêm mã cổ phiếu ở ô bên dưới để bắt đầu theo dõi.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-1">
      <p className="px-1 text-[10px] text-muted-foreground">
        {items.length} mã · dùng ⋯ để đổi thứ tự hoặc bỏ theo dõi
      </p>
      <ul className="space-y-0.5">
        {items.map((item, index) => (
          <WatchlistRow
            key={item.symbol}
            item={item}
            active={item.symbol === symbol}
            canMoveUp={index > 0}
            canMoveDown={index < items.length - 1}
            onSelect={() => onSymbolChange(item.symbol)}
            onMove={(delta) => move(item, delta)}
          />
        ))}
      </ul>
    </div>
  )
}

function WatchlistRow({
  item,
  active,
  canMoveUp,
  canMoveDown,
  onSelect,
  onMove,
}: {
  item: WatchlistItem
  active: boolean
  canMoveUp: boolean
  canMoveDown: boolean
  onSelect: () => void
  onMove: (delta: number) => void
}) {
  const { data: quote } = useQuote(item.symbol)
  const { data: info } = useSymbolInfo(item.symbol)
  const { data: closes } = useDailyCloses(item.symbol)
  const remove = useRemoveFromWatchlist()

  const change = quoteChange(quote)
  const price = displayPrice(quote)
  const series = closes ?? []

  async function handleRemove() {
    try {
      await remove.mutateAsync(item.symbol)
      toast.success(`Đã bỏ ${item.symbol} khỏi danh mục theo dõi`)
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  return (
    <li
      className={cn(
        "group flex items-center gap-1 rounded-sm px-1 py-1 transition-colors hover:bg-muted/60",
        active && "bg-muted/70 ring-1 ring-border",
      )}
    >
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        aria-label={`Bỏ theo dõi ${item.symbol}`}
        title="Bỏ theo dõi"
        disabled={remove.isPending}
        onClick={() => void handleRemove()}
      >
        <Star className="fill-accent text-accent" />
      </Button>

      <button
        type="button"
        onClick={onSelect}
        aria-current={active ? "true" : undefined}
        className="flex min-w-0 flex-1 items-center gap-1.5 text-left focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        <span className="w-11 shrink-0 text-xs font-bold">{item.symbol}</span>
        <span className="min-w-0 flex-1 truncate text-[10px] text-muted-foreground">
          {info?.shortName ?? info?.name ?? ""}
        </span>
        <Sparkline values={series} />
        <span className="flex w-20 shrink-0 flex-col items-end leading-tight">
          <span className={cn("text-xs font-semibold tabular-nums", priceToneClass(quote))}>
            {price === null ? "—" : formatNumber(price)}
          </span>
          {change ? (
            <span
              className={cn(
                "flex items-center gap-px text-[10px] font-medium tabular-nums",
                QUOTE_TONE_CLASS[change.tone],
              )}
            >
              {change.tone === "up" && <ArrowUp className="size-2.5" aria-hidden="true" />}
              {change.tone === "down" && <ArrowDown className="size-2.5" aria-hidden="true" />}
              {change.percent === null ? "—" : formatPercent(change.percent)}
            </span>
          ) : (
            <span className="text-[10px] text-muted-foreground">
              {quote && quote.price == null ? "chưa khớp" : "—"}
            </span>
          )}
        </span>
      </button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label={`Thao tác với ${item.symbol}`}
          >
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem disabled={!canMoveUp} onSelect={() => onMove(-1)}>
            <ChevronUp />
            Chuyển lên
          </DropdownMenuItem>
          <DropdownMenuItem disabled={!canMoveDown} onSelect={() => onMove(1)}>
            <ChevronDown />
            Chuyển xuống
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => void handleRemove()}>
            <Trash2 />
            Bỏ theo dõi
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  )
}

/** Sparkline 3 tháng — màu theo xu hướng của chính chuỗi giá đó. */
function Sparkline({ values }: { values: number[] }) {
  const gradientId = useId().replace(/:/g, "")
  const width = 44
  const height = 20
  if (values.length < 2) {
    return <span aria-hidden="true" className="inline-block shrink-0" style={{ width, height }} />
  }
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const pad = 2
  const line = `M${values
    .map((value, index) => {
      const x = ((index / (values.length - 1)) * width).toFixed(1)
      const y = (height - pad - ((value - min) / span) * (height - pad * 2)).toFixed(1)
      return `${x},${y}`
    })
    .join(" L")}`
  const stroke =
    values[values.length - 1] > values[0]
      ? "var(--price-up)"
      : values[values.length - 1] < values[0]
        ? "var(--price-down)"
        : "var(--price-ref)"

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      aria-hidden="true"
      className="shrink-0"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.35" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${line} L${width},${height} L0,${height} Z`} fill={`url(#${gradientId})`} />
      <path
        d={line}
        fill="none"
        stroke={stroke}
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
