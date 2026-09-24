import { BellRing, Check, Send } from "lucide-react"
import { Link } from "react-router"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

import { ALERT_FACTS, ALERT_SAMPLE, BACKTEST, BRIEFING, LINKS } from "../content"
import { Caption, Container, FlowBars, LineChart, Panel, Section, SectionHead, toneText } from "../ui"

export function MarketBriefing() {
  return (
    <Section id="thi-truong" className="bg-muted/30">
      <Container className="py-12 sm:py-16">
        <SectionHead
          title="Ba bản nhận định mỗi phiên."
          lead="Bản trước phiên lúc 07:15, bản giữa phiên lúc 11:30 và bản tổng kết sau ATC lúc 16:30, từ thứ Hai đến thứ Sáu. Mỗi bản có chỉ số, độ rộng, dòng tiền và kịch bản cho phiên kế tiếp."
        />

        <Panel className="mt-8 p-0 sm:p-0">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
            <span className="font-mono text-xs text-muted-foreground">{BRIEFING.session}</span>
            <span className="text-xs font-semibold text-muted-foreground">Tổng kết sau ATC</span>
          </div>

          <div className="grid gap-8 p-4 sm:p-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:gap-10">
            <div className="min-w-0">
              <h3 className="font-heading text-lg leading-snug font-bold text-balance sm:text-xl">
                {BRIEFING.headline}
              </h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{BRIEFING.sub}</p>
              <p className="mt-4 text-sm leading-6">{BRIEFING.read}</p>

              <h4 className="mt-6 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                Kịch bản phiên sau
              </h4>
              <ul className="mt-3 space-y-2">
                {BRIEFING.scenarios.map((scenario) => (
                  <li key={scenario.condition} className="rounded-lg border border-border bg-background px-3 py-2.5">
                    <p className="text-xs leading-5 text-muted-foreground">{scenario.condition}</p>
                    <p className={cn("mt-0.5 text-sm font-medium", toneText(scenario.tone))}>{scenario.outcome}</p>
                  </li>
                ))}
              </ul>
            </div>

            <div className="min-w-0 space-y-5">
              <dl className="grid grid-cols-2 gap-x-4 gap-y-4">
                {BRIEFING.pulse.map((item) => (
                  <div key={item.label} className="min-w-0">
                    <dt className="text-xs text-muted-foreground">{item.label}</dt>
                    <dd className={cn("mt-1 font-heading text-base font-bold tabular-nums", toneText(item.tone))}>
                      {item.value}
                    </dd>
                    <dd className="mt-0.5 text-xs leading-5 text-muted-foreground">{item.delta}</dd>
                  </div>
                ))}
              </dl>

              <div className="rounded-lg border border-border bg-background p-3">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-xs font-semibold">Khối ngoại 15 phiên</span>
                  <span className="text-xs text-muted-foreground">tỷ đồng</span>
                </div>
                <FlowBars values={BRIEFING.foreign} className="mt-3 h-20" />
                <div className="mt-1 flex justify-between text-[11px] text-muted-foreground">
                  <span>Phiên cũ nhất</span>
                  <span>Phiên minh hoạ</span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3 sm:px-5">
            <Caption className="max-w-xl">{BRIEFING.caption}</Caption>
            <Button asChild variant="outline" size="sm">
              <Link to={LINKS.market}>Xem thị trường</Link>
            </Button>
          </div>
        </Panel>
      </Container>
    </Section>
  )
}

export function StrategyLab() {
  return (
    <Section id="chien-luoc" className="bg-background">
      <Container className="py-12 sm:py-16">
        <SectionHead
          title="Kiểm chứng chiến lược trước khi bỏ tiền thật."
          lead="Strategy Lab chạy mô phỏng có T+2, cắt lỗ và chốt lời, rồi trả về Sharpe kèm khoảng tin cậy 95%, mức sụt giảm lớn nhất và so sánh với VN-Index."
        />

        <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:gap-12">
          <div className="min-w-0">
            <Panel>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="font-heading text-base font-bold">Vốn theo chiến lược so với VN-Index</h3>
                <span className="text-xs text-muted-foreground">base 100</span>
              </div>
              <div className="mt-5">
                <LineChart
                  series={[
                    { points: BACKTEST.strategy, stroke: "stroke-primary", swatch: "bg-primary", label: "Chiến lược" },
                    {
                      points: BACKTEST.index,
                      stroke: "stroke-muted-foreground",
                      swatch: "bg-muted-foreground",
                      label: "VN-Index",
                    },
                  ]}
                />
              </div>
            </Panel>

            <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {BACKTEST.kpis.map((kpi) => (
                <div key={kpi.label} className="rounded-lg border border-border bg-card px-3 py-2.5">
                  <dt className="text-xs leading-4 text-muted-foreground">{kpi.label}</dt>
                  <dd className={cn("mt-1 font-heading text-lg font-bold tabular-nums", toneText(kpi.tone))}>
                    {kpi.value}
                  </dd>
                </div>
              ))}
            </dl>
            <Caption className="mt-3">{BACKTEST.caption}</Caption>
          </div>

          <div className="min-w-0">
            <Panel className="h-full">
              <div className="flex items-center gap-2">
                <BellRing className="size-4 text-primary" aria-hidden="true" />
                <h3 className="font-heading text-base font-bold">Cảnh báo qua Telegram</h3>
              </div>

              <div className="mt-4 rounded-lg border border-border bg-background p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-primary">
                    <Send className="size-3.5" aria-hidden="true" />
                    Tín hiệu
                  </span>
                  <span className="font-mono text-xs text-muted-foreground">{ALERT_SAMPLE.time}</span>
                </div>
                <p className="mt-2 text-sm font-semibold">
                  {ALERT_SAMPLE.ticker} · {ALERT_SAMPLE.signal}
                </p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">{ALERT_SAMPLE.detail}</p>
              </div>

              <ul className="mt-4 space-y-3">
                {ALERT_FACTS.map((fact) => (
                  <li key={fact} className="flex gap-2.5 text-sm leading-6 text-muted-foreground">
                    <Check className="mt-1 size-4 shrink-0 text-primary" aria-hidden="true" />
                    {fact}
                  </li>
                ))}
              </ul>

              <Caption className="mt-4">Ví dụ minh hoạ về nội dung một tín hiệu đã gửi.</Caption>
            </Panel>
          </div>
        </div>
      </Container>
    </Section>
  )
}
