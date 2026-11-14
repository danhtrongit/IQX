/** Thẻ "Nhật ký lời mời": mỗi SACO được xét trong một lượt tìm là một dòng, mới nhất ở trên. */
import { PanelState } from "@/components/layout/panel-state"
import { Card } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { errorMessage } from "@/lib/api"
import { StatusBadge, TableLoadingRows, TableNoticeRow } from "@/pages/admin/revenue/ui"
import { formatVnDateTime } from "@/pages/trading-floor/posts/format"

import { useInviteLog } from "./hooks"
import { INVITE_RESULT } from "./labels"

export function SacoInvitesTab() {
  const invites = useInviteLog()
  if (invites.isError) {
    return <PanelState title="Không tải được nhật ký lời mời" description={errorMessage(invites.error)} action={{ label: "Thử lại", onClick: () => void invites.refetch() }} />
  }
  const items = invites.data?.items ?? []
  return <Card className="gap-0 overflow-hidden py-0">
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className="pl-3">Giờ</TableHead>
          <TableHead>Người dùng</TableHead>
          <TableHead>SACO được mời</TableHead>
          <TableHead className="pr-3">Kết quả</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {invites.isLoading ? <TableLoadingRows colSpan={4} />
          : items.length === 0 ? <TableNoticeRow colSpan={4}>Chưa có lượt tìm SACO nào.</TableNoticeRow>
          : items.map((row, index) => {
            const result = INVITE_RESULT[row.result] ?? { label: row.result, tone: "neutral" as const }
            return <TableRow key={`${row.at}-${index}`}>
              <TableCell className="pl-3 tabular-nums text-muted-foreground">{formatVnDateTime(row.at)}</TableCell>
              <TableCell>{row.userName}</TableCell>
              <TableCell>{row.sacoName}</TableCell>
              <TableCell className="pr-3"><StatusBadge label={result.label} tone={result.tone} /></TableCell>
            </TableRow>
          })}
      </TableBody>
    </Table>
  </Card>
}
