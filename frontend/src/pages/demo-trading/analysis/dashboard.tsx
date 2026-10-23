import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import { SortableContext, arrayMove, rectSortingStrategy, sortableKeyboardCoordinates } from "@dnd-kit/sortable"
import { toast } from "sonner"

import { FIXED_YEAR_KINDS, decimalsForUnit } from "@/components/fundamental-charts"

import { PanelState } from "@/components/layout/panel-state"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useAuth } from "@/hooks/use-auth"
import { errorMessage } from "@/lib/api"
import { cn } from "@/lib/utils"

import type { ChartKind, ChartName } from "./api"
import { isNotApplicable } from "./api"
import { ChartCard } from "./chart-card"
import { ChartPicker } from "./chart-picker"
import {
  DEFAULT_DRAFT,
  PERIOD_OPTIONS,
  chartView,
  dailyWindowStart,
  isSameSettings,
  legendNoteOf,
  normalizedPeriodCounts,
  periodCount,
  valuationFrom,
  windowMonths,
  type ChartView,
  type DashboardDraft,
} from "./model"
import {
  useDashboardCatalog,
  useDashboardSettings,
  useFundamental,
  useInstrumentIsBank,
  useSaveDashboardSettings,
  useValuation,
} from "./use-dashboard"

/** Chỉ tiêu hỏi khi danh sách trống, để biết mã đó có phải ngân hàng không. */
const BANK_PROBE_CHART = "ROE"

/** 5 chỉ tiêu định giá theo ngày (khuôn F, spec §8.6). */
const VALUATION_CHARTS: Partial<Record<ChartName, true>> = {
  "P/E": true,
  "P/B": true,
  "P/S": true,
  "EV / EBITDA": true,
  "FCF Yield": true,
}
/** Số tháng xin chuỗi định giá: luôn đủ 10 năm (120 tháng) để chuyển Quý/Năm không phải gọi lại. */
const VALUATION_LOOKBACK_MONTHS = 120

type CardModel = {
  name: ChartName
  view: ChartView
  notApplicable: boolean
  /** Số liệu của thẻ này chưa về: thẻ hiện khung chờ. */
  pending: boolean
  note?: string
  /** Khuôn cố định theo năm (D, E1, E2). */
  fixedYear: boolean
  /** Ô số kỳ; null cho khuôn cố định theo năm và chỉ tiêu không áp dụng (spec §4.1). */
  period: { count: number; options: readonly number[]; unit: string } | null
}

/**
 * Dashboard phân tích (spec §1–§13): lưới biểu đồ của các chỉ tiêu đã học,
 * khung chọn biểu đồ bên phải và thiết lập lưu theo tài khoản.
 *
 * Mã đang xem là trạng thái chung của trang: dashboard chỉ hiện mã, không đổi
 * mã. Danh sách biểu đồ, thứ tự, Quý/Năm và số kỳ giữ nguyên khi đổi mã.
 *
 * Khách chưa đăng nhập xem bộ mặc định và đổi được trên màn hình; nút "Lưu
 * thiết lập" mời đăng nhập (spec cập nhật 22-10 §3.7).
 */
export function AnalysisDashboard({ symbol, tabsSlot }: { symbol: string; tabsSlot?: ReactNode }) {
  const { isAuthenticated, isLoading: authLoading, openAuth } = useAuth()
  const [override, setOverride] = useState<DashboardDraft | null>(null)
  const pendingScroll = useRef<string | null>(null)

  const settings = useDashboardSettings(isAuthenticated)
  const catalog = useDashboardCatalog()
  const save = useSaveDashboardSettings()
  const instrumentIsBank = useInstrumentIsBank(symbol)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  /** Khách: bộ mặc định. Thành viên: bản đã lưu cho tới khi người dùng đổi gì. */
  const guest = !isAuthenticated && !authLoading
  const saved = isAuthenticated ? settings.data : guest ? DEFAULT_DRAFT : undefined
  const base: DashboardDraft = saved ?? DEFAULT_DRAFT
  const draft = override ?? base
  const selected = draft.charts
  const per = draft.per
  const requested = selected.length > 0 ? selected : [BANK_PROBE_CHART]
  const ready = !!saved

  /** Khuôn của từng chỉ tiêu theo danh mục: biết ngay thẻ nào có ô số kỳ (DB-05e). */
  const kindByName = useMemo(() => {
    const out = new Map<string, ChartKind>()
    for (const group of catalog.data ?? []) for (const item of group.items) out.set(item.name, item.kind)
    return out
  }, [catalog.data])

  const fundamental = useFundamental(symbol, requested, per, ready)
  const fundamentalData = fundamental.data

  const valuationNames = useMemo(
    () => selected.filter((name) => VALUATION_CHARTS[name] === true),
    [selected],
  )

  const valuationFromDate = useMemo(() => valuationFrom(VALUATION_LOOKBACK_MONTHS, new Date()), [])
  const valuation = useValuation(symbol, valuationFromDate, valuationNames, ready)
  const valuationData = valuation.data

  useEffect(() => {
    const name = pendingScroll.current
    if (!name) return
    pendingScroll.current = null
    const element = document.querySelector(`[data-chart="${name}"]`)
    element?.scrollIntoView?.({ behavior: "smooth", block: "center" })
  }, [selected])

  const cards = useMemo<CardModel[]>(() => {
    const loading = fundamental.isPending || fundamental.isPlaceholderData
    const valuationLoading = valuation.isPending || valuation.isPlaceholderData
    return selected.map((name) => {
      const entry = fundamentalData?.charts[name]
      const data = entry && !isNotApplicable(entry) ? entry : undefined
      const notApplicable = isNotApplicable(entry)
      const count = periodCount(draft.nks, name, per)
      const kind = data?.kind ?? kindByName.get(name)
      const fixedYear = kind !== undefined && FIXED_YEAR_KINDS[kind]
      // Ô số kỳ luôn hiện, kể cả lúc thẻ đang tải (DB-05e).
      const period =
        kind !== undefined && !fixedYear && !notApplicable
          ? { count, options: PERIOD_OPTIONS[per], unit: per === "q" ? "quý" : "năm" }
          : null
      if (!data) {
        return {
          name,
          view: { name, kind: kind ?? "B", unit: "", decimals: 0, labels: [], main: [] },
          notApplicable,
          pending: loading,
          fixedYear,
          period,
        }
      }
      if (data.kind === "F") {
        const daily = valuationData?.charts[name]
        const dates = valuationData?.dates ?? []
        const start = dailyWindowStart(dates, windowMonths(count, per))
        const unit = daily && "v" in daily ? daily.unit : data.unit
        return {
          name,
          view: {
            name,
            kind: "F",
            unit,
            decimals: decimalsForUnit(unit),
            labels: dates.slice(start),
            main: [{ name, v: daily && "v" in daily ? daily.v.slice(start) : [] }],
            ...legendNoteOf(data),
          },
          notApplicable: false,
          pending: loading || valuationLoading,
          ...(data.note ? { note: data.note } : {}),
          fixedYear,
          period,
        }
      }
      return {
        name,
        view: chartView(data, per, count),
        notApplicable: false,
        pending: false,
        ...(data.note ? { note: data.note } : {}),
        fixedYear,
        period,
      }
    })
  }, [
    selected,
    fundamentalData,
    valuationData,
    draft.nks,
    per,
    kindByName,
    fundamental.isPending,
    fundamental.isPlaceholderData,
    valuation.isPending,
    valuation.isPlaceholderData,
  ])

  const dirty = !!saved && !isSameSettings(draft, saved)

  function update(changes: Partial<DashboardDraft>) {
    setOverride({ ...draft, ...changes })
  }

  function toggleChart(name: ChartName) {
    const charts = selected.includes(name)
      ? selected.filter((item) => item !== name)
      : [...selected, name]
    update({ charts })
    if (!selected.includes(name)) pendingScroll.current = name
  }

  function removeChart(name: ChartName) {
    update({ charts: selected.filter((item) => item !== name) })
  }

  function changePeriod(name: ChartName, count: number) {
    update({ nks: { ...draft.nks, [name]: { ...draft.nks[name], [per]: count } } })
  }

  function moveChart(fromIndex: number, toIndex: number) {
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return
    if (fromIndex >= selected.length || toIndex >= selected.length) return
    update({ charts: arrayMove([...selected], fromIndex, toIndex) })
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    moveChart(selected.indexOf(active.id as ChartName), selected.indexOf(over.id as ChartName))
  }

  function handleSave() {
    if (!isAuthenticated) {
      openAuth("login")
      return
    }
    const normalizedNks = normalizedPeriodCounts(draft.nks)
    const nextDraft: DashboardDraft = { charts: draft.charts, per: draft.per, nks: normalizedNks }
    setOverride(nextDraft)
    save.mutate(nextDraft, {
      onSuccess: () => {
        setOverride(null)
        toast.success("Đã lưu thiết lập dashboard")
      },
      onError: (error) => toast.error(errorMessage(error)),
    })
  }

  function handleReset() {
    setOverride(DEFAULT_DRAFT)
    toast.success("Đã đưa về bộ mặc định, bấm Lưu thiết lập để giữ")
  }

  // Loại doanh nghiệp: theo số liệu khi đã về, trước đó theo ngành của mã (DB-05d).
  const isBank = fundamentalData?.is_bank ?? instrumentIsBank

  return (
    <div data-analysis-dashboard="" className="flex min-h-0 flex-1 flex-col min-[761px]:flex-row">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {tabsSlot}
        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto">
          <div className="space-y-3 p-3 min-[761px]:p-4">
            <header className="flex flex-wrap items-center gap-2">
              <h1 className="font-heading text-lg font-bold">Dashboard phân tích</h1>
              <span className="rounded-sm border border-border bg-card px-2 py-1 text-sm font-bold tabular-nums">
                {symbol}
              </span>
              {isBank !== null && (
                <span
                  className={cn(
                    "rounded-full border px-2 py-0.5 text-xs font-semibold",
                    isBank
                      ? "border-status-warning/50 text-status-warning"
                      : "border-border text-text-secondary",
                  )}
                >
                  {isBank ? "Ngân hàng" : "Doanh nghiệp thông thường"}
                </span>
              )}
              <div
                role="group"
                aria-label="Chế độ kỳ"
                className="flex overflow-hidden rounded-sm border border-border"
              >
                <Button
                  type="button"
                  size="sm"
                  variant={per === "q" ? "default" : "ghost"}
                  aria-pressed={per === "q"}
                  onClick={() => update({ per: "q" })}
                >
                  Quý
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={per === "y" ? "default" : "ghost"}
                  aria-pressed={per === "y"}
                  onClick={() => update({ per: "y" })}
                >
                  Năm
                </Button>
              </div>
              <div className="ml-auto flex items-center gap-2 max-[760px]:ml-0 max-[760px]:w-full">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="max-[760px]:flex-1"
                  onClick={handleReset}
                >
                  Mặc định
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="max-[760px]:flex-1"
                  onClick={handleSave}
                  disabled={isAuthenticated && (!dirty || save.isPending)}
                >
                  {!isAuthenticated || dirty ? "Lưu thiết lập" : "✓ Đã lưu"}
                </Button>
              </div>
            </header>

            {guest && (
              <p className="text-xs leading-5 text-text-secondary">
                Bạn đang xem bộ biểu đồ mặc định. Thay đổi chỉ áp dụng trên màn hình này. Đăng nhập để lưu thiết lập theo tài khoản.
              </p>
            )}

            {isAuthenticated && settings.isError && (
              <PanelState
                title="Không tải được thiết lập dashboard"
                description={errorMessage(settings.error)}
                descriptionClassName="text-text-secondary"
                action={{ label: "Thử lại", onClick: () => void settings.refetch() }}
              />
            )}

            {!saved && !(isAuthenticated && settings.isError) && (
              <div className="grid grid-cols-1 gap-3 min-[1250px]:grid-cols-2">
                {[0, 1, 2, 3].map((index) => (
                  <Skeleton key={index} className="h-64 w-full rounded-lg" />
                ))}
              </div>
            )}

            {saved && fundamental.isError && (
              <PanelState
                title="Không tải được số liệu dashboard"
                description={errorMessage(fundamental.error)}
                descriptionClassName="text-text-secondary"
                action={{ label: "Thử lại", onClick: () => void fundamental.refetch() }}
              />
            )}

            {saved && !fundamental.isError && selected.length === 0 && (
              <p className="rounded-lg border border-dashed border-border px-4 py-12 text-center text-sm font-semibold text-text-secondary">
                Chưa có biểu đồ nào. Tick chọn chỉ tiêu ở khung bên phải để thêm biểu đồ.
              </p>
            )}
            {saved && !fundamental.isError && selected.length > 0 && (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={selected} strategy={rectSortingStrategy}>
                  <div className="grid grid-cols-1 gap-3 min-[1250px]:grid-cols-2">
                    {cards.map((card, index) => (
                      <ChartCard
                        key={card.name}
                        view={card.view}
                        fixedYear={card.fixedYear}
                        period={card.period}
                        onPeriodChange={(count) => changePeriod(card.name, count)}
                        onRemove={() => removeChart(card.name)}
                        {...(index > 0 ? { onMoveUp: () => moveChart(index, index - 1) } : {})}
                        {...(index < cards.length - 1 ? { onMoveDown: () => moveChart(index, index + 1) } : {})}
                        notApplicable={card.notApplicable}
                        pending={card.pending}
                        {...(card.note ? { note: card.note } : {})}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            )}
          </div>
        </div>
      </div>

      <aside className="order-first flex w-full shrink-0 flex-col border-b border-border min-[761px]:order-none min-[761px]:h-full min-[761px]:w-[300px] min-[761px]:border-b-0 min-[761px]:border-l">
        <ChartPicker
          catalog={catalog.data ?? []}
          selected={selected}
          isBank={isBank === true}
          onToggle={toggleChart}
        />
      </aside>
    </div>
  )
}
