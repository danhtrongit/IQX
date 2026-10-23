import { useState } from "react"
import { Ban, Eye, PauseCircle, PlayCircle, Send } from "lucide-react"
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
import { errorMessage } from "@/lib/api"
import { formatDateTime, formatNumber } from "@/lib/format"

import { AdminDataTable, type AdminColumn } from "./components/admin-data-table"
import { StatusBadge } from "./components/status-badge"
import { useConfirmDialog } from "./components/use-confirm-dialog"
import type {
  FlashbackAlert,
  FlashbackAlertLevel,
  FlashbackReveal,
  FlashbackRewardHold,
  FlashbackRound,
  FlashbackSetting,
  FlashbackSuspect,
} from "./flashback-api"
import {
  useDecideRewardHold,
  useFlashbackAlerts,
  useFlashbackPauseStatus,
  useFlashbackRewardHolds,
  useFlashbackRounds,
  useFlashbackSettings,
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
  same_phone: "Cùng số điện thoại",
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
 * chủ ghi nhật ký. Nút tạm dừng và xem mã chỉ hiện với quản trị cao nhất
 * (`SUPER_ADMIN_USER_IDS`, máy chủ báo qua `super_admin` và tự kiểm tra lại).
 * Thưởng của tài khoản nghi gian lận bị tạm giữ ở đây chờ trả hoặc huỷ.
 */
export function FlashbackPage() {
  const rounds = useFlashbackRounds()
  const holds = useFlashbackRewardHolds()
  const settings = useFlashbackSettings()
  const decide = useDecideRewardHold()
  const alerts = useFlashbackAlerts()
  const suspects = useFlashbackSuspects()
  const pauseStatus = useFlashbackPauseStatus()
  const pause = usePauseFlashback()
  const reveal = useRevealFlashbackRound()
  const confirm = useConfirmDialog()
  const [revealed, setRevealed] = useState<FlashbackReveal | null>(null)

  /** Flashback đang tạm dừng: đọc từ máy chủ, không suy đoán từ phiên. */
  const paused = pauseStatus.data?.paused === true
  /** Quản trị cao nhất theo máy chủ (FB-08), không theo vai trò trong phiên. */
  const isTopAdmin = pauseStatus.data?.superAdmin === true

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

  function askDecide(hold: FlashbackRewardHold, action: "release" | "void") {
    const release = action === "release"
    confirm.ask({
      title: release ? "Trả thưởng cho tài khoản này?" : "Huỷ khoản thưởng này?",
      description: release
        ? `Cộng ${formatNumber(hold.amount)} xu vào ví của ${hold.username} cho đề #${hold.roundNo}.`
        : `Không cộng ${formatNumber(hold.amount)} xu cho ${hold.username} ở đề #${hold.roundNo}. Thao tác không hoàn tác được.`,
      body: <p className="text-muted-foreground">Máy chủ ghi nhật ký kiểm tra cho thao tác này.</p>,
      confirmLabel: release ? "Trả thưởng" : "Huỷ thưởng",
      tone: release ? "default" : "destructive",
      run: async () => {
        try {
          await decide.mutateAsync({ id: hold.id, action })
          toast.success(release ? "Đã trả thưởng" : "Đã huỷ thưởng")
        } catch (error) {
          toast.error(errorMessage(error))
          throw error
        }
      },
    })
  }

  const holdColumns: AdminColumn<FlashbackRewardHold>[] = [
    { id: "roundNo", header: "Đề", cell: (row) => <span className="font-semibold">{`#${row.roundNo}`}</span> },
    { id: "username", header: "Tài khoản", cell: (row) => row.username },
    {
      id: "amount",
      header: "Thưởng giữ (xu)",
      align: "right",
      cell: (row) => <span className="tabular-nums">{formatNumber(row.amount)}</span>,
    },
    { id: "reason", header: "Lý do", cell: (row) => SUSPECT_REASON[row.reason] ?? row.reason },
    {
      id: "createdAt",
      header: "Thời điểm",
      cell: (row) => <span className="tabular-nums">{formatDateTime(row.createdAt)}</span>,
    },
    {
      id: "actions",
      header: <span className="sr-only">Thao tác</span>,
      cell: (row) => (
        <div className="flex justify-end gap-1.5">
          <Button
            type="button"
            size="xs"
            variant="outline"
            aria-label={`Trả thưởng đề #${row.roundNo} cho ${row.username}`}
            disabled={decide.isPending}
            onClick={() => askDecide(row, "release")}
          >
            <Send aria-hidden="true" />
            Trả thưởng
          </Button>
          <Button
            type="button"
            size="xs"
            variant="ghost"
            aria-label={`Huỷ thưởng đề #${row.roundNo} của ${row.username}`}
            disabled={decide.isPending}
            onClick={() => askDecide(row, "void")}
          >
            <Ban aria-hidden="true" />
            Huỷ thưởng
          </Button>
        </div>
      ),
    },
  ]

  const settingColumns: AdminColumn<FlashbackSetting>[] = [
    { id: "label", header: "Tham số", cell: (row) => row.label },
    {
      id: "key",
      header: "Khoá",
      cell: (row) => <span className="font-mono text-xs">{row.key}</span>,
    },
    {
      id: "value",
      header: "Giá trị",
      align: "right",
      cell: (row) => (
        <span className="tabular-nums font-semibold">
          {typeof row.value === "number" ? formatNumber(row.value) : row.value}
        </span>
      ),
    },
    {
      id: "defaultValue",
      header: "Mặc định",
      align: "right",
      cell: (row) => (
        <span className="tabular-nums text-muted-foreground">
          {typeof row.defaultValue === "number" ? formatNumber(row.defaultValue) : row.defaultValue}
        </span>
      ),
    },
  ]

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
    {
      id: "heldRewardXu",
      header: "Thưởng tạm giữ (xu)",
      align: "right",
      cell: (row) =>
        row.heldRewardXu > 0 ? (
          <span className="tabular-nums text-status-warning">{formatNumber(row.heldRewardXu)}</span>
        ) : (
          formatNumber(0)
        ),
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

      <Section
        title="Thưởng tạm giữ"
        description="Thưởng của tài khoản nằm trong nhóm nghi gian lận được giữ lại khi đề đóng. Trả thưởng cộng xu vào ví, huỷ thưởng thì không cộng."
      >
        {holds.isError ? (
          <PanelState
            title="Không tải được danh sách thưởng tạm giữ"
            description={errorMessage(holds.error)}
            action={{ label: "Thử lại", onClick: () => void holds.refetch() }}
          />
        ) : (
          <AdminDataTable
            columns={holdColumns}
            rows={holds.data ?? []}
            rowKey={(row) => `hold-${row.id}`}
            loading={holds.isPending}
            emptyLabel="Không có khoản thưởng nào đang tạm giữ."
          />
        )}
      </Section>

      <Section
        title="Tham số vận hành"
        description="Chỉ đọc. Muốn đổi tham số thì sửa bảng flashback_settings theo hướng dẫn vận hành; tác vụ đọc lại ở lần chạy kế tiếp."
      >
        {settings.isError ? (
          <PanelState
            title="Không tải được tham số vận hành"
            description={errorMessage(settings.error)}
            action={{ label: "Thử lại", onClick: () => void settings.refetch() }}
          />
        ) : (
          <AdminDataTable
            columns={settingColumns}
            rows={settings.data ?? []}
            rowKey={(row) => `setting-${row.key}`}
            loading={settings.isPending}
            emptyLabel="Chưa đọc được tham số."
          />
        )}
      </Section>

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
