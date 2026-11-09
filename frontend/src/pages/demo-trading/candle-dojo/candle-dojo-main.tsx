/**
 * Vùng chính của Candle Dojo (spec v1.2 §1, §13): màn Dojo, hoặc một việc tập trung (nhập môn, bài học, luyện
 * công, thi đai) thay cho nó. Khung rộng tối đa 480 px trên điện thoại, 980 px từ 900 px, canh giữa. Khách chưa
 * đăng nhập được mời đăng nhập. Về lại màn Dojo thì tải lại tiến độ từ server.
 */
import { useCallback, useEffect, useRef } from "react"
import { useQueryClient } from "@tanstack/react-query"

import { PanelState } from "@/components/layout/panel-state"
import { useAuth } from "@/hooks/use-auth"
import { CANDLE_DOJO_QUERY_ROOT } from "./candle-dojo-api"
import { DOJO_HOME, useCandleDojo, type DojoScreen } from "./candle-dojo-context"
import { DOJO_COPY } from "./candle-dojo-model"
import { DojoExam } from "./dojo-exam"
import { DojoHome } from "./dojo-home"
import { DojoIntro } from "./dojo-intro"
import { DrillPlayer } from "./lesson/drill-player"
import { LessonPlayer } from "./lesson/lesson-player"

const screenKey = (screen: DojoScreen) => (screen.kind === "lesson" || screen.kind === "drill" ? `${screen.kind}:${screen.lessonId}` : screen.kind === "exam" ? `exam:${screen.dojo}` : screen.kind)

export function CandleDojoMain({ onOpenShop }: { onOpenShop: () => void }) {
  const { user, openAuth } = useAuth()
  const { screen, open, preview } = useCandleDojo()
  const queryClient = useQueryClient()
  const root = useRef<HTMLDivElement>(null)
  const key = screenKey(screen)
  const shownKey = useRef(key)

  // Each task starts at its top, and the home comes back at the top too.
  useEffect(() => {
    if (shownKey.current === key) return
    shownKey.current = key
    root.current?.scrollIntoView?.({ block: "start" })
  }, [key])

  // Server state moved while the learner was away (stars, xu, belt, cards): read it again. Preview wrote nothing.
  const goHome = useCallback(() => {
    open(DOJO_HOME)
    if (!preview) void queryClient.invalidateQueries({ queryKey: CANDLE_DOJO_QUERY_ROOT })
  }, [open, preview, queryClient])

  if (!user) {
    return (
      <PanelState
        title={DOJO_COPY.signInTitle}
        description={DOJO_COPY.signInDescription}
        descriptionClassName="text-foreground"
        action={{ label: DOJO_COPY.signIn, onClick: () => openAuth("login") }}
      />
    )
  }

  return (
    <div ref={root} className="mx-auto w-full max-w-[480px] min-[900px]:max-w-[980px]" data-testid="candle-dojo" data-screen={screen.kind}>
      {screen.kind === "intro" ? (
        <DojoIntro preview={preview} onExit={goHome} />
      ) : screen.kind === "lesson" ? (
        <LessonPlayer key={screen.lessonId} lessonId={screen.lessonId} preview={preview} onExit={goHome} onFinished={goHome} />
      ) : screen.kind === "drill" ? (
        <DrillPlayer key={screen.lessonId} lessonId={screen.lessonId} preview={preview} onExit={goHome} onFinished={goHome} />
      ) : screen.kind === "exam" ? (
        <DojoExam key={screen.dojo} dojo={screen.dojo} onExit={goHome} />
      ) : (
        <DojoHome onOpenShop={onOpenShop} />
      )}
    </div>
  )
}
