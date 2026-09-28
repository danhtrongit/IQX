import { ArrowRight } from "lucide-react"
import { Link } from "react-router"

import { Button } from "@/components/ui/button"

import { HERO, LINKS, METRICS } from "../content"
import { Container, Section } from "../ui"

function ChartPreview() {
  return <figure className="overflow-hidden rounded-lg border border-border bg-background">
    <Link to="/co-phieu/VNM" className="block focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring">
      <img src="/brand/iqx-chart-vnm.webp" alt="Biểu đồ nến và khối lượng VNM trên IQX, từ tháng 4 đến tháng 9 năm 2026" width={1200} height={924} fetchPriority="high" className="h-auto w-full" />
    </Link>
    <figcaption className="flex items-center justify-between gap-3 border-t border-border px-4 py-3 text-xs text-muted-foreground">
      <span>Giao diện IQX · Biểu đồ VNM</span>
      <span>Ảnh chụp 22/09/2026</span>
    </figcaption>
  </figure>
}

export function Hero({ isAuthenticated, onSignUp }: { isAuthenticated: boolean; onSignUp: () => void }) {
  function scrollToAnalysis() {
    const target = document.getElementById("phan-tich")
    if (!target) return
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    target.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" })
  }

  return (
    <Section className="border-t-0 bg-card">
      <Container className="grid gap-10 py-10 sm:py-12 lg:grid-cols-[minmax(0,1.02fr)_minmax(0,1fr)] lg:items-center lg:gap-14 lg:py-14">
        <div className="min-w-0">
          <p className="text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">{HERO.eyebrow}</p>
          <h1 className="mt-4 text-3xl leading-[1.12] font-bold tracking-tight text-balance sm:text-4xl lg:text-5xl">
            {HERO.title}
          </h1>
          <p className="mt-4 max-w-xl text-sm leading-6 text-muted-foreground sm:text-base sm:leading-7">{HERO.lead}</p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            {isAuthenticated ? (
              <Button asChild size="lg" className="h-10 px-4">
                <Link to={LINKS.demo}>
                  {HERO.primaryCtaMember}
                  <ArrowRight aria-hidden="true" />
                </Link>
              </Button>
            ) : (
              <Button size="lg" className="h-10 px-4" onClick={onSignUp}>
                {HERO.primaryCta}
                <ArrowRight aria-hidden="true" />
              </Button>
            )}
            <Button variant="outline" size="lg" className="h-10 px-4" onClick={scrollToAnalysis}>
              {HERO.secondaryCta}
            </Button>
          </div>
        </div>
        <div className="min-w-0">
          <ChartPreview />
        </div>
      </Container>

      <div className="border-t border-border bg-muted/30">
        <Container className="grid grid-cols-2 gap-x-6 gap-y-6 py-6 sm:grid-cols-3 lg:grid-cols-6">
          {METRICS.map((metric) => (
            <div key={metric.label}>
              <p className="font-heading text-2xl leading-none font-bold tabular-nums">
                {metric.value}
                {metric.unit && <span className="ml-1 text-sm font-semibold text-muted-foreground">{metric.unit}</span>}
              </p>
              <p className="mt-1.5 text-xs leading-5 text-muted-foreground">{metric.label}</p>
            </div>
          ))}
        </Container>
      </div>
    </Section>
  )
}
