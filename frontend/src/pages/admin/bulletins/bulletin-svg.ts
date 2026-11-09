const DROP_ELEMENTS = new Set(["script", "foreignobject", "iframe", "object", "embed", "style"])

/**
 * Làm sạch SVG do máy chủ dựng trước khi nhúng vào trang: bỏ phần tử chạy được mã, thuộc tính
 * `on*` và liên kết không phải http(s). Chữ trong SVG đã được máy chủ escape; đây là lớp phòng thủ thứ hai.
 */
export function sanitizeSvg(svg: string): string {
  const doc = new DOMParser().parseFromString(svg, "image/svg+xml")
  const root = doc.documentElement
  if (!root || root.nodeName.toLowerCase() !== "svg" || doc.querySelector("parsererror")) return ""
  const walk = (node: Element) => {
    for (const child of Array.from(node.children)) {
      if (DROP_ELEMENTS.has(child.localName.toLowerCase())) {
        child.remove()
        continue
      }
      for (const attribute of Array.from(child.attributes)) {
        const name = attribute.name.toLowerCase()
        if (name.startsWith("on")) child.removeAttribute(attribute.name)
        else if ((name === "href" || name === "xlink:href") && !/^https?:\/\//i.test(attribute.value.trim())) {
          child.removeAttribute(attribute.name)
        }
      }
      walk(child)
    }
  }
  walk(root)
  root.removeAttribute("width")
  root.removeAttribute("height")
  return new XMLSerializer().serializeToString(root)
}
