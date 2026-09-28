import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"

import { AI_LAYERS, SAMPLE_ANALYSES } from "../content"
import { Caption, Container, Panel, Section, SectionHead, toneText } from "../ui"

function SamplePanel({ ticker }: { ticker: string }) {
  const sample = SAMPLE_ANALYSES.find((item) => item.ticker === ticker)
  if (!sample) return null

  return (
    <Panel className="p-0 sm:p-0">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div className="flex items-baseline gap-2">
          <span className="font-heading text-base font-bold">{sample.ticker}</span>
          <span className="text-xs text-muted-foreground">{sample.sector}</span>
        </div>
        <span className={cn("text-sm font-semibold", toneText(sample.conclusionTone))}>{sample.conclusion}</span>
      </div>

      <ul className="divide-y divide-border">
        {sample.layers.map((layer) => (
          <li
            key={layer.id}
            className={cn("grid gap-1 px-4 py-3 sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-4", layer.id === "L6" && "bg-muted/40")}
          >
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-xs text-muted-foreground">{layer.id}</span>
              <span className="text-sm font-semibold">
                {AI_LAYERS.find((def) => def.id === layer.id)?.name ?? layer.id}
              </span>
            </div>
            <div className="min-w-0">
              <p className={cn("text-sm font-medium", toneText(layer.tone))}>{layer.verdict}</p>
              <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{layer.note}</p>
            </div>
          </li>
        ))}
      </ul>

      <p className="border-t border-border px-4 py-3 text-sm leading-6 text-muted-foreground">{sample.brief}</p>
    </Panel>
  )
}

export function AiAnalysis() {
  return (
    <Section id="phan-tich" className="bg-background">
      <Container className="py-12 sm:py-16">
        <SectionHead
          title="Mỗi mã, một bản phân tích sáu lớp."
          lead="Từng lớp đọc một nguồn dữ liệu riêng, rồi lớp tổng hợp viết lại thành một bản briefing tiếng Việt để bạn đọc trong khoảng một phút."
        />

        <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-12">
          <ul className="space-y-5">
            {AI_LAYERS.map((layer) => (
              <li key={layer.id} className="flex gap-3">
                <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-sm bg-muted">
                  <layer.Icon className="size-4 text-muted-foreground" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold">
                    <span className="font-mono text-xs text-muted-foreground">{layer.id}</span> {layer.name}
                  </p>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">{layer.reads}</p>
                </div>
              </li>
            ))}
          </ul>

          <div className="min-w-0">
            <Tabs defaultValue={SAMPLE_ANALYSES[0].ticker} className="gap-3">
              <TabsList>
                {SAMPLE_ANALYSES.map((sample) => (
                  <TabsTrigger key={sample.ticker} value={sample.ticker} className="px-3">
                    {sample.ticker}
                  </TabsTrigger>
                ))}
              </TabsList>
              {SAMPLE_ANALYSES.map((sample) => (
                <TabsContent key={sample.ticker} value={sample.ticker}>
                  <SamplePanel ticker={sample.ticker} />
                </TabsContent>
              ))}
            </Tabs>
            <Caption className="mt-3">
              Ví dụ minh hoạ · phiên 19/06/2026. Trong ứng dụng, mỗi mã được phân tích lại theo dữ liệu của phiên gần
              nhất, kèm phần so sánh với lần phân tích trước.
            </Caption>
          </div>
        </div>
      </Container>
    </Section>
  )
}
