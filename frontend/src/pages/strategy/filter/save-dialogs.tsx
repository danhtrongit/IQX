import { useId, useState } from "react"
import { LoaderCircle } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

import { ErrorLine } from "../shared/controls"
import { FIELD_LABEL } from "../shared/ui-text"
import { DialogShell } from "../shared/dialog-shell"

const NAME_MAX = 120

function NameField({ id, value, onChange, label = "Tên" }: { id: string; value: string; onChange: (value: string) => void; label?: string }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className={FIELD_LABEL}>{label}</Label>
      <Input id={id} value={value} maxLength={NAME_MAX} autoComplete="off" onChange={(event) => onChange(event.target.value)} />
    </div>
  )
}

/** Save the criteria of the filter (definition 3.0, a period per condition). Does not save any result and does not touch the Bot. */
export function SaveFilterDialog({
  initialName,
  loaded,
  criteria,
  pending,
  error,
  onSave,
  onClose,
}: {
  initialName: string
  loaded: { id: string; name: string; version: number } | null
  criteria: string
  pending: boolean
  error: string | null
  onSave: (input: { name: string; newVersionOf: string | null }) => void
  onClose: () => void
}) {
  const id = useId()
  const [name, setName] = useState(initialName)
  const [asNew, setAsNew] = useState(false)
  const trimmed = name.trim()
  return (
    <DialogShell
      title="Lưu bộ lọc"
      size="sm"
      dirty={name !== initialName && !pending}
      busy={pending}
      onClose={onClose}
      footer={({ requestClose }) => (
        <>
          <Button type="button" variant="outline" onClick={requestClose} disabled={pending}>Hủy</Button>
          <Button type="button" disabled={pending || trimmed === ""} onClick={() => onSave({ name: trimmed, newVersionOf: loaded && !asNew ? loaded.id : null })}>
            {pending && <LoaderCircle aria-hidden="true" className="animate-spin" />}
            Lưu bộ lọc
          </Button>
        </>
      )}
    >
      <NameField id={`${id}-name`} value={name} onChange={setName} label="Tên bộ lọc" />
      {loaded && (
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-1" checked={!asNew} onChange={(event) => setAsNew(!event.target.checked)} />
          <span>Lưu thành phiên bản mới của “{loaded.name}” (đang ở phiên bản {loaded.version})</span>
        </label>
      )}
      <p className="rounded-md border border-border bg-muted/40 p-3 text-xs leading-5 text-muted-foreground">{criteria}</p>
      <p className="text-xs leading-5 text-muted-foreground">
        Bộ lọc chỉ lưu tiêu chí, dấu, ngưỡng, kỳ tính của từng điều kiện và phạm vi. Mở lại sẽ lấy “báo cáo mới nhất đã công bố” tại thời điểm đó, không khóa vào kỳ hiện tại. Không đổi Bot.
      </p>
      {error && <ErrorLine>{error}</ErrorLine>}
    </DialogShell>
  )
}

export type ResultSaveKind = "list" | "snapshot"

const COPY: Record<ResultSaveKind, { title: string; field: string; action: string; note: string }> = {
  list: {
    title: "Lưu danh mục",
    field: "Tên danh mục",
    action: "Lưu danh mục",
    note: "Danh mục giữ đúng tập mã, tiêu chí, kỳ tính, số liệu và mốc dữ liệu tại lúc lưu; mở lại không tính lại bằng dữ liệu mới. Lưu danh mục không mua cổ phiếu và không đổi Bot.",
  },
  snapshot: {
    title: "Lưu kết quả",
    field: "Tên kết quả",
    action: "Lưu kết quả",
    note: "Kết quả giữ nguyên các dòng số liệu, kỳ thực tế và nguồn của lần lọc này để xem lại. Lưu kết quả không tạo danh mục, không mua cổ phiếu và không đổi Bot.",
  },
}

/** Save list or snapshot of the stored result: the server picks the rows, the dialog only names them and shows how many. */
export function SaveResultDialog({
  kind,
  initialName,
  summary,
  count,
  pending,
  error,
  onSave,
  onClose,
}: {
  kind: ResultSaveKind
  initialName: string
  /** The criteria of the result being saved. */
  summary: string
  /** How many symbols will be saved. */
  count: number
  pending: boolean
  error: string | null
  onSave: (name: string) => void
  onClose: () => void
}) {
  const id = useId()
  const [name, setName] = useState(initialName)
  const copy = COPY[kind]
  const trimmed = name.trim()
  return (
    <DialogShell
      title={copy.title}
      size="sm"
      dirty={name !== initialName && !pending}
      busy={pending}
      onClose={onClose}
      footer={({ requestClose }) => (
        <>
          <Button type="button" variant="outline" onClick={requestClose} disabled={pending}>Hủy</Button>
          <Button type="button" disabled={pending || trimmed === ""} onClick={() => onSave(trimmed)}>
            {pending && <LoaderCircle aria-hidden="true" className="animate-spin" />}
            {copy.action}
          </Button>
        </>
      )}
    >
      <NameField id={`${id}-name`} value={name} onChange={setName} label={copy.field} />
      <p className="text-sm font-medium" data-testid="save-count">Lưu {count} mã</p>
      <p className="rounded-md border border-border bg-muted/40 p-3 text-xs leading-5 text-muted-foreground">{summary}</p>
      <p className="text-xs leading-5 text-muted-foreground">{copy.note}</p>
      {error && <ErrorLine>{error}</ErrorLine>}
    </DialogShell>
  )
}
