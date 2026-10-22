/**
 * Allowlist sanitizer for the Inline HTML of Học viện v3.3 lesson content.
 *
 * The content schema (`backend/src/modules/academy/content/v3/schema.ts`, `inlineHtml`) allows only
 * `<b> <strong> <em> <br>` and `<span class="tone-…">`. The server validates that at boot, but the
 * string is still injected with `dangerouslySetInnerHTML`, so it is rebuilt from scratch here: only
 * allowlisted elements are re-created, no attribute of the source is copied except one `tone-*`
 * class on a span, text is re-serialised by the DOM (so `< > &` stay literal text), unknown
 * elements are unwrapped (their text survives) and active or embedded elements are dropped with
 * their content.
 */

const INLINE_TAGS = new Set(["b", "strong", "em", "br", "span"])

const DROPPED_TAGS = new Set([
  "script", "style", "iframe", "frame", "frameset", "object", "embed", "applet", "noscript", "template",
  "svg", "math", "link", "meta", "base", "form", "input", "button", "textarea", "select", "option",
  "img", "picture", "video", "audio", "source", "track", "canvas", "dialog", "head", "title",
])

/** Inline tones of the schema (`INLINE_TONES`), styled in `academy.css`. */
export const INLINE_TONE_CLASSES = new Set([
  "tone-pos",
  "tone-neg",
  "tone-warn",
  "tone-info",
  "tone-violet",
  "tone-accent",
  "tone-strong",
])

function sanitizeChildren(source: Node, target: Node, output: Document): void {
  source.childNodes.forEach((child) => {
    if (child.nodeType === Node.TEXT_NODE) {
      target.appendChild(output.createTextNode(child.textContent ?? ""))
      return
    }
    if (child.nodeType !== Node.ELEMENT_NODE) return
    const element = child as Element
    const tag = element.tagName.toLowerCase()
    if (DROPPED_TAGS.has(tag)) return
    if (!INLINE_TAGS.has(tag)) {
      sanitizeChildren(element, target, output)
      return
    }
    const clean = output.createElement(tag)
    if (tag === "span") {
      const tone = (element.getAttribute("class") ?? "").split(/\s+/).find((name) => INLINE_TONE_CLASSES.has(name))
      if (tone) clean.setAttribute("class", tone)
    }
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
