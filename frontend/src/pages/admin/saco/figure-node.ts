/**
 * Nút ảnh `figure` của trình soạn. HTML lưu đúng dạng hợp đồng:
 * `<figure data-align="center" data-width="60"><img src="…" alt=""><figcaption>…</figcaption></figure>`.
 * Viền chọn, thanh nhỏ và ô kéo chỉ có trong NodeView, không bao giờ vào HTML.
 */
import { mergeAttributes, Node, type JSONContent } from "@tiptap/core"

export type FigureAlign = "left" | "center" | "right"
export type FigureAttrs = { src: string; width: number; align: FigureAlign }

export const FIGURE_WIDTH_MIN = 15
export const FIGURE_WIDTH_MAX = 100
export const FIGURE_WIDTH_DEFAULT = 60
export const FIGURE_PRESETS = [
  { label: "Nhỏ", width: 30 },
  { label: "Vừa", width: 60 },
  { label: "Lớn", width: 100 },
] as const

/** Ảnh trong bài chỉ được trỏ tới kho ảnh bài nhận định của IQX. */
export const POST_IMAGE_PREFIX = "/api/v2/trading-floor/post-images/"

export function clampWidth(value: unknown): number {
  if (value === null || value === undefined || value === "") return FIGURE_WIDTH_DEFAULT
  const number = typeof value === "number" ? value : Number(value)
  if (!Number.isFinite(number)) return FIGURE_WIDTH_DEFAULT
  return Math.min(FIGURE_WIDTH_MAX, Math.max(FIGURE_WIDTH_MIN, Math.round(number)))
}

export function normalizeAlign(value: unknown): FigureAlign {
  return value === "left" || value === "right" ? value : "center"
}

/** Ảnh đã tải lên: `url` của máy chủ có thể là tuyệt đối; bài chỉ lưu đường dẫn tương đối. */
export function postImagePath(url: string): string {
  const index = url.indexOf(POST_IMAGE_PREFIX)
  return index >= 0 ? url.slice(index) : url
}

export function figureContent(src: string, caption = ""): JSONContent {
  return {
    type: "figure",
    attrs: { src: postImagePath(src), width: FIGURE_WIDTH_DEFAULT, align: "center" },
    content: caption ? [{ type: "text", text: caption }] : undefined,
  }
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    figure: {
      /** Chèn các ảnh ngay dưới khối đang đứng (mặc định 60%, căn giữa). */
      insertFiguresBelow: (srcs: string[]) => ReturnType
    }
  }
}

export const Figure = Node.create({
  name: "figure",
  group: "block",
  content: "inline*",
  marks: "",
  isolating: true,
  draggable: false,
  selectable: true,

  addAttributes() {
    return {
      src: {
        default: null,
        parseHTML: (element) => element.querySelector("img")?.getAttribute("src") ?? null,
        renderHTML: () => ({}),
      },
      width: {
        default: FIGURE_WIDTH_DEFAULT,
        parseHTML: (element) => clampWidth(element.getAttribute("data-width")),
        renderHTML: () => ({}),
      },
      align: {
        default: "center",
        parseHTML: (element) => normalizeAlign(element.getAttribute("data-align")),
        renderHTML: () => ({}),
      },
    }
  },

  parseHTML() {
    return [{
      tag: "figure",
      // Chỉ nhận figure có ảnh; chú thích đọc từ figcaption (không có thì để trống).
      getAttrs: (element) => (element.querySelector("img[src]") ? null : false),
      contentElement: (element) => element.querySelector("figcaption") ?? element.ownerDocument.createElement("figcaption"),
    }]
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      "figure",
      mergeAttributes(HTMLAttributes, { "data-align": normalizeAlign(node.attrs.align), "data-width": String(clampWidth(node.attrs.width)) }),
      ["img", { src: node.attrs.src as string, alt: "" }],
      ["figcaption", 0],
    ]
  },

  addCommands() {
    return {
      insertFiguresBelow: (srcs) => ({ state, chain }) => {
        if (srcs.length === 0) return false
        const { $from } = state.selection
        // Ngay sau khối cấp cao nhất chứa con trỏ; tài liệu trống thì chèn ở đầu.
        const position = $from.depth > 0 ? $from.after(1) : Math.min($from.pos, state.doc.content.size)
        return chain().insertContentAt(position, srcs.map((src) => figureContent(src))).run()
      },
    }
  },
})
