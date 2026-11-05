/**
 * Quản trị chat phòng Flashback (spec v2.4 §3.5): danh sách từ cấm (từ cấm thành `***` trước khi lưu,
 * áp dụng cho tin gửi từ lúc đổi) và các tin bị người chơi báo cáo, kèm 10 tin trước đó.
 */
import { useState, type FormEvent } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { X } from "lucide-react"
import { toast } from "sonner"

import { PanelState } from "@/components/layout/panel-state"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { errorMessage } from "@/lib/api"
import { formatDateTime } from "@/lib/format"

import {
  decideFlashbackChatReport,
  fetchFlashbackChatBannedWords,
  fetchFlashbackChatReports,
  saveFlashbackChatBannedWords,
  type FlashbackChatReport,
} from "./flashback-api"

const chatKeys = {
  words: ["admin", "flashback", "chat", "words"] as const,
  reports: ["admin", "flashback", "chat", "reports"] as const,
}

const placeLabel = (item: { waiting: boolean; phien: number }) =>
  item.waiting ? "Phòng chờ" : `Phiên ${item.phien}`

export function FlashbackChatSection() {
  return (
    <section className="space-y-3" aria-label="Chat phòng">
      <div>
        <h2 className="font-heading text-sm font-bold">Chat phòng</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Từ cấm được thay bằng *** trước khi lưu. Tin nhắn lưu 7 ngày; báo cáo giữ bản sao riêng.
        </p>
      </div>
      <BannedWords />
      <Reports />
    </section>
  )
}

function BannedWords() {
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState("")
  const words = useQuery({
    queryKey: chatKeys.words,
    queryFn: ({ signal }) => fetchFlashbackChatBannedWords(signal),
  })
  const save = useMutation({
    mutationFn: saveFlashbackChatBannedWords,
    onSuccess: (saved) => queryClient.setQueryData(chatKeys.words, saved),
    onError: (error) => toast.error(errorMessage(error)),
  })
  const current = words.data ?? []

  function add(event: FormEvent) {
    event.preventDefault()
    const word = draft.trim()
    if (!word || !words.data) return
    save.mutate([...current, word], { onSuccess: () => setDraft("") })
  }

  return (
    <div className="space-y-2.5 rounded-lg border border-border bg-card p-3">
      <h3 className="text-sm font-bold">Từ cấm ({current.length})</h3>
      <form onSubmit={add} className="flex max-w-md gap-2">
        <Input
          aria-label="Thêm từ cấm"
          placeholder="Nhập từ hoặc cụm từ"
          maxLength={64}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
        <Button type="submit" disabled={save.isPending || !words.data || draft.trim() === ""}>
          Thêm
        </Button>
      </form>
      {words.isError ? <p className="text-sm text-destructive">{errorMessage(words.error)}</p> : null}
      {words.data && current.length === 0 ? (
        <p className="text-sm text-muted-foreground">Chưa có từ cấm nào: chat chưa lọc từ nào.</p>
      ) : null}
      <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
        {current.map((word) => (
          <li key={word} className="flex items-center gap-1 rounded-md bg-muted py-0.5 pr-0.5 pl-2 text-sm font-semibold">
            {word}
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label={`Xoá từ cấm ${word}`}
              disabled={save.isPending}
              onClick={() => save.mutate(current.filter((item) => item !== word))}
            >
              <X aria-hidden="true" />
            </Button>
          </li>
        ))}
      </ul>
    </div>
  )
}

function Reports() {
  const reports = useQuery({
    queryKey: chatKeys.reports,
    queryFn: ({ signal }) => fetchFlashbackChatReports(signal),
    staleTime: 30_000,
  })
  if (reports.isError) {
    return (
      <PanelState
        title="Chưa tải được báo cáo"
        description={errorMessage(reports.error)}
        action={{ label: "Thử lại", onClick: () => void reports.refetch() }}
      />
    )
  }
  const rows = reports.data ?? []
  return (
    <div className="space-y-2.5 rounded-lg border border-border bg-card p-3">
      <h3 className="text-sm font-bold">Tin bị báo cáo ({rows.length})</h3>
      {reports.data && rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Không có báo cáo nào đang chờ xử lý.</p>
      ) : null}
      <ul className="m-0 list-none space-y-2 p-0">
        {rows.map((report) => (
          <ReportRow key={report.id} report={report} />
        ))}
      </ul>
    </div>
  )
}

function ReportRow({ report }: { report: FlashbackChatReport }) {
  const queryClient = useQueryClient()
  const decide = useMutation({
    mutationFn: (status: "resolved" | "dismissed") => decideFlashbackChatReport(report.id, status),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: chatKeys.reports }),
    onError: (error) => toast.error(errorMessage(error)),
  })
  return (
    <li className="space-y-1.5 rounded-md border border-border p-2.5 text-sm" data-testid="flashback-chat-report">
      <p className="m-0 text-xs font-semibold">
        Phòng {report.room_code} · {report.reporter_name} báo cáo {report.reported_name} · {formatDateTime(report.created_at)}
      </p>
      <p className="m-0 font-bold [overflow-wrap:anywhere]">{report.text}</p>
      {report.context.length > 0 ? (
        <details className="text-xs">
          <summary className="cursor-pointer font-semibold">{report.context.length} tin trước đó</summary>
          <ul className="m-0 mt-1 list-none space-y-0.5 p-0">
            {report.context.map((item, index) => (
              <li key={`${item.at}-${index}`} className="[overflow-wrap:anywhere]">
                <b>{item.name}</b> ({placeLabel(item)}): {item.text}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      <div className="flex gap-2">
        <Button type="button" size="sm" disabled={decide.isPending} onClick={() => decide.mutate("resolved")}>
          Đã xử lý
        </Button>
        <Button type="button" size="sm" variant="outline" disabled={decide.isPending} onClick={() => decide.mutate("dismissed")}>
          Bỏ qua
        </Button>
      </div>
    </li>
  )
}
