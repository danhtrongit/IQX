/**
 * "Phân tích danh mục" — báo cáo AI thật từ `POST /portfolio-manager/analyze`
 * (premium-gated ở cả hai đầu: UI chặn trước, backend trả 403 nếu không phải
 * premium).
 *
 * Cổng premium ở đây KHÔNG có link nâng cấp: khách chưa đăng nhập được mời đăng
 * nhập, người đã đăng nhập nhưng chưa premium nhận đúng một lời giải thích
 * (tính năng này thuộc gói premium) — không có nút dẫn tới route không tồn tại.
 *
 * Báo cáo render theo cấu trúc thật của payload (điểm tổng, trụ điểm, tổng
 * quan, hiệu suất, phân bổ, rủi ro, đóng góp, chất lượng, hành vi, nhận định
 * của quản lý quỹ, việc cần làm) — không dump JSON. Phần nào backend không trả
 * thì ẩn phần đó; `insufficient_data` hiện lý do thay vì bảng rỗng.
 */
import { useEffect, useState, type ReactNode } from "react"
import { LoaderCircle, Sparkles } from "lucide-react"
import { cn } from "cn"

import { PanelState } from "@/components/layout/panel-state"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Skeleton } from "@/components/ui/skeleton"
import { useAuth } from "@/hooks/use-auth"
import { errorMessage } from "@/lib/api"
import { formatMoney, formatNumber, formatPercent } from "@/lib/format"
import type {
  AnalysisAllocation,
  AnalysisCorrelation,
  PortfolioAnalysisResponse,
} from "./api"
import { useAnalyzePortfolio } from "./hooks"

const PILLAR_LABEL: Record<string, string> = {
  performance: "Hiệu suất",
  risk: "Rủi ro",
  diversification: "Đa dạng hoá",
  quality: "Chất lượng",
  discipline: "Kỷ luật",
}

const LAYER_LABEL: Record<string, string> = {
  overview: "Tổng quan",
  performance: "Hiệu suất",
  allocation: "Phân bổ",
  stress: "Sức chịu đựng",
  risk: "Rủi ro",
  attribution: "Đóng góp",
  quality: "Chất lượng",
  behavior: "Hành vi",
}

const MODE_LABEL: Record<string, string> = {
  first: "báo cáo đầu tiên",
  full_changed: "cập nhật đầy đủ",
  light_unchanged: "cập nhật nhanh",
}

export function PortfolioAnalysisButton() {
  const { isAuthenticated, isPremium, premiumLoading, openAuth } = useAuth()
  const [open, setOpen] = useState(false)

  if (!isAuthenticated) {
    return (
      <Button type="button" variant="outline" size="xs" onClick={() => openAuth()}>
        <Sparkles />
        Phân tích
      </Button>
    )
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="xs"
        disabled={premiumLoading}
        onClick={() => setOpen(true)}
      >
        {premiumLoading ? <LoaderCircle className="animate-spin" /> : <Sparkles />}
        Phân tích
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="grid-rows-[auto_minmax(0,1fr)_auto] sm:max-w-2xl max-h-[88dvh]"
          showCloseButton={false}
        >
          <DialogHeader>
            <DialogTitle>Phân tích danh mục</DialogTitle>
            <DialogDescription>
              Báo cáo do AI tổng hợp từ chính danh mục Sân tập của bạn: điểm tổng,
              phân bổ, rủi ro, đóng góp lợi nhuận và việc cần làm.
            </DialogDescription>
          </DialogHeader>
          {isPremium ? (
            <AnalysisReport />
          ) : (
            <div className="space-y-2 text-sm">
              <p className="font-medium">Tính năng thuộc gói Premium</p>
              <p className="text-muted-foreground">
                Báo cáo phân tích danh mục là một phần của gói Premium. Tài khoản
                hiện tại chưa có quyền truy cập, nên báo cáo không được tạo.
              </p>
              <p className="text-muted-foreground">
                Phần theo dõi, nắm giữ và lịch sử lệnh vẫn dùng đầy đủ trong lúc
                này.
              </p>
            </div>
          )}
          <DialogFooter showCloseButton={false}>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Đóng
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function AnalysisReport() {
  const { report, analyze, isPending, error } = useAnalyzePortfolio()

  useEffect(() => {
    if (!report && !isPending && !error) analyze()
  }, [report, isPending, error, analyze])

  if (isPending) {
    return (
      <div className="space-y-3 py-2">
        <div className="flex items-center gap-2 text-sm">
          <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
          AI đang phân tích danh mục của bạn…
        </div>
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-2">
        <PanelState title="Không tạo được báo cáo" description={errorMessage(error)} />
        <Button type="button" variant="outline" size="xs" onClick={() => analyze()}>
          Thử lại
        </Button>
      </div>
    )
  }

  if (!report) {
    return <p className="py-4 text-sm text-muted-foreground">Chưa có báo cáo.</p>
  }

  return <ReportBody report={report} />
}

function ReportBody({ report }: { report: PortfolioAnalysisResponse }) {
  const { analysis, narrative, meta } = report

  if (analysis.insufficient_data) {
    return (
      <PanelState
        title="Chưa đủ dữ liệu để phân tích"
        description={analysis.reason ?? "Danh mục cần thêm vị thế hoặc lịch sử giao dịch."}
      />
    )
  }

  const overview = analysis.overview
  const performance = analysis.performance
  const scores = analysis.scores
  const pillars = scores?.pillars
    ? Object.entries(scores.pillars).filter((entry): entry is [string, number] => entry[1] != null)
    : []
  const drawdown = performance?.max_drawdown

  return (
    <ScrollArea className="min-h-0 pr-2">
      <div className="space-y-5 pb-2">
        <header className="space-y-1.5">
          <h3 className="font-heading text-base font-semibold">
            {narrative?.title ?? "Báo cáo danh mục"}
          </h3>
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
            {analysis.meta?.period && <span>{analysis.meta.period}</span>}
            {analysis.meta?.date && <span>{analysis.meta.date}</span>}
            {analysis.meta?.mode && <span>{MODE_LABEL[analysis.meta.mode] ?? analysis.meta.mode}</span>}
            {meta.cached && (
              <Badge variant="outline" className="h-4 px-1 text-[10px] font-medium">
                Bản trong ngày
              </Badge>
            )}
          </div>
          {narrative?.verdict && <p className="text-sm font-medium">{narrative.verdict}</p>}
          {narrative?.lede && <p className="text-sm text-muted-foreground">{narrative.lede}</p>}
          {narrative?.low_data_note && (
            <p className="text-[11px] text-price-ref">{narrative.low_data_note}</p>
          )}
        </header>

        {scores && (
          <Section title="Điểm tổng">
            <div className="flex items-baseline gap-2">
              <span className="font-heading text-2xl font-bold tabular-nums">
                {formatNumber(scores.overall)}
              </span>
              <span className="text-[11px] text-muted-foreground">/ 5</span>
              {scores.prev_overall != null && (
                <span className="text-[11px] text-muted-foreground">
                  kỳ trước {formatNumber(scores.prev_overall)}
                </span>
              )}
            </div>
            {pillars.length > 0 && (
              <div className="mt-2 space-y-1.5">
                {pillars.map(([key, value]) => (
                  <Bar key={key} label={PILLAR_LABEL[key] ?? key} percent={value} />
                ))}
              </div>
            )}
          </Section>
        )}

        {overview && (
          <Section title="Tổng quan">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <Stat label="NAV" value={formatMoney(overview.nav)} />
              <Stat label="Số vị thế" value={formatNumber(overview.n_positions)} />
              <Stat label="Tiền mặt" value={fraction(overview.cash_pct)} />
              <Stat
                label="Lợi nhuận tổng"
                value={signedFraction(overview.total_return)}
                tone={overview.total_return}
              />
              <Stat
                label="Lãi/Lỗ"
                value={formatMoney(overview.total_pnl)}
                tone={overview.total_pnl}
              />
              <Stat label="Thời gian nắm giữ" value={`${formatNumber(overview.holding_months)} tháng`} />
            </div>
            {(overview.positions?.length ?? 0) > 0 && (
              <div className="mt-2 overflow-hidden rounded-sm border border-border">
                <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_3rem_4rem] gap-2 border-b border-border bg-muted/40 px-2 py-1 text-[10px] text-muted-foreground">
                  <span>Mã</span>
                  <span>Ngành</span>
                  <span className="text-right">Tỷ trọng</span>
                  <span className="text-right">Lãi/Lỗ</span>
                </div>
                {overview.positions?.map((position) => (
                  <div
                    key={position.ticker ?? `${position.sector}-${position.weight}`}
                    className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_3rem_4rem] gap-2 px-2 py-1 text-[11px] tabular-nums"
                  >
                    <span className="truncate font-semibold">
                      {position.ticker ?? "—"}
                      {position.low_confidence && (
                        <span className="ml-1 text-[10px] font-normal text-price-ref">?</span>
                      )}
                    </span>
                    <span className="truncate text-muted-foreground">{position.sector ?? "—"}</span>
                    <span className="text-right">{fraction(position.weight)}</span>
                    <span className={cn("text-right", toneClass(position.pnl))}>
                      {formatMoney(position.pnl)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Section>
        )}

        {performance && (
          <Section title="Hiệu suất">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat
                label="Danh mục"
                value={signedFraction(performance.portfolio_return)}
                tone={performance.portfolio_return}
              />
              <Stat label="Tham chiếu" value={signedFraction(performance.benchmark_return)} />
              <Stat
                label="Chênh lệch"
                value={signedFraction(performance.excess_return)}
                tone={performance.excess_return}
              />
              <Stat label="Sụt giảm tối đa" value={signedFraction(drawdown)} tone={-1} />
            </div>
            {performance.method && (
              <p className="mt-2 text-[11px] text-muted-foreground">{performance.method}</p>
            )}
          </Section>
        )}

        {(analysis.allocation?.length ?? 0) > 0 && (
          <Section title="Phân bổ theo ngành">
            <div className="space-y-1.5">
              {analysis.allocation?.map((row: AnalysisAllocation) => (
                <div key={row.sector ?? String(row.weight)} className="space-y-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="truncate">{row.sector ?? "—"}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {fraction(row.weight)} · tham chiếu {fraction(row.benchmark)}
                      {row.active != null && (
                        <span className={cn("ml-1", toneClass(row.active))}>
                          ({signedFraction(row.active)})
                        </span>
                      )}
                    </span>
                  </div>
                  <Bar label="" percent={(row.weight ?? 0) * 100} />
                </div>
              ))}
            </div>
          </Section>
        )}

        {analysis.risk && (
          <Section title="Rủi ro">
            <div className="grid grid-cols-3 gap-2">
              <Stat label="Beta" value={formatNumber(analysis.risk.beta)} />
              <Stat label="Biến động" value={fraction(analysis.risk.volatility)} />
              <Stat label="Tracking error" value={fraction(analysis.risk.tracking_error)} />
            </div>
            {(analysis.risk.correlation?.length ?? 0) > 0 && (
              <div className="mt-2 space-y-0.5">
                <p className="text-[11px] font-medium">Tương quan</p>
                {topCorrelations(analysis.risk.correlation ?? []).map((pair) => (
                  <p key={`${pair.a}-${pair.b}`} className="text-[11px] tabular-nums text-muted-foreground">
                    {pair.a} · {pair.b} · {formatNumber(pair.value)}
                  </p>
                ))}
              </div>
            )}
            {(analysis.risk.excluded?.length ?? 0) > 0 && (
              <div className="mt-2 space-y-0.5">
                <p className="text-[11px] font-medium">Loại khỏi phân tích</p>
                {analysis.risk.excluded?.map((item) => (
                  <p key={item.ticker} className="text-[11px] text-muted-foreground">
                    {item.ticker} — {item.reason}
                  </p>
                ))}
              </div>
            )}
          </Section>
        )}

        {(analysis.attribution?.length ?? 0) > 0 && (
          <Section title="Đóng góp lợi nhuận">
            <div className="space-y-0.5">
              {analysis.attribution?.map((row) => (
                <div key={row.ticker} className="flex items-center justify-between text-[11px] tabular-nums">
                  <span className="font-semibold">{row.ticker}</span>
                  <span className={toneClass(row.pnl)}>
                    {formatMoney(row.pnl)}
                    {row.pct != null && ` · ${fraction(row.pct)}`}
                  </span>
                </div>
              ))}
            </div>
          </Section>
        )}

        {analysis.quality && (
          <Section title="Chất lượng danh mục">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat label="P/E" value={formatNumber(analysis.quality.pe)} />
              <Stat label="P/B" value={formatNumber(analysis.quality.pb)} />
              <Stat label="ROE" value={fraction(analysis.quality.roe)} />
              <Stat label="Cổ tức" value={fraction(analysis.quality.dividend)} />
            </div>
            {analysis.quality.sector_benchmark && (
              <p className="mt-2 text-[11px] text-muted-foreground">
                Ngành {analysis.quality.sector_benchmark.sector}: danh mục{" "}
                {signedFraction(analysis.quality.sector_benchmark.your_return)}, ngành{" "}
                {signedFraction(analysis.quality.sector_benchmark.industry_return)} (
                <span className={toneClass(analysis.quality.sector_benchmark.gap)}>
                  {signedFraction(analysis.quality.sector_benchmark.gap)}
                </span>
                )
              </p>
            )}
          </Section>
        )}

        {analysis.behavior && (
          <Section title="Hành vi giao dịch">
            <div className="grid grid-cols-3 gap-2">
              <Stat label="Số ngày giữ (TB)" value={formatNumber(analysis.behavior.avg_holding_days)} />
              <Stat label="Vị thế đang lỗ" value={formatNumber(analysis.behavior.losing_count)} />
              <Stat
                label="Hiệu ứng bán lỗ"
                value={
                  analysis.behavior.disposition_flag == null
                    ? "—"
                    : analysis.behavior.disposition_flag
                      ? "Có dấu hiệu"
                      : "Không"
                }
                tone={analysis.behavior.disposition_flag == null ? null : analysis.behavior.disposition_flag ? -1 : 1}
              />
            </div>
            {analysis.behavior.worst_loser && (
              <p className="mt-2 text-[11px] text-muted-foreground">
                Lỗ nặng nhất: {analysis.behavior.worst_loser.ticker} ·{" "}
                {signedFraction(analysis.behavior.worst_loser.pnl_pct)} ·{" "}
                {formatNumber(analysis.behavior.worst_loser.periods_held)} phiên
              </p>
            )}
          </Section>
        )}

        {narrative?.layers && Object.keys(narrative.layers).length > 0 && (
          <Section title="Nhận định của quản lý quỹ">
            <div className="space-y-2">
              {Object.entries(narrative.layers).map(([key, text]) =>
                text ? (
                  <div key={key} className="space-y-0.5">
                    <p className="text-[11px] font-semibold">{LAYER_LABEL[key] ?? key}</p>
                    <p className="text-[11px] leading-relaxed text-muted-foreground">{text}</p>
                  </div>
                ) : null,
              )}
            </div>
          </Section>
        )}

        {narrative?.insight && (
          <Section title={narrative.insight.label ?? "Điểm đáng chú ý"}>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              {narrative.insight.text}
            </p>
          </Section>
        )}

        {(narrative?.actions?.length ?? 0) > 0 && (
          <Section title="Việc cần làm">
            <ol className="space-y-1.5">
              {narrative?.actions?.map((action, index) => (
                <li key={action.title ?? index} className="flex gap-2 text-[11px]">
                  <span className="flex size-4 shrink-0 items-center justify-center rounded-sm bg-muted text-[9px] font-bold tabular-nums">
                    {index + 1}
                  </span>
                  <span>
                    <b className="font-semibold">{action.title}</b>
                    {action.detail && (
                      <span className="text-muted-foreground"> — {action.detail}</span>
                    )}
                  </span>
                </li>
              ))}
            </ol>
          </Section>
        )}

        {(analysis.progress?.prev_actions?.length ?? 0) > 0 && (
          <Section title="So với kỳ trước">
            <div className="space-y-1">
              {analysis.progress?.prev_actions?.map((action) => (
                <p key={action.id ?? action.detail} className="text-[11px]">
                  <span
                    className={cn(
                      "mr-1 font-semibold",
                      action.done ? "text-price-up" : "text-price-ref",
                    )}
                  >
                    {action.done ? "Đã làm" : "Chưa làm"}
                  </span>
                  <span className="text-muted-foreground">{action.detail}</span>
                </p>
              ))}
            </div>
            {narrative?.progress_text && (
              <p className="mt-2 text-[11px] text-muted-foreground">{narrative.progress_text}</p>
            )}
          </Section>
        )}

        {(narrative?.watch || narrative?.closing) && (
          <Section title="Theo dõi tiếp">
            {Array.isArray(narrative.watch) && narrative.watch.filter((item): item is string => typeof item === "string").length > 0 && (
              <ul className="list-disc space-y-1 pl-4 text-[11px] leading-relaxed text-muted-foreground">
                {narrative.watch.filter((item): item is string => typeof item === "string").map((item) => <li key={item}>{item}</li>)}
              </ul>
            )}
            {narrative.closing && (
              <p className="mt-2 text-[11px] leading-relaxed">{narrative.closing}</p>
            )}
          </Section>
        )}
      </div>
    </ScrollArea>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h4 className="font-heading text-xs font-bold tracking-wide uppercase">{title}</h4>
      {children}
    </section>
  )
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: number | null }) {
  return (
    <div className="rounded-sm border border-border bg-card/40 px-2 py-1.5">
      <p className="truncate text-[10px] text-muted-foreground">{label}</p>
      <p className={cn("mt-0.5 truncate text-[11px] font-semibold tabular-nums", toneClass(tone))}>
        {value}
      </p>
    </div>
  )
}

function Bar({ label, percent }: { label: string; percent: number }) {
  const width = Math.max(0, Math.min(100, percent))
  return (
    <div className="flex items-center gap-2">
      {label && <span className="w-24 shrink-0 truncate text-[11px]">{label}</span>}
      <span className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted-foreground/20">
        <span className="block h-full rounded-full bg-primary" style={{ width: `${width}%` }} />
      </span>
      <span className="w-10 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
        {formatNumber(percent)}
      </span>
    </div>
  )
}

function toneClass(value: number | null | undefined): string {
  if (value == null || value === 0) return ""
  return value > 0 ? "text-price-up" : "text-price-down"
}

/** Backend trả tỷ lệ dạng phân số (0.234 = 23,4%) — `formatPercent` chỉ thêm ký hiệu. */
function fraction(value: number | null | undefined): string {
  return value == null ? "—" : `${formatNumber(value * 100)}%`
}

/** Như `fraction` nhưng giữ dấu +/- — dùng cho lợi nhuận và chênh lệch. */
function signedFraction(value: number | null | undefined): string {
  return value == null ? "—" : formatPercent(value * 100)
}

/** 3 cặp tương quan mạnh nhất — heatmap đầy đủ không vừa panel 400px. */
function topCorrelations(pairs: AnalysisCorrelation[]): AnalysisCorrelation[] {
  return [...pairs]
    .sort((a, b) => Math.abs(b.value ?? 0) - Math.abs(a.value ?? 0))
    .slice(0, 3)
}
