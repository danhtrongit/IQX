/**
 * AI Mẫu nến panel — candlestick / chart patterns for the symbol on screen.
 *
 * Upstream is `GET /ai/patterns/{candles|charts}`, which is premium-gated
 * server-side (401 without a session, 403 without an active subscription), so
 * the panel gates itself the same way the legacy panel did: guests are invited
 * to sign in; signed-in free users can open the Premium plans without changing
 * their journey progress.
 *
 * The backend reports the patterns it actually recognised: an empty list is
 * rendered as "chưa có pattern cho mã này", never as invented analysis.
 */
import { useState, type ReactNode } from "react"
import { useQuery } from "@tanstack/react-query"
import { useNavigate } from "react-router"
import {
  ChartCandlestick,
  ChartLine,
  CircleAlert,
  Info,
  Check,
  LogIn,
  Sparkles,
} from "lucide-react"
import { cn } from "cn"

import { PanelState } from "@/components/layout/panel-state"
import { SidebarPanel } from "@/components/layout/sidebar-panel"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useAuth } from "@/hooks/use-auth"
import { ApiError, errorMessage } from "@/lib/api"

import { fetchPatterns, marketKeys, type PatternItem, type PatternKind } from "./market-api"

const KIND_LABEL: Record<PatternKind, string> = {
  candles: "Mẫu nến",
  charts: "Mẫu hình giá",
}

const SIGNAL_LABEL: Record<PatternItem["signal"], string> = {
  bullish: "Tăng",
  bearish: "Giảm",
  neutral: "Trung tính",
}

const SIGNAL_TONE: Record<PatternItem["signal"], string> = {
  bullish: "text-price-up border-price-up/40 bg-price-up/10",
  bearish: "text-price-down border-price-down/40 bg-price-down/10",
  neutral: "text-price-ref border-price-ref/40 bg-price-ref/10",
}

function SignalBadge({ item }: { item: PatternItem }) {
  return (
    <Badge
      variant="outline"
      className={cn("shrink-0 font-semibold", SIGNAL_TONE[item.signal])}
      title="Tín hiệu AI nhận diện"
    >
      {item.signalLabel ?? SIGNAL_LABEL[item.signal]}
    </Badge>
  )
}

export type PatternsPanelProps = {
  /** Symbol the terminal is looking at. */
  symbol: string
}

export function PatternsPanel({ symbol }: PatternsPanelProps) {
  const navigate = useNavigate()
  const code = symbol.trim().toUpperCase()
  const { isAuthenticated, isPremium, premiumLoading, isLoading: authLoading, openAuth } =
    useAuth()
  const [kind, setKind] = useState<PatternKind>("candles")
  const [selection, setSelection] = useState({ key: "", index: 0 })
  const selectionKey = `${code}:${kind}`

  const enabled = isAuthenticated && isPremium && code.length > 0
  const patterns = useQuery({
    queryKey: marketKeys.patterns(kind, code),
    enabled,
    queryFn: ({ signal }) => fetchPatterns(kind, code, signal),
    staleTime: 5 * 60_000,
    retry: 1,
  })

  const items = patterns.data ?? []
  const activeIndex = selection.key === selectionKey ? Math.min(selection.index, Math.max(0, items.length - 1)) : 0
  const active = items[activeIndex] ?? null


  const forbidden =
    patterns.error instanceof ApiError &&
    (patterns.error.status === 403 || patterns.error.status === 401)

  const description = `${code || "—"} · ${KIND_LABEL[kind]} · nguồn AI`

  let body: ReactNode
  if (authLoading || (isAuthenticated && premiumLoading)) {
    body = (
      <div className="space-y-3">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    )
  } else if (!isAuthenticated) {
    body = (
      <PanelState
        title="Cần đăng nhập"
        description="AI Mẫu nến phân tích mã đang xem cho tài khoản IQX. Đăng nhập để tiếp tục — hành trình của bạn không bị ảnh hưởng."
        action={{ label: "Đăng nhập", onClick: () => openAuth("login") }}
      />
    )
  } else if (!isPremium) {
    body = (
      <PanelState
        title="Cần gói Premium"
        description="Nhận diện mẫu nến và mẫu hình giá bằng AI chỉ dành cho tài khoản Premium. Hành trình học của bạn vẫn giữ nguyên."
        action={{ label: "Xem gói Premium", onClick: () => navigate("/nang-cap") }}
      />
    )
  } else if (forbidden) {
    body = (
      <PanelState
        title="Cần gói Premium"
        description="Máy chủ từ chối yêu cầu này vì gói Premium chưa hoạt động. Gia hạn gói để xem lại phân tích AI."
        action={{ label: "Xem gói Premium", onClick: () => navigate("/nang-cap") }}
      />
    )
  } else if (patterns.isLoading) {
    body = (
      <div className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Đang phân tích {KIND_LABEL[kind].toLowerCase()} cho {code}…
        </p>
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    )
  } else if (patterns.isError) {
    body = (
      <PanelState
        title="Không tải được dữ liệu pattern"
        description={errorMessage(patterns.error)}
        action={{ label: "Thử lại", onClick: () => void patterns.refetch() }}
      />
    )
  } else if (!active) {
    body = (
      <div className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground">
        <Sparkles aria-hidden="true" className="size-6 opacity-40" />
        <p className="text-xs">Chưa có {KIND_LABEL[kind].toLowerCase()} cho {code}.</p>
        <p className="text-[11px] opacity-80">
          Hệ thống AI chỉ có dữ liệu cho một số mã — thử mã khác hoặc đổi loại mẫu.
        </p>
      </div>
    )
  } else {
    body = (
      <div className="space-y-3">
        <div className="space-y-1.5">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-heading text-xl leading-tight font-bold">{active.name}</h3>
            <SignalBadge item={active} />
          </div>
          {active.state && (
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              <span className="font-semibold tracking-wide uppercase">
                {kind === "candles" ? "Mức độ" : "Trạng thái"}
              </span>
              {" · "}
              {active.state}
            </p>
          )}
        </div>

        {active.meaning && (
          <div className="space-y-1.5 rounded-lg border border-border bg-muted/40 p-3">
            <div className="flex items-center gap-1.5 text-xs font-bold">
              <Info aria-hidden="true" className="size-3.5 text-primary" />
              Ý nghĩa
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">{active.meaning}</p>
          </div>
        )}

        {active.action && (
          <div className="space-y-1.5 rounded-lg border border-price-up/40 bg-price-up/10 p-3">
            <div className="flex items-center gap-1.5 text-xs font-bold text-price-up">
              <Check aria-hidden="true" className="size-3.5" />
              Hành động đề xuất
            </div>
            <p className="text-xs leading-relaxed">{active.action}</p>
          </div>
        )}

        <div className="space-y-1.5">
          <div className="flex items-center justify-between px-0.5">
            <span className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
              Tất cả {KIND_LABEL[kind].toLowerCase()}
            </span>
            <span className="text-[10px] text-muted-foreground tabular-nums">
              {items.length} pattern
            </span>
          </div>
          {items.map((item, index) => (
            <button
              key={`${item.name}-${index}`}
              type="button"
              aria-pressed={index === activeIndex}
              onClick={() => setSelection({ key: selectionKey, index })}
              className={cn(
                "flex w-full items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-left transition-colors duration-150",
                index === activeIndex
                  ? "border-primary/50 bg-primary/10"
                  : "border-border bg-card hover:bg-muted/60",
              )}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-semibold">{item.name}</span>
                {item.state && (
                  <span className="line-clamp-1 text-[10px] text-muted-foreground">
                    {item.state}
                  </span>
                )}
              </span>
              <Badge
                variant="outline"
                className={cn("shrink-0 text-[10px]", SIGNAL_TONE[item.signal])}
              >
                {item.signalLabel ?? SIGNAL_LABEL[item.signal]}
              </Badge>
            </button>
          ))}
        </div>
      </div>
    )
  }

  return (
    <SidebarPanel
      title="AI Mẫu nến"
      description={description}
      actions={
        !isAuthenticated ? (
          <Button size="sm" variant="outline" onClick={() => openAuth("login")}>
            <LogIn aria-hidden="true" />
            Đăng nhập
          </Button>
        ) : undefined
      }
      footer={
        <p className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <CircleAlert aria-hidden="true" className="size-3 shrink-0" />
          Phân tích AI chỉ mang tính tham khảo, không phải khuyến nghị đầu tư.
        </p>
      }
    >
      <Tabs
        value={kind}
        onValueChange={(next) => setKind(next as PatternKind)}
        className="gap-3"
      >
        <TabsList className="w-full">
          <TabsTrigger value="candles">
            <ChartCandlestick aria-hidden="true" className="size-3.5" />
            Mẫu nến
          </TabsTrigger>
          <TabsTrigger value="charts">
            <ChartLine aria-hidden="true" className="size-3.5" />
            Mẫu hình giá
          </TabsTrigger>
        </TabsList>
      </Tabs>
      {body}
    </SidebarPanel>
  )
}
