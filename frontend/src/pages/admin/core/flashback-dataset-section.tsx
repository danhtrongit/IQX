import { useEffect, useRef, useState } from "react"
import { Database, RefreshCw, Settings2 } from "lucide-react"
import { toast } from "sonner"

import { PanelState } from "@/components/layout/panel-state"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { ApiError, errorMessage } from "@/lib/api"
import { formatNumber } from "@/lib/format"

import { useConfirmDialog } from "./components/use-confirm-dialog"
import { datasetSignature, latestDatasetRun, type DatasetStatus } from "./flashback-dataset-api"
import { DatasetConfigDialog } from "./flashback-dataset-config"
import { describeDatasetSchedule } from "./flashback-dataset-format"
import {
  useDatasetStatus,
  useDatasetSymbols,
  useDatasetVersions,
  useRefreshDataset,
} from "./flashback-dataset-hooks"
import {
  DatasetBlock,
  DatasetLastRun,
  DatasetParamsPanel,
  DatasetProgressPanel,
  DatasetQueuedPanel,
  DatasetSymbolsPanel,
  DatasetVersionInfo,
  DatasetVersionsPanel,
  DatasetWarnings,
} from "./flashback-dataset-panels"

/** Đợi lâu hơn chừng này mà chưa thấy lần dựng nào bắt đầu thì báo tác vụ nền có thể đang bận. */
const QUEUE_WAIT_MS = 90_000

/** Yêu cầu làm mới đã được máy chủ nhận nhưng chưa thấy lần dựng nào bắt đầu. */
type Awaiting = { signature: string; timedOut: boolean }

function describeRefreshImpact(status: DatasetStatus): string {
  const active = status.active
  const keep = active
    ? `Kho đang dùng (phiên bản ${active.version}, ${formatNumber(active.symbolsCount)} mã) và các ván đang chơi không bị ảnh hưởng.`
    : "Hiện chưa có kho đang dùng nên phòng chơi chưa bắt đầu được ván."
  return `${keep} Phiên bản mới chỉ thay kho cũ khi có ít nhất ${status.config.minSymbols} mã hợp lệ.`
}

/**
 * Mục "Kho dữ liệu Flashback" của màn quản trị (spec v2.2 §6): phiên bản đang dùng, danh sách mã
 * kèm lý do bị loại, nút "Làm mới kho" có tiến độ, lịch sử phiên bản kèm nhật ký, cảnh báo và
 * tham số.
 *
 * Mọi con số đều do máy chủ báo. Nút "Làm mới kho" bị khoá khi máy chủ báo đang có một lần dựng
 * (còn tín hiệu sống), khi yêu cầu đang gửi, và từ lúc máy chủ nhận yêu cầu cho tới lúc thấy lần
 * dựng bắt đầu. Máy chủ vẫn là nơi chặn chạy hai lần (409) nếu hai quản trị viên bấm cùng lúc.
 */
export function FlashbackDatasetSection() {
  const [awaiting, setAwaiting] = useState<Awaiting | null>(null)
  const [selectedVersion, setSelectedVersion] = useState<number | null>(null)
  const [configOpen, setConfigOpen] = useState(false)
  const symbolsAnchor = useRef<HTMLDivElement>(null)

  const status = useDatasetStatus({ waitingFor: awaiting && !awaiting.timedOut ? awaiting.signature : null })
  const signature = datasetSignature(status.data)
  const symbols = useDatasetSymbols(selectedVersion, signature)
  const versions = useDatasetVersions(signature)
  const refresh = useRefreshDataset()
  const confirm = useConfirmDialog()

  const data = status.data
  const building = data?.building ?? null
  /** Máy chủ đang dựng và còn tín hiệu sống: không cho bấm thêm. */
  const running = building !== null && !building.stale
  /** Yêu cầu đã gửi mà kho chưa đổi dấu hiệu, tức chưa thấy lần dựng nào bắt đầu. */
  const unchanged = awaiting !== null && awaiting.signature === signature
  /** Còn trong thời gian chờ tác vụ nền nhận việc: vẫn khoá nút. */
  const waiting = unchanged && !awaiting.timedOut
  /** Đã chờ quá lâu mà chưa có lần dựng nào: báo, và cho bấm lại. */
  const notStarted = unchanged && awaiting.timedOut
  const refreshBlocked = data === undefined || running || waiting || refresh.isPending
  const lastRun = data ? latestDatasetRun(data) : null

  useEffect(() => {
    if (awaiting === null || awaiting.timedOut) return
    const timer = window.setTimeout(
      () => setAwaiting((current) => (current ? { ...current, timedOut: true } : current)),
      QUEUE_WAIT_MS,
    )
    return () => window.clearTimeout(timer)
  }, [awaiting])

  function askRefresh() {
    if (!data || signature === null) return
    confirm.ask({
      title: "Làm mới kho dữ liệu?",
      description:
        "Tải lại lịch sử giá của rổ mã và dựng một phiên bản kho mới ở nền. Việc này thường mất vài phút.",
      body: <p className="text-muted-foreground">{describeRefreshImpact(data)}</p>,
      confirmLabel: "Làm mới kho",
      run: async () => {
        try {
          await refresh.mutateAsync()
          setAwaiting({ signature, timedOut: false })
          toast.success("Đã gửi yêu cầu làm mới kho")
        } catch (error) {
          toast.error(errorMessage(error))
          // Máy chủ báo đang có một lần dựng khác: đóng hộp thoại và đọc lại để hiện tiến độ.
          if (error instanceof ApiError && error.status === 409) {
            void status.refetch()
            return
          }
          throw error
        }
      },
    })
  }

  function viewSymbols(version: number) {
    setSelectedVersion(version === data?.active?.version ? null : version)
    symbolsAnchor.current?.scrollIntoView?.({ behavior: "smooth", block: "start" })
  }

  return (
    <section className="space-y-6" aria-labelledby="flashback-dataset-heading">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="flashback-dataset-heading" className="font-heading text-sm font-bold">
            Kho dữ liệu Flashback
          </h2>
          <p className="mt-0.5 max-w-3xl text-xs text-muted-foreground">
            Lịch sử giá của rổ mã mà phòng chơi cắt đề từ đó. Kho có nhiều phiên bản: làm mới tạo phiên bản
            mới, ván đang chơi vẫn đọc đúng phiên bản cũ của mình.
          </p>
        </div>
        <Button type="button" onClick={askRefresh} disabled={refreshBlocked}>
          <RefreshCw className={running || waiting || refresh.isPending ? "animate-spin" : undefined} aria-hidden="true" />
          {running || waiting || refresh.isPending ? "Đang làm mới kho" : "Làm mới kho"}
        </Button>
      </div>

      {status.isError && !data ? (
        <PanelState
          title="Không tải được kho dữ liệu"
          description={errorMessage(status.error)}
          action={{ label: "Thử lại", onClick: () => void status.refetch() }}
        />
      ) : !data ? (
        <div className="space-y-3" aria-busy="true" aria-label="Đang tải kho dữ liệu">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : (
        <>
          {building ? (
            <DatasetProgressPanel building={building} />
          ) : waiting ? (
            <DatasetQueuedPanel />
          ) : notStarted ? (
            <PanelState
              title="Chưa thấy lần làm mới nào bắt đầu"
              description="Yêu cầu đã được máy chủ nhận nhưng tác vụ nền chưa chạy. Có thể tác vụ đang bận: hãy tải lại sau ít phút."
              action={{ label: "Đọc lại", onClick: () => void status.refetch() }}
            />
          ) : null}

          <DatasetBlock title="Cảnh báo" description="Làm mới thất bại, kho dưới ngưỡng số mã và ván không cắt được đề.">
            <DatasetWarnings warnings={data.warnings} />
          </DatasetBlock>

          {data.active ? (
            <DatasetVersionInfo version={data.active} />
          ) : (
            <PanelState
              title="Chưa có kho dữ liệu đang dùng"
              description="Phòng chơi chưa bắt đầu được ván. Bấm Làm mới kho để tạo phiên bản đầu tiên."
            />
          )}

          <div className="space-y-1">
            {lastRun && <DatasetLastRun run={lastRun} />}
            <p className="text-xs text-muted-foreground">{describeDatasetSchedule(data.schedule)}</p>
          </div>
        </>
      )}

      <div ref={symbolsAnchor}>
        <DatasetSymbolsPanel
          key={selectedVersion ?? "active"}
          data={symbols.data}
          isPending={signature === null || symbols.isPending}
          error={symbols.isError ? errorMessage(symbols.error) : null}
          onRetry={() => void symbols.refetch()}
          onBackToActive={selectedVersion !== null ? () => setSelectedVersion(null) : undefined}
        />
      </div>

      <DatasetBlock
        title="Lịch sử phiên bản"
        description="Ngày tạo, trạng thái, số mã và nhật ký của từng lần tạo kho. Mở một dòng để đọc nhật ký."
      >
        <DatasetVersionsPanel
          versions={versions.data}
          isPending={signature === null || versions.isPending}
          error={versions.isError ? errorMessage(versions.error) : null}
          onRetry={() => void versions.refetch()}
          onViewSymbols={viewSymbols}
        />
      </DatasetBlock>

      <DatasetBlock
        title="Tham số kho dữ liệu"
        description="Tham số của spec v2.2 §5. Đổi ở đây không cần sửa code; mỗi tham số ghi rõ lúc nào có hiệu lực."
        actions={
          data ? (
            <Button type="button" size="sm" variant="outline" onClick={() => setConfigOpen(true)}>
              <Settings2 aria-hidden="true" />
              Sửa tham số
            </Button>
          ) : undefined
        }
      >
        {data ? (
          <>
            {data.configInvalid.length > 0 && (
              <p className="text-xs text-status-warning">
                {`Các tham số sau không hợp lệ nên đang dùng mặc định: ${data.configInvalid.join(", ")}.`}
              </p>
            )}
            <DatasetParamsPanel config={data.config} defaults={data.configDefaults} />
          </>
        ) : (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Database className="size-4" aria-hidden="true" />
            Tham số hiện ra khi kho dữ liệu tải xong.
          </div>
        )}
      </DatasetBlock>

      {data && <DatasetConfigDialog open={configOpen} onOpenChange={setConfigOpen} config={data.config} />}
      {confirm.element}
    </section>
  )
}
