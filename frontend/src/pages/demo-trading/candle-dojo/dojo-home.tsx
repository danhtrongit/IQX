/**
 * Màn Candle Dojo (spec v1.2 §1, §2, §13): một màn không có thanh tab riêng. Điện thoại một cột (tối đa 480 px);
 * từ 900 px hai cột (tối đa 980 px): trái là Nhập môn và 5 Dojo, phải (330 px, dính khi cuộn) là đai hiện tại,
 * Thẻ nến của bạn, Luyện công và chế độ xem trước. Mọi con số (đai, sao, xu, thẻ, chuỗi) lấy từ server.
 */
import { Coins, Flame, Lock, Swords } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { useAuth } from "@/hooks/use-auth"
import { cdCard } from "@/lib/candle-dojo/cards"
import { CD_DOJOS, type CdLessonDef } from "@/lib/candle-dojo/lessons"
import { cn } from "@/lib/utils"
import { formatXu } from "../shop/shop-model"
import { useCandleDojoState } from "./candle-dojo-api"
import { CandleShapeSvg } from "./candle-card"
import { cardFaceShape } from "./candle-card-style"
import { CD_CHART_COLORS } from "./candle-chart-model"
import { useCandleDojo } from "./candle-dojo-context"
import {
  avatarInitial,
  buildHomeModel,
  COIN_TEXT,
  DOJO_COPY,
  EXAM_RULE,
  pickDrillLesson,
  type DojoRowModel,
  type HomeModel,
  type LessonRowModel,
} from "./candle-dojo-model"
import { BeltAvatar, BeltBar, BeltGlyph } from "./dojo-belt"
import { ActionPill, DojoError, DojoHeading, DojoRowButton, DoneMark, StarMeter } from "./dojo-rows"

const CARD_BOX = "rounded-xl border border-border bg-card p-3.5"
const BOX_TITLE = "mb-2 text-xs font-bold tracking-wider text-foreground uppercase"

function HomeSkeleton() {
  return (
    <div className="space-y-4" role="status" aria-label="Đang tải Candle Dojo" data-testid="dojo-home-loading">
      <div className="flex items-center justify-between gap-3"><Skeleton className="h-8 w-40" /><Skeleton className="h-7 w-44" /></div>
      <div className="grid gap-4 min-[900px]:grid-cols-[minmax(0,1fr)_330px]">
        <div className="space-y-3 min-[900px]:order-2">
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-20 rounded-xl" />
          <Skeleton className="h-16 rounded-xl" />
        </div>
        <div className="space-y-2 min-[900px]:order-1">
          <Skeleton className="h-6 w-48" />
          {[0, 1, 2, 3, 4].map((index) => <Skeleton key={index} className="h-14 rounded-xl" />)}
        </div>
      </div>
    </div>
  )
}

function lessonSubtitle(lesson: CdLessonDef): string {
  return lesson.cards.map((id) => cdCard(id)?.name ?? id).join(" · ")
}

function LessonIcon({ lesson }: { lesson: CdLessonDef }) {
  const card = cdCard(lesson.mainCard)
  if (!card) return null
  return <CandleShapeSvg shape={cardFaceShape(card)} vn={card.vn} className="h-10 w-12" />
}

function IntroSection({ model, onOpen }: { model: HomeModel; onOpen: () => void }) {
  return (
    <section aria-labelledby="dojo-intro-heading">
      <DojoHeading
        id="dojo-intro-heading"
        color={CD_DOJOS[0].color}
        title="Nhập môn"
        aside={model.introDone ? "Đã có đai trắng" : "Học xong nhận đai trắng"}
      />
      <DojoRowButton
        data-intro="anatomy"
        current={!model.introDone}
        icon={(
          <svg viewBox="0 0 48 40" className="h-10 w-12" aria-hidden="true">
            <line x1="24" x2="24" y1="4" y2="36" stroke={CD_CHART_COLORS.up} strokeWidth="3" />
            <rect x="17" y="10" width="14" height="16" rx="2" fill={CD_CHART_COLORS.up} />
          </svg>
        )}
        title={DOJO_COPY.introTitle}
        subtitle={DOJO_COPY.introSubtitle}
        trailing={model.introDone ? <DoneMark label="Đã học xong nhập môn" /> : <ActionPill>Học</ActionPill>}
        onClick={onOpen}
      />
    </section>
  )
}

function LessonRow({ row, onOpen }: { row: LessonRowModel; onOpen: (lessonId: string) => void }) {
  return (
    <DojoRowButton
      data-lesson={row.lesson.id}
      current={row.current}
      locked={!row.open}
      icon={<LessonIcon lesson={row.lesson} />}
      title={row.lesson.title}
      subtitle={lessonSubtitle(row.lesson)}
      trailing={row.stars > 0 ? <StarMeter stars={row.stars} /> : <ActionPill>Học</ActionPill>}
      onClick={() => onOpen(row.lesson.id)}
    />
  )
}

function ExamRow({ dojo, preview, onOpen }: { dojo: DojoRowModel; preview: boolean; onOpen: (dojo: number) => void }) {
  const blocked = preview || !dojo.examReady
  return (
    <DojoRowButton
      exam
      data-exam={dojo.n}
      locked={blocked}
      icon={<BeltGlyph color={dojo.color} className="h-10 w-12" />}
      title={`Thi đai ${dojo.belt.toLowerCase()}`}
      subtitle={preview ? DOJO_COPY.previewExam : dojo.examReady ? EXAM_RULE : DOJO_COPY.examLocked}
      trailing={dojo.passed ? <DoneMark label="Đã qua bài thi" /> : <ActionPill>Thi</ActionPill>}
      onClick={() => onOpen(dojo.n)}
    />
  )
}

function DojoSection({ dojo, preview, onOpenLesson, onOpenExam }: {
  dojo: DojoRowModel
  preview: boolean
  onOpenLesson: (lessonId: string) => void
  onOpenExam: (dojo: number) => void
}) {
  if (!dojo.unlocked) {
    return (
      <div data-dojo-locked={dojo.n} className="flex items-center justify-between gap-3 rounded-xl border border-dashed border-border bg-card px-3.5 py-3 text-sm font-bold text-foreground">
        <span className="flex min-w-0 items-center gap-2"><Lock aria-hidden="true" className="size-4 shrink-0" />{`Dojo ${dojo.n} · ${dojo.name}`}</span>
        <span className="text-xs font-semibold whitespace-nowrap">{`${dojo.lessonsTotal} bài · Đai ${dojo.belt.toLowerCase()}`}</span>
      </div>
    )
  }
  const headingId = `dojo-heading-${dojo.n}`
  return (
    <section aria-labelledby={headingId} data-dojo={dojo.n}>
      <DojoHeading id={headingId} color={dojo.color} title={`Dojo ${dojo.n} · ${dojo.name}`} aside={`${dojo.lessonsDone}/${dojo.lessonsTotal}`} />
      <div className="flex flex-col gap-2">
        {dojo.lessons.map((row) => <LessonRow key={row.lesson.id} row={row} onOpen={onOpenLesson} />)}
        <ExamRow dojo={dojo} preview={preview} onOpen={onOpenExam} />
      </div>
    </section>
  )
}

function DrillBlock({ model, preview, onStart }: { model: HomeModel; preview: boolean; onStart: () => void }) {
  const { drill } = model
  if (!drill.unlocked) {
    return (
      <section data-testid="dojo-drill" data-state="locked" className={cn(CARD_BOX, "flex items-center justify-between gap-3 border-dashed")}>
        <div className="min-w-0">
          <h3 className="font-heading text-base font-bold text-foreground">{DOJO_COPY.drillTitle}</h3>
          <p className="text-xs font-medium text-foreground">{DOJO_COPY.drillLocked}</p>
        </div>
        <Lock aria-hidden="true" className="size-5 shrink-0 text-foreground" />
      </section>
    )
  }
  const doneToday = !preview && drill.doneToday
  const empty = drill.poolSize === 0
  return (
    <section data-testid="dojo-drill" data-state={doneToday ? "done" : "ready"} className={cn(CARD_BOX, "flex items-center justify-between gap-3 border-2 border-primary")}>
      <div className="min-w-0">
        <h3 className="font-heading text-base font-bold text-foreground">{DOJO_COPY.drillTitle}</h3>
        <p className="text-xs font-medium text-foreground">
          {preview
            ? "Xem trước: săn một mẫu nến bất kỳ, không nhận xu."
            : doneToday
              ? `Hôm nay đã luyện xong · chuỗi ${model.streakDays} ngày`
              : `Săn một mẫu nến đã học · giữ chuỗi ${model.streakDays} ngày`}
        </p>
        {!preview && <p className={cn("mt-0.5 text-xs font-bold tabular-nums", COIN_TEXT)}>{`+${formatXu(drill.rewardXu)} xu mỗi ngày`}</p>}
      </div>
      <Button type="button" size="lg" variant={doneToday ? "outline" : "default"} disabled={empty} onClick={onStart} className="shrink-0">
        {doneToday ? "Luyện thêm" : "Bắt đầu"}
      </Button>
    </section>
  )
}

function PreviewToggle({ preview, onChange }: { preview: boolean; onChange: (preview: boolean) => void }) {
  return (
    <div className={cn(CARD_BOX, "flex items-center justify-between gap-3")}>
      <div className="min-w-0">
        <Label htmlFor="dojo-preview-switch" className="text-sm font-bold text-foreground">{DOJO_COPY.previewTitle}</Label>
        <p className="text-xs font-medium text-foreground">{DOJO_COPY.previewHint}</p>
      </div>
      <Switch id="dojo-preview-switch" checked={preview} onCheckedChange={onChange} />
    </div>
  )
}

export function DojoHome({ onOpenShop }: { onOpenShop: () => void }) {
  const { user } = useAuth()
  const { open, preview, setPreview } = useCandleDojo()
  const query = useCandleDojoState()
  const state = query.data

  if (!state) {
    return query.isError
      ? <DojoError message={DOJO_COPY.loadFailed} onRetry={() => void query.refetch()} retrying={query.isFetching} />
      : <HomeSkeleton />
  }

  const model = buildHomeModel(state, preview)

  function startDrill() {
    const lessonId = state ? pickDrillLesson(state, preview) : null
    if (lessonId) open({ kind: "drill", lessonId })
  }

  return (
    <div className="space-y-4" data-testid="dojo-home" data-preview={preview || undefined}>
      {query.isRefetchError && (
        <DojoError message="Chưa cập nhật được dữ liệu mới nhất. Đang hiển thị dữ liệu đã xác nhận gần nhất." onRetry={() => void query.refetch()} retrying={query.isFetching} />
      )}

      <header className="flex items-center justify-between gap-3">
        <h2 className="flex min-w-0 items-center gap-2 font-heading text-lg font-extrabold text-foreground">
          <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground"><Swords className="size-[18px]" /></span>
          {DOJO_COPY.title}
          {preview && <Badge variant="outline" className="text-[10px] font-bold text-foreground">Xem trước</Badge>}
        </h2>
        <div className="flex shrink-0 items-center gap-1.5">
          <span
            data-testid="dojo-streak"
            aria-label={`Chuỗi luyện công ${model.streakDays} ngày`}
            className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-2.5 py-1 text-xs font-bold text-foreground tabular-nums"
          >
            <Flame aria-hidden="true" className="size-3.5 text-chart-2" />
            {model.streakDays}
          </span>
          <span
            data-testid="dojo-balance"
            aria-label={`Số dư ${formatXu(model.balance)} xu`}
            className={cn("inline-flex items-center gap-1 rounded-full border border-border bg-card px-2.5 py-1 text-xs font-bold tabular-nums", COIN_TEXT)}
          >
            <Coins aria-hidden="true" className="size-3.5" />
            {formatXu(model.balance)} xu
          </span>
        </div>
      </header>

      {preview && (
        <p role="status" data-testid="dojo-preview-banner" className="rounded-lg border border-chart-2/50 bg-chart-2/10 px-3 py-2 text-sm font-semibold text-foreground">
          {DOJO_COPY.previewBanner}
        </p>
      )}

      <div className="grid gap-4 min-[900px]:grid-cols-[minmax(0,1fr)_330px] min-[900px]:items-start min-[900px]:gap-[22px]">
        <aside aria-label="Tiến độ của bạn" className="space-y-3 min-[900px]:sticky min-[900px]:top-3 min-[900px]:order-2">
          <section data-testid="dojo-belt-card" className={cn(CARD_BOX, "flex items-center gap-3.5")}>
            <BeltAvatar belt={model.belt} size={58} initial={avatarInitial(user)} className="mb-1" />
            <div className="min-w-0 space-y-1.5">
              <p className="text-[11px] font-bold tracking-wider text-foreground uppercase">Đai hiện tại</p>
              <h3 className="font-heading text-lg leading-tight font-extrabold text-foreground">{model.beltLabel}</h3>
              <BeltBar belt={model.belt} />
            </div>
          </section>

          <section data-testid="dojo-cards-block" className={CARD_BOX}>
            <h3 className={BOX_TITLE}>{DOJO_COPY.cardsTitle}</h3>
            <p className="text-sm font-semibold text-foreground">
              <b data-testid="dojo-cards-count" className="font-heading tabular-nums">{`${model.cardsOwned} / ${model.cardsTotal}`}</b>
              {" thẻ. Học xong bài nào, mua thẻ của bài đó ngay cuối bài hoặc trong Shop › Thẻ nến."}
            </p>
            <Button type="button" size="sm" variant="outline" className="mt-2.5" onClick={onOpenShop}>{DOJO_COPY.openShop}</Button>
          </section>

          <DrillBlock model={model} preview={preview} onStart={startDrill} />
          <PreviewToggle preview={preview} onChange={setPreview} />
        </aside>

        <div className="min-w-0 space-y-4 min-[900px]:order-1">
          <IntroSection model={model} onOpen={() => open({ kind: "intro" })} />
          {model.dojos.map((dojo) => (
            <DojoSection
              key={dojo.n}
              dojo={dojo}
              preview={preview}
              onOpenLesson={(lessonId) => open({ kind: "lesson", lessonId })}
              onOpenExam={(n) => open({ kind: "exam", dojo: n })}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
