import { useEffect, useMemo, useRef, useState } from "react"

import { cn } from "@/lib/utils"
import { useDebouncedValue } from "@/pages/admin/academy/use-debounced-value"

import type { AdminBulletinDetail, PreviewVariant } from "./bulletin-admin-api"
import {
  contentFromDraft,
  contentKey,
  draftFromContent,
  errorFields,
  invalidLevels,
  type ContentDraft,
} from "./bulletin-admin-format"
import { useSaveBulletinContent } from "./bulletin-admin-hooks"
import { BulletinPreview } from "./bulletin-preview"
import { BulletinStepComment } from "./bulletin-step-comment"
import { BulletinStepData } from "./bulletin-step-data"
import { BulletinStepPublish } from "./bulletin-step-publish"
import { BulletinStepSlots } from "./bulletin-step-slots"

const AUTOSAVE_MS = 700
const PREVIEW_MS = 500

type SaveState = "saved" | "unsaved" | "saving" | "error" | "invalid"

const SAVE_LABEL: Record<SaveState, string> = {
  saved: "Đã lưu",
  unsaved: "Chưa lưu",
  saving: "Đang lưu...",
  error: "Không lưu được",
  invalid: "Có ô số điểm chưa đúng, chưa lưu",
}

/**
 * Màn soạn: 4 bước bên trái, xem trước bên phải. Nội dung tự lưu sau khi ngừng gõ (máy chủ chỉ
 * Public nội dung đã lưu và kiểm tra trên bản đã lưu); xem trước dùng nội dung đang gõ nên cập
 * nhật ngay cả khi chưa lưu xong.
 */
export function BulletinEditor({ detail }: { detail: AdminBulletinDetail }) {
  const date = detail.trade_date
  const [draft, setDraft] = useState<ContentDraft>(() => draftFromContent(detail.content))
  const [variant, setVariant] = useState<PreviewVariant>("desktop")
  const save = useSaveBulletinContent(date)
  const { mutate: saveContent, isPending: saving, isError: saveFailed, reset: resetSave } = save
  const lastAttempt = useRef<string | null>(null)

  const content = useMemo(() => contentFromDraft(draft), [draft])
  const invalid = invalidLevels(draft).length > 0
  const draftKey = content ? contentKey(content) : null
  const dirty = draftKey !== null && draftKey !== contentKey(detail.content)

  // Chỉ lưu khi người dùng đã ngừng gõ: giá trị debounce khớp với nội dung hiện tại.
  const debouncedContent = useDebouncedValue(content, AUTOSAVE_MS)
  const settled = content !== null && debouncedContent !== null && contentKey(debouncedContent) === draftKey

  useEffect(() => {
    if (!dirty || !settled || saving || !content || draftKey === null) return
    if (lastAttempt.current === draftKey) return
    lastAttempt.current = draftKey
    saveContent(content)
  }, [dirty, settled, saving, content, draftKey, saveContent])

  // Nội dung đổi sau một lần lưu hỏng thì cho phép thử lại với nội dung mới.
  useEffect(() => {
    if (saveFailed && lastAttempt.current !== draftKey) resetSave()
  }, [saveFailed, draftKey, resetSave])

  const previewContent = useDebouncedValue(content, PREVIEW_MS)

  const saveState: SaveState = invalid
    ? "invalid"
    : saving
      ? "saving"
      : saveFailed && dirty
        ? "error"
        : dirty
          ? "unsaved"
          : "saved"

  const unsavedReason =
    saveState === "saved"
      ? null
      : saveState === "invalid"
        ? "Sửa ô số điểm chưa đúng để lưu và Public."
        : saveState === "error"
          ? "Chưa lưu được nội dung. Bấm Lưu lại để Public."
          : "Đang lưu thay đổi, đợi một chút để Public."

  const failing = useMemo(() => errorFields(detail.checks), [detail.checks])

  function retrySave() {
    lastAttempt.current = null
    resetSave()
    if (content) saveContent(content)
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:items-start">
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3 text-xs" aria-live="polite">
          <span className={cn("font-medium", saveState === "error" || saveState === "invalid" ? "text-destructive" : "text-muted-foreground")}>
            {SAVE_LABEL[saveState]}
          </span>
          {saveState === "error" && (
            <button type="button" className="font-medium text-primary underline-offset-2 hover:underline" onClick={retrySave}>
              Lưu lại
            </button>
          )}
        </div>
        <BulletinStepData detail={detail} />
        <BulletinStepComment detail={detail} draft={draft} onChange={setDraft} errorFields={failing} />
        <BulletinStepSlots detail={detail} />
        <BulletinStepPublish detail={detail} unsavedReason={unsavedReason} />
      </div>

      <div className="lg:sticky lg:top-4">
        <BulletinPreview date={date} variant={variant} onVariantChange={setVariant} content={previewContent} />
      </div>
    </div>
  )
}
