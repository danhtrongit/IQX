import type { ReactNode } from "react"
import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { ArrowDown, ArrowUp, EllipsisVertical, GripVertical, X } from "lucide-react"

import { FundamentalChart, hasChartData } from "@/components/fundamental-charts"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

import type { ChartView } from "./model"

export type ChartCardProps = {
  view: ChartView
  /** Khuôn cố định theo năm (D, E1, E2): có nhãn "Theo năm, cố định", không có ô số kỳ (spec §4.1). */
  fixedYear: boolean
  /** Ô số kỳ; null khi thẻ không có ô này (khuôn cố định, chỉ tiêu không áp dụng). */
  period: { count: number; options: readonly number[]; unit: string } | null
  onPeriodChange: (count: number) => void
  onRemove: () => void
  /** Đổi chỗ với thẻ trước hoặc sau; bỏ trống khi thẻ đã ở đầu hoặc cuối (DB-05a). */
  onMoveUp?: () => void
  onMoveDown?: () => void
  /** Chỉ tiêu không áp dụng cho mã ngân hàng (spec §7). */
  notApplicable?: boolean
  /** Số liệu đang tải: thẻ hiện khung chờ, chưa vẽ gì. */
  pending?: boolean
  /** Lý do biểu đồ trống do máy chủ báo (chỉ hiện khi không có số liệu). */
  note?: string
}

const BANK_NOTE = "Không áp dụng cho ngân hàng. Báo cáo tài chính ngân hàng không có chỉ tiêu này theo cách tính của doanh nghiệp thông thường."
const EMPTY_NOTE = "Đang cập nhật dữ liệu"

/** Nhãn vàng dạng pill: "Theo năm, cố định", "Không áp dụng" (DB-05f). */
export function WarningPill({ children }: { children: ReactNode }) {
  return (
    <span className="shrink-0 rounded-full border border-status-warning/45 px-2 py-px text-[10px] font-semibold whitespace-nowrap text-status-warning">
      {children}
    </span>
  )
}

function EmptyNote({ children }: { children: ReactNode }) {
  return (
    <p className="flex min-h-40 items-center justify-center rounded-lg border border-dashed border-border px-4 py-6 text-center text-xs leading-5 font-semibold text-text-secondary">
      {children}
    </p>
  )
}

/**
 * Một thẻ biểu đồ của dashboard (spec §4): tay kéo, tên chỉ tiêu, ô số kỳ và
 * thân biểu đồ vẽ bằng bộ khuôn dùng chung. Đầu thẻ không có con số lớn của
 * kỳ gần nhất. Kéo bằng tay kéo chạy được cả chuột, cảm ứng và bàn phím;
 * menu thẻ có Lên trên / Xuống dưới cho trường hợp không kéo được.
 */
export function ChartCard({
  view,
  fixedYear,
  period,
  onPeriodChange,
  onRemove,
  onMoveUp,
  onMoveDown,
  notApplicable = false,
  pending = false,
  note,
}: ChartCardProps) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id: view.name })
  const hasData = hasChartData(view)

  return (
    <article
      ref={setNodeRef}
      data-chart={view.name}
      style={{ transform: CSS.Translate.toString(transform), transition: transition }}
      className={cn(
        "relative flex min-w-0 flex-col gap-2 rounded-lg border border-border bg-card p-3",
        isDragging && "z-10 opacity-70 outline-2 outline-dashed outline-primary",
      )}
    >
      <header className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-1.5">
          <button
            type="button"
            ref={setActivatorNodeRef}
            aria-label={`Kéo để đổi chỗ ${view.name}`}
            className="mt-0.5 shrink-0 cursor-grab touch-none rounded-sm text-text-secondary hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none active:cursor-grabbing"
            {...attributes}
            {...listeners}
          >
            <GripVertical aria-hidden="true" className="size-4" />
          </button>
          <h3 className="min-w-0 text-sm leading-snug font-semibold break-words">{view.name}</h3>
          {!notApplicable && fixedYear && <WarningPill>Theo năm, cố định</WarningPill>}
        </div>
        <div className="flex shrink-0 items-center">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="ghost" size="icon-sm" aria-label={`Tuỳ chọn ${view.name}`}>
                <EllipsisVertical aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem disabled={!onMoveUp} onSelect={() => onMoveUp?.()}>
                <ArrowUp aria-hidden="true" /> Lên trên
              </DropdownMenuItem>
              <DropdownMenuItem disabled={!onMoveDown} onSelect={() => onMoveDown?.()}>
                <ArrowDown aria-hidden="true" /> Xuống dưới
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Bỏ ${view.name} khỏi dashboard`}
            onClick={onRemove}
          >
            <X aria-hidden="true" />
          </Button>
        </div>
      </header>

      {period && (
        <select
          aria-label={`Số kỳ hiển thị của ${view.name}`}
          value={period.count}
          onChange={(event) => onPeriodChange(Number(event.target.value))}
          className="h-7 w-fit rounded-sm border border-border bg-input px-2 text-xs font-semibold text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {period.options.map((option) => (
            <option key={option} value={option}>
              {option} {period.unit}
            </option>
          ))}
        </select>
      )}

      {pending ? (
        <Skeleton className="h-40 w-full rounded-sm" />
      ) : notApplicable ? (
        <EmptyNote>{BANK_NOTE}</EmptyNote>
      ) : !hasData ? (
        <EmptyNote>{note ?? EMPTY_NOTE}</EmptyNote>
      ) : (
        <FundamentalChart chart={view} />
      )}
    </article>
  )
}
