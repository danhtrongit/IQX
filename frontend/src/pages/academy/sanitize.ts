/**
 * Allowlist HTML sanitizer for Học viện lesson content.
 *
 * The server serves vetted content (packages of chapters 1-4, the re-homed legacy lessons of
 * chapters 5-13), but it is still injected with `dangerouslySetInnerHTML`, so everything is
 * rebuilt from scratch: only allowlisted elements and classes are re-created, no attribute of the
 * source is copied except `colspan`/`rowspan`/`scope`, text is re-serialised by the DOM (so `< > &`
 * stay literal text and `∈ ∉` survive), unknown elements are unwrapped (their text survives) and
 * active/embedded elements are dropped with their content.
 *
 * Two modes: `flow` for `html` blocks and step bodies, `inline` for table cells.
 */

const FLOW_TAGS = new Set([
  "p", "br", "hr", "strong", "b", "em", "i", "u", "sub", "sup", "small", "code", "pre",
  "span", "div", "blockquote", "h3", "h4", "h5", "ul", "ol", "li",
  "table", "caption", "thead", "tbody", "tfoot", "tr", "th", "td",
])

const INLINE_TAGS = new Set(["br", "strong", "b", "em", "i", "u", "sub", "sup", "small", "code", "span"])

const DROPPED_TAGS = new Set([
  "script", "style", "iframe", "frame", "frameset", "object", "embed", "applet", "noscript", "template",
  "svg", "math", "link", "meta", "base", "form", "input", "button", "textarea", "select", "option",
  "img", "picture", "video", "audio", "source", "track", "canvas", "dialog", "head", "title",
])

/** Classes the lesson stylesheet (`academy.css`) knows; any other class is removed. */
const ALLOWED_CLASSES = new Set([
  "formula", "formula-group", "frac", "math-eq", "worked", "good",
  "execution-example", "time-arrow", "filter-name", "filter-period", "filter-expression",
  "table-scroll", "table-wrap",
])
const INLINE_CLASSES = new Set(["good"])
const REMOVED_CLASSES = new Set(["chart-mount"])
const TABLE_REGION_CLASSES = new Set(["table-scroll", "table-wrap"])
const TABLE_SCOPES = new Set(["row", "col", "rowgroup", "colgroup"])

export type SanitizeMode = "flow" | "inline"

type Context = { mode: SanitizeMode; output: Document; insideRegion: boolean }

function classesOf(element: Element): string[] {
  return (element.getAttribute("class") ?? "").split(/\s+/).filter(Boolean)
}

function makeRegion(output: Document): HTMLDivElement {
  const region = output.createElement("div")
  region.setAttribute("class", "table-scroll")
  region.setAttribute("role", "region")
  region.setAttribute("tabindex", "0")
  region.setAttribute("aria-label", "Bảng số liệu")
  return region
}

function copyAttributes(source: Element, target: Element, tag: string, mode: SanitizeMode): void {
  const allowed = mode === "inline" ? INLINE_CLASSES : ALLOWED_CLASSES
  const classes = classesOf(source).filter((name) => allowed.has(name))
  if (classes.length) target.setAttribute("class", classes.join(" "))
  if (tag === "th") {
    const scope = source.getAttribute("scope")?.toLowerCase()
    if (scope && TABLE_SCOPES.has(scope)) target.setAttribute("scope", scope)
  }
  if (tag === "th" || tag === "td") {
    for (const name of ["colspan", "rowspan"]) {
      const value = source.getAttribute(name)
      if (value && /^\d{1,2}$/.test(value)) target.setAttribute(name, value)
    }
  }
}

function sanitizeChildren(source: Node, target: Node, context: Context): void {
  const { mode, output } = context
  const allowedTags = mode === "inline" ? INLINE_TAGS : FLOW_TAGS
  source.childNodes.forEach((child) => {
    if (child.nodeType === Node.TEXT_NODE) {
      target.appendChild(output.createTextNode(child.textContent ?? ""))
      return
    }
    if (child.nodeType !== Node.ELEMENT_NODE) return
    const element = child as Element
    const tag = element.tagName.toLowerCase()
    if (DROPPED_TAGS.has(tag)) return
    const classes = classesOf(element)
    if (classes.some((name) => REMOVED_CLASSES.has(name))) return
    if (!allowedTags.has(tag)) {
      sanitizeChildren(element, target, context)
      return
    }
    const clean = output.createElement(tag)
    copyAttributes(element, clean, tag, mode)
    let childContext = context
    if (mode === "flow") {
      if (tag === "div" && classes.some((name) => TABLE_REGION_CLASSES.has(name))) {
        // An internal scroll region must be reachable by keyboard.
        clean.setAttribute("role", "region")
        clean.setAttribute("tabindex", "0")
        clean.setAttribute("aria-label", "Bảng số liệu")
        childContext = { ...context, insideRegion: true }
      } else if (tag === "table" && !context.insideRegion) {
        // A bare table scrolls inside its own focusable region instead of widening the page.
        const region = makeRegion(output)
        sanitizeChildren(element, clean, { ...context, insideRegion: true })
        region.appendChild(clean)
        target.appendChild(region)
        return
      }
    }
    sanitizeChildren(element, clean, childContext)
    target.appendChild(clean)
  })
}

export function sanitizeLessonHtml(html: string, mode: SanitizeMode = "flow"): string {
  const parsed = new DOMParser().parseFromString(`<!doctype html><html><body>${html}</body></html>`, "text/html")
  const output = document.implementation.createHTMLDocument("")
  const container = output.createElement("div")
  sanitizeChildren(parsed.body, container, { mode, output, insideRegion: false })
  return container.innerHTML
}
