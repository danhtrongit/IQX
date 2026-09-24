import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { useNavigate } from "react-router"
import { CircleAlert } from "lucide-react"

import { PanelState } from "@/components/layout/panel-state"
import { SidebarPanel } from "@/components/layout/sidebar-panel"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useAuth } from "@/hooks/use-auth"
import { ApiError, errorMessage } from "@/lib/api"
import { cn } from "@/lib/utils"
import { fetchForecastRanking, fetchSymbolForecast, forecastKeys, type ForecastHorizon } from "./forecast-api"
import { forecastPercent, forecastPrice } from "./forecast-format"

const HORIZONS: ForecastHorizon[] = ["3", "5", "10"]

export function ForecastPanel({ symbol, onSymbolChange }: { symbol: string; onSymbolChange: (symbol: string) => void }) {
  const navigate = useNavigate()
  const { isAuthenticated, isPremium, isLoading: authLoading, premiumLoading, openAuth } = useAuth()
  const [horizon, setHorizon] = useState<ForecastHorizon>("5")
  const code = symbol.trim().toUpperCase()
  const enabled = isAuthenticated && isPremium && !authLoading && !premiumLoading
  const ranking = useQuery({
    queryKey: forecastKeys.ranking(horizon),
    queryFn: ({ signal }) => fetchForecastRanking(horizon, signal),
    enabled,
    staleTime: 5 * 60_000,
    retry: 1,
  })
  const detail = useQuery({
    queryKey: forecastKeys.symbol(code),
    queryFn: ({ signal }) => fetchSymbolForecast(code, signal),
    enabled: enabled && !!code,
    staleTime: 5 * 60_000,
    retry: 1,
  })
  const denied = [ranking.error, detail.error].some((error) => error instanceof ApiError && (error.status === 401 || error.status === 403))

  let content: React.ReactNode
  if (authLoading || (isAuthenticated && premiumLoading)) {
    content = <div className="space-y-3"><Skeleton className="h-8 w-full" /><Skeleton className="h-24 w-full" /><Skeleton className="h-24 w-full" /></div>
  } else if (!isAuthenticated) {
    content = <PanelState title="Cần đăng nhập" description="Đăng nhập để xem dữ liệu dự báo." action={{ label: "Đăng nhập", onClick: () => openAuth("login") }} />
  } else if (!isPremium || denied) {
    content = <PanelState title="Cần gói Premium" description="Dữ liệu dự báo dành cho tài khoản Premium." action={{ label: "Xem gói Premium", onClick: () => navigate("/nang-cap") }} />
  } else {
    content = (
      <div className="space-y-5">
        <section className="space-y-2" aria-label="Bảng xếp hạng dự báo">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">Xếp hạng dự báo</h3>
            <div role="group" aria-label="Kỳ dự báo" className="flex gap-1">
              {HORIZONS.map((value) => <Button key={value} size="xs" variant={horizon === value ? "default" : "outline"} aria-pressed={horizon === value} onClick={() => setHorizon(value)}>T+{value}</Button>)}
            </div>
          </div>
          {ranking.isLoading ? <div className="space-y-2"><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /></div>
            : ranking.isError ? <PanelState title="Không tải được xếp hạng" description={errorMessage(ranking.error)} action={{ label: "Thử lại", onClick: () => void ranking.refetch() }} />
            : !ranking.data?.items.length ? <PanelState title="Chưa có dự báo" description={`Máy chủ chưa có mã nào cho kỳ T+${horizon}. Thử kỳ khác.`} />
            : <div className="space-y-1">
                {ranking.data.items.map((item) => <button key={item.symbol} type="button" aria-pressed={item.symbol === code} onClick={() => onSymbolChange(item.symbol)} className={cn("flex w-full items-center gap-2 rounded border border-border p-2 text-left text-xs hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", item.symbol === code && "border-primary/50 bg-primary/10")}>
                  <span className="w-6 shrink-0 text-muted-foreground tabular-nums">{item.rank}</span>
                  <span className="min-w-0 flex-1 font-semibold">{item.symbol}</span>
                  <span className="tabular-nums">{forecastPercent(item.expectedReturn)}</span>
                </button>)}
              </div>}
          {ranking.data && <p className="text-xs text-muted-foreground">Kỳ {ranking.data.horizon}, {ranking.data.count} mã. Lợi nhuận kỳ vọng tính theo %.</p>}
        </section>

        <section className="space-y-2 border-t border-border pt-4" aria-label="Chi tiết dự báo theo mã">
          <h3 className="text-sm font-semibold">Dự báo {code || "theo mã"}</h3>
          {!code ? <PanelState title="Chưa chọn mã" description="Chọn một mã trong bảng xếp hạng hoặc trên biểu đồ để xem chi tiết." />
            : detail.isLoading ? <div className="space-y-2"><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /></div>
            : detail.isError ? <PanelState title="Không tải được dự báo theo mã" description={errorMessage(detail.error)} action={{ label: "Thử lại", onClick: () => void detail.refetch() }} />
            : !detail.data?.forecasts.some((point) => point.expectedReturn !== null || point.projectedPrice !== null || point.upProbability !== null) ? <PanelState title="Chưa có dự báo cho mã này" description={`Máy chủ chưa có số liệu dự báo cho ${code}. Chọn mã khác trong bảng xếp hạng.`} />
            : <div className="space-y-2">
                {detail.data.forecasts.map((point) => <div key={point.horizonDays} className="rounded border border-border bg-card p-2 text-xs">
                  <p className="mb-2 font-semibold">{point.horizon}</p>
                  <dl className="grid grid-cols-2 gap-x-3 gap-y-1">
                    <dt className="text-muted-foreground">Giá dự kiến</dt><dd className="text-right tabular-nums">{forecastPrice(point.projectedPrice)}</dd>
                    <dt className="text-muted-foreground">Lợi nhuận kỳ vọng</dt><dd className="text-right tabular-nums">{forecastPercent(point.expectedReturn)}</dd>
                    <dt className="text-muted-foreground">Xác suất tăng</dt><dd className="text-right tabular-nums">{forecastPercent(point.upProbability)}</dd>
                  </dl>
                </div>)}
              </div>}
        </section>
      </div>
    )
  }

  return <SidebarPanel title="Dự báo" description="Dữ liệu dự báo từ máy chủ" footer={<p className="flex gap-1.5 text-xs text-muted-foreground"><CircleAlert aria-hidden="true" className="size-3.5 shrink-0" />Dự báo chỉ mang tính tham khảo, không phải khuyến nghị đầu tư.</p>}>{content}</SidebarPanel>
}
