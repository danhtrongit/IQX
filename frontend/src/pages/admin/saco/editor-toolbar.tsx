/** Thanh công cụ dính của trình soạn bài nhận định (spec "Thanh công cụ"). */
import { useRef, useState, type ReactNode } from "react"
import {
  AlignCenter, AlignLeft, AlignRight, Bold, ImagePlus, Italic, Link2, Link2Off, List, ListOrdered, Minus, Palette,
  Redo2, Strikethrough, Table2, Underline, Undo2,
} from "lucide-react"
import { useEditorState, type Editor } from "@tiptap/react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"

import { IMAGE_TYPES } from "./post-validation"

/** Màu chữ của nội dung bài (đọc trên nền tối của khu giao dịch), không phải màu giao diện. */
const TEXT_COLORS = [
  { label: "Đỏ", value: "#ff6b6b" },
  { label: "Cam", value: "#ff9f43" },
  { label: "Vàng", value: "#f6d27a" },
  { label: "Xanh lá", value: "#32d74b" },
  { label: "Xanh dương", value: "#5aa9ff" },
  { label: "Tím", value: "#b197fc" },
  { label: "Xám", value: "#93a0b8" },
] as const

type BlockType = "paragraph" | "h1" | "h2" | "h3" | "blockquote"

const BLOCKS: { value: BlockType; label: string }[] = [
  { value: "paragraph", label: "Đoạn văn" },
  { value: "h1", label: "Tiêu đề 1" },
  { value: "h2", label: "Tiêu đề 2" },
  { value: "h3", label: "Tiêu đề 3" },
  { value: "blockquote", label: "Trích dẫn" },
]

function ToolButton({ label, active, disabled, onClick, children }: { label: string; active?: boolean; disabled?: boolean; onClick: () => void; children: ReactNode }) {
  return <Button
    type="button"
    variant="ghost"
    size="icon-sm"
    aria-label={label}
    title={label}
    aria-pressed={active}
    disabled={disabled}
    className={cn(active && "bg-muted text-primary")}
    onMouseDown={(event) => event.preventDefault()}
    onClick={onClick}
  >
    {children}
  </Button>
}

function Divider() {
  return <span aria-hidden="true" className="mx-0.5 h-5 w-px shrink-0 bg-border" />
}

export function EditorToolbar({ editor, onPickImages, disabled }: { editor: Editor; onPickImages: (files: File[]) => void; disabled?: boolean }) {
  const fileInput = useRef<HTMLInputElement>(null)
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
      block: (e.isActive("heading", { level: 1 }) ? "h1"
        : e.isActive("heading", { level: 2 }) ? "h2"
        : e.isActive("heading", { level: 3 }) ? "h3"
        : e.isActive("blockquote") ? "blockquote"
        : "paragraph") as BlockType,
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      underline: e.isActive("underline"),
      strike: e.isActive("strike"),
      color: (e.getAttributes("textStyle").color as string | undefined) ?? null,
      alignLeft: e.isActive({ textAlign: "left" }),
      alignCenter: e.isActive({ textAlign: "center" }),
      alignRight: e.isActive({ textAlign: "right" }),
      bullet: e.isActive("bulletList"),
      ordered: e.isActive("orderedList"),
      link: e.isActive("link"),
      inTable: e.isActive("table"),
      hasSelection: !e.state.selection.empty,
    }),
  })

  const setBlock = (value: string) => {
    const chain = editor.chain().focus()
    if (value === "blockquote") {
      if (!editor.isActive("blockquote")) chain.setParagraph().setBlockquote().run()
      return
    }
    if (editor.isActive("blockquote")) chain.unsetBlockquote()
    if (value === "paragraph") chain.setParagraph().run()
    else chain.setHeading({ level: Number(value.slice(1)) as 1 | 2 | 3 }).run()
  }

  return <div role="toolbar" aria-label="Định dạng bài" className="sticky top-0 z-10 flex flex-wrap items-center gap-0.5 border-b border-border bg-card px-2 py-1.5">
    <ToolButton label="Hoàn tác" disabled={disabled || !state.canUndo} onClick={() => editor.chain().focus().undo().run()}><Undo2 /></ToolButton>
    <ToolButton label="Làm lại" disabled={disabled || !state.canRedo} onClick={() => editor.chain().focus().redo().run()}><Redo2 /></ToolButton>
    <Divider />
    <Select value={state.block} onValueChange={setBlock} disabled={disabled}>
      <SelectTrigger size="sm" className="h-7 w-32" aria-label="Kiểu đoạn"><SelectValue /></SelectTrigger>
      <SelectContent>
        {BLOCKS.map((block) => <SelectItem key={block.value} value={block.value}>{block.label}</SelectItem>)}
      </SelectContent>
    </Select>
    <Divider />
    <ToolButton label="Đậm" active={state.bold} disabled={disabled} onClick={() => editor.chain().focus().toggleBold().run()}><Bold /></ToolButton>
    <ToolButton label="Nghiêng" active={state.italic} disabled={disabled} onClick={() => editor.chain().focus().toggleItalic().run()}><Italic /></ToolButton>
    <ToolButton label="Gạch chân" active={state.underline} disabled={disabled} onClick={() => editor.chain().focus().toggleUnderline().run()}><Underline /></ToolButton>
    <ToolButton label="Gạch ngang" active={state.strike} disabled={disabled} onClick={() => editor.chain().focus().toggleStrike().run()}><Strikethrough /></ToolButton>
    <ColorPicker editor={editor} current={state.color} disabled={disabled} />
    <Divider />
    <ToolButton label="Căn trái" active={state.alignLeft} disabled={disabled} onClick={() => editor.chain().focus().setTextAlign("left").run()}><AlignLeft /></ToolButton>
    <ToolButton label="Căn giữa" active={state.alignCenter} disabled={disabled} onClick={() => editor.chain().focus().setTextAlign("center").run()}><AlignCenter /></ToolButton>
    <ToolButton label="Căn phải" active={state.alignRight} disabled={disabled} onClick={() => editor.chain().focus().setTextAlign("right").run()}><AlignRight /></ToolButton>
    <Divider />
    <ToolButton label="Danh sách chấm" active={state.bullet} disabled={disabled} onClick={() => editor.chain().focus().toggleBulletList().run()}><List /></ToolButton>
    <ToolButton label="Danh sách số" active={state.ordered} disabled={disabled} onClick={() => editor.chain().focus().toggleOrderedList().run()}><ListOrdered /></ToolButton>
    <ToolButton label="Đường kẻ ngang" disabled={disabled} onClick={() => editor.chain().focus().setHorizontalRule().run()}><Minus /></ToolButton>
    <Divider />
    <LinkPicker editor={editor} active={state.link} hasSelection={state.hasSelection} disabled={disabled} />
    <ToolButton label="Chèn ảnh" disabled={disabled} onClick={() => fileInput.current?.click()}><ImagePlus /></ToolButton>
    <input
      ref={fileInput}
      type="file"
      accept={IMAGE_TYPES.join(",")}
      multiple
      hidden
      onChange={(event) => {
        const files = Array.from(event.target.files ?? [])
        event.target.value = ""
        if (files.length) onPickImages(files)
      }}
    />
    <ToolButton label="Chèn bảng" disabled={disabled} onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}><Table2 /></ToolButton>
    {state.inTable && <div className="flex flex-wrap items-center gap-0.5" aria-label="Bảng">
      <Divider />
      <Button type="button" variant="ghost" size="xs" disabled={disabled} onMouseDown={(event) => event.preventDefault()} onClick={() => editor.chain().focus().addRowAfter().run()}>+ Hàng</Button>
      <Button type="button" variant="ghost" size="xs" disabled={disabled} onMouseDown={(event) => event.preventDefault()} onClick={() => editor.chain().focus().addColumnAfter().run()}>+ Cột</Button>
      <Button type="button" variant="ghost" size="xs" disabled={disabled} onMouseDown={(event) => event.preventDefault()} onClick={() => editor.chain().focus().deleteRow().run()}>− Hàng</Button>
      <Button type="button" variant="ghost" size="xs" disabled={disabled} className="text-destructive" onMouseDown={(event) => event.preventDefault()} onClick={() => editor.chain().focus().deleteTable().run()}>Xoá bảng</Button>
    </div>}
  </div>
}

function ColorPicker({ editor, current, disabled }: { editor: Editor; current: string | null; disabled?: boolean }) {
  const [open, setOpen] = useState(false)
  const pick = (value: string | null) => {
    const chain = editor.chain().focus()
    if (value) chain.setColor(value).run()
    else chain.unsetColor().run()
    setOpen(false)
  }
  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger asChild>
      <Button type="button" variant="ghost" size="icon-sm" aria-label="Màu chữ" title="Màu chữ" disabled={disabled} onMouseDown={(event) => event.preventDefault()}>
        <Palette />
      </Button>
    </PopoverTrigger>
    <PopoverContent align="start" className="w-auto p-2" onOpenAutoFocus={(event) => event.preventDefault()}>
      <div className="flex items-center gap-1.5">
        {TEXT_COLORS.map((color) => <button
          key={color.value}
          type="button"
          aria-label={color.label}
          title={color.label}
          aria-pressed={current?.toLowerCase() === color.value}
          className={cn("size-6 rounded-full border border-border focus-visible:outline-2 focus-visible:outline-ring", current?.toLowerCase() === color.value && "ring-2 ring-primary ring-offset-1 ring-offset-background")}
          style={{ backgroundColor: color.value }}
          onClick={() => pick(color.value)}
        />)}
        <Button type="button" variant="outline" size="xs" onClick={() => pick(null)}>Mặc định</Button>
      </div>
    </PopoverContent>
  </Popover>
}

function LinkPicker({ editor, active, hasSelection, disabled }: { editor: Editor; active: boolean; hasSelection: boolean; disabled?: boolean }) {
  const [open, setOpen] = useState(false)
  const [href, setHref] = useState("")
  const valid = /^https:\/\/[^\s]+\.[^\s]+/i.test(href.trim())

  if (active) {
    return <ToolButton label="Bỏ liên kết" active disabled={disabled} onClick={() => editor.chain().focus().extendMarkRange("link").unsetLink().run()}><Link2Off /></ToolButton>
  }

  return <Popover open={open} onOpenChange={(next) => {
    if (next && !hasSelection) {
      toast.error("Chọn chữ cần gắn liên kết trước")
      return
    }
    setOpen(next)
    if (next) setHref("https://")
  }}>
    <PopoverTrigger asChild>
      <Button type="button" variant="ghost" size="icon-sm" aria-label="Gắn liên kết" title="Gắn liên kết" disabled={disabled} onMouseDown={(event) => event.preventDefault()}>
        <Link2 />
      </Button>
    </PopoverTrigger>
    <PopoverContent align="start" className="w-80 p-3">
      <form
        className="flex flex-col gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          if (!valid) return
          editor.chain().focus().setLink({ href: href.trim(), target: "_blank", rel: "noopener noreferrer nofollow" }).run()
          setOpen(false)
        }}
      >
        <label className="text-xs font-medium" htmlFor="saco-link-input">Liên kết (chỉ nhận https://)</label>
        <Input id="saco-link-input" value={href} onChange={(event) => setHref(event.target.value)} inputMode="url" autoComplete="off" aria-invalid={!valid && href.length > 8} />
        {!valid && href.length > 8 && <p className="text-[11px] text-destructive">Liên kết phải bắt đầu bằng https://</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>Hủy</Button>
          <Button type="submit" size="sm" disabled={!valid}>Gắn liên kết</Button>
        </div>
      </form>
    </PopoverContent>
  </Popover>
}
