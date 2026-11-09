import { useCallback, useEffect, useRef, useState, type ReactNode } from "react"
import { Timer } from "lucide-react"

import { CD_HUNT_SECONDS, gradeHunt, type CdHuntResult } from "@/lib/candle-dojo/grading"
import { cn } from "@/lib/utils"
import { CandleChart } from "../../candle-chart"
import { CD_CHART_COLORS, type CdBand, type CdChartScale, type CdTag } from "../../candle-chart-model"
import { ChartStage, StepHeading } from "../lesson-chrome"
import { classifyHuntTap, HUNT_INTRO_CAPTION, wrongTapInfo, type HuntTapKind, type LessonContent } from "../lesson-model"

/** Vòng đánh dấu và vùng tô đỏ hiện ngắn sau mỗi lần chạm (ms). */
const MARK_MS = 900

interface TapMark {
  id: number
  index: number
  kind: HuntTapKind
  start: number
  end: number
  name: string | null
}

export interface HuntOutcome {
  result: CdHuntResult
  /** Mọi chỗ đã chạm (chỉ số nến), theo thứ tự chạm. */
  taps: number[]
}

export interface HuntStepProps {
  content: LessonContent
  /** Nhãn trên tiêu đề (ví dụ "4 · Săn nến" hoặc "Luyện công mỗi ngày"). */
  badge: string
  /** Gọi đúng một lần khi hết giờ hoặc tìm đủ mẫu, kèm mọi chỗ đã chạm. */
  onEnd?: (taps: number[]) => void
  /** Thanh chấm bài ở đáy sau khi kết thúc. */
  renderBar: (outcome: HuntOutcome) => ReactNode
}

/**
 * Săn nến (spec v1.2 §5.1 bước 4, §5.4): một khung duy nhất, không kéo, không cuộn; cả biểu đồ giãn vừa bề
 * rộng khung, 30 giây. Chạm lệch tối đa ±1 nến so với mẫu là trúng; chạm nhầm thì máy nói tên nó nhận ra.
 * Chấm bằng đúng `gradeHunt` mà server dùng để chấm lại.
 */
export function HuntStep({ content, badge, onEnd, renderBar }: HuntStepProps) {
  const { hunt } = content.exercises
  const mainName = content.mainCard.name
  const [taps, setTaps] = useState<number[]>([])
  const [timeLeft, setTimeLeft] = useState(CD_HUNT_SECONDS)
  const [over, setOver] = useState(false)
  const [combo, setCombo] = useState(0)
  const [caption, setCaption] = useState<{ text: string; tone: HuntTapKind | "idle" }>({ text: HUNT_INTRO_CAPTION, tone: "idle" })
  const [mark, setMark] = useState<TapMark | null>(null)

  const tapsRef = useRef<number[]>([])
  const remainingRef = useRef(CD_HUNT_SECONDS)
  const comboRef = useRef(0)
  const markIdRef = useRef(0)
  const endedRef = useRef(false)
  const onEndRef = useRef(onEnd)
  useEffect(() => {
    onEndRef.current = onEnd
  }, [onEnd])

  const finish = useCallback(
    (timeUp: boolean) => {
      if (endedRef.current) return
      endedRef.current = true
      setOver(true)
      if (timeUp) {
        const missed = hunt.targets.length - gradeHunt(hunt, tapsRef.current).found
        setCaption({ text: missed > 0 ? "Hết giờ! Mẫu còn sót đã được tô vàng." : "Hết giờ!", tone: "idle" })
      }
      onEndRef.current?.(tapsRef.current.slice())
    },
    [hunt],
  )

  useEffect(() => {
    if (over) return
    const timer = setInterval(() => {
      remainingRef.current -= 1
      setTimeLeft(Math.max(0, remainingRef.current))
      if (remainingRef.current <= 0) finish(true)
    }, 1000)
    return () => clearInterval(timer)
  }, [over, finish])

  useEffect(() => {
    if (!mark) return
    const timer = setTimeout(() => setMark(null), MARK_MS)
    return () => clearTimeout(timer)
  }, [mark])

  function handleTap(index: number) {
    if (endedRef.current) return
    const kind = classifyHuntTap(hunt, tapsRef.current, index)
    const next = [...tapsRef.current, index]
    tapsRef.current = next
    setTaps(next)

    if (kind === "found") comboRef.current += 1
    else if (kind === "wrong") comboRef.current = 0
    setCombo(comboRef.current)

    const wrong = kind === "wrong" ? wrongTapInfo(hunt, index) : null
    const target = hunt.targets.find(([start, end]) => index >= start - 1 && index <= end + 1)
    markIdRef.current += 1
    setMark({
      id: markIdRef.current,
      index,
      kind,
      start: wrong?.start ?? target?.[0] ?? index,
      end: wrong?.end ?? target?.[1] ?? index,
      name: wrong?.name ?? null,
    })
    if (kind === "found") {
      setCaption({ text: comboRef.current > 1 ? `Combo x${comboRef.current}!` : "Trúng!", tone: "found" })
    } else if (kind === "wrong") {
      setCaption({ text: wrong?.name ? `Đây là ${wrong.name}` : `Không phải ${mainName}`, tone: "wrong" })
    } else {
      setCaption({ text: "Mẫu này đã được đánh dấu rồi.", tone: "repeat" })
    }
    if (gradeHunt(hunt, next).found === hunt.targets.length) finish(false)
  }

  const result = gradeHunt(hunt, taps)
  const foundSpans = result.foundTargets.map((k) => hunt.targets[k])
  const missedSpans = over ? hunt.targets.filter((_, k) => !result.foundTargets.includes(k)) : []

  const bands: CdBand[] = [
    ...foundSpans.map(([start, end]) => ({ start, end, color: CD_CHART_COLORS.up, opacity: 0.18 })),
    ...missedSpans.map(([start, end]) => ({ start, end, color: CD_CHART_COLORS.gold, opacity: 0.22 })),
    ...(mark?.kind === "wrong" ? [{ start: mark.start, end: mark.end, color: CD_CHART_COLORS.down, opacity: 0.15 }] : []),
  ]
  const tags: CdTag[] = [
    ...foundSpans.map(([start, end]) => ({ start, end, text: mainName, color: CD_CHART_COLORS.up })),
    ...missedSpans.map(([start, end]) => ({ start, end, text: mainName, color: CD_CHART_COLORS.gold })),
    ...(mark?.kind === "wrong"
      ? [{ start: mark.start, end: mark.end, text: mark.name ?? `Không phải ${mainName}`, color: CD_CHART_COLORS.down }]
      : []),
  ]

  const ring = (scale: CdChartScale) => {
    if (!mark) return null
    const bar = hunt.bars[mark.index]
    if (!bar) return null
    const color = mark.kind === "wrong" ? CD_CHART_COLORS.down : mark.kind === "found" ? CD_CHART_COLORS.up : CD_CHART_COLORS.ink2
    return (
      <circle
        key={mark.id}
        data-testid="hunt-ring"
        cx={scale.x(mark.index)}
        cy={scale.y((bar.h + bar.l) / 2)}
        r={Math.max(10, scale.barWidth * 1.8)}
        fill="none"
        stroke={color}
        strokeWidth={2.4}
        style={{ animation: "cd-fade .2s both" }}
      />
    )
  }

  return (
    <>
      <div className="flex-1 pb-4">
        <StepHeading badge={badge} title={`Tìm hết các ${mainName}`} />
        <div className="mb-2 flex items-center justify-between font-bold text-foreground">
          <span
            role="timer"
            aria-label="Thời gian còn lại, giây"
            className={cn("inline-flex items-center gap-1.5 font-heading text-2xl tabular-nums", timeLeft <= 5 && !over && "text-destructive")}
          >
            <Timer aria-hidden="true" className="size-5" />
            {timeLeft}
          </span>
          <span aria-label="Số mẫu đã tìm thấy" className="tabular-nums">
            {result.found}/{result.total}
          </span>
          <span aria-label="Chuỗi trúng liên tiếp" className="min-w-8 text-right font-heading text-destructive tabular-nums">
            {combo > 1 ? `x${combo}` : ""}
          </span>
        </div>
        <div className="touch-none overflow-hidden select-none" data-testid="hunt-frame">
          <ChartStage>
            <CandleChart
              bars={hunt.bars}
              height={260}
              bands={bands}
              tags={tags}
              overlay={ring}
              onTapBar={over ? undefined : handleTap}
              aria-label={`Biểu đồ nến ${hunt.bars.length} phiên: chạm vào các mẫu ${mainName}`}
            />
          </ChartStage>
        </div>
        <p
          aria-live="polite"
          className={cn(
            "mt-3 min-h-6 text-center text-base font-bold text-foreground",
            caption.tone === "found" && "text-(--status-success)",
            caption.tone === "wrong" && "text-destructive",
          )}
        >
          {caption.text}
        </p>
      </div>
      {over ? renderBar({ result, taps }) : null}
    </>
  )
}
