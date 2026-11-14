/**
 * NodeView của ảnh trong trình soạn: bấm ảnh để chọn (viền vàng), thanh nhỏ phía trên
 * (Nhỏ/Vừa/Lớn, căn lề, Xoá) và ô kéo vàng ở góc phải dưới để đổi bề ngang 15% đến 100%.
 * Ảnh căn giữa giãn đều hai bên nên kéo được tính gấp đôi.
 */
import { useRef, useState, type PointerEvent } from "react"
import { AlignCenter, AlignLeft, AlignRight, Trash2 } from "lucide-react"
import { NodeViewContent, NodeViewWrapper, type ReactNodeViewProps } from "@tiptap/react"

import { cn } from "@/lib/utils"

import { clampWidth, FIGURE_PRESETS, normalizeAlign, type FigureAlign } from "./figure-node"

const ALIGNS: { value: FigureAlign; label: string; icon: typeof AlignLeft }[] = [
  { value: "left", label: "Căn trái", icon: AlignLeft },
  { value: "center", label: "Căn giữa", icon: AlignCenter },
  { value: "right", label: "Căn phải", icon: AlignRight },
]

export function FigureView({ node, selected, editor, getPos, updateAttributes, deleteNode }: ReactNodeViewProps) {
  const width = clampWidth(node.attrs.width)
  const align = normalizeAlign(node.attrs.align)
  const src = node.attrs.src as string
  const [dragWidth, setDragWidth] = useState<number | null>(null)
  const drag = useRef<{ startX: number; startWidth: number; editorWidth: number } | null>(null)
  const shown = dragWidth ?? width
  const editable = editor.isEditable

  const select = () => {
    const pos = getPos()
    if (typeof pos === "number") editor.chain().focus().setNodeSelection(pos).run()
  }

  /** Đổi thuộc tính làm mất vùng chọn nút; chọn lại để thanh nhỏ và ô kéo còn nguyên. */
  const update = (attrs: Record<string, unknown>) => {
    updateAttributes(attrs)
    select()
  }

  const onPointerDown = (event: PointerEvent<HTMLSpanElement>) => {
    event.preventDefault()
    event.stopPropagation()
    const content = (event.currentTarget.closest(".ProseMirror") as HTMLElement | null) ?? event.currentTarget.parentElement
    drag.current = { startX: event.clientX, startWidth: width, editorWidth: Math.max(1, content?.clientWidth ?? 1) }
    event.currentTarget.setPointerCapture(event.pointerId)
    setDragWidth(width)
  }

  const onPointerMove = (event: PointerEvent<HTMLSpanElement>) => {
    const state = drag.current
    if (!state) return
    const factor = align === "center" ? 2 : 1
    const delta = ((event.clientX - state.startX) * factor * 100) / state.editorWidth
    setDragWidth(clampWidth(state.startWidth + delta))
  }

  const onPointerUp = (event: PointerEvent<HTMLSpanElement>) => {
    if (!drag.current) return
    drag.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    if (dragWidth !== null && dragWidth !== width) update({ width: dragWidth })
    setDragWidth(null)
  }

  return <NodeViewWrapper
    as="figure"
    className={cn("saco-figure", selected && "saco-figure--selected")}
    data-align={align}
    data-width={shown}
    style={{ width: `${shown}%` }}
  >
    {selected && editable && <div className="saco-figure-bar" contentEditable={false} role="toolbar" aria-label="Ảnh">
      {FIGURE_PRESETS.map((preset) => <button
        key={preset.width}
        type="button"
        className={cn("saco-figure-bar-btn", width === preset.width && "saco-figure-bar-btn--on")}
        aria-pressed={width === preset.width}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => update({ width: preset.width })}
      >
        {preset.label} {preset.width}%
      </button>)}
      <span className="saco-figure-bar-sep" aria-hidden="true" />
      {ALIGNS.map(({ value, label, icon: Icon }) => <button
        key={value}
        type="button"
        className={cn("saco-figure-bar-btn saco-figure-bar-btn--icon", align === value && "saco-figure-bar-btn--on")}
        aria-label={label}
        title={label}
        aria-pressed={align === value}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => update({ align: value })}
      >
        <Icon aria-hidden="true" />
      </button>)}
      <span className="saco-figure-bar-sep" aria-hidden="true" />
      <button type="button" className="saco-figure-bar-btn saco-figure-bar-btn--danger" onMouseDown={(event) => event.preventDefault()} onClick={deleteNode}>
        <Trash2 aria-hidden="true" />Xoá
      </button>
    </div>}
    <div className="saco-figure-media" contentEditable={false}>
      <img src={src} alt="" draggable={false} className="saco-figure-img" onClick={select} />
    {selected && editable && <span
      className="saco-figure-handle"
      role="slider"
      tabIndex={0}
      aria-label="Kéo để đổi bề ngang ảnh"
      aria-valuemin={15}
      aria-valuemax={100}
      aria-valuenow={shown}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onKeyDown={(event) => {
        const step = event.key === "ArrowRight" || event.key === "ArrowUp" ? 5 : event.key === "ArrowLeft" || event.key === "ArrowDown" ? -5 : 0
        if (!step) return
        event.preventDefault()
        event.stopPropagation()
        update({ width: clampWidth(width + step) })
      }}
    />}
    {dragWidth !== null && <span className="saco-figure-size" aria-live="polite">{dragWidth}%</span>}
    </div>
    <NodeViewContent<"figcaption"> as="figcaption" className="saco-figure-caption" data-placeholder="Chú thích ảnh" />
  </NodeViewWrapper>
}
