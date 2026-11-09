/**
 * Nhập môn "Giải phẫu cây nến" (spec v1.2 §5.2): bốn lần chạm vào một cây nến xanh lớn (bóng trên, thân, bóng
 * dưới, giá đóng). Chạm sai thì đánh dấu chỗ đúng. Xong thì gọi server nhận đai trắng; thưởng +100 xu chỉ ở
 * lần đầu và con số lấy từ phản hồi. Ở chế độ xem trước màn này không gọi API.
 */
import { useRef, useState, type KeyboardEvent, type MouseEvent } from "react"

import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { CD_CHART_COLORS } from "./candle-chart-model"
import { useCompleteDojoIntro, type CandleDojoIntroResult } from "./candle-dojo-api"
import { COIN_TEXT } from "./candle-dojo-model"
import { BeltAvatar } from "./dojo-belt"
import { describeIntroError } from "./dojo-errors"
import { ChartStage, FeedbackBar, FocusHeader, StepLabel } from "./dojo-focus"
import {
  ANATOMY_QUESTIONS,
  ANATOMY_VIEWBOX,
  ANATOMY_ZONES,
  CANDLE,
  hitsAnatomyPart,
  type AnatomyPart,
} from "./dojo-intro-model"
import { DojoError } from "./dojo-rows"

type Phase =
  | { kind: "play" }
  | { kind: "saving" }
  | { kind: "error"; message: string }
  | { kind: "done"; result: CandleDojoIntroResult | null }

const TOTAL_STEPS = ANATOMY_QUESTIONS.length + 1
const WHITE_BELT = 0

function AnatomyChart({ step, picked, onPick }: {
  step: number
  picked: { part: AnatomyPart; good: boolean } | null
  onPick: (part: AnatomyPart | null, point: { x: number; y: number }) => void
}) {
  const svg = useRef<SVGSVGElement>(null)
  const current = ANATOMY_QUESTIONS[step].part
  const mark = picked ? ANATOMY_ZONES[ANATOMY_QUESTIONS[step].part] : null

  function pointFrom(event: MouseEvent<SVGSVGElement>) {
    const box = svg.current?.getBoundingClientRect()
    if (!box || box.width === 0 || box.height === 0) return { x: Number.NaN, y: Number.NaN }
    return {
      x: ((event.clientX - box.left) / box.width) * ANATOMY_VIEWBOX.width,
      y: ((event.clientY - box.top) / box.height) * ANATOMY_VIEWBOX.height,
    }
  }

  function keyActivate(part: AnatomyPart) {
    return (event: KeyboardEvent<SVGRectElement>) => {
      if (event.key !== "Enter" && event.key !== " ") return
      event.preventDefault()
      onPick(part, { x: Number.NaN, y: Number.NaN })
    }
  }

  return (
    <svg
      ref={svg}
      viewBox={`0 0 ${ANATOMY_VIEWBOX.width} ${ANATOMY_VIEWBOX.height}`}
      role="group"
      aria-label="Cây nến xanh lớn"
      data-testid="dojo-anatomy-chart"
      className="block h-auto w-full touch-manipulation select-none"
      onClick={picked ? undefined : (event) => onPick(null, pointFrom(event))}
    >
      <line
        x1={CANDLE.center}
        x2={CANDLE.center}
        y1={CANDLE.wickTop}
        y2={CANDLE.wickBottom}
        stroke={CD_CHART_COLORS.up}
        strokeWidth={6}
        strokeLinecap="round"
      />
      <rect
        x={CANDLE.center - CANDLE.bodyWidth / 2}
        y={CANDLE.bodyTop}
        width={CANDLE.bodyWidth}
        height={CANDLE.bodyBottom - CANDLE.bodyTop}
        rx={4}
        fill={CD_CHART_COLORS.up}
      />
      {step >= 3 && (
        <g fontSize={13} fontWeight={800} fill={CD_CHART_COLORS.ink2} aria-hidden="true">
          <text x={CANDLE.center + 44} y={CANDLE.openY + 4}>Mở ?</text>
          <text x={CANDLE.center + 44} y={CANDLE.closeY + 4}>Đóng ?</text>
        </g>
      )}
      {mark && picked && (
        <rect
          data-testid="dojo-anatomy-mark"
          data-good={picked.good}
          x={mark.x - 4}
          y={mark.y - 4}
          width={mark.width + 8}
          height={mark.height + 8}
          rx={6}
          fill="none"
          stroke={picked.good ? CD_CHART_COLORS.up : CD_CHART_COLORS.gold}
          strokeWidth={3}
        />
      )}
      {/* Cho bàn phím: mỗi phần là một nút; con trỏ vẫn đi xuyên qua để việc chấm đúng sai theo toạ độ chạm. */}
      {!picked && (Object.keys(ANATOMY_ZONES) as AnatomyPart[]).map((part) => {
        const zone = ANATOMY_ZONES[part]
        const name = ANATOMY_QUESTIONS.find((question) => question.part === part)?.name ?? part
        return (
          <rect
            key={part}
            role="button"
            tabIndex={0}
            aria-label={name}
            data-part={part}
            data-current={part === current || undefined}
            x={zone.x}
            y={zone.y}
            width={zone.width}
            height={zone.height}
            rx={4}
            strokeWidth={3}
            pointerEvents="none"
            className="fill-transparent stroke-transparent outline-none focus-visible:stroke-ring"
            onKeyDown={keyActivate(part)}
          />
        )
      })}
    </svg>
  )
}

export function DojoIntro({ preview, onExit }: { preview: boolean; onExit: () => void }) {
  const { mutateAsync: completeIntro } = useCompleteDojoIntro()
  const [step, setStep] = useState(0)
  const [picked, setPicked] = useState<{ part: AnatomyPart; good: boolean } | null>(null)
  const [phase, setPhase] = useState<Phase>({ kind: "play" })

  async function save() {
    setPhase({ kind: "saving" })
    try {
      setPhase({ kind: "done", result: await completeIntro() })
    } catch (error) {
      setPhase({ kind: "error", message: describeIntroError(error) })
    }
  }

  function finish() {
    if (preview) setPhase({ kind: "done", result: null })
    else void save()
  }

  function pick(part: AnatomyPart | null, point: { x: number; y: number }) {
    if (picked) return
    const asked = ANATOMY_QUESTIONS[step].part
    // A keyboard press names the part itself; a tap is judged by where it landed.
    const good = part ? part === asked : hitsAnatomyPart(asked, point.x, point.y)
    setPicked({ part: asked, good })
  }

  function next() {
    setPicked(null)
    if (step + 1 < ANATOMY_QUESTIONS.length) setStep(step + 1)
    else finish()
  }

  if (phase.kind === "done") {
    const { result } = phase
    return (
      <div className="flex flex-col items-center gap-3.5 pt-4 text-center" data-testid="dojo-intro-result" data-preview={preview || undefined}>
        <h2 className="font-heading text-[26px] font-bold text-foreground">Hoàn thành nhập môn</h2>
        <BeltAvatar belt={result?.belt ?? WHITE_BELT} size={110} className="mb-2" />
        {result?.first_time ? (
          <p className="font-extrabold text-foreground">
            {"Nhận đai trắng · "}
            <span className={cn("tabular-nums", COIN_TEXT)}>{`+${result.reward_xu} xu`}</span>
            {" · mở Dojo 1"}
          </p>
        ) : null}
        {result === null && <p className="font-semibold text-foreground">Chế độ xem trước: không lưu đai, không nhận xu.</p>}
        <Button type="button" size="lg" className="h-11 w-full max-w-[360px] text-base font-bold" onClick={onExit}>Về Dojo</Button>
      </div>
    )
  }

  if (phase.kind === "saving") {
    return (
      <div className="space-y-3" role="status" aria-label="Đang lưu nhập môn" data-testid="dojo-intro-saving">
        <Skeleton className="mx-auto h-8 w-60" />
        <Skeleton className="mx-auto size-[110px] rounded-full" />
        <Skeleton className="mx-auto h-5 w-48" />
      </div>
    )
  }

  if (phase.kind === "error") {
    return (
      <div className="space-y-3" data-testid="dojo-intro-error">
        <DojoError message={phase.message} onRetry={() => void save()} />
        <Button type="button" variant="outline" onClick={onExit}>Về Dojo</Button>
      </div>
    )
  }

  const question = ANATOMY_QUESTIONS[step]
  return (
    <div data-testid="dojo-intro" data-step={step}>
      <FocusHeader exitLabel="Thoát nhập môn" onExit={onExit} total={TOTAL_STEPS} current={step} />
      <StepLabel>Nhập môn · Giải phẫu cây nến</StepLabel>
      <h2 className="mb-2.5 font-heading text-xl font-bold text-foreground min-[900px]:text-2xl">{question.prompt}</h2>
      <ChartStage>
        <AnatomyChart step={step} picked={picked} onPick={pick} />
      </ChartStage>
      <p className="mt-2.5 min-h-11 text-center text-[15px] font-bold text-foreground">
        Nến xanh: giá đóng cao hơn giá mở. Nến đỏ: ngược lại.
      </p>
      {picked && (
        <FeedbackBar
          good={picked.good}
          title={picked.good ? "Đúng!" : "Chỗ được đánh dấu mới đúng."}
          detail={question.explain}
          actionLabel={step + 1 < ANATOMY_QUESTIONS.length ? "Tiếp tục" : "Hoàn thành"}
          onAction={next}
        />
      )}
    </div>
  )
}
