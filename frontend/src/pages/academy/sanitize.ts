/**
 * Minimal allowlist HTML sanitizer for Học viện lesson sections.
 *
 * Lesson HTML is trusted server content, but it is still rendered through
 * `dangerouslySetInnerHTML`, so every element/attribute that is not explicitly
 * allowed is removed. Unknown elements are unwrapped (their text survives);
 * active/embedded elements are dropped together with their content. Old
 * `.chart-mount` placeholders are removed — they are not real charts.
 */

const ALLOWED_TAGS = new Set([
  "p", "br", "hr", "strong", "b", "em", "i", "u", "sub", "sup", "small", "code", "pre",
  "span", "div", "blockquote", "h3", "h4", "h5", "ul", "ol", "li",
  "table", "caption", "thead", "tbody", "tfoot", "tr", "th", "td",
])

const DROPPED_TAGS = new Set([
  "script", "style", "iframe", "frame", "frameset", "object", "embed", "applet", "noscript", "template",
  "svg", "math", "link", "meta", "base", "form", "input", "button", "textarea", "select", "option",
  "img", "picture", "video", "audio", "source", "track", "canvas", "dialog", "head", "title",
])

const ALLOWED_CLASSES = new Set(["formula", "formula-group", "frac", "math-eq", "table-scroll", "table-wrap", "worked"])
const REMOVED_CLASSES = new Set(["chart-mount"])
const TABLE_SCOPES = new Set(["row", "col", "rowgroup", "colgroup"])

function copyAttributes(source: Element, target: Element, tag: string): void {
  const classes = (source.getAttribute("class") ?? "").split(/\s+/).filter(name => ALLOWED_CLASSES.has(name))
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

function sanitizeChildren(source: Node, target: Node, output: Document): void {
  source.childNodes.forEach(child => {
    if (child.nodeType === Node.TEXT_NODE) {
      target.appendChild(output.createTextNode(child.textContent ?? ""))
      return
    }
    if (child.nodeType !== Node.ELEMENT_NODE) return
    const element = child as Element
    const tag = element.tagName.toLowerCase()
    if (DROPPED_TAGS.has(tag)) return
    if ((element.getAttribute("class") ?? "").split(/\s+/).some(name => REMOVED_CLASSES.has(name))) return
    if (!ALLOWED_TAGS.has(tag)) {
      sanitizeChildren(element, target, output)
      return
    }
    const clean = output.createElement(tag)
    copyAttributes(element, clean, tag)
    sanitizeChildren(element, clean, output)
    target.appendChild(clean)
  })
}

export function sanitizeLessonHtml(html: string): string {
  const parsed = new DOMParser().parseFromString(`<!doctype html><html><body>${html}</body></html>`, "text/html")
  const output = document.implementation.createHTMLDocument("")
  const container = output.createElement("div")
  sanitizeChildren(parsed.body, container, output)
  return container.innerHTML
}
