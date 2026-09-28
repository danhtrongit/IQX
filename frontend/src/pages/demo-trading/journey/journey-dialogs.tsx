import { useState } from "react"
import { useMutation, useQuery } from "@tanstack/react-query"
import { ArrowRight, Compass, GraduationCap, LoaderCircle, ShieldCheck } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { api, errorMessage } from "@/lib/api"
import { useAuth } from "@/hooks/use-auth"
import type { JourneyProgress } from "../types"
import { canGraduate } from "./journey-state"
import { useJourney } from "./use-journey"

const experienceChoices = [
  { id: "never", title: "Tôi chưa từng giao dịch", detail: "Bắt đầu từ Cấp 0 · Nhập môn" },
  { id: "unsure", title: "Tôi đã thử nhưng chưa tự tin", detail: "Bắt đầu từ Cấp 1 · Học việc" },
  { id: "regular", title: "Tôi giao dịch thường xuyên", detail: "Bắt đầu từ Cấp 2 · Kỷ luật" },
] as const
const risks = [{ id: "than_trong", label: "Thận trọng", detail: "Trần phân bổ 10% mỗi mã" }, { id: "can_bang", label: "Cân bằng", detail: "Trần phân bổ 20% mỗi mã" }, { id: "tan_cong", label: "Tấn công", detail: "Trần phân bổ 30% mỗi mã" }] as const

export function JourneyDialogs() {
  const journey = useJourney()
  const { user } = useAuth()
  const [dismissedGraduation, setDismissedGraduation] = useState<number | null>(null)
  const placement = useMutation({ mutationFn: journey.choosePlacement })
  const graduation = useMutation({ mutationFn: journey.graduate })
  const riskProgress = useQuery({ queryKey: ["journey", "risk", user?.id], enabled: !!user && journey.level >= 3, queryFn: ({ signal }) => api<JourneyProgress>("/cap3/progress", { signal }) })
  const risk = useMutation({ mutationFn: (khau_vi: string) => api("/cap3/khau-vi", { method: "POST", body: JSON.stringify({ khau_vi }) }), onSuccess: async () => { await riskProgress.refetch(); await journey.refresh() } })
  const tours = useMutation({ mutationFn: async () => {
    for (const tour of ["phantich", "bantin", "bctc"]) await api(`/cap0/tours/${tour}/complete`, { method: "POST", body: JSON.stringify({ skipped: true }) })
    await journey.refresh()
  } })
  const requiresTourDecision = !!user && !journey.isLoading && journey.level >= 1 && !!journey.placement && !journey.placement.da_xem_tour

  return <>
    <Dialog open={journey.needsPlacement}>
      <DialogContent showCloseButton={false} onEscapeKeyDown={event => event.preventDefault()} onInteractOutside={event => event.preventDefault()}>
        <DialogHeader><Compass className="mb-2 size-8 text-primary" /><DialogTitle>Bắt đầu hành trình giao dịch</DialogTitle><DialogDescription>Bạn đã từng mua bán cổ phiếu thật chưa? Câu trả lời giúp chọn điểm bắt đầu phù hợp.</DialogDescription></DialogHeader>
        <div className="space-y-2">{experienceChoices.map(choice => <Button key={choice.id} variant="outline" disabled={placement.isPending} onClick={() => placement.mutate(choice.id)} className="h-auto w-full justify-between px-3 py-3 text-left whitespace-normal"><span><span className="block font-semibold">{choice.title}</span><span className="mt-1 block text-xs font-normal text-muted-foreground">{choice.detail}</span></span><ArrowRight className="ml-3" /></Button>)}</div>
        {placement.error && <p role="alert" className="text-xs text-destructive">{errorMessage(placement.error)}</p>}
      </DialogContent>
    </Dialog>
    <Dialog open={!journey.needsPlacement && requiresTourDecision}>
      <DialogContent showCloseButton={false} onEscapeKeyDown={event => event.preventDefault()} onInteractOutside={event => event.preventDefault()}>
        <DialogHeader><DialogTitle>Trước khi bắt đầu thực chiến</DialogTitle><DialogDescription>Hành trình sẽ yêu cầu bạn đọc dữ liệu, ghi kế hoạch trước lệnh mua và đối chiếu lại sau lệnh bán.</DialogDescription></DialogHeader>
        <ol className="list-decimal space-y-3 pl-5 text-sm"><li>Chọn cổ phiếu và kiểm tra giá hiện tại. Dữ liệu chưa có sẽ được hiển thị rõ, không thay bằng số 0.</li><li>Ghi lý do mua và vùng mua. Từ Cấp 2, thêm mốc cắt lỗ và chốt lời trước khi xác nhận.</li><li>Mở Danh mục để xem cổ phiếu nắm giữ, theo dõi trạng thái lệnh và hoàn thành kết sổ.</li></ol>
        <p className="text-xs text-muted-foreground">Bạn có thể bỏ qua các tour sản phẩm để bắt đầu thực hành ngay.</p>
        {tours.error && <p role="alert" className="text-xs text-destructive">{errorMessage(tours.error)}</p>}
        <Button disabled={tours.isPending} onClick={() => tours.mutate()}>{tours.isPending && <LoaderCircle className="animate-spin" />}Bỏ qua tour và bắt đầu</Button>
      </DialogContent>
    </Dialog>
    <Dialog open={!requiresTourDecision && !!riskProgress.data && !riskProgress.data.khau_vi && journey.level >= 3}>
      <DialogContent showCloseButton={false} onEscapeKeyDown={event => event.preventDefault()} onInteractOutside={event => event.preventDefault()}>
        <DialogHeader><ShieldCheck className="mb-2 size-8 text-primary" /><DialogTitle>Khẩu vị rủi ro của bạn</DialogTitle><DialogDescription>Thiết lập nguyên tắc phân bổ vốn. Bạn có thể điều chỉnh trong kế hoạch đặt lệnh.</DialogDescription></DialogHeader>
        {risks.map(choice => <Button key={choice.id} variant="outline" className="h-auto justify-between p-3" disabled={risk.isPending} onClick={() => risk.mutate(choice.id)}><span>{choice.label}</span><span className="text-xs text-muted-foreground">{choice.detail}</span></Button>)}
        {risk.error && <p role="alert" className="text-xs text-destructive">{errorMessage(risk.error)}</p>}
      </DialogContent>
    </Dialog>
    <Dialog open={canGraduate(journey.level, journey.progress) && dismissedGraduation !== journey.level} onOpenChange={open => { if (!open) setDismissedGraduation(journey.level) }}>
      <DialogContent><DialogHeader><GraduationCap className="mb-2 size-8 text-primary" /><DialogTitle>Hoàn thành Cấp {journey.level}</DialogTitle><DialogDescription>{journey.level === 6 ? "Bạn đã hoàn tất hành trình. Xác nhận để khám phá linh thú và Bot của tôi." : `Bạn đã hoàn thành nhiệm vụ ${journey.levelName}. Sẵn sàng bước sang cấp tiếp theo?`}</DialogDescription></DialogHeader>{graduation.error && <p role="alert" className="text-xs text-destructive">{errorMessage(graduation.error)}</p>}<Button disabled={graduation.isPending} onClick={() => graduation.mutate()}>{graduation.isPending && <LoaderCircle className="animate-spin" />}{journey.level === 6 ? "Hoàn tất hành trình" : "Lên cấp tiếp theo"}</Button></DialogContent>
    </Dialog>
  </>
}
