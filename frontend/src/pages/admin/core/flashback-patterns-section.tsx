import { useEffect, useState } from "react"
import { RefreshCw } from "lucide-react"
import { toast } from "sonner"

import { PanelState } from "@/components/layout/panel-state"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { ApiError, errorMessage } from "@/lib/api"

import { useConfirmDialog } from "./components/use-confirm-dialog"
import type { PatternStatus } from "./flashback-patterns-api"
import { describeRecomputeError } from "./flashback-patterns-format"
import { usePatternOverview, usePatternStatus, useRecomputePatterns } from "./flashback-patterns-hooks"
import {
  PatternLookupPanel,
  PatternOverviewPanel,
  PatternProgressPanel,
  PatternQueuedPanel,
  PatternStatusPanel,
  PatternWarnings,
} from "./flashback-patterns-panels"

/** Đợi lâu hơn chừng này mà chưa thấy lần tính nào xuất hiện thì báo máy chủ có thể đang bận. */
const START_WAIT_MS = 45_000

/** Yêu cầu tính lại đã được máy chủ nhận nhưng chưa thấy lần tính nào xuất hiện. */
type Awaiting = { latestId: number | null; timedOut: boolean }

function describeRecomputeImpact(status: PatternStatus): string {
  const keep = status.used
    ? `Ván chơi vẫn chạy bình thường trong lúc tính; thẻ trong ván dùng bộ mẫu hiện tại (bộ nhận diện ${status.used.detectorVersion}) cho tới khi lần tính mới xong.`
    : "Kho chưa có mẫu nến nên ván vẫn chơi bình thường, chỉ chưa hiện thẻ nào cho tới khi tính xong."
  return `${keep} Chạy lại nhiều lần vẫn cho đúng kết quả, không tạo dòng trùng.`
}

/**
 * Khối "Mẫu nến" của mục "Kho dữ liệu Flashback" (Candle Dojo spec v1.3 §7): trạng thái tính mẫu
 * kèm nút "Tính lại mẫu nến", cảnh báo, tra cứu theo mã và khoảng ngày, tổng quan 47 thẻ trên cả kho.
 *
 * Mọi con số đều do máy chủ báo. Nút bị khoá khi máy chủ báo đang có một lần tính (còn tín hiệu
 * sống), khi yêu cầu đang gửi, và từ lúc máy chủ nhận yêu cầu cho tới khi thấy lần tính xuất hiện.
 * Máy chủ vẫn là nơi chặn chạy hai lần (409) nếu hai quản trị viên bấm cùng lúc.
 */
export function FlashbackPatternsSection({
  datasetSignature,
  symbolOptions,
}: {
  /** Dấu hiệu của kho dữ liệu: đổi thì trạng thái mẫu nến đọc lại. */
  datasetSignature: string
  /** Mã trong kho đang dùng, để gợi ý ở ô tra cứu. */
  symbolOptions?: readonly string[]
}) {
  const [awaiting, setAwaiting] = useState<Awaiting | null>(null)
  const status = usePatternStatus({
    waitingFor: awaiting && !awaiting.timedOut ? { latestId: awaiting.latestId } : null,
    datasetSignature,
  })
  const recompute = useRecomputePatterns()
  const confirm = useConfirmDialog()

  const data = status.data
  const usedRunId = data?.used?.id ?? null
  const overview = usePatternOverview(usedRunId, data !== undefined && data.version !== null)

  const running = data?.running ?? null
  /** Yêu cầu đã gửi mà chưa có lần tính mới nào xuất hiện. */
  const unchanged = awaiting !== null && (data?.latest?.id ?? null) === awaiting.latestId
  /** Còn trong thời gian chờ máy chủ nhận việc: vẫn khoá nút. */
  const waiting = unchanged && !awaiting.timedOut
  /** Đã chờ quá lâu mà chưa có lần tính nào: báo, và cho bấm lại. */
  const notStarted = unchanged && awaiting.timedOut
  const busy = running !== null || waiting || recompute.isPending
  const blocked = data === undefined || data.version === null || busy

  useEffect(() => {
    if (awaiting === null || awaiting.timedOut) return
    const timer = window.setTimeout(
      () => setAwaiting((current) => (current ? { ...current, timedOut: true } : current)),
      START_WAIT_MS,
    )
    return () => window.clearTimeout(timer)
  }, [awaiting])

  function askRecompute() {
    if (!data || data.version === null) return
    const latestId = data.latest?.id ?? null
    confirm.ask({
      title: "Tính lại mẫu nến?",
      description: `Nhận diện lại mẫu nến của mọi phiên của mọi mã trong kho phiên bản ${data.version} bằng bộ nhận diện ${data.detectorVersion}. Việc này chạy nền trong máy chủ, thường dưới 5 phút.`,
      body: <p className="text-foreground">{describeRecomputeImpact(data)}</p>,
      confirmLabel: "Tính lại mẫu nến",
      run: async () => {
        try {
          await recompute.mutateAsync()
          setAwaiting({ latestId, timedOut: false })
          toast.success("Đã gửi yêu cầu tính lại mẫu nến")
        } catch (error) {
          toast.error(describeRecomputeError(error))
          // Máy chủ báo đang có một lần tính khác hoặc chưa có kho: đóng hộp thoại và đọc lại trạng thái.
          if (error instanceof ApiError && error.status === 409) {
            void status.refetch()
            return
          }
          throw error
        }
      },
    })
  }

  return (
    <section className="space-y-5" aria-labelledby="flashback-patterns-heading">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 id="flashback-patterns-heading" className="font-heading text-sm font-bold">
            Mẫu nến
          </h3>
          <p className="mt-0.5 max-w-3xl text-xs text-muted-foreground">
            Mẫu nến của mọi phiên của mọi mã trong kho được tính sẵn một lần. Lúc chơi hệ thống chỉ tra bảng này, không
            nhận diện lại. Tính lại khi đổi bộ nhận diện hoặc khi kho có từ trước chưa có mẫu.
          </p>
        </div>
        <Button type="button" onClick={askRecompute} disabled={blocked}>
          <RefreshCw className={busy ? "animate-spin" : undefined} aria-hidden="true" />
          {busy ? "Đang tính mẫu nến" : "Tính lại mẫu nến"}
        </Button>
      </div>

      {status.isError && !data ? (
        <PanelState
          title="Không tải được trạng thái mẫu nến"
          description={errorMessage(status.error)}
          action={{ label: "Thử lại", onClick: () => void status.refetch() }}
        />
      ) : !data ? (
        <div className="space-y-3" aria-busy="true" aria-label="Đang tải trạng thái mẫu nến">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : (
        <>
          {running ? (
            <PatternProgressPanel run={running} detectorVersion={data.detectorVersion} />
          ) : waiting ? (
            <PatternQueuedPanel />
          ) : notStarted ? (
            <PanelState
              title="Chưa thấy lần tính nào bắt đầu"
              description="Yêu cầu đã được máy chủ nhận nhưng chưa có lần tính nào xuất hiện. Hãy đọc lại sau ít phút."
              action={{ label: "Đọc lại", onClick: () => void status.refetch() }}
            />
          ) : null}

          {data.version === null ? (
            <PanelState
              title="Chưa có kho dữ liệu đang dùng"
              description="Mẫu nến tính theo phiên bản kho đang dùng. Hãy làm mới kho ở trên để tạo phiên bản đầu tiên."
            />
          ) : (
            <>
              <PatternStatusPanel status={data} />
              <PatternWarnings warnings={data.warnings} />
              <PatternLookupPanel usedRunId={usedRunId} symbolOptions={symbolOptions} />
              <PatternOverviewPanel
                data={overview.data}
                isPending={overview.isPending}
                error={overview.isError ? errorMessage(overview.error) : null}
                onRetry={() => void overview.refetch()}
              />
            </>
          )}
        </>
      )}

      {confirm.element}
    </section>
  )
}
