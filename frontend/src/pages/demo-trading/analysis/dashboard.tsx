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

import { INDUSTRY_LABEL, type ChartKind, type ChartName, type Industry } from "./api"
import { ChartCard } from "./chart-card"
import { ChartPicker } from "./chart-picker"
import {
  PERIOD_OPTIONS,
  chartView,
  dailyWindowStart,
  defaultDraftOf,
  findIndustry,
  industryItems,
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
  useDashboardIndustry,
  useDashboardSettings,
  useFundamental,
  useSaveDashboardSettings,
  useValuation,
} from "./use-dashboard"

/** Số tháng xin chuỗi định giá: luôn đủ 10 năm (120 tháng) để chuyển Quý/Năm không phải gọi lại. */
const VALUATION_LOOKBACK_MONTHS = 120

type CardModel = {
  name: ChartName
  /** Khoá bài học của chỉ tiêu, cho nút "Học" (spec §4.3). */
  metricKey: string | undefined
  view: ChartView
  /** Số liệu của thẻ này chưa về: thẻ hiện khung chờ. */
  pending: boolean
  note?: string
  /** Khuôn cố định theo năm (D, E1, E2). */
  fixedYear: boolean
  /** Ô số kỳ; null cho khuôn cố định theo năm (spec §4.1). */
  period: { count: number; options: readonly number[]; unit: string } | null
}

/** Các bản chỉnh chưa lưu của phiên, mỗi ngành một bản (spec §6.4). */
type Drafts = Partial<Record<Industry, DashboardDraft>>

/**
 * Dashboard phân tích v2 (spec §1–§13): lưới biểu đồ của các chỉ tiêu đã học, khung chọn biểu
 * đồ bên phải và thiết lập lưu theo tài khoản và theo ngành.
 *
 * Mã đang xem là trạng thái chung của trang: dashboard chỉ hiện mã, không đổi mã. Ngành của mã
 * (doanh nghiệp sản xuất, ngân hàng, chứng khoán, bảo hiểm) lấy từ mẫu báo cáo tài chính và
 * quyết định danh mục chỉ tiêu cùng thiết lập đang dùng. Đổi sang mã cùng ngành thì thiết lập
 * giữ nguyên; đổi sang mã khác ngành thì chuyển sang thiết lập của ngành đó, và quay lại thấy
 * lại thay đổi chưa lưu trong phiên của ngành cũ.
 *
 * Khách chưa đăng nhập xem bộ mặc định và đổi được trên màn hình; nút "Lưu thiết lập" mời đăng
 * nhập (spec cập nhật 22-10 §3.7).
 */
export function AnalysisDashboard({ symbol, tabsSlot }: { symbol: string; tabsSlot?: ReactNode }) {
  const { isAuthenticated, isLoading: authLoading, openAuth } = useAuth()
  const [drafts, setDrafts] = useState<Drafts>({})
  const pendingScroll = useRef<string | null>(null)

  const industryQuery = useDashboardIndustry(symbol)
  const industry = industryQuery.data?.nganh
  const settings = useDashboardSettings(isAuthenticated)
  const catalog = useDashboardCatalog()
  const save = useSaveDashboardSettings()

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const catalogIndustry = findIndustry(catalog.data?.industries, industry)
  const defaults = defaultDraftOf(catalogIndustry)

  /** Khách: bộ mặc định của ngành. Thành viên: bản đã lưu của ngành cho tới khi người dùng đổi gì. */
  const guest = !isAuthenticated && !authLoading
  const saved: DashboardDraft | undefined =
    industry === undefined ? undefined : isAuthenticated ? settings.data?.[industry] : guest ? defaults : undefined
  const draft: DashboardDraft | undefined = industry === undefined ? undefined : (drafts[industry] ?? saved)
  const selected = useMemo<ChartName[]>(() => draft?.charts ?? [], [draft])
  const per = draft?.per ?? "q"
  const ready = !!draft && !!catalogIndustry

  /** Khuôn và khoá bài học của từng chỉ tiêu theo danh mục: biết ngay thẻ nào có ô số kỳ (DB-05e). */
  const itemByName = useMemo(
    () => new Map(industryItems(catalogIndustry).map((item) => [item.name, item] as const)),
    [catalogIndustry],
  )

  const fundamental = useFundamental(symbol, selected, per, ready)
  const fundamentalData = fundamental.data

  const valuationNames = useMemo(
    () => selected.filter((name) => itemByName.get(name)?.kind === "F"),
    [selected, itemByName],
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
      const data = fundamentalData?.charts[name]
      const item = itemByName.get(name)
      const metricKey = item?.metric_key
      const count = periodCount(draft?.nks ?? {}, name, per)
      const kind: ChartKind | undefined = data?.kind ?? item?.kind
      const fixedYear = kind !== undefined && FIXED_YEAR_KINDS[kind]
      // Ô số kỳ luôn hiện, kể cả lúc thẻ đang tải (DB-05e).
      const period =
        kind !== undefined && !fixedYear
          ? { count, options: PERIOD_OPTIONS[per], unit: per === "q" ? "quý" : "năm" }
          : null
      if (!data) {
        return {
          name,
          metricKey,
          view: { name, kind: kind ?? "B", unit: "", decimals: 0, labels: [], main: [] },
          pending: loading,
          fixedYear,
          period,
        }
      }
      if (data.kind === "F") {
        const daily = valuationData?.charts[name]
        const dates = valuationData?.dates ?? []
        const start = dailyWindowStart(dates, windowMonths(count, per))
        const unit = daily ? daily.unit : data.unit
        return {
          name,
          metricKey,
          view: {
            name,
            kind: "F",
            unit,
            decimals: decimalsForUnit(unit),
            labels: dates.slice(start),
            main: [{ name, v: daily ? daily.v.slice(start) : [] }],
            ...legendNoteOf(data),
          },
          pending: loading || valuationLoading,
          ...(data.note ? { note: data.note } : {}),
          fixedYear,
          period,
        }
      }
      return {
        name,
        metricKey,
        view: chartView(data, per, count),
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
    draft?.nks,
    per,
    itemByName,
    fundamental.isPending,
    fundamental.isPlaceholderData,
    valuation.isPending,
    valuation.isPlaceholderData,
  ])

  const dirty = !!saved && !!draft && !isSameSettings(draft, saved)

  /** Ghi bản chỉnh của ngành đang xem; các ngành khác giữ nguyên bản chỉnh của chúng. */
  function setDraft(target: Industry, next: DashboardDraft | null) {
    setDrafts((current) => {
      const copy = { ...current }
      if (next === null) delete copy[target]
      else copy[target] = next
      return copy
    })
  }

  function update(changes: Partial<DashboardDraft>) {
    if (!industry || !draft) return
    setDraft(industry, { ...draft, ...changes })
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
    if (!draft) return
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
    if (!industry || !draft) return
    const target = industry
    const next: DashboardDraft = {
      charts: draft.charts,
      per: draft.per,
      nks: normalizedPeriodCounts(draft.nks),
    }
    setDraft(target, next)
    save.mutate(
      { nganh: target, body: next },
      {
        onSuccess: () => {
          setDraft(target, null)
          toast.success("Đã lưu thiết lập dashboard")
        },
        onError: (error) => toast.error(errorMessage(error)),
      },
    )
  }

  function handleReset() {
    if (!industry || !defaults) return
    setDraft(industry, defaults)
    toast.success("Đã đưa về bộ mặc định, bấm Lưu thiết lập để giữ")
  }

  const loadingError = industryQuery.isError ? industryQuery : catalog.isError ? catalog : null
  const waiting = !ready && !loadingError && !(isAuthenticated && settings.isError)

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
              {industry && (
                <span
                  data-industry={industry}
                  className="rounded-full border border-border px-2 py-0.5 text-xs font-semibold text-text-secondary"
                >
                  {INDUSTRY_LABEL[industry]}
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

            {loadingError && (
              <PanelState
                title={
                  loadingError === industryQuery
                    ? "Không tải được ngành của mã"
                    : "Không tải được danh mục chỉ tiêu"
                }
                description={errorMessage(loadingError.error)}
                descriptionClassName="text-text-secondary"
                action={{ label: "Thử lại", onClick: () => void loadingError.refetch() }}
              />
            )}

            {isAuthenticated && settings.isError && (
              <PanelState
                title="Không tải được thiết lập dashboard"
                description={errorMessage(settings.error)}
                descriptionClassName="text-text-secondary"
                action={{ label: "Thử lại", onClick: () => void settings.refetch() }}
              />
            )}

            {waiting && (
              <div className="grid grid-cols-1 gap-3 min-[1250px]:grid-cols-2">
                {[0, 1, 2, 3].map((index) => (
                  <Skeleton key={index} className="h-64 w-full rounded-lg" />
                ))}
              </div>
            )}

            {ready && fundamental.isError && (
              <PanelState
                title="Không tải được số liệu dashboard"
                description={errorMessage(fundamental.error)}
                descriptionClassName="text-text-secondary"
                action={{ label: "Thử lại", onClick: () => void fundamental.refetch() }}
              />
            )}

            {ready && !fundamental.isError && selected.length === 0 && (
              <p className="rounded-lg border border-dashed border-border px-4 py-12 text-center text-sm font-semibold text-text-secondary">
                Chưa có biểu đồ nào. Tick chọn chỉ tiêu ở khung bên phải để thêm biểu đồ.
              </p>
            )}
            {ready && !fundamental.isError && selected.length > 0 && (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={selected} strategy={rectSortingStrategy}>
                  <div className="grid grid-cols-1 gap-3 min-[1250px]:grid-cols-2">
                    {cards.map((card, index) => (
                      <ChartCard
                        key={card.name}
                        view={card.view}
                        {...(card.metricKey ? { metricKey: card.metricKey } : {})}
                        fixedYear={card.fixedYear}
                        period={card.period}
                        onPeriodChange={(count) => changePeriod(card.name, count)}
                        onRemove={() => removeChart(card.name)}
                        {...(index > 0 ? { onMoveUp: () => moveChart(index, index - 1) } : {})}
                        {...(index < cards.length - 1 ? { onMoveDown: () => moveChart(index, index + 1) } : {})}
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
        <ChartPicker industry={catalogIndustry} selected={selected} onToggle={toggleChart} />
      </aside>
    </div>
  )
}
