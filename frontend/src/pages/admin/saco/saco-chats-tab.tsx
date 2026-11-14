/**
 * Thẻ "Lịch sử chat": cột trái các cặp "Người dùng ↔ SACO" mới nhất ở trên, cột phải toàn bộ
 * cuộc chat. Chỉ đọc: máy chủ không đổi trạng thái đã xem khi quản trị mở.
 */
import { useState } from "react"
import { ArrowLeftRight } from "lucide-react"

import { PanelState } from "@/components/layout/panel-state"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Skeleton } from "@/components/ui/skeleton"
import { errorMessage } from "@/lib/api"
import { cn } from "@/lib/utils"
import type { ChatMessage } from "@/pages/trading-floor/net/types"
import { formatVnDateTime } from "@/pages/trading-floor/posts/format"

import type { ManageConv } from "./api"
import { useManageConv, useManageConvs } from "./hooks"

export function SacoChatsTab() {
  const convs = useManageConvs()
  const [selected, setSelected] = useState<string | null>(null)

  if (convs.isError) {
    return <PanelState title="Không tải được lịch sử chat" description={errorMessage(convs.error)} action={{ label: "Thử lại", onClick: () => void convs.refetch() }} />
  }
  const items = convs.data?.items ?? []

  return <div className="grid gap-4 lg:grid-cols-[minmax(260px,340px)_minmax(0,1fr)]">
    <Card className="gap-0 overflow-hidden py-0">
      <p className="border-b border-border px-3 py-2 text-xs font-medium text-muted-foreground">Người dùng ↔ SACO</p>
      <ScrollArea className="max-h-[60vh]">
        {convs.isLoading ? <div className="space-y-2 p-3" role="status" aria-label="Đang tải danh sách chat">
          {Array.from({ length: 6 }, (_, index) => <Skeleton key={index} className="h-11 w-full" />)}
        </div>
          : items.length === 0 ? <p className="p-4 text-sm text-muted-foreground">Chưa có cuộc chat nào.</p>
          : <ul className="divide-y divide-border">
            {items.map((conv) => <li key={conv.id}>
              <ConvRow conv={conv} active={conv.id === selected} onSelect={() => setSelected(conv.id)} />
            </li>)}
          </ul>}
      </ScrollArea>
    </Card>
    <Card className="min-h-64 gap-0 overflow-hidden py-0">
      {selected ? <Transcript convId={selected} /> : <p className="p-6 text-sm text-muted-foreground">Chọn một cuộc chat để xem toàn bộ tin nhắn.</p>}
    </Card>
  </div>
}

function ConvRow({ conv, active, onSelect }: { conv: ManageConv; active: boolean; onSelect: () => void }) {
  return <button
    type="button"
    onClick={onSelect}
    aria-current={active || undefined}
    className={cn("flex w-full flex-col gap-0.5 px-3 py-2 text-left text-sm hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring", active && "bg-primary/10")}
  >
    <span className="flex min-w-0 items-center gap-1.5 font-medium">
      <span className="truncate">{conv.userName}</span>
      <ArrowLeftRight aria-label="với" className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="truncate">{conv.sacoName}</span>
      {conv.matched && <Badge variant="secondary" className="ml-auto h-5 shrink-0 px-1.5 text-[10px]">Khớp</Badge>}
    </span>
    <span className="flex min-w-0 gap-2 text-xs text-muted-foreground">
      <span className="min-w-0 flex-1 truncate">{conv.last?.text ?? "Chưa có tin nhắn"}</span>
      {conv.last && <span className="shrink-0 tabular-nums">{formatVnDateTime(conv.last.at)}</span>}
    </span>
  </button>
}

const SENDER_LABEL: Record<ChatMessage["from"], string> = { u: "Người dùng", s: "SACO", x: "Hệ thống" }

function Transcript({ convId }: { convId: string }) {
  const conv = useManageConv(convId)
  if (conv.isError) {
    return <div className="p-3"><PanelState title="Không tải được cuộc chat" description={errorMessage(conv.error)} action={{ label: "Thử lại", onClick: () => void conv.refetch() }} /></div>
  }
  if (!conv.data) {
    return <div className="space-y-2 p-4" role="status" aria-label="Đang tải cuộc chat">
      <Skeleton className="h-5 w-48" /><Skeleton className="h-14 w-2/3" /><Skeleton className="ml-auto h-14 w-2/3" />
    </div>
  }
  const { userName, sacoName, messages } = conv.data
  return <div className="flex min-h-0 flex-col">
    <div className="border-b border-border px-4 py-2">
      <p className="text-sm font-semibold">{userName} ↔ {sacoName}</p>
      <p className="text-xs text-muted-foreground">Chỉ xem. Mở cuộc chat ở đây không đổi trạng thái đã xem của hai bên.</p>
    </div>
    <ScrollArea className="max-h-[60vh]">
      {messages.length === 0 ? <p className="p-4 text-sm text-muted-foreground">Cuộc chat chưa có tin nhắn.</p>
        : <ol className="space-y-2 p-4">
          {messages.map((message) => message.from === "x"
            ? <li key={message.id} className="text-center text-xs text-muted-foreground">{message.text} · {formatVnDateTime(message.at)}</li>
            : <li key={message.id} className={cn("flex", message.from === "s" ? "justify-end" : "justify-start")}>
              <div className={cn("max-w-[80%] rounded-lg border px-3 py-2 text-sm", message.from === "s" ? "border-primary/30 bg-primary/10" : "border-border bg-muted/50")}>
                <p className="text-[11px] text-muted-foreground">{message.from === "s" ? sacoName : userName} · {SENDER_LABEL[message.from]} · <span className="tabular-nums">{formatVnDateTime(message.at)}</span></p>
                <p className="mt-0.5 whitespace-pre-wrap break-words">{message.text}</p>
              </div>
            </li>)}
        </ol>}
    </ScrollArea>
  </div>
}
