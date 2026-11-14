/**
 * Làm sạch HTML dán từ Word hoặc trang web trước khi TipTap đọc theo schema. Schema đã bỏ
 * mọi mark/thuộc tính lạ; bước này bỏ thêm chú thích HTML, script, iframe, style, rác `mso-*`,
 * class, id, liên kết không phải https và ảnh ngoài (ảnh chỉ vào bài qua tệp được tải lên).
 * Máy chủ lọc lại lần nữa khi lưu và khi hiển thị.
 */

const DROP_TAGS = ["script", "style", "iframe", "object", "embed", "frame", "frameset", "noscript", "meta", "link", "title", "base", "template", "svg", "math", "form", "input", "button", "select", "textarea", "img", "picture", "video", "audio", "source", "canvas"]

/** Khai báo style còn giữ để schema đọc ra đậm/nghiêng/gạch/màu/căn lề; mọi thứ khác (font, cỡ, mso-*) bị bỏ. */
const KEEP_STYLE = new Set(["color", "text-align", "font-weight", "font-style", "text-decoration", "text-decoration-line"])

const KEEP_ATTRS = new Set(["href", "style", "colspan", "rowspan", "data-align", "data-width"])

function cleanStyle(style: string): string {
  const kept: string[] = []
  for (const part of style.split(";")) {
    const index = part.indexOf(":")
    if (index <= 0) continue
    const name = part.slice(0, index).trim().toLowerCase()
    const value = part.slice(index + 1).trim()
    const lower = value.toLowerCase()
    if (!KEEP_STYLE.has(name) || !value) continue
    if (lower.includes("expression(") || lower.includes("url(") || lower.includes("var(")) continue
    kept.push(`${name}: ${value}`)
  }
  return kept.join("; ")
}

function unwrap(element: Element) {
  element.replaceWith(...Array.from(element.childNodes))
}

export function cleanPastedHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html")
  const body = doc.body

  // Chú thích HTML (gồm cả khối <!--[if mso]> của Word).
  const comments = doc.createTreeWalker(body, NodeFilter.SHOW_COMMENT)
  const commentNodes: Node[] = []
  while (comments.nextNode()) commentNodes.push(comments.currentNode)
  for (const node of commentNodes) node.parentNode?.removeChild(node)

  for (const element of Array.from(body.querySelectorAll(DROP_TAGS.join(",")))) element.remove()

  for (const element of Array.from(body.querySelectorAll("*"))) {
    const tag = element.tagName.toLowerCase()
    // Thẻ có namespace của Word (o:p, w:sdt, v:shape…) và <font>: giữ chữ, bỏ thẻ.
    if (tag.includes(":") || tag === "font") {
      unwrap(element)
      continue
    }
    for (const attr of Array.from(element.attributes)) {
      const name = attr.name.toLowerCase()
      if (!KEEP_ATTRS.has(name)) {
        element.removeAttribute(attr.name)
        continue
      }
      if (name === "style") {
        const style = cleanStyle(attr.value)
        if (style) element.setAttribute("style", style)
        else element.removeAttribute("style")
      }
    }
    if (tag === "a") {
      const href = (element.getAttribute("href") ?? "").trim()
      if (!/^https:\/\//i.test(href)) unwrap(element)
    } else {
      element.removeAttribute("href")
    }
  }

  return body.innerHTML
}
