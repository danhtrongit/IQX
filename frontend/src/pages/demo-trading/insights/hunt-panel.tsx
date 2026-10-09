/**
 * «Săn mã» tool panel: the five hunt groups and the entry point to the watch
 * list. The group results and the Theo dõi checkboxes live in the main area
 * (`HuntMain`); the selected group travels in the `hunt` URL param.
 *
 * Săn mã is independent of the Bot: ticking Theo dõi only saves a mã to the
 * watch list, and "Đặt lệnh" only pre-fills the manual order form.
 */
import { ArrowRight, Eye, LogIn } from "lucide-react"
import { useSearchParams } from "react-router"

import { SidebarPanel } from "@/components/layout/sidebar-panel"
import { useWorkspaceFrame } from "@/components/layout/workspace-frame-context"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/hooks/use-auth"
import { cn } from "@/lib/utils"
import { rememberPortfolioTab } from "../portfolio/tab-state"
import { useWatchlist } from "../portfolio/hooks"
import { HUNT_FILTERS, formatInt } from "./copy"
import { huntFilterAvailability, splitLocSan } from "./derive"
import { HUNT_PARAM, parseHuntFilter, withHuntFilter } from "./hunt-url"
import { useSanMaIndex } from "./hooks"
import { ErrorLine, HintLine, NoteLine, SectionCard } from "./ui"

export function HuntPanel({
  onNavigate,
}: {
  onNavigate: (panel: string, symbol?: string) => void
}) {
  const { isAuthenticated, isLoading, openAuth } = useAuth()
  const frame = useWorkspaceFrame()
  const [params, setParams] = useSearchParams()
  const selected = parseHuntFilter(params.get(HUNT_PARAM))
  const index = useSanMaIndex()
  const watchlist = useWatchlist()
  const indexLocSan = index.data ? splitLocSan(index.data.loc_san) : null
  const watchCount = watchlist.data ? formatInt(watchlist.data.length) : "-"

  if (!isLoading && !isAuthenticated) {
    return (
      <SidebarPanel title="Săn mã" description="Theo dõi độc lập với Bot">
        <div className="flex flex-col items-center gap-3 px-4 py-16 text-center">
          <Eye className="size-6 text-muted-foreground/60" aria-hidden="true" />
          <p className="text-xs text-muted-foreground">
            Đăng nhập để xem kết quả năm bộ lọc Săn mã và lưu mã vào danh mục theo dõi.
          </p>
          <Button type="button" size="sm" onClick={() => openAuth()}>
            <LogIn />
            Đăng nhập
          </Button>
        </div>
      </SidebarPanel>
    )
  }

  return (
    <SidebarPanel title="Săn mã" description="Theo dõi độc lập với Bot">
      <SectionCard title="Năm nhóm săn mã">
        {index.isError && (
          <ErrorLine text="Chưa lấy được tình trạng bộ lọc từ máy chủ." onRetry={() => void index.refetch()} />
        )}
        {indexLocSan && (
          <div className="space-y-0.5">
            <HintLine>
              {indexLocSan.apDung.length > 0
                ? `Đã lọc sàn: ${indexLocSan.apDung.join(" · ")}`
                : "Máy chủ chưa cho biết điều kiện lọc sàn nào đã được áp dụng."}
            </HintLine>
            {indexLocSan.chuaApDung.length > 0 && (
              <NoteLine tone="warn">{`Chưa lọc được: ${indexLocSan.chuaApDung.join(" · ")} - máy chủ chưa có dữ liệu.`}</NoteLine>
            )}
          </div>
        )}
        <div className="space-y-1.5" role="group" aria-label="Nhóm săn mã">
          {HUNT_FILTERS.map((item) => {
            const availability = huntFilterAvailability(index.data, item.ma)
            const unavailable = availability.kha_dung === false
            const Icon = item.Icon
            return (
              <button
                key={item.ma}
                type="button"
                aria-pressed={selected === item.ma}
                onClick={() => {
                  setParams(withHuntFilter(params, item.ma), { replace: true })
                  // The results live in the main area: on small screens get the layer out of the way.
                  if (frame?.overlay) frame.setOpen(false)
                }}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md border border-border bg-background/40 px-2 py-2 text-left transition-colors hover:border-primary/45 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none",
                  selected === item.ma && "border-primary/60 bg-muted",
                  unavailable && "opacity-70"
                )}
              >
                <Icon className="size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-medium">{item.ten}</span>
                  <span className="block text-xs text-muted-foreground">{item.dieu_kien}</span>
                  {unavailable && (
                    <span className="block text-xs text-price-ref">
                      {availability.ly_do ?? "Chưa đủ dữ liệu để chạy bộ lọc này"}
                    </span>
                  )}
                </span>
                <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
              </button>
            )
          })}
        </div>
      </SectionCard>

      <SectionCard title="Danh mục theo dõi">
        <p className="font-heading text-sm font-bold">{watchCount} mã</p>
        <HintLine>Danh sách quan sát riêng của bạn, không thay danh mục mua mới của Bot.</HintLine>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-fit"
          onClick={() => {
            rememberPortfolioTab("watchlist")
            onNavigate("portfolio")
          }}
        >
          Xem danh sách
          <ArrowRight aria-hidden="true" />
        </Button>
      </SectionCard>
    </SidebarPanel>
  )
}
