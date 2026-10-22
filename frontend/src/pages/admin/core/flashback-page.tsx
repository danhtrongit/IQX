import { useState } from "react"
import { Eye, PauseCircle, PlayCircle } from "lucide-react"
import { toast } from "sonner"

import { PanelState } from "@/components/layout/panel-state"
import { WorkspacePage } from "@/components/layout/workspace-page"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useAuth } from "@/hooks/use-auth"
import { errorMessage } from "@/lib/api"
import { formatDateTime, formatNumber } from "@/lib/format"

import { AdminDataTable, type AdminColumn } from "./components/admin-data-table"
import { StatusBadge } from "./components/status-badge"
import { useConfirmDialog } from "./components/use-confirm-dialog"
import type {
  FlashbackAlert,
  FlashbackAlertLevel,
  FlashbackReveal,
  FlashbackRound,
  FlashbackSuspect,
} from "./flashback-api"
import {
  useFlashbackAlerts,
  useFlashbackPauseStatus,
  useFlashbackRounds,
  useFlashbackSuspects,
  usePauseFlashback,
  useRevealFlashbackRound,
} from "./flashback-hooks"
import type { StatusTone } from "./labels"

/** Trạng thái của một đề theo spec v1.2 §5.1. */
const ROUND_STATUS: Record<string, { label: string; tone: StatusTone }> = {
  ready: { label: "Chờ mở", tone: "neutral" },
  open: { label: "Đang mở", tone: "success" },
  closing: { label: "Đang chốt", tone: "warning" },
  closed: { label: "Đã chốt", tone: "info" },
  paid: { label: "Đã trả thưởng", tone: "info" },
}

/** Nhãn mức độ cảnh báo (spec v1.2 §6.1), dùng khi máy chủ không gửi nhãn. */
const ALERT_LEVEL: Record<FlashbackAlertLevel, string> = {
  high: "Cao",
  medium: "Trung bình",
  low: "Thấp",
}

/** Lý do tài khoản bị đánh dấu nghi gian lận. */
const SUSPECT_REASON: Record<string, string> = {
  same_ip: "Cùng địa chỉ IP",
  same_device: "Cùng thiết bị",
}

/** Chỉ đề đã đóng mới xem được mã (máy chủ kiểm tra lại và ghi nhật ký). */
function isRevealable(round: FlashbackRound): boolean {
  return round.status === "closed" || round.status === "paid"
}

function Section({ title, description, children }: {
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="font-heading text-sm font-bold">{title}</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
      </div>
      {children}
    </section>
  )
}

/**
 * Màn quản trị Flashback (spec v1.2 §7): chỉ để xem.
 *
 * Không có thao tác tạo, sửa hay chọn đề. Mã và giai đoạn của đề không có ở đây:
 * đề đã đóng cũng chỉ lộ qua thao tác "Xem mã và giai đoạn" và mỗi lần xem máy
 * chủ ghi nhật ký. Nút tạm dừng đọc trạng thái từ máy chủ và là tuỳ chọn an toàn
 * cho quản trị cao nhất.
 */
export function FlashbackPage() {
  const { user } = useAuth()
  const isTopAdmin = user?.role === "admin"
  const rounds = useFlashbackRounds()
  const alerts = useFlashbackAlerts()
  const suspects = useFlashbackSuspects()
  const pauseStatus = useFlashbackPauseStatus()
  const pause = usePauseFlashback()
  const reveal = useRevealFlashbackRound()
  const confirm = useConfirmDialog()
  const [revealed, setRevealed] = useState<FlashbackReveal | null>(null)

  /** Flashback đang tạm dừng: đọc từ máy chủ, không suy đoán từ phiên. */
  const paused = pauseStatus.data === true

  const roundRows = rounds.data ?? []
  const fallbacks = roundRows.filter((round) => round.fallbackLevel > 0)

  function askPause() {
    confirm.ask({
      title: paused ? "Chạy lại Flashback?" : "Tạm dừng Flashback?",
      description: paused
        ? "Tác vụ sẽ mở đề mới ngay khi tới giờ mở."
        : "Tác vụ sẽ dừng mở đề mới. Đề đang mở vẫn chạy tới giờ đóng và trả thưởng bình thường.",
      body: (
        <p className="text-muted-foreground">
          Đây là tuỳ chọn an toàn, không phải thao tác hằng ngày.
        </p>
      ),
      confirmLabel: paused ? "Chạy lại" : "Tạm dừng",
      tone: paused ? "default" : "destructive",
      run: async () => {
        try {
          const next = await pause.mutateAsync(!paused)
          toast.success(next ? "Đã tạm dừng Flashback" : "Flashback đã chạy lại")
        } catch (error) {
          toast.error(errorMessage(error))
          throw error
        }
      },
    })
  }

  function askReveal(round: FlashbackRound) {
    reveal.mutate(round.id, {
      onSuccess: setRevealed,
      onError: (error) => toast.error(errorMessage(error)),
    })
  }

  const roundColumns: AdminColumn<FlashbackRound>[] = [
    {
      id: "roundNo",
      header: "Số đề",
      cell: (row) => <span className="font-semibold">{`#${row.roundNo}`}</span>,
    },
    {
      id: "status",
      header: "Trạng thái",
      cell: (row) => {
        const known = ROUND_STATUS[row.status]
        return (
          <StatusBadge
            status={row.status}
            label={known?.label ?? row.status}
            tone={known?.tone ?? "neutral"}
          />
        )
      },
    },
    {
      id: "opensAt",
      header: "Giờ mở",
      cell: (row) => (
        <span
          className="tabular-nums"
          title={row.opensAt ? undefined : `Dự kiến mở lúc ${formatDateTime(row.scheduledOpenAt)}`}
        >
          {formatDateTime(row.opensAt ?? row.scheduledOpenAt)}
        </span>
      ),
    },
    {
      id: "closesAt",
      header: "Giờ đóng",
      cell: (row) => <span className="tabular-nums">{formatDateTime(row.closesAt)}</span>,
    },
    {
      id: "playerCount",
      header: "Người chơi",
      align: "right",
      cell: (row) => formatNumber(row.playerCount),
    },
    {
      id: "totalFeeXu",
      header: "Phí thu (xu)",
      align: "right",
      cell: (row) => formatNumber(row.totalFeeXu),
    },
    {
      id: "totalRewardXu",
      header: "Thưởng đã trả (xu)",
      align: "right",
      cell: (row) => formatNumber(row.totalRewardXu),
    },
    ...(isTopAdmin
      ? [
          {
            id: "reveal",
            header: <span className="sr-only">Thao tác</span>,
            cell: (row: FlashbackRound) =>
              isRevealable(row) ? (
                <Button
                  type="button"
                  size="xs"
                  variant="outline"
                  aria-label={`Xem mã và giai đoạn của đề #${row.roundNo}`}
                  onClick={() => askReveal(row)}
                >
                  <Eye aria-hidden="true" />
                  Xem mã
                </Button>
              ) : null,
          } satisfies AdminColumn<FlashbackRound>,
        ]
      : []),
  ]

  const alertColumns: AdminColumn<FlashbackAlert>[] = [
    {
      id: "level",
      header: "Mức độ",
      cell: (row) =>
        row.level ? (
          <StatusBadge
            status={row.level}
            label={row.levelLabel ?? ALERT_LEVEL[row.level]}
            tone={row.level === "high" ? "danger" : "warning"}
          />
        ) : (
          "—"
        ),
    },
    {
      id: "runAt",
      header: "Thời điểm",
      cell: (row) => <span className="tabular-nums">{formatDateTime(row.runAt)}</span>,
    },
    { id: "result", header: "Nội dung", cell: (row) => row.result },
    {
      id: "roundId",
      header: "Đề",
      cell: (row) =>
        row.roundId ? (
          <span className="font-mono text-xs" title={row.roundId}>
            {row.roundId.slice(0, 8)}
          </span>
        ) : (
          "—"
        ),
    },
    { id: "error", header: "Lỗi", cell: (row) => row.error ?? "—" },
  ]

  const suspectColumns: AdminColumn<FlashbackSuspect>[] = [
    {
      id: "reason",
      header: "Lý do",
      cell: (row) => (
        <Badge variant="outline" className="border-status-warning/45 text-status-warning">
          {SUSPECT_REASON[row.reason] ?? row.reason}
        </Badge>
      ),
    },
    {
      id: "shared",
      header: "Dấu vết chung",
      cell: (row) => (
        <span className="font-mono text-xs break-all" title={row.shared}>
          {row.shared}
        </span>
      ),
    },
    {
      id: "usernames",
      header: "Tài khoản",
      cell: (row) => row.usernames.join(", ") || "—",
    },
    {
      id: "userCount",
      header: "Số tài khoản",
      align: "right",
      cell: (row) => formatNumber(row.userCount),
    },
    {
      id: "roundId",
      header: "Đề",
      cell: (row) => (
        <span className="font-mono text-xs" title={row.roundId}>
          {row.roundId.slice(0, 8)}
        </span>
      ),
    },
  ]

  return (
    <WorkspacePage
      title="Flashback"
      description="Theo dõi các đề Flashback: số đề, trạng thái, người chơi, phí thu và thưởng đã trả. Mã và giai đoạn của đề chỉ xem được bằng thao tác có ghi nhật ký."
      actions={
        isTopAdmin ? (
          <Button
            type="button"
            variant={paused ? "default" : "outline"}
            onClick={askPause}
            disabled={pause.isPending || pauseStatus.isPending || pauseStatus.isError}
          >
            {paused ? <PlayCircle aria-hidden="true" /> : <PauseCircle aria-hidden="true" />}
            {paused ? "Chạy lại Flashback" : "Tạm dừng Flashback"}
          </Button>
        ) : undefined
      }
    >
      <Section title="Đề Flashback" description="Mã và giai đoạn của đề đang mở không hiện ở đây.">
        {rounds.isError ? (
          <PanelState
            title="Không tải được danh sách đề"
            description={errorMessage(rounds.error)}
            action={{ label: "Thử lại", onClick: () => void rounds.refetch() }}
          />
        ) : (
          <AdminDataTable
            columns={roundColumns}
            rows={roundRows}
            rowKey={(row) => `round-${row.roundNo}`}
            loading={rounds.isPending}
            emptyLabel="Chưa có đề Flashback nào."
          />
        )}
      </Section>

      <div className="grid gap-6 xl:grid-cols-2">
        <Section title="Cảnh báo" description="Cảnh báo của tác vụ tạo đề và các lần dùng phương án dự phòng.">
          {alerts.isError ? (
            <PanelState
              title="Không tải được cảnh báo"
              description={errorMessage(alerts.error)}
              action={{ label: "Thử lại", onClick: () => void alerts.refetch() }}
            />
          ) : (
            <div className="space-y-4">
              <AdminDataTable
                columns={alertColumns}
                rows={alerts.data ?? []}
                rowKey={(row) => `alert-${row.runAt}-${row.result}`}
                loading={alerts.isPending}
                emptyLabel="Không có cảnh báo nào."
              />
              <div className="space-y-2">
                <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  Phương án dự phòng đã dùng
                </h3>
                {fallbacks.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Chưa có lần nào phải dùng phương án dự phòng.
                  </p>
                ) : (
                  <ul className="space-y-1.5 text-xs">
                    {fallbacks.map((round) => (
                      <li key={round.roundNo} className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold">{`Đề #${round.roundNo}`}</span>
                        <Badge variant="outline" className="border-status-warning/45 text-status-warning">
                          Mức nới {round.fallbackLevel}
                        </Badge>
                        <span className="tabular-nums text-muted-foreground">
                          {formatDateTime(round.opensAt ?? round.scheduledOpenAt)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </Section>

        <Section
          title="Tài khoản bị đánh dấu nghi gian lận"
          description="Nhóm tài khoản dùng chung một dấu vết rồi cùng tham gia một đề."
        >
          {suspects.isError ? (
            <PanelState
              title="Không tải được danh sách tài khoản nghi vấn"
              description={errorMessage(suspects.error)}
              action={{ label: "Thử lại", onClick: () => void suspects.refetch() }}
            />
          ) : (
            <AdminDataTable
              columns={suspectColumns}
              rows={suspects.data ?? []}
              rowKey={(row) => `suspect-${row.reason}-${row.shared}`}
              loading={suspects.isPending}
              emptyLabel="Không có tài khoản nào bị đánh dấu nghi gian lận."
            />
          )}
        </Section>
      </div>

      {confirm.element}

      <Dialog
        open={revealed !== null}
        onOpenChange={(open) => {
          if (!open) setRevealed(null)
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Mã và giai đoạn của đề #{revealed?.roundNo}</DialogTitle>
            <DialogDescription>
              Mỗi lần xem được ghi nhật ký để đối soát khi có khiếu nại.
            </DialogDescription>
          </DialogHeader>
          <dl className="space-y-2 text-sm">
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-muted-foreground">Mã</dt>
              <dd className="font-semibold">{revealed?.symbol}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-muted-foreground">Ngày bắt đầu</dt>
              <dd className="tabular-nums">{revealed?.startDate}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-muted-foreground">Khoảng phiên</dt>
              <dd className="font-mono text-xs tabular-nums">{revealed?.sessionRange}</dd>
            </div>
          </dl>
        </DialogContent>
      </Dialog>
    </WorkspacePage>
  )
}
