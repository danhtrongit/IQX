import { useState } from "react"
import { useMutation } from "@tanstack/react-query"
import { ArrowRight, Check, ChevronRight, Circle, GraduationCap, LoaderCircle, LockKeyhole, RefreshCw } from "lucide-react"
import { SidebarPanel } from "@/components/layout/sidebar-panel"
import { PanelState } from "@/components/layout/panel-state"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { useAuth } from "@/hooks/use-auth"
import { errorMessage } from "@/lib/api"
import { cn } from "@/lib/utils"
import { canGraduate, LEVELS, taskDone } from "./journey-state"
import { JourneyStage } from "./journey-stage"
import { useJourney } from "./use-journey"
import type { JourneyProgress } from "../types"

function counter(level: number, task: number, progress: JourneyProgress | null): string | null {
  const fields: Record<number, Record<number, [string, number]>> = {
    1: { 3: ["so_ly_do_da_dung", 5], 4: ["so_lenh_ly_do_ung_ho", 3], 5: ["so_lenh_thuc_chien", 10] },
    2: { 1: ["so_lenh_co_cl_tp", 10] },
    3: { 1: ["so_lenh_quan_ly_von", 10], 2: ["so_muc_tu_tin_da_dung", 3] },
    4: { 1: ["so_lenh_doc_du_5lop", 10] },
    5: { 1: ["so_ma_da_san", 10], 2: ["so_ma_mua_tu_watchlist", 5] },
    6: { 1: ["so_lan_xu_ly_nhat_quan", 3] },
  }
  const field = fields[level]?.[task]
  if (!field || typeof progress?.[field[0]] !== "number") return null
  return `${progress[field[0]]} / ${field[1]}`
}

export function JourneyPanel({ onNavigate }: { onNavigate: (panel: string) => void }) {
  const { user, openAuth } = useAuth()
  const journey = useJourney()
  const [tab, setTab] = useState("tasks")
  const graduation = useMutation({ mutationFn: journey.graduate })
  const tasks = LEVELS[journey.level].tasks
  const done = tasks.filter(task => taskDone(journey.level, task.no, journey.progress)).length
  const graduated = journey.level === 6 && !!journey.progress?.graduated_at
  const ready = canGraduate(journey.level, journey.progress)
  return <SidebarPanel title="Hành trình" description="Tiến bộ từ những quyết định của bạn" actions={<Button variant="ghost" size="icon-sm" aria-label="Làm mới tiến trình" disabled={journey.isLoading || !user} onClick={() => void journey.refresh()}><RefreshCw /></Button>}>
    <div className="lg:hidden"><JourneyStage onNavigate={onNavigate} compact /></div>
    {journey.isLoading ? <PanelState title="Đang tải tiến trình" loading /> : journey.error ? <PanelState title="Không tải được tiến trình" description={errorMessage(journey.error)} action={{ label: "Thử lại", onClick: () => void journey.refresh() }} /> : <>
      <div className="space-y-3 rounded-lg border border-border bg-card p-4">
        <div className="flex items-center justify-between gap-2"><Badge variant="secondary">Cấp {journey.level}</Badge><span className="text-xs text-muted-foreground">{graduated ? "Hoàn thành" : `${done}/${tasks.length} nhiệm vụ`}</span></div>
        <h2 className="font-heading text-xl font-semibold">{journey.levelName}</h2>
        <p className="text-xs leading-5 text-muted-foreground">{LEVELS[journey.level].skill}</p>
        <Progress value={done / tasks.length * 100} aria-label="Tiến trình cấp hiện tại" />
      </div>
      {!user && <PanelState title="Lưu hành trình của bạn" description="Đăng nhập để nhận vốn mô phỏng, đặt lệnh và theo dõi tiến bộ." action={{ label: "Đăng nhập", onClick: openAuth }} />}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList variant="line" className="w-full"><TabsTrigger value="tasks" className="flex-1">Nhiệm vụ</TabsTrigger><TabsTrigger value="roadmap" className="flex-1">Lộ trình</TabsTrigger></TabsList>
        <TabsContent value="tasks" className="space-y-3 pt-3">
          {tasks.map((task, index) => {
            const completed = taskDone(journey.level, task.no, journey.progress)
            const tally = counter(journey.level, task.no, journey.progress)
            const panel = journey.level === 0 && task.no === 1 && journey.progress?.task_1_done_at ? "portfolio" : task.panel
            return <button key={task.no} type="button" onClick={() => !user ? openAuth() : onNavigate(panel)} className="flex w-full items-start gap-3 rounded-lg border border-border bg-card p-3 text-left transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
              <span className={cn("mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-xs", completed ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}>{completed ? <Check className="size-3.5" /> : index + 1}</span>
              <span className="min-w-0 flex-1 space-y-1"><span className="block text-sm leading-5 font-medium">{task.label}</span><span className="block text-xs text-muted-foreground">{completed ? "Đã hoàn thành" : tally ?? "Tiếp tục thực hành"}</span></span><ChevronRight className="mt-1 size-4 shrink-0 text-muted-foreground" />
            </button>
          })}
          <p className="px-1 text-[11px] leading-5 text-muted-foreground">Nhiệm vụ được xác nhận từ giao dịch và hành động thực tế. Lợi nhuận không phải điều kiện lên cấp.</p>
          {(ready || graduated) && <div className="space-y-3 rounded-lg border border-primary/20 bg-primary/5 p-4"><GraduationCap className="size-6 text-primary" /><h3 className="text-sm font-semibold">{graduated ? "Bạn đã hoàn thành 7 cấp độ" : "Sẵn sàng cho bước tiếp theo"}</h3><p className="text-xs leading-5 text-muted-foreground">{graduated ? "Khám phá linh thú và công cụ đồng hành của bạn." : "Các nhiệm vụ đã đủ điều kiện. Tiến trình sẽ được xác nhận lại trên máy chủ."}</p><Button className="w-full" disabled={graduation.isPending} onClick={() => graduated ? onNavigate("bot") : graduation.mutate()}>{graduation.isPending ? <LoaderCircle className="animate-spin" /> : <ArrowRight />}{graduated ? "Mở Bot" : journey.level === 6 ? "Hoàn thành hành trình" : `Bước vào cấp ${journey.level + 1}`}</Button>{graduation.error && <p role="alert" className="text-xs text-destructive">{errorMessage(graduation.error)}</p>}</div>}
        </TabsContent>
        <TabsContent value="roadmap" className="space-y-2 pt-3">{LEVELS.map((level, index) => <div key={level.name} className={cn("flex gap-3 rounded-lg border p-3", index === journey.level ? "border-primary/25 bg-primary/5" : "border-border bg-card")}><div className="mt-0.5">{index < journey.level || graduated ? <Check className="size-4 text-primary" /> : index > journey.level ? <LockKeyhole className="size-4 text-muted-foreground" /> : <Circle className="size-4 text-primary" />}</div><div className="space-y-1"><h3 className="text-sm font-medium">Cấp {index} · {level.name}</h3><p className="text-xs leading-5 text-muted-foreground">{level.skill}</p></div></div>)}</TabsContent>
      </Tabs>
    </>}
  </SidebarPanel>
}
