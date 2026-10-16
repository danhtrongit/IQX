import { CircleAlert, CircleCheck, LoaderCircle } from "lucide-react"

import { cn } from "@/lib/utils"

export type FieldNoteValue = { tone: "error" | "success" | "muted" | "checking"; text: string }

/** Dòng gợi ý/kết quả kiểm tra trực tiếp dưới một ô nhập; `id` nối với `aria-describedby`. */
export function FieldNote({ id, note }: { id: string; note: FieldNoteValue }) {
  return (
    <p
      id={id}
      aria-live="polite"
      className={cn(
        "flex items-start gap-1.5 text-xs",
        note.tone === "error" ? "text-destructive" : note.tone === "success" ? "text-foreground" : "text-muted-foreground",
      )}
    >
      {note.tone === "error" && <CircleAlert aria-hidden="true" className="mt-px size-3.5 shrink-0" />}
      {note.tone === "success" && <CircleCheck aria-hidden="true" className="mt-px size-3.5 shrink-0 text-primary" />}
      {note.tone === "checking" && <LoaderCircle aria-hidden="true" className="mt-px size-3.5 shrink-0 animate-spin" />}
      <span>{note.text}</span>
    </p>
  )
}
