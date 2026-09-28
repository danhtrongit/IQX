import { ArrowRight, Check } from "lucide-react"
import { Link } from "react-router"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

import { CLOSING, CLOSING_LINKS, HERO, LINKS, PRICING_NOTE, TIERS } from "../content"
import { Caption, Container, Panel, Section, SectionHead } from "../ui"

export function Premium({ isAuthenticated, onSignUp }: { isAuthenticated: boolean; onSignUp: () => void }) {
  return (
    <Section id="bang-gia" className="bg-background">
      <Container className="py-12 sm:py-16">
        <SectionHead
          title="Miễn phí để bắt đầu."
          lead="Tài khoản mới được tặng 7 ngày Premium ngay khi đăng ký, không cần thanh toán. Hết thời gian dùng thử, tài khoản trở về gói Miễn phí và bạn nâng cấp bất cứ lúc nào."
        />

        <div className="mt-8 grid gap-5 lg:grid-cols-2">
          {TIERS.map((tier) => (
            <Panel
              key={tier.name}
              className={cn("flex flex-col", tier.highlight && "border-accent/50 bg-accent/5")}
            >
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="font-heading text-lg font-bold">{tier.name}</h3>
                <span className="text-right">
                  <span className="font-heading text-xl font-bold tabular-nums">{tier.price}</span>
                  <span className="ml-1 text-xs text-muted-foreground">{tier.period}</span>
                </span>
              </div>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{tier.note}</p>

              <ul className="mt-5 flex-1 space-y-2.5">
                {tier.features.map((feature) => (
                  <li key={feature} className="flex gap-2.5 text-sm leading-6">
                    <Check className="mt-1 size-4 shrink-0 text-primary" aria-hidden="true" />
                    <span className="text-muted-foreground">{feature}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-6">
                {tier.highlight ? (
                  <Button asChild variant="gold" size="lg" className="h-10 w-full px-4">
                    <Link to={LINKS.premium}>
                      Xem các gói Premium
                      <ArrowRight aria-hidden="true" />
                    </Link>
                  </Button>
                ) : isAuthenticated ? (
                  <Button asChild variant="outline" size="lg" className="h-10 w-full px-4">
                    <Link to={LINKS.market}>Xem thị trường</Link>
                  </Button>
                ) : (
                  <Button size="lg" className="h-10 w-full px-4" onClick={onSignUp}>
                    {HERO.primaryCta}
                  </Button>
                )}
              </div>
            </Panel>
          ))}
        </div>

        <Caption className="mt-4">{PRICING_NOTE}</Caption>
      </Container>
    </Section>
  )
}

export function Closing({ isAuthenticated, onSignUp }: { isAuthenticated: boolean; onSignUp: () => void }) {
  return (
    <Section id="bat-dau" className="bg-card">
      <Container className="py-12 sm:py-16">
        <div className="max-w-2xl">
          <h2 className="text-2xl font-bold tracking-tight text-balance sm:text-3xl">{CLOSING.title}</h2>
          <p className="mt-3 text-sm leading-6 text-muted-foreground sm:text-base sm:leading-7">{CLOSING.lead}</p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
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
          </div>
        </div>

        <nav aria-label="Đi tới các khu vực chính" className="mt-10 grid gap-4 border-t border-border pt-8 sm:grid-cols-2 lg:grid-cols-4">
          {CLOSING_LINKS.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className="group rounded-lg border border-border bg-background p-4 transition-colors duration-150 hover:border-primary/40 hover:bg-muted/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <span className="flex items-center gap-1.5 text-sm font-semibold">
                {link.label}
                <ArrowRight
                  aria-hidden="true"
                  className="size-3.5 text-muted-foreground transition-transform duration-150 group-hover:translate-x-0.5"
                />
              </span>
              <span className="mt-1 block text-xs leading-5 text-muted-foreground">{link.description}</span>
            </Link>
          ))}
        </nav>

        <p className="mt-8 max-w-3xl text-xs leading-5 text-muted-foreground">{CLOSING.note}</p>
      </Container>
    </Section>
  )
}
