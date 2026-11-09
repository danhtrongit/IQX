import { Check, LoaderCircle, Star, X } from "lucide-react"

import { Skeleton } from "@/components/ui/skeleton"
import { ApiError } from "@/lib/api"
import { cdCard } from "@/lib/candle-dojo/cards"
import { cn } from "@/lib/utils"
import type { CandleDojoLessonResult } from "../candle-dojo-api"
import { CandleCard } from "../candle-card"
import { CardPurchase } from "./card-purchase"
import { GradingBar, GradingButton, PreviewNote } from "./lesson-chrome"
import { formatXu, type LessonContent, type LocalLessonGrade } from "./lesson-model"

export type LessonSubmitState =
  | { status: "idle" }
  | { status: "pending" }
  | { status: "error"; error: unknown }
  | { status: "success"; data: CandleDojoLessonResult }

export interface LessonResultProps {
  content: LessonContent
  preview: boolean
  /** Chấm tại máy: chỉ dùng ở chế độ xem trước. */
  local: LocalLessonGrade
  submit: LessonSubmitState
  onRetry: () => void
  /** Thoát và bỏ kết quả (khi không ghi nhận được). */
  onDiscard: () => void
  /** Đóng màn kết thúc, về Dojo. */
  onDone: () => void
}

interface ResultView {
  stars: number
  bestStars: number
  huntStar: boolean
  twinStar: boolean
  huntFound: number
  huntTotal: number
  twinsRight: number
  twinsTotal: number
  /** Xu thưởng hiển thị: chỉ khi server báo lần đầu và có xu. */
  rewardXu: number
  cardIds: string[]
}

function resultView(props: LessonResultProps): ResultView | null {
  const { content, preview, local, submit } = props
  if (preview) {
    return {
      stars: local.stars.stars,
      bestStars: local.stars.stars,
      huntStar: local.hunt.star,
      twinStar: local.twins.star,
      huntFound: local.hunt.found,
      huntTotal: local.hunt.total,
      twinsRight: local.twins.right,
      twinsTotal: local.twins.total,
      rewardXu: 0,
      cardIds: content.cards.map((card) => card.id),
    }
  }
  if (submit.status !== "success") return null
  const { data } = submit
  return {
    stars: data.stars,
    bestStars: data.best_stars,
    huntStar: data.hunt.star,
    twinStar: data.twins.star,
    huntFound: data.hunt.found,
    huntTotal: data.hunt.total,
    twinsRight: data.twins.right,
    twinsTotal: data.twins.total,
    rewardXu: data.first_time && data.reward_xu > 0 ? data.reward_xu : 0,
    cardIds: data.card_ids,
  }
}

function Stars({ count }: { count: number }) {
  return (
    <div role="img" aria-label={`${count} trên 3 sao`} className="flex gap-1.5">
      {[1, 2, 3].map((n) => (
        <Star
          key={n}
          aria-hidden="true"
          className={cn("size-11", n <= count ? "fill-current text-amber-700 dark:text-chart-2" : "text-border")}
          strokeWidth={n <= count ? 1.5 : 2}
        />
      ))}
    </div>
  )
}

function Criterion({ ok, label }: { ok: boolean; label: string }) {
  return (
    <li className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-3 py-1 text-sm font-semibold text-foreground">
      {ok ? (
        <Check aria-hidden="true" className="size-4 text-(--status-success)" />
      ) : (
        <X aria-hidden="true" className="size-4 text-destructive" />
      )}
      <span className="sr-only">{ok ? "Đạt: " : "Chưa đạt: "}</span>
      {label}
    </li>
  )
}

function submitErrorMessage(error: unknown) {
  return error instanceof ApiError && error.message ? error.message : "Kiểm tra kết nối rồi thử lại."
}

/** Màn kết thúc bài: số sao, lật thẻ của bài, xu thưởng lần đầu và nút mua thẻ ngay tại đây. */
export function LessonResult(props: LessonResultProps) {
  const { content, preview, submit, onRetry, onDiscard, onDone } = props
  const view = resultView(props)
  const waiting = !preview && !view

  return (
    <>
      <div className="flex-1 pb-4">
        <div className="flex flex-col items-center gap-3.5 pt-2 text-center">
          <h2 className="font-heading text-2xl font-bold text-balance text-foreground">Xong bài {content.lesson.title}</h2>
          {view ? (
            <>
              <Stars count={view.stars} />
              <ul className="flex flex-wrap justify-center gap-2" aria-label="Kết quả từng bước">
                <Criterion ok label="Hoàn thành" />
                <Criterion ok={view.huntStar} label={`Săn nến ${view.huntFound}/${view.huntTotal}`} />
                <Criterion ok={view.twinStar} label={`Song sinh ${view.twinsRight}/${view.twinsTotal}`} />
              </ul>
              {view.bestStars > view.stars ? (
                <p className="text-sm font-semibold text-foreground">Sao cao nhất của bài này: {view.bestStars}</p>
              ) : null}
              {view.rewardXu > 0 ? (
                <p className="font-heading text-xl font-bold text-amber-700 dark:text-chart-2">+{formatXu(view.rewardXu)}</p>
              ) : null}
            </>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <Skeleton className="h-11 w-40" />
              <Skeleton className="h-7 w-64 max-w-full" />
            </div>
          )}
          <p className="text-sm font-semibold text-foreground">Mua ngay ở đây hoặc sau trong Shop › Thẻ nến.</p>
          <div className="flex flex-wrap justify-center gap-4">
            {(view ? view.cardIds : content.cards.map((card) => card.id)).map((cardId) => (
              <div key={cardId} className="flex w-[130px] flex-col items-center gap-2" data-card={cardId}>
                <CandleCard card={cdCard(cardId) ?? cardId} width={130} reveal={!!view} faceDown={waiting} />
                {view ? <CardPurchase cardId={cardId} preview={preview} unlocked /> : <Skeleton className="h-9 w-full" />}
              </div>
            ))}
          </div>
        </div>
      </div>
      {preview ? (
        <GradingBar actions={<GradingButton onClick={onDone}>Về Dojo</GradingButton>}>
          <PreviewNote />
        </GradingBar>
      ) : submit.status === "pending" || submit.status === "idle" ? (
        <GradingBar actions={<GradingButton disabled>Về Dojo</GradingButton>}>
          <span className="inline-flex items-center gap-2">
            <LoaderCircle aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" />
            Đang ghi nhận kết quả bài học
          </span>
        </GradingBar>
      ) : submit.status === "error" ? (
        <GradingBar
          tone="bad"
          title="Chưa ghi nhận được kết quả."
          actions={
            <>
              <GradingButton onClick={onRetry}>Thử lại</GradingButton>
              <GradingButton variant="outline" onClick={onDiscard}>
                Thoát, không lưu
              </GradingButton>
            </>
          }
        >
          {submitErrorMessage(submit.error)} Kết quả làm bài của bạn vẫn được giữ để gửi lại.
        </GradingBar>
      ) : (
        <GradingBar actions={<GradingButton onClick={onDone}>Về Dojo</GradingButton>}>Tiến độ đã được ghi nhận.</GradingBar>
      )}
    </>
  )
}
