/**
 * Thẻ cấp ở đầu sảnh (spec v2.1 §2.1): "Cấp N", điểm, điểm còn thiếu để lên cấp kế, thanh tiến độ
 * trong cấp hiện tại và hạng trên bảng xếp hạng toàn hệ thống. Thẻ chỉ để xem, không bấm được.
 */
import { Skeleton } from "@/components/ui/skeleton"
import { formatNumber, levelPercent } from "./flashback-model"
import { useMyLevel } from "./use-flashback-progress"

export function LevelCard() {
  const query = useMyLevel()
  const level = query.data
  if (!level) {
    // Lỗi tải thẻ cấp không chặn sảnh: thẻ chỉ để xem, danh sách phòng vẫn dùng được.
    return query.isPending ? (
      <Skeleton className="h-[62px] w-full sm:w-[340px]" role="status" aria-label="Đang tải cấp" />
    ) : null
  }
  const percent = levelPercent(level)
  return (
    <section
      aria-label="Cấp của bạn"
      data-testid="flashback-level-card"
      className="flex w-full min-w-0 items-center gap-3 rounded-lg border border-border bg-card p-2 pr-3.5 sm:w-auto"
    >
      <span className="rounded-md bg-crown-gold px-2.5 py-2 font-heading text-[13px] font-black whitespace-nowrap text-crown-foreground tabular-nums">
        Cấp {level.level}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1 sm:min-w-[170px] sm:flex-none">
        <b className="text-[14.5px] tabular-nums">{formatNumber(level.points)} điểm</b>
        <span className="text-xs font-semibold text-text-secondary tabular-nums">
          Còn {formatNumber(level.remaining_points)} điểm lên cấp {level.level + 1}
        </span>
        <div
          role="progressbar"
          aria-label="Tiến độ trong cấp"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          className="h-1.5 overflow-hidden rounded-full bg-muted"
        >
          <div className="h-full bg-crown-gold" style={{ width: `${percent}%` }} />
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end border-l border-border pl-3 text-right">
        <span className="text-xs font-semibold text-text-secondary">Xếp hạng</span>
        <b className="text-[14.5px] tabular-nums">{level.rank ? `Top ${level.rank}` : "Chưa xếp hạng"}</b>
      </div>
    </section>
  )
}
