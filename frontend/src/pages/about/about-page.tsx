import { useEffect } from "react"
import { Link } from "react-router"
import { ScrollArea } from "@/components/ui/scroll-area"
import "../introduction/landing.css"
import {
  ABOUT_INTRO,
  ABOUT_SEO,
  AI_COPY,
  COMPANY,
  COMPANY_FACTS,
  DISCLAIMER_EN,
  LEGAL_LINE_EN,
  PRODUCTS,
  TEAM_COPY,
} from "./about-content"

function Section({
  id,
  title,
  children,
}: {
  id: string
  title: string
  children: React.ReactNode
}) {
  return (
    <section
      aria-labelledby={id}
      className="intro-section intro-section-heading"
    >
      <h2 id={id}>{title}</h2>
      {children}
    </section>
  )
}

export function AboutPage() {
  useEffect(() => {
    const previousTitle = document.title
    const previousMeta = document.querySelector<HTMLMetaElement>(
      'meta[name="description"]'
    )
    const previousDescription = previousMeta?.getAttribute("content") ?? null
    const meta = previousMeta ?? document.createElement("meta")
    if (!previousMeta) {
      meta.name = "description"
      document.head.appendChild(meta)
    }
    document.title = ABOUT_SEO.title
    meta.content = ABOUT_SEO.description
    return () => {
      document.title = previousTitle
      if (!previousMeta) meta.remove()
      else if (previousDescription === null) meta.removeAttribute("content")
      else meta.content = previousDescription
    }
  }, [])

  return (
    <main
      lang="en"
      aria-label="About IQX"
      className="flex min-h-0 min-w-0 flex-1 flex-col"
    >
      <ScrollArea className="min-h-0 flex-1" viewportClassName="intro-scroll">
        <div className="intro-page">
          <div className="intro-container max-w-3xl pt-10 pb-8 sm:pt-14">
            <p className="intro-eyebrow">IQX · {COMPANY.shortName}</p>
            <h1 className="mt-2 text-3xl leading-tight font-bold tracking-tight sm:text-4xl">
              About IQX
            </h1>
            <p className="mt-4 text-base leading-relaxed text-muted-foreground">
              {ABOUT_INTRO}
            </p>

            <Section id="about-company" title="Company">
              <dl className="mt-4 divide-y divide-border rounded-md border border-border bg-card text-sm">
                {COMPANY_FACTS.map((fact) => (
                  <div
                    key={fact.term}
                    className="grid gap-1 px-4 py-3 sm:grid-cols-[11rem_1fr] sm:gap-4"
                  >
                    <dt className="font-medium text-muted-foreground">
                      {fact.term}
                    </dt>
                    <dd className="m-0 break-words text-foreground">
                      {"href" in fact ? (
                        <a href={fact.href} className="intro-text-link">
                          {fact.detail}
                        </a>
                      ) : (
                        fact.detail
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
            </Section>

            <Section id="about-team" title="Team">
              <p>{TEAM_COPY}</p>
            </Section>

            <Section id="about-products" title="What IQX offers">
              <ul className="mt-3 list-disc space-y-2 pl-5 text-[13px] leading-relaxed text-muted-foreground">
                {PRODUCTS.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </Section>

            <Section id="about-ai" title="How we use AI">
              <p>{AI_COPY}</p>
            </Section>

            <Section id="about-disclaimer" title="Disclaimer">
              <p>{DISCLAIMER_EN}</p>
            </Section>

            <Section id="about-contact" title="Contact">
              <p>
                Website:{" "}
                <a href={COMPANY.website} className="intro-text-link">
                  iqx.vn
                </a>
                <br />
                Address: {COMPANY.address}
              </p>
            </Section>
          </div>

          <footer className="intro-footer intro-container">
            <p>{LEGAL_LINE_EN}</p>
            <Link to="/" className="intro-text-link">
              Back to IQX
            </Link>
          </footer>
        </div>
      </ScrollArea>
    </main>
  )
}
