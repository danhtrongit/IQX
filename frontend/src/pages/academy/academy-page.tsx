import { useCallback, useMemo, useState } from "react"
import { List, RefreshCw } from "lucide-react"
import { Link, useParams } from "react-router"
import { toast } from "sonner"
import { useQueryClient } from "@tanstack/react-query"

import { PanelState } from "@/components/layout/panel-state"
import { WorkspacePage } from "@/components/layout/workspace-page"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import { useAuth } from "@/hooks/use-auth"
import { ApiError, errorMessage } from "@/lib/api"
import { formatDateLabel } from "@/lib/date-only"
import type { IndicatorConfig, Side, TechnicalIndicator } from "@/lib/shared-config"

import { AcademySidebar, type LessonRowControl } from "./academy-sidebar"
import { isAcademyDisabled, type Curriculum, type CurriculumLesson } from "./api"
import { savedIndicatorConfig } from "./config-draft"
import { academyKeys, useAcademyConfig, useCurriculum, useInvalidateAcademyProgress, useLesson, type AcademyConfigController } from "./hooks"
import { IndicatorConfigDialog } from "./indicator-config-dialog"
import { LessonView } from "./lesson-view"
import { QuizView } from "./quiz-view"

type DialogState = { indicatorId: string; side: Side; activate: boolean }
/** Unsaved master toggle kept after a 409 REVISION_CONFLICT. */
type MasterConflict = { indicatorId: string; desired: boolean; currentRevision: number | null; reloadedRevision: number | null }

function ConfigStatus({ config }: { config: AcademyConfigController }) {
  if (config.availability === "disabled") return null
  if (config.availability === "premium_required") {
    return (
      <p className="text-xs leading-5 text-muted-foreground">
        Cấu hình chỉ báo dùng chung (Học viện · Backtest · Bot) cần gói Premium. <Link className="underline" to="/nang-cap">Xem gói</Link>
      </p>
    )
  }
  if (config.availability === "error") {
    return <p role="alert" className="text-xs leading-5 text-destructive">Không tải được cấu hình: {config.errorMessage}</p>
  }
  const state = config.state
  if (!state) return <Skeleton className="h-4 w-48" />
  if (state.saved_revision === 0) {
    return <p className="text-xs leading-5 text-muted-foreground">Chưa lưu cấu hình. Đang hiển thị thiết lập mặc định để học, không phải tham số tối ưu.</p>
  }
  const effective = state.status === "calendar_unavailable" || !state.effective_session
    ? "Chờ lịch phiên"
    : `Có hiệu lực từ phiên ${formatDateLabel(state.effective_session)}`
  return (
    <p className="text-xs leading-5 text-muted-foreground" aria-live="polite">
      Bản đã lưu #{state.saved_revision} · {effective}
      {state.effective_revision !== null && state.effective_revision !== state.saved_revision
        ? ` · Bot đang dùng bản #${state.effective_revision}`
        : ""}
    </p>
  )
}

function LessonPane({ lessonId, curriculum, lessonNames, capabilityNames, configActionFor }: {
  lessonId: string
  curriculum: Curriculum
  lessonNames: ReadonlyMap<string, string>
  capabilityNames: ReadonlyMap<string, string>
  configActionFor: (lesson: CurriculumLesson) => { label: string; enabled: boolean; onOpen: () => void } | null
}) {
  const [mode, setMode] = useState<"lesson" | "quiz">("lesson")
  const lessonQuery = useLesson(lessonId)
  const invalidateProgress = useInvalidateAcademyProgress()
  const chapter = curriculum.chapters.find(item => item.lessons.some(lesson => lesson.id === lessonId))
  const meta = chapter?.lessons.find(lesson => lesson.id === lessonId)
  const ordered = curriculum.chapters.flatMap(item => item.lessons)
  const index = ordered.findIndex(lesson => lesson.id === lessonId)
  const nextLessonId = index >= 0 && index < ordered.length - 1 ? ordered[index + 1].id : null

  if (lessonQuery.isPending) {
    return (
      <div className="mx-auto w-full max-w-[880px] space-y-3" aria-busy="true" aria-label="Đang tải bài học">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48 w-full rounded-lg" />
        <Skeleton className="h-48 w-full rounded-lg" />
      </div>
    )
  }
  if (lessonQuery.isError) {
    const missing = lessonQuery.error instanceof ApiError && lessonQuery.error.status === 404
    return (
      <PanelState
        title={missing ? "Không tìm thấy bài học" : "Không tải được bài học"}
        description={missing ? "Bài học này không tồn tại hoặc đã đổi mã." : errorMessage(lessonQuery.error)}
        action={missing ? undefined : { label: "Thử lại", onClick: () => void lessonQuery.refetch() }}
      />
    )
  }
  const lesson = lessonQuery.data
  if (mode === "quiz") {
    return (
      <QuizView
        lesson={lesson}
        capabilityNames={capabilityNames}
        onExit={() => setMode("lesson")}
        onGraded={invalidateProgress}
        onContentChanged={() => { invalidateProgress(); setMode("lesson") }}
      />
    )
  }
  return (
    <LessonView
      lesson={lesson}
      chapterTitle={chapter?.title}
      chapterLessonCount={chapter?.lessons.length ?? lesson.order}
      lessonNames={lessonNames}
      nextLessonId={nextLessonId}
      configAction={meta ? configActionFor(meta) : null}
      onStartQuiz={() => setMode("quiz")}
    />
  )
}

function AcademyWorkspace() {
  const { lessonId } = useParams<{ lessonId: string }>()
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const curriculumQuery = useCurriculum()
  const config = useAcademyConfig()
  const [dialog, setDialog] = useState<DialogState | null>(null)
  const [masterConflict, setMasterConflict] = useState<MasterConflict | null>(null)
  const [savingMasterId, setSavingMasterId] = useState<string | null>(null)
  const [reloadingMaster, setReloadingMaster] = useState(false)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  const curriculum = curriculumQuery.data
  const lessons = useMemo(() => curriculum?.chapters.flatMap(chapter => chapter.lessons) ?? [], [curriculum])
  const activeLessonId = lessonId ?? lessons[0]?.id
  const granted = useMemo(() => new Set(curriculum?.granted_capabilities ?? []), [curriculum])
  const registryById = useMemo(
    () => new Map((config.registry?.indicators ?? []).map(indicator => [indicator.id, indicator])),
    [config.registry],
  )
  const lessonNames = useMemo(() => new Map(lessons.map(lesson => [lesson.id, lesson.name])), [lessons])
  const capabilityNames = useMemo(() => {
    const names = new Map<string, string>()
    for (const lesson of lessons) {
      names.set(`lesson:${lesson.id}`, lesson.name)
      if (lesson.config_id) names.set(`${lesson.kind === "fundamental" ? "metric" : "indicator"}:${lesson.config_id}`, lesson.name)
    }
    for (const indicator of registryById.values()) names.set(`indicator:${indicator.id}`, indicator.name)
    return names
  }, [lessons, registryById])

  const indicatorOf = useCallback((lesson: CurriculumLesson): TechnicalIndicator | undefined =>
    lesson.kind === "technical" && lesson.config_id ? registryById.get(lesson.config_id) : undefined, [registryById])

  const isLearned = useCallback((lesson: CurriculumLesson): boolean => {
    if (lesson.passed) return true
    if (!lesson.config_id) return false
    return granted.has(`indicator:${lesson.config_id}`) || !!registryById.get(lesson.config_id)?.learned
  }, [granted, registryById])

  const hasControls = (lesson: CurriculumLesson) =>
    config.availability !== "disabled" && lesson.kind === "technical" && !!lesson.config_id

  const savedConfigOf = (indicator: TechnicalIndicator): IndicatorConfig => savedIndicatorConfig(config.state, indicator)

  const controlFor = (lesson: CurriculumLesson): LessonRowControl | null => {
    if (!hasControls(lesson)) return null
    const indicator = indicatorOf(lesson)
    const saved = indicator ? savedConfigOf(indicator) : undefined
    const unsaved = !!masterConflict && masterConflict.indicatorId === lesson.config_id
    return {
      indicatorName: indicator?.name ?? lesson.name,
      learned: isLearned(lesson),
      available: config.availability === "ready" && !!indicator,
      master: unsaved ? masterConflict.desired : !!saved?.master_enabled,
      unsaved,
      busy: savingMasterId === lesson.config_id || config.saving,
    }
  }

  const openConfig = (lesson: CurriculumLesson, side: Side = "buy", activate = false) => {
    const indicator = indicatorOf(lesson)
    if (!indicator || !isLearned(lesson) || config.availability !== "ready") return
    setDialog({ indicatorId: indicator.id, side, activate })
  }

  const saveMaster = async (indicator: TechnicalIndicator, desired: boolean) => {
    setSavingMasterId(indicator.id)
    const outcome = await config.saveIndicator(indicator.id, { ...savedConfigOf(indicator), master_enabled: desired })
    setSavingMasterId(null)
    if (outcome.ok) {
      setMasterConflict(previous => (previous?.indicatorId === indicator.id ? null : previous))
      toast.success(`${desired ? "Đã bật" : "Đã tắt"} ${indicator.name} (bản #${outcome.result.revision}).`)
      return
    }
    if (outcome.reason === "conflict") {
      setMasterConflict({ indicatorId: indicator.id, desired, currentRevision: outcome.currentRevision, reloadedRevision: null })
      return
    }
    toast.error(outcome.message)
  }

  const toggleMaster = (lesson: CurriculumLesson, next: boolean) => {
    const indicator = indicatorOf(lesson)
    if (!indicator || !isLearned(lesson) || config.availability !== "ready") return
    const saved = savedConfigOf(indicator)
    // Master ON with both sides OFF opens the panel to pick one side; it never enables both.
    if (next && !saved.buy.enabled && !saved.sell.enabled) {
      openConfig(lesson, "buy", true)
      return
    }
    void saveMaster(indicator, next)
  }

  const reloadAfterMasterConflict = async () => {
    setReloadingMaster(true)
    try {
      const latest = await config.reload()
      setMasterConflict(previous => previous && { ...previous, reloadedRevision: latest?.saved_revision ?? null })
    } finally {
      setReloadingMaster(false)
    }
  }

  const configActionFor = (lesson: CurriculumLesson) => {
    if (!hasControls(lesson)) return null
    const indicator = indicatorOf(lesson)
    return {
      label: `Cấu hình ${indicator?.name ?? lesson.name}`,
      enabled: !!indicator && isLearned(lesson) && config.availability === "ready",
      onOpen: () => openConfig(lesson),
    }
  }

  if (curriculumQuery.isPending) {
    return (
      <div className="grid min-h-0 flex-1 gap-4 p-4 lg:grid-cols-[340px_minmax(0,1fr)]" aria-busy="true" aria-label="Đang tải Học viện">
        <Skeleton className="h-[60vh] w-full rounded-lg" />
        <Skeleton className="h-[60vh] w-full rounded-lg" />
      </div>
    )
  }
  if (curriculumQuery.isError || !curriculum) {
    const disabled = isAcademyDisabled(curriculumQuery.error)
    return (
      <div className="mx-auto w-full max-w-[720px] p-4 sm:p-6">
        <PanelState
          title={disabled ? "Học viện đang tạm đóng" : "Không tải được Học viện"}
          description={disabled ? "Tính năng Học viện chưa được bật trên hệ thống." : errorMessage(curriculumQuery.error)}
          action={disabled ? undefined : { label: "Thử lại", onClick: () => void curriculumQuery.refetch() }}
        />
      </div>
    )
  }

  const dialogIndicator = dialog ? registryById.get(dialog.indicatorId) : undefined
  const conflictIndicator = masterConflict ? registryById.get(masterConflict.indicatorId) : undefined

  const sidebar = (onNavigate?: () => void) => (
    <AcademySidebar
      curriculum={curriculum}
      activeLessonId={activeLessonId}
      header={<ConfigStatus config={config} />}
      controlFor={controlFor}
      onOpenConfig={lesson => openConfig(lesson)}
      onToggleMaster={toggleMaster}
      onNavigate={onNavigate}
    />
  )

  return (
    <div className="flex min-h-0 flex-1">
      <aside className="hidden w-[340px] shrink-0 border-r border-border bg-card lg:flex lg:flex-col" aria-label="Danh sách chương">
        <ScrollArea className="min-h-0 flex-1">{sidebar()}</ScrollArea>
      </aside>
      <ScrollArea className="min-w-0 flex-1" viewportClassName="[&>div]:!block">
        <div className="space-y-4 p-4 sm:p-6">
          <div className="lg:hidden">
            <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
              <SheetTrigger asChild>
                <Button variant="outline" size="sm"><List aria-hidden="true" />Danh sách bài học</Button>
              </SheetTrigger>
              <SheetContent side="left" className="gap-0 overflow-y-auto p-0 data-[side=left]:w-[min(22rem,90vw)]">
                <SheetHeader className="border-b border-border">
                  <SheetTitle>Chương trình Học viện</SheetTitle>
                  <SheetDescription className="sr-only">18 chương, chọn bài để xem.</SheetDescription>
                </SheetHeader>
                {mobileNavOpen && sidebar(() => setMobileNavOpen(false))}
              </SheetContent>
            </Sheet>
          </div>

          {masterConflict && (
            <Alert variant="destructive" className="mx-auto max-w-[880px]">
              <AlertTitle>Cấu hình đã thay đổi ở nơi khác</AlertTitle>
              <AlertDescription>
                {masterConflict.reloadedRevision === null
                  ? `Thay đổi “${masterConflict.desired ? "Bật" : "Tắt"} ${conflictIndicator?.name ?? masterConflict.indicatorId}” chưa được lưu và vẫn được giữ${masterConflict.currentRevision !== null ? ` (bản hiện tại #${masterConflict.currentRevision})` : ""}.`
                  : `Đã tải bản #${masterConflict.reloadedRevision}. Lưu lại thay đổi “${masterConflict.desired ? "Bật" : "Tắt"} ${conflictIndicator?.name ?? masterConflict.indicatorId}”?`}
              </AlertDescription>
              <div className="col-start-2 mt-2 flex flex-wrap gap-2">
                {masterConflict.reloadedRevision === null ? (
                  <Button variant="outline" size="sm" disabled={reloadingMaster} onClick={() => void reloadAfterMasterConflict()}>
                    <RefreshCw aria-hidden="true" className={reloadingMaster ? "animate-spin" : undefined} />
                    Tải lại
                  </Button>
                ) : (
                  <>
                    <Button
                      size="sm"
                      disabled={!conflictIndicator || config.saving}
                      onClick={() => { if (conflictIndicator) void saveMaster(conflictIndicator, masterConflict.desired) }}
                    >
                      Lưu thay đổi
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setMasterConflict(null)}>Bỏ thay đổi</Button>
                  </>
                )}
              </div>
            </Alert>
          )}

          {activeLessonId
            ? (
              <LessonPane
                key={activeLessonId}
                lessonId={activeLessonId}
                curriculum={curriculum}
                lessonNames={lessonNames}
                capabilityNames={capabilityNames}
                configActionFor={configActionFor}
              />
            )
            : <PanelState title="Chưa có bài học" description="Chương trình Học viện chưa có bài nào." />}
        </div>
      </ScrollArea>

      {dialog && dialogIndicator && config.state && (
        <IndicatorConfigDialog
          key={`${dialog.indicatorId}-${dialog.side}-${dialog.activate}`}
          indicator={dialogIndicator}
          saved={savedConfigOf(dialogIndicator)}
          savedRevision={config.state.saved_revision}
          initialSide={dialog.side}
          activate={dialog.activate}
          saving={config.saving}
          onSave={next => config.saveIndicator(dialogIndicator.id, next)}
          onReload={async () => {
            const latest = await config.reload()
            void queryClient.invalidateQueries({ queryKey: academyKeys.registry(user?.id ?? null) })
            return latest
          }}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  )
}

/** `/hoc-vien` and `/hoc-vien/:lessonId`: Học viện (bot-v2 Academy). */
export function AcademyPage() {
  const { isAuthenticated, isLoading, sessionExpired, openAuth } = useAuth()

  return (
    <WorkspacePage
      title="Học viện"
      description="18 chương chỉ báo, chỉ tiêu và hệ thống. Đạt 8/8 bài kiểm tra để mở quyền sử dụng trong Chiến lược."
      scroll={false}
    >
      {isLoading
        ? (
          <div className="space-y-3 p-4 sm:p-6" aria-busy="true">
            <Skeleton className="h-7 w-56" />
            <Skeleton className="h-40 w-full rounded-lg" />
          </div>
        )
        : isAuthenticated
          ? <AcademyWorkspace />
          : (
            <div className="mx-auto w-full max-w-[720px] p-4 sm:p-6">
              <PanelState
                title={sessionExpired ? "Phiên đăng nhập đã hết hạn" : "Cần đăng nhập"}
                description={sessionExpired
                  ? "Đăng nhập lại để tiếp tục học. Tiến độ và quyền đã mở được lưu trên tài khoản."
                  : "Học viện lưu tiến độ và quyền đã mở theo tài khoản. Đăng nhập để học và làm bài kiểm tra."}
                action={{ label: "Đăng nhập", onClick: () => openAuth("login") }}
              />
            </div>
          )}
    </WorkspacePage>
  )
}
