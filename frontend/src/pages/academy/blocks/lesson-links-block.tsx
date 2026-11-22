import { Fragment, type ReactNode } from "react"
import { Link, useInRouterContext, useSearchParams } from "react-router"

import { ACADEMY_TOOL, METRIC_PARAM, NGANH_PARAM, TOOL_PARAM, parseNganhParam } from "@/pages/demo-trading/workspace-url"
import type { LessonLinksBlock as LessonLinksModel } from "../content-types"
import { InlineText } from "./inline-text"

type LessonLink = LessonLinksModel["links"][number]

const LINK_CLASS = "font-semibold text-primary underline-offset-2 hover:underline focus-visible:underline"

/**
 * Query of a lesson link: the workspace keeps its other parameters (symbol, the open lesson while the link
 * resolves) and the Học viện tool resolves `metric` + `nganh` through `GET /academy/link` (deep-link.ts).
 */
function lessonLinkSearch(link: Pick<LessonLink, "metric_key" | "nganh">, current = ""): string {
  const params = new URLSearchParams(current)
  params.set(TOOL_PARAM, ACADEMY_TOOL)
  params.set(METRIC_PARAM, link.metric_key)
  const nganh = parseNganhParam(link.nganh)
  if (nganh) params.set(NGANH_PARAM, nganh)
  else params.delete(NGANH_PARAM)
  return `?${params}`
}

function RouterLinks({ links }: { links: readonly LessonLink[] }) {
  const [params] = useSearchParams()
  return (
    <LinkList
      links={links}
      render={(link) => (
        <Link to={{ search: lessonLinkSearch(link, params.toString()) }} className={LINK_CLASS}>
          {link.label}
        </Link>
      )}
    />
  )
}

/** Outside a router (block previews, tests) the links are plain anchors on the same page. */
function PlainLinks({ links }: { links: readonly LessonLink[] }) {
  return (
    <LinkList
      links={links}
      render={(link) => (
        <a href={lessonLinkSearch(link)} className={LINK_CLASS}>
          {link.label}
        </a>
      )}
    />
  )
}

function LinkList({ links, render }: { links: readonly LessonLink[]; render: (link: LessonLink) => ReactNode }) {
  return (
    <>
      {links.map((link, index) => (
        <Fragment key={`${link.metric_key}-${link.nganh ?? ""}-${index}`}>
          {index > 0 && ", "}
          {render(link)}
        </Fragment>
      ))}
    </>
  )
}

/**
 * "Có bài riêng: ROE · ở ngân hàng, ROE · ở công ty chứng khoán. Các bài này..." (spec v5 §1.3, §6.3):
 * one paragraph, the lead and tail are lesson inline HTML, each link opens the lesson of a metric in an
 * industry through the same deep link as the Dashboard's "Học" button.
 */
export function LessonLinksBlock({ block }: { block: LessonLinksModel }) {
  const inRouter = useInRouterContext()
  if (block.links.length === 0) return null
  const tail = block.tail?.trim()
  return (
    <p className="academy-paragraph break-words">
      {block.lead && (
        <>
          <InlineText html={block.lead} />{" "}
        </>
      )}
      {inRouter ? <RouterLinks links={block.links} /> : <PlainLinks links={block.links} />}
      {tail ? (
        <>
          {/^[.,;:]/.test(tail) ? "" : ". "}
          <InlineText html={tail} />
        </>
      ) : (
        "."
      )}
    </p>
  )
}
