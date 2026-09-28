/**
 * Inline markup renderer for AI-written market copy.
 *
 * The briefs arrive as small HTML fragments: `<strong>`, `<br>`, and
 * `<span class="num|up-text|down-text">`. Nothing else is trusted, so the
 * fragment is parsed against that allowlist and rendered as React elements
 * (never `dangerouslySetInnerHTML`) with the workspace's own token classes.
 *
 * AI text is written by the model rather than by our formatters, so it can
 * arrive in Vietnamese number convention — unambiguous decimal commas are
 * normalised to the app-wide en-US standard before rendering.
 */

import { Fragment, type ReactNode } from "react"

type InlineKind = "text" | "strong" | "num" | "up" | "down"

interface InlineNode {
  kind: InlineKind
  /** Set for text nodes; empty for wrappers. */
  value: string
  children: InlineNode[]
}

const VI_DECIMAL_COMMA = /(\d),(\d{1,2})(?!\d)/g

/** "0,35" → "0.35" — only the unambiguous vi-VN decimal case. */
function normalizeNumberFormat(input: string): string {
  return input.replace(VI_DECIMAL_COMMA, "$1.$2")
}

const TAG = /<(\/?)([a-zA-Z0-9]+)([^>]*)>/g

/** The wrapper kind a tag maps to, or null when the tag isn't allowlisted. */
function wrapperKind(tag: string, attrs: string): InlineKind | null {
  if (tag === "strong") return "strong"
  if (tag !== "span") return null
  const cls = /class\s*=\s*["']([^"']*)["']/.exec(attrs)?.[1]?.trim() ?? ""
  if (cls === "num") return "num"
  if (cls === "up-text") return "up"
  if (cls === "down-text") return "down"
  return null
}

function textNode(value: string): InlineNode {
  return { kind: "text", value: normalizeNumberFormat(value), children: [] }
}

function pushText(target: InlineNode[], value: string) {
  if (value) target.push(textNode(value))
}

/** Parse the allowlisted fragment into a node tree; unknown tags are dropped. */
function parseInline(html: string): InlineNode[] {
  const root: InlineNode[] = []
  const stack: { kind: InlineKind; children: InlineNode[] }[] = [{ kind: "text", children: root }]
  const target = () => stack[stack.length - 1].children

  let cursor = 0
  TAG.lastIndex = 0
  for (let match = TAG.exec(html); match; match = TAG.exec(html)) {
    pushText(target(), html.slice(cursor, match.index))
    cursor = match.index + match[0].length

    const [, closing, rawTag, attrs] = match
    const tag = rawTag.toLowerCase()
    if (tag === "br") {
      pushText(target(), "\n")
      continue
    }
    const kind = wrapperKind(tag, attrs)
    if (!kind) continue
    if (closing) {
      // Close the nearest matching wrapper; unmatched closers are ignored.
      for (let i = stack.length - 1; i > 0; i--) {
        if (stack[i].kind === kind) {
          stack.length = i
          break
        }
      }
      continue
    }
    const children: InlineNode[] = []
    target().push({ kind, value: "", children })
    stack.push({ kind, children })
  }
  pushText(target(), html.slice(cursor))
  return root
}

const WRAPPER_CLASS: Record<"strong" | "num" | "up" | "down", string> = {
  strong: "font-semibold text-foreground",
  num: "tabular-nums",
  up: "tabular-nums text-price-up",
  down: "tabular-nums text-price-down",
}

/** Newlines produced by `<br>` render as real line breaks. */
function renderText(value: string, key: number): ReactNode {
  const lines = value.split("\n")
  return (
    <Fragment key={key}>
      {lines.map((line, index) =>
        index === 0 ? (
          line
        ) : (
          <Fragment key={index}>
            <br />
            {line}
          </Fragment>
        ),
      )}
    </Fragment>
  )
}

function renderNodes(nodes: InlineNode[]): ReactNode {
  return nodes.map((node, index) => {
    if (node.kind === "text") return renderText(node.value, index)
    if (node.kind === "strong") {
      return (
        <strong key={index} className={WRAPPER_CLASS.strong}>
          {renderNodes(node.children)}
        </strong>
      )
    }
    return (
      <span key={index} className={WRAPPER_CLASS[node.kind]}>
        {renderNodes(node.children)}
      </span>
    )
  })
}

/**
 * Renders one AI-written fragment. Empty input renders nothing, so callers keep
 * their own surrounding layout.
 */
export function RichText({ html, className }: { html: string | null | undefined; className?: string }) {
  if (!html) return null
  return <span className={className}>{renderNodes(parseInline(html))}</span>
}
