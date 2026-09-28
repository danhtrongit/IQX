import { useState } from "react"
import { ArrowRight, Check, GraduationCap, ShieldCheck, Sparkles } from "lucide-react"

import { PanelState } from "@/components/layout/panel-state"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/hooks/use-auth"
import { errorMessage } from "@/lib/api"
import { cn } from "@/lib/utils"
import { IdentityPresentation } from "./identity-presentation"
import { LEVELS, taskDone } from "./journey-state"
import { useIdentity } from "./use-identity"
import { useJourney } from "./use-journey"

export function JourneyStage({ onNavigate, compact = false }: { onNavigate: (panel: string) => void; compact?: boolean }) {
  const { user, openAuth } = useAuth()
  const journey = useJourney()
  const identity = useIdentity()
  const [revealRequested, setRevealRequested] = useState(false)
  const current = LEVELS[journey.level]
  const state = identity.data
  const graduated = journey.level === 6 && !!journey.progress?.graduated_at
  const revealed = state?.lifecycle === "mascot" && state.mascot
  const nextTask = current.tasks.find(task => !taskDone(journey.level, task.no, journey.progress))

  if (journey.isLoading) return <PanelState title="Đang tải hành trình" loading />
  if (journey.error) return <PanelState title="Chưa tải được hành trình" description={errorMessage(journey.error)} action={{ label: "Thử lại", onClick: () => void journey.refresh() }} />

  return <section aria-label="Hành trình đầu tư" className={cn("flex min-h-full flex-col items-center px-5 py-6 text-center", compact ? "gap-3" : "gap-5 xl:px-10")}>
    <div className="flex flex-wrap items-center justify-center gap-2">
      <Badge variant="outline" className="gap-1.5 border-primary/20 bg-primary/5 text-primary"><ShieldCheck className="size-3" />{journey.mode === "san_tap" ? "Sân tập" : "Thực chiến mô phỏng"}</Badge>
      <span className="text-xs text-muted-foreground">Không sử dụng tiền thật</span>
    </div>
    <div className="space-y-2">
      <h2 className="font-heading text-2xl font-semibold tracking-tight xl:text-3xl">{revealed ? revealed.name : graduated ? "Một hành trình mới bắt đầu" : `Cấp ${journey.level} · ${journey.levelName}`}</h2>
      <p className="mx-auto max-w-sm text-sm leading-6 text-muted-foreground">{revealed ? "Linh thú được hình thành từ cách bạn đọc thị trường và ra quyết định." : current.skill}</p>
      {revealed && state?.bot_run.last_updated_at && <p className="text-xs text-muted-foreground">Bot cập nhật lúc {new Date(state.bot_run.last_updated_at).toLocaleString("vi-VN", { timeZone: state.timezone })}.</p>}
    </div>
    <div className={cn("relative my-auto w-full max-w-80", compact && "max-w-48")}>
      <IdentityPresentation level={journey.level} state={state} revealRequested={revealRequested} />
    </div>
    <div className="w-full max-w-sm space-y-3">
      {state?.lifecycle === "pending_data_repair" ? <PanelState title="Đang khôi phục dữ liệu linh thú" description="Bạn đã hoàn thành cấp 6. Hệ thống cần khôi phục dữ liệu đánh giá trước khi xác định linh thú; tiến trình tốt nghiệp vẫn được giữ nguyên." action={{ label: "Kiểm tra lại", onClick: () => void identity.refetch() }} /> : state?.lifecycle === "reveal_pending" ? <>
        <p className="text-sm text-muted-foreground">Linh thú của bạn đã sẵn sàng.</p>
        <Button onClick={() => setRevealRequested(true)} disabled={revealRequested}><Sparkles />{revealRequested ? "Linh thú đang xuất hiện" : "Khám phá linh thú"}</Button>
      </> : <>
        <p className="text-xs leading-5 text-muted-foreground">{!user ? "Bắt đầu với 100 triệu đồng vốn mô phỏng. Tiến bộ qua từng quyết định, không phải từng lần thắng." : graduated ? "Đã hoàn thành 7 cấp độ. Tiếp tục rèn luyện và quản lý Bot của bạn." : "Hoàn thành nhiệm vụ để mở khóa kỹ năng và giúp linh thú trưởng thành."}</p>
        <Button onClick={() => !user ? openAuth() : onNavigate(graduated ? "bot" : nextTask?.panel ?? "journey")}>{graduated ? <GraduationCap /> : <ArrowRight />}{!user ? "Bắt đầu hành trình" : graduated ? "Đến Bot của tôi" : nextTask ? "Tiếp tục thực hành" : "Xem hành trình"}</Button>
      </>}
      {identity.error && <p role="alert" className="text-xs text-destructive">Không tải được linh thú. <button className="underline underline-offset-2" onClick={() => void identity.refetch()}>Thử lại</button></p>}
    </div>
    {!compact && <ol aria-label="Các cấp độ hành trình" className="mt-3 grid w-full max-w-xl grid-cols-7 gap-1 border-t border-border pt-5">
      {LEVELS.map((level, index) => <li key={level.name} aria-current={index === journey.level ? "step" : undefined} className="flex flex-col items-center gap-2">
        <span className={cn("flex size-7 items-center justify-center rounded-full border text-xs tabular-nums", index === journey.level ? "border-primary bg-primary text-primary-foreground" : index < journey.level || graduated ? "border-primary/20 bg-primary/10 text-primary" : "border-border bg-muted/40 text-muted-foreground")}>{index < journey.level || graduated ? <Check className="size-3.5" /> : index}</span>
        <span className={cn("text-[10px] leading-4", index === journey.level ? "font-semibold text-foreground" : "text-muted-foreground")}>{level.name}</span>
      </li>)}
    </ol>}
  </section>
}
