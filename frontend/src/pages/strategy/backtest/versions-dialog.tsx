import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"

import { ErrorLine } from "../shared/controls"
import { DialogShell } from "../shared/dialog-shell"
import { errorMessage } from "../shared/errors"
import { fmtDateTime } from "../shared/format"
import type { BotSchedule } from "../shared/bot-schedule"
import { BotTags } from "./bot-tags"
import { stampLabel } from "./draft"
import { useIqxVersions, useVersions } from "./hooks"
import { SUB_TEXT } from "./ui"

const TH = `px-2 py-2 text-left text-[10.5px] font-semibold tracking-wide uppercase whitespace-nowrap ${SUB_TEXT}`

function Loading({ query }: { query: { isPending: boolean; isError: boolean; error: unknown; refetch: () => unknown } }) {
  if (query.isError) {
    return (
      <div className="space-y-2">
        <ErrorLine>{errorMessage(query.error)}</ErrorLine>
        <Button type="button" variant="outline" size="sm" onClick={() => void query.refetch()}>Thử lại</Button>
      </div>
    )
  }
  return <Skeleton className="h-24 w-full" aria-label="Đang tải phiên bản" />
}

/** Lịch sử phiên bản of a Chiến lược IQX (§4.2): v / xuất bản / lý do, current and Bot versions marked. Read only. */
export function IqxVersionsDialog({ id, name, current, schedule, onClose }: { id: string; name: string; current: number; schedule: BotSchedule | undefined; onClose: () => void }) {
  const query = useIqxVersions(id)
  const items = [...(query.data?.items ?? [])].sort((a, b) => b.version - a.version)
  return (
    <DialogShell title={`Lịch sử phiên bản · Chiến lược IQX · ${name}`} size="lg" onClose={onClose} footer={<Button type="button" variant="outline" onClick={onClose}>Đóng</Button>}>
      {!query.data ? (
        <Loading query={query} />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs" aria-label="Phiên bản">
            <thead className="border-b border-border"><tr>{["Phiên bản", "Xuất bản", "Lý do", ""].map((head, index) => <th key={`${head}-${index}`} className={TH}>{head}</th>)}</tr></thead>
            <tbody className="divide-y divide-border">
              {items.map((item) => (
                <tr key={item.version}>
                  <td className="px-2 py-2 whitespace-nowrap">
                    <b>v{item.version}</b>
                    {item.version === current && <span className="ml-1 rounded-sm border border-primary/50 px-1 text-[10.5px] font-semibold text-primary">hiện hành</span>}
                  </td>
                  <td className="px-2 py-2 whitespace-nowrap tabular-nums">{fmtDateTime(item.published_at)}</td>
                  <td className="min-w-[10rem] px-2 py-2">{item.reason ?? "—"}</td>
                  <td className="px-2 py-2"><BotTags schedule={schedule} source="iqx" id={id} version={item.version} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className={`text-xs leading-5 ${SUB_TEXT}`}>Chiến lược IQX do quản trị viên xuất bản, không chỉnh được.</p>
    </DialogShell>
  )
}

/** Lịch sử bản of a Chiến lược của tôi (§4.10): Mở, Khôi phục thành bản mới (old versions only). */
export function UserVersionsDialog({
  id,
  name,
  schedule,
  busy,
  error,
  onOpen,
  onRestore,
  onClose,
}: {
  id: string | null
  name: string
  schedule: BotSchedule | undefined
  busy: boolean
  error: string | null
  onOpen: (version: number) => void
  onRestore: (version: number, latest: number) => void
  onClose: () => void
}) {
  const query = useVersions(id)
  const items = [...(query.data?.items ?? [])].sort((a, b) => b.version - a.version)
  const latest = items[0]?.version ?? 0
  return (
    <DialogShell title={id ? `Lịch sử bản · ${name}` : "Lịch sử bản"} size="lg" busy={busy} onClose={onClose} footer={<Button type="button" variant="outline" onClick={onClose}>Đóng</Button>}>
      {!id ? (
        <p className="text-xs leading-5">Chiến lược mới chưa có bản nào. Chạy rồi bấm Lưu để tạo bản đầu tiên.</p>
      ) : !query.data ? (
        <Loading query={query} />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs" aria-label="Các bản">
            <thead className="border-b border-border"><tr>{["Bản", "Ghi chú", "Trên Bot", ""].map((head, index) => <th key={`${head}-${index}`} className={TH}>{head}</th>)}</tr></thead>
            <tbody className="divide-y divide-border">
              {items.map((item) => (
                <tr key={item.version} data-testid={`version-${item.version}`}>
                  <td className="px-2 py-2 whitespace-nowrap">
                    <b className="tabular-nums">{stampLabel(item.created_at)}</b>
                    {item.version === latest && <span className="ml-1 rounded-sm border border-border px-1 text-[10.5px] font-semibold">mới nhất</span>}
                  </td>
                  <td className="min-w-[10rem] px-2 py-2">
                    {item.note && <span className="block">{item.note}</span>}
                    <span className={`block ${SUB_TEXT}`}>Rổ {item.universe_label} · giữ tối đa {item.max_holding}</span>
                  </td>
                  <td className="px-2 py-2"><BotTags schedule={schedule} source="user" id={id} version={item.version} fallback={item.on_bot} /></td>
                  <td className="px-2 py-2 text-right whitespace-nowrap">
                    <span className="inline-flex gap-1">
                      <Button type="button" size="xs" variant="outline" disabled={busy} onClick={() => onOpen(item.version)}>Mở</Button>
                      {item.version !== latest && (
                        <Button type="button" size="xs" variant="outline" disabled={busy} onClick={() => onRestore(item.version, latest)}>Khôi phục thành bản mới</Button>
                      )}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {error && <ErrorLine>{error}</ErrorLine>}
      <p className={`text-xs leading-5 ${SUB_TEXT}`}>Mỗi lần Lưu tạo một bản mới; bản cũ giữ nguyên. Bot dùng bản mới nhất của chiến lược được chọn từ phiên kế tiếp.</p>
    </DialogShell>
  )
}
