/**
 * Bộ điều khiển của màn chơi Flashback: giữ trạng thái lượt chơi dùng chung giữa vùng chính và
 * panel phải (spec v1.1 §2.4 - §2.7).
 *
 * Mọi thay đổi trạng thái lượt chơi đi qua server: bấm "Phiên tiếp" mới nhận nến kế tiếp, đặt
 * lệnh mới nhận lệnh đã khớp. Chỉ bộ chỉ báo đang chọn và các trạng thái ẩn là của phiên.
 */
import { useCallback, useMemo, useState } from "react"
import { toast } from "sonner"

import { ApiError } from "@/lib/api"

import type { FlashbackIndicatorParams } from "./flashback-api"
import type { ChartIndicator, FlashbackContextValue, FlashbackPanelTab, LocalIndicator } from "./flashback-context"
import { computeIndicator } from "./flashback-indicators"
import {
  FLASHBACK_INITIAL_CASH,
  formatNumber,
  indicatorColor,
  instanceShortLabel,
  orderError,
} from "./flashback-model"
import {
  useFinishRound,
  useFlashbackCurrent,
  useFlashbackIndicators,
  useJoinRound,
  useNextSession,
  usePlaceOrder,
  useReloadFlashback,
  useSaveIndicators,
} from "./use-flashback"

/** Lỗi tham gia đề (spec 22-10 FB-11b). */
export type FlashbackJoinErrorKind = "xu" | "other"

/** Câu báo lỗi tham gia theo loại lỗi. */
export const FLASHBACK_JOIN_ERROR_TEXT: Record<FlashbackJoinErrorKind, string> = {
  xu: "Chưa đủ xu, học thêm bài để có xu",
  other: "Không tham gia được, thử lại",
}

/** 409 của server: đề đã tới giờ đóng hoặc trạng thái đề đã đổi (FB-06), cần tải lại đề. */
export function isRoundChangedError(error: unknown): boolean {
  return error instanceof ApiError && error.status === 409
}

/** Loại lỗi tham gia: chỉ 402 `XU_INSUFFICIENT` là thiếu xu. */
export function joinErrorKind(error: unknown): FlashbackJoinErrorKind {
  return error instanceof ApiError && error.status === 402 && error.code === "XU_INSUFFICIENT" ? "xu" : "other"
}

export function useFlashbackController(): FlashbackContextValue {
  const current = useFlashbackCurrent()
  const join = useJoinRound()
  const next = useNextSession()
  const order = usePlaceOrder()
  const finish = useFinishRound()
  const save = useSaveIndicators()
  const reload = useReloadFlashback()
  const [joinFailure, setJoinFailure] = useState<FlashbackJoinErrorKind | null>(null)

  const round = current.data
  const entry = round?.my_entry ?? null
  const [side, setSide] = useState<"buy" | "sell">("buy")
  const [qty, setQty] = useState("")
  const [instances, setInstances] = useState<LocalIndicator[]>([])
  const [seededFor, setSeededFor] = useState<string | null>(null)
  const [hiddenKeys, setHiddenKeys] = useState<ReadonlySet<string>>(new Set())
  const [panelTab, setPanelTab] = useState<FlashbackPanelTab>("trade")
  const [focusQtyTick, setFocusQtyTick] = useState(0)

  // Lượt chơi vừa mở: nạp danh sách chỉ báo server đã lưu.
  if (entry && entry.id !== seededFor) {
    setSeededFor(entry.id)
    setInstances(
      (entry.indicator_params ?? []).map((instance, index) => ({
        key: `s${index}`,
        id: instance.id,
        params: instance.params,
      })),
    )
  }

  const bars = useMemo(() => (round ? [...round.bars, ...round.played_bars] : []), [round])
  const warmup = useMemo(() => round?.warmup_bars ?? [], [round])
  const unlocked = useFlashbackIndicators(true)
  const metaById = useMemo(
    () => new Map((unlocked.data?.indicators ?? []).map((meta) => [meta.id, meta])),
    [unlocked.data],
  )

  const historySessions = round?.history_sessions ?? 60
  const totalSlots = round?.total_sessions ?? 120
  const step = entry?.step ?? 0
  const cash = Number(entry?.cash ?? FLASHBACK_INITIAL_CASH)
  const holdings = entry?.holdings ?? 0
  const lastClose = bars.length > 0 ? bars[bars.length - 1].close : 0
  const totalAssets = entry ? Number(entry.total_assets) : cash + holdings * lastClose
  const pnlPct = entry?.pnl_percent ?? 0

  const chartIndicators = useMemo<ChartIndicator[]>(() => {
    const withWarmup = [...warmup, ...bars]
    return instances.map((instance, index) => {
      const sameId = instances.filter((candidate) => candidate.id === instance.id)
      const position = sameId.findIndex((candidate) => candidate.key === instance.key)
      const computed = computeIndicator(instance.id, instance.params, withWarmup)
      const plot =
        warmup.length > 0
          ? {
              ...computed,
              series: computed.series.map((s) => ({ ...s, values: s.values.slice(warmup.length) })),
              histogram: computed.histogram ? computed.histogram.slice(warmup.length) : undefined,
              markers: computed.markers
                ?.filter((m) => m.index >= warmup.length)
                .map((m) => ({ ...m, index: m.index - warmup.length })),
            }
          : computed
      return {
        key: instance.key,
        id: instance.id,
        params: instance.params,
        label: instanceShortLabel({ id: instance.id, params: instance.params }, metaById.get(instance.id)),
        color: indicatorColor(instance.id, position < 0 ? index : position),
        hidden: hiddenKeys.has(instance.key),
        plot,
      }
    })
  }, [instances, bars, warmup, hiddenKeys, metaById])

  const persist = useCallback(
    (next: LocalIndicator[]) => {
      setInstances(next)
      if (!entry) return
      save.mutate(
        {
          entryId: entry.id,
          indicators: next.map((instance) => ({ id: instance.id, params: instance.params })),
        },
        { onError: () => toast.error("Chưa lưu được tham số chỉ báo.") },
      )
    },
    [entry, save],
  )

  const addIndicator = useCallback(
    (id: string, params: FlashbackIndicatorParams) => {
      persist([...instances, { key: `c${Date.now()}-${instances.length}`, id, params }])
    },
    [instances, persist],
  )

  const updateIndicator = useCallback(
    (key: string, params: FlashbackIndicatorParams) => {
      persist(instances.map((instance) => (instance.key === key ? { ...instance, params } : instance)))
    },
    [instances, persist],
  )

  const removeIndicator = useCallback(
    (key: string) => {
      persist(instances.filter((instance) => instance.key !== key))
    },
    [instances, persist],
  )

  const toggleIndicator = useCallback((key: string) => {
    setHiddenKeys((previous) => {
      const next = new Set(previous)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  const requestQtyFocus = useCallback(() => {
    setFocusQtyTick((tick) => tick + 1)
  }, [])

  const parsedQty = Number.parseInt(qty, 10)
  const qtyNumber = Number.isFinite(parsedQty) ? parsedQty : 0
  const positions = entry?.positions ?? []
  const localError = entry ? orderError(side, qtyNumber, lastClose, cash, positions, step) : null

  function submitOrder() {
    if (!entry || !qtyNumber || localError) return
    order.mutate(
      { entryId: entry.id, side, qty: qtyNumber },
      {
        onSuccess: () => {
          setQty("")
          toast.success(side === "buy" ? `Đã mua ${formatNumber(qtyNumber)} cp` : `Đã bán ${formatNumber(qtyNumber)} cp`)
        },
        onError: (error) => {
          if (roundChanged(error)) return
          toast.error("Không đặt được lệnh. Thử lại.")
        },
      },
    )
  }

  /** Đề đã tới giờ đóng (409): tải lại đề, không báo lỗi thao tác. */
  function roundChanged(error: unknown): boolean {
    if (!isRoundChangedError(error)) return false
    reload()
    toast.info("Đề đã tới giờ đóng. Đang tải lại đề.")
    return true
  }

  function joinRound() {
    setJoinFailure(null)
    join.mutate(undefined, {
      onError: (error) => {
        if (isRoundChangedError(error)) {
          reload()
          return
        }
        setJoinFailure(joinErrorKind(error))
      },
    })
  }

  function nextSession() {
    if (!entry) return
    next.mutate(entry.id, {
      onError: (error) => {
        if (roundChanged(error)) return
        toast.error("Chưa mở được phiên tiếp theo.")
      },
    })
  }

  function finishRound() {
    if (!entry) return
    finish.mutate(entry.id, {
      onError: (error) => {
        if (roundChanged(error)) return
        toast.error("Chưa chốt được kết quả.")
      },
    })
  }

  return {
    round,
    entry,
    loading: current.isPending,
    failed: current.isError,
    bars,
    warmup,
    historySessions,
    totalSlots,
    step,
    finished: entry?.status === "finished",
    cash,
    holdings,
    totalAssets,
    pnlPct,
    lastClose,
    side,
    setSide,
    qty,
    setQty,
    focusQtyTick,
    requestQtyFocus,
    orderError: localError,
    orderBusy: order.isPending,
    submitOrder,
    join: joinRound,
    joinBusy: join.isPending,
    joinError: joinFailure ? FLASHBACK_JOIN_ERROR_TEXT[joinFailure] : null,
    joinErrorKind: joinFailure,
    nextSession,
    nextBusy: next.isPending,
    finish: finishRound,
    finishBusy: finish.isPending,
    indicators: chartIndicators,
    addIndicator,
    updateIndicator,
    removeIndicator,
    toggleIndicator,
    hiddenKeys,
    panelTab,
    setPanelTab,
  }
}
