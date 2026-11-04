import { useMemo, useState } from "react"
import { CircleAlert, LoaderCircle } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { formatNumber } from "@/lib/format"
import { useConfirmDialog } from "@/pages/admin/core/components/use-confirm-dialog"

import type { AcademyCatalogChapter, AcademyConfigDraft, AcademyConfigItem, AcademyMode } from "./academy-config-api"
import { academyConfigErrorMessage, chapterIdsInCatalogOrder } from "./academy-config-format"
import { AcademyChapterField, AcademyModeField } from "./academy-config-fields"
import {
  useCreateAcademyConfig,
  useDeleteAcademyConfig,
  useSaveAcademyConfig,
} from "./academy-config-hooks"
import { AcademyConfigLogs } from "./academy-config-logs"
import { AcademyConfigPreviewPanel } from "./academy-config-preview"
import { useDebouncedValue } from "./use-debounced-value"

/** Chờ người quản trị ngừng tick rồi mới hỏi máy chủ bản xem trước. */
const PREVIEW_DELAY_MS = 250

function sameChapters(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((chapterId) => b.includes(chapterId))
}

/**
 * Màn sửa một cấu hình (spec §1.4): cách học, 12 chương theo danh mục gốc, xem trước đã đánh số
 * lại, Lưu, Về mặc định (chỉ cấu hình riêng) và nhật ký thay đổi.
 *
 * Ba trường hợp: sửa cấu hình mặc định, sửa cấu hình riêng của trưởng nhóm, và "Tạo cấu hình
 * riêng" cho trưởng nhóm chưa có (`item.id === null`; bản nháp khởi đầu là cách học và chương của
 * cấu hình mặc định, chính là `mode` và `chapter_ids` máy chủ trả cho dòng đó).
 */
export function AcademyConfigEditor({
  item,
  catalog,
  onClose,
}: {
  item: AcademyConfigItem
  catalog: AcademyCatalogChapter[]
  onClose: () => void
}) {
  const configId = item.id
  const isNew = configId === null
  const canRevert = item.owner_type === "leader" && configId !== null

  const [mode, setMode] = useState<AcademyMode>(item.mode)
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set(item.chapter_ids))
  const [tab, setTab] = useState("config")
  const [error, setError] = useState<string | null>(null)

  const save = useSaveAcademyConfig()
  const create = useCreateAcademyConfig()
  const revert = useDeleteAcademyConfig()
  const confirm = useConfirmDialog()
  const busy = save.isPending || create.isPending || revert.isPending

  const chapterIds = useMemo(() => chapterIdsInCatalogOrder(catalog, selected), [catalog, selected])
  const draft = useMemo<AcademyConfigDraft>(() => ({ mode, chapter_ids: chapterIds }), [mode, chapterIds])
  const settled = useDebouncedValue(draft, PREVIEW_DELAY_MS)

  const noChapter = chapterIds.length === 0
  const dirty = mode !== item.mode || !sameChapters(chapterIds, item.chapter_ids)
  const canSave = !noChapter && !busy && (isNew ? item.leader !== null : dirty)

  function toggle(chapterId: string) {
    setError(null)
    setSelected((previous) => {
      const next = new Set(previous)
      if (next.has(chapterId)) next.delete(chapterId)
      else next.add(chapterId)
      return next
    })
  }

  async function persist() {
    setError(null)
    try {
      if (configId !== null) await save.mutateAsync({ id: configId, draft })
      else if (item.leader) await create.mutateAsync({ leader_id: item.leader.user_id, ...draft })
      onClose()
    } catch (failure) {
      // The hook already toasted; keep the editor open with the same message next to the form.
      setError(academyConfigErrorMessage(failure))
    }
  }

  function submit() {
    if (!canSave) return
    if (item.user_count > 0) {
      confirm.ask({
        title: "Lưu cấu hình Học viện?",
        description: `Thay đổi áp dụng ngay cho ${formatNumber(item.user_count)} người dùng.`,
        run: persist,
      })
      return
    }
    void persist()
  }

  function askRevert() {
    if (configId === null) return
    confirm.ask({
      title: "Về cấu hình mặc định?",
      description: `Cấu hình riêng của ${item.name} sẽ bị xóa và nhóm dùng lại cấu hình mặc định.`,
      body:
        item.user_count > 0 ? (
          <p className="text-muted-foreground">
            {`Thay đổi áp dụng ngay cho ${formatNumber(item.user_count)} người dùng.`}
          </p>
        ) : undefined,
      confirmLabel: "Xóa cấu hình riêng",
      tone: "destructive",
      run: async () => {
        setError(null)
        try {
          await revert.mutateAsync(configId)
          onClose()
        } catch (failure) {
          setError(academyConfigErrorMessage(failure))
        }
      },
    })
  }

  return (
    <>
      <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
        <DialogContent className="sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>{isNew ? `Tạo cấu hình riêng: ${item.name}` : `Sửa cấu hình: ${item.name}`}</DialogTitle>
            <DialogDescription>
              {isNew
                ? "Nhóm đang dùng cấu hình mặc định. Lưu để tạo cấu hình riêng cho nhóm này."
                : `Đang áp dụng cho ${formatNumber(item.user_count)} người dùng.`}
            </DialogDescription>
          </DialogHeader>

          <Tabs value={tab} onValueChange={setTab}>
            <TabsList variant="line">
              <TabsTrigger value="config">Cấu hình</TabsTrigger>
              {configId !== null && <TabsTrigger value="logs">Nhật ký thay đổi</TabsTrigger>}
            </TabsList>
            <ScrollArea className="max-h-[55dvh]" viewportClassName="[&>div]:!block">
              <TabsContent value="config" className="pr-3">
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                  <div className="space-y-4">
                    <AcademyModeField value={mode} disabled={busy} onChange={setMode} />
                    <AcademyChapterField
                      catalog={catalog}
                      selected={selected}
                      disabled={busy}
                      onToggle={toggle}
                      onSelectAll={() => setSelected(new Set(catalog.map((chapter) => chapter.chapter_id)))}
                    />
                    {noChapter && (
                      <p role="alert" className="flex gap-2 text-sm text-destructive">
                        <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                        Cần chọn ít nhất một chương.
                      </p>
                    )}
                  </div>
                  <AcademyConfigPreviewPanel live={draft} settled={settled} />
                </div>
              </TabsContent>
              {configId !== null && (
                <TabsContent value="logs" className="pr-3">
                  <AcademyConfigLogs configId={configId} catalog={catalog} />
                </TabsContent>
              )}
            </ScrollArea>
          </Tabs>

          {error && (
            <p role="alert" className="flex gap-2 text-sm text-destructive">
              <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              {error}
            </p>
          )}

          <DialogFooter className="sm:justify-between">
            <div>
              {canRevert && (
                <Button type="button" variant="destructive" disabled={busy} onClick={askRevert}>
                  Về mặc định
                </Button>
              )}
            </div>
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <Button type="button" variant="outline" disabled={busy} onClick={onClose}>
                Hủy
              </Button>
              <Button type="button" disabled={!canSave} onClick={submit}>
                {busy && <LoaderCircle className="animate-spin" />}
                Lưu
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {confirm.element}
    </>
  )
}
