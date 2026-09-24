/**
 * `TradingRuntime` — the globally-mounted Kết sổ host + the durable Cấp 2
 * stop-loss inbox.
 *
 * Why it exists: a SELL that closes a round trip must open the level's Kết sổ
 * ("kết sổ lệnh") no matter which panel placed it, and it must still be
 * reachable after a reload (the legacy dashboard's session-local refs made
 * Cấp 0 ungraduatable when a user reloaded before reading it). So:
 *
 * - a live fill arrives over the in-process bus with the plan it was placed
 *   with (exact, no request needed);
 * - after a reload, the round trip is rebuilt from `GET /virtual-trading/orders`
 *   plus the level's real plan row. Which BUY opened it is decided only on
 *   unambiguous evidence: the server's `exit_matched_buy_order_id`, or the only
 *   eligible BUY in a complete order history including known session fills.
 *   A partial page cannot prove uniqueness. Ambiguous attribution is explicit;
 *   never guess the nearest buy. The entry price still comes from the average
 *   cost the SELL snapshot carries (`exit_avg_cost_vnd`). Plan reads use
 *   `planRouteLadder` (Cấp 6 → 5 → 4 → the ungated Cấp 3 route for Cấp 1–2), and
 *   Cấp 0 reads its own chip via `GET /cap0/kehoach?order_id=`;
 * - recording posts `POST /cap1/ketso` FIRST (every higher level's row extends
 *   that one, and `/cap2/ketso` 404s without it), then the level's own evidence.
 *
 * Mount it once inside the demo-trading page (it needs `JourneyProvider`):
 *
 *   <TradingRuntime />
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { LoaderCircle } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useAuth } from "@/hooks/use-auth"
import { useTradingOrders } from "@/hooks/use-trading"
import { api, errorMessage } from "@/lib/api"
import type { TradingOrder } from "@/pages/demo-trading/types"
import { useJourney } from "../journey/use-journey"
import { StopLossBanner } from "./blocks/alerts"
import { onOrderFilled } from "./fill-events"
import type { FilledOrderEvent } from "./fill-events"
import type { JourneyPlanInput } from "./journey-plan"
import type { CamXuc, Lop5Partial, PhuongPhapSlTp } from "./plan-math"
import {
  CAM_XUC_OPTIONS,
  TRANG_THAI_LABEL,
  UNKNOWN,
  camXucLabel,
  coachTemplateCap0,
  coachTemplateCap1,
  computeKetsoFlagsCap2,
  conflictLevelLabel,
  countCalendarDays,
  countKhacAi,
  countTradingSessions,
  fmtPct,
  fmtVnd,
  fmtVndSigned,
  holdTimeText,
  isLenhCoChuyen,
  lopLabel,
  lyDoLabel,
  nhanDinhLabel,
} from "./plan-math"
import type { Cap1Progress, Cap1TradeRow, Cap2Alert, RecoveredPlan } from "./use-plan-data"
import {
  useActiveCap2Alerts,
  useCap0Kehoach,
  useCap1Progress,
  useCap1Trades,
  useCap2AlertAction,
  useCap6Kehoach,
  useRecoveredPlan,
} from "./use-plan-data"
import { usePlaceOrder } from "./use-trading-orders"
import { useEngineRefresh } from "./use-engine-refresh"

const TARGET_CAP1_ORDERS = 10
const MIN_TRADES_FOR_STAT = 2
const EMPTY_ORDERS: TradingOrder[] = []

/** Everything the Kết sổ can prove about one closed round trip. */
export type CloseoutData = {
  /** Chronological closeout number, only when the complete history is known. */
  n: number | null
  symbol: string
  level: number
  sellOrderId: string
  /**
   * The BUY that opened this round trip, when it is known UNIQUELY — either
   * from the server's own `exit_matched_buy_order_id` or as the only candidate.
   * `null` means "not attributable", never "we picked the nearest one".
   */
  buyOrderId: string | null
  quantity: number
  /** `giá vốn bình quân` the server snapshotted on the SELL, or the buy's fill. */
  entryPrice: number | null
  /** `true` when `entryPrice` is the account's average cost, not one lot's fill. */
  entryPriceIsAverage: boolean
  exitPrice: number
  buyDate: string | null
  sellDate: string
  /** What the buy committed to when it was placed in THIS session. */
  plan: JourneyPlanInput | null
  ai5Lop: Lop5Partial | null
  /** Why the round trip could not be attributed (shown instead of guesses). */
  unattributed: string | null
}

export function TradingRuntime() {
  const { isAuthenticated, user } = useAuth()
  const journey = useJourney()
  const level = isAuthenticated ? journey.level : null
  const history = useTradingOrders({ status: "filled", allPages: true })
  const orderPage = history.data
  const orders = orderPage?.orders ?? EMPTY_ORDERS
  const completeHistory = orderPage != null && orderPage.total <= orders.length
  const { data: cap1Trades } = useCap1Trades(level !== null && level >= 1)
  const { data: alerts } = useActiveCap2Alerts(level !== null && level >= 2)
  const placeOrder = usePlaceOrder()
  const engine = useEngineRefresh()

  // Session evidence: every fill this tab saw, keyed by order id and (for the
  // uniqueness rule) grouped by symbol.
  const sessionFillsRef = useRef(new Map<string, FilledOrderEvent>())
  const handledSellsRef = useRef(new Set<string>())
  const [closeout, setCloseout] = useState<CloseoutData | null>(null)
  const [dismissedAlerts, setDismissedAlerts] = useState<string[]>([])

  const filledSells = useMemo(
    () => orders.filter((order) => order.side.toLowerCase() === "sell" && order.status.toLowerCase() === "filled"),
    [orders],
  )

  const openCloseout = useCallback(
    (sell: TradingOrder, sessionEvent: FilledOrderEvent | null) => {
      const resolution = resolveBuy(sell, orders, sessionFillsRef.current, completeHistory)
      const priorSells = filledSells.filter(row => row.mode === sell.mode && Date.parse(row.created_at) <= Date.parse(sell.created_at))
      const buy = resolution.kind === "resolved" ? resolution.buy : null
      const entryPrice = sell.exit_avg_cost_vnd ?? buy?.filled_price_vnd ?? null
      setCloseout({
        n: completeHistory ? priorSells.length + (priorSells.some(row => row.id === sell.id) ? 0 : 1) : null,
        symbol: sell.symbol.toUpperCase(),
        level: sessionEvent?.level ?? level ?? 0,
        sellOrderId: sell.id,
        buyOrderId: resolution.kind === "resolved" ? resolution.buyOrderId : null,
        quantity: sell.quantity,
        entryPrice,
        entryPriceIsAverage: sell.exit_avg_cost_vnd != null,
        exitPrice: sell.filled_price_vnd ?? sell.limit_price_vnd ?? 0,
        buyDate: buy?.trading_date ?? null,
        sellDate: sell.trading_date,
        plan: resolution.kind === "resolved" ? resolution.plan : null,
        ai5Lop: resolution.kind === "resolved" ? resolution.ai5Lop : null,
        unattributed: resolution.kind === "resolved" ? null : resolution.note,
      })
    },
    [completeHistory, filledSells, level, orders],
  )

  /* live fills from the panel */
  useEffect(() => {
    return onOrderFilled((event) => {
      const { order } = event
      if (order.status.toLowerCase() !== "filled") return
      if (order.side.toLowerCase() === "buy") {
        sessionFillsRef.current.set(order.id, event)
        return
      }
      if (handledSellsRef.current.has(order.id)) return
      handledSellsRef.current.add(order.id)
      openCloseout(order, event)
    })
  }, [openCloseout])

  /* recovery: a round trip that closed before this mount (reload / other panel) */
  useEffect(() => {
    if (!isAuthenticated || journey.isLoading || level === null || closeout) return
    if (level >= 1 && !cap1Trades) return
    if (level === 0 && journey.progress?.task_5_done_at && journey.progress?.task5_debrief_done) return
    const pending = pendingCloseouts(user?.id)
    const sell = filledSells.find(row =>
      !handledSellsRef.current.has(row.id) &&
      row.mode === (level === 0 ? "san_tap" : "thuc_chien") &&
      (level === 0 || pending.includes(row.id) || !cap1Trades?.some(trade => trade.sell_order_id === row.id)),
    )
    if (!sell) return
    handledSellsRef.current.add(sell.id)
    openCloseout(sell, null)
  }, [cap1Trades, closeout, filledSells, isAuthenticated, journey.isLoading, journey.progress, level, openCloseout, user?.id])

  const stopLossAlerts = (alerts ?? []).filter(
    (alert) => alert.alert_type === "cham_cat_lo" && !dismissedAlerts.includes(alert.id),
  )

  return (
    <>
      {/* The engine heartbeat's only visible surface: silent while it works,
          explicit when it cannot (the whole session's state depends on it). */}
      {engine.state.status === "error" && (
        <div className="fixed bottom-4 left-4 z-40 w-72 space-y-1.5 rounded-lg border border-price-down/50 bg-card p-2 text-xs">
          <p>Không cập nhật được trạng thái lệnh: {engine.state.message}</p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            onClick={() => void engine.refresh({ force: true })}
          >
            Thử lại
          </Button>
        </div>
      )}
      {engine.state.status === "ok" && engine.state.warnings.length > 0 && (
        <div className="fixed bottom-4 left-4 z-40 w-72 rounded-lg border border-price-ceiling/50 bg-card p-2 text-xs">
          <p className="text-muted-foreground">{engine.state.warnings[0]}</p>
        </div>
      )}

      {stopLossAlerts.length > 0 && (
        <div className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center px-4">
          <div className="pointer-events-auto w-full max-w-xl space-y-2">
            {stopLossAlerts.map((alert) => (
              <StopLossCard
                key={alert.id}
                alert={alert}
                pending={placeOrder.isPending}
                onDismiss={() => setDismissedAlerts((previous) => [...previous, alert.id])}
                onSellAto={(quantity) => {
                  void placeOrder
                    .mutateAsync({
                      symbol: alert.symbol,
                      side: "sell",
                      method: "market",
                      quantity,
                      price: alert.observed_price_vnd,
                      journeyPlan: null,
                      level: null,
                      vonBanDau: null,
                    })
                    .then(() => toast.success(`Đã đặt lệnh BÁN ATO ${alert.symbol} theo kế hoạch.`))
                    .catch((error) => toast.error(errorMessage(error)))
                }}
              />
            ))}
          </div>
        </div>
      )}

      {closeout && (
        <SellCloseoutDialog
          data={closeout}
          onClose={() => setCloseout(null)}
          onRecorded={() => setCloseout(null)}
          onRetry={() => {
            void history.refetch({ throwOnError: true }).then(({ data: page }) => {
              if (!page) return
              const sell = page.orders.find(order => order.id === closeout.sellOrderId)
              if (!sell) return
              const resolution = resolveBuy(sell, page.orders, sessionFillsRef.current, page.total <= page.orders.length)
              if (resolution.kind !== "resolved") return
              setCloseout(previous => previous && ({
                ...previous,
                buyOrderId: resolution.buyOrderId,
                buyDate: resolution.buy?.trading_date ?? null,
                plan: resolution.plan,
                ai5Lop: resolution.ai5Lop,
                unattributed: null,
              }))
            }).catch(error => toast.error(errorMessage(error)))
          }}
        />
      )}
    </>
  )
}

type BuyResolution =
  | {
      kind: "resolved"
      buyOrderId: string
      /** The buy row itself, when the loaded history contains it. */
      buy: TradingOrder | null
      plan: JourneyPlanInput | null
      ai5Lop: Lop5Partial | null
    }
  | { kind: "unresolved"; note: string }

/**
 * Which BUY opened this round trip — decided only on evidence that resolves to
 * exactly one order:
 *
 * 1. the server's own `exit_matched_buy_order_id` (set for a position whose
 *    plan was activated, i.e. Cấp 2+ — it is the authoritative lot);
 * 2. else the ONLY eligible BUY in the complete loaded history, combined with
 *    fills observed in this session. A partial history is never sufficient.
 *
 * Two or more candidates is NOT a reason to take the nearest one: that would
 * file one order's lý do/kế hoạch against another order's exit. It reports
 * "không xác định được" instead, and the Kết sổ still shows the server's own
 * average-cost entry price.
 */
function resolveBuy(
  sell: TradingOrder,
  orders: TradingOrder[],
  sessionFills: Map<string, FilledOrderEvent>,
  completeHistory: boolean,
): BuyResolution {
  const matchedId = sell.exit_matched_buy_order_id
  if (matchedId) {
    const fromSession = sessionFills.get(matchedId)
    if (fromSession) {
      return {
        kind: "resolved",
        buyOrderId: matchedId,
        buy: fromSession.order,
        plan: fromSession.plan,
        ai5Lop: fromSession.ai5Lop,
      }
    }
    // Authoritative id even when its row sits outside the loaded page: the
    // plan routes key on it, and the entry price falls back to the average
    // cost the SELL snapshot carries.
    return { kind: "resolved", buyOrderId: matchedId, buy: orders.find((o) => o.id === matchedId) ?? null, plan: null, ai5Lop: null }
  }

  if (!completeHistory) {
    return { kind: "unresolved", note: "Lịch sử đang tải chưa bao gồm toàn bộ lệnh mua. Chưa thể xác định kế hoạch của lệnh bán này." }
  }
  const knownOrders = new Map(orders.map(order => [order.id, order]))
  for (const event of sessionFills.values()) knownOrders.set(event.order.id, event.order)

  const sellTime = Date.parse(sell.created_at)
  const candidates = [...knownOrders.values()].filter(
    (order) =>
      order.side.toLowerCase() === "buy" &&
      order.status.toLowerCase() === "filled" &&
      order.symbol.toUpperCase() === sell.symbol.toUpperCase() &&
      order.mode === sell.mode &&
      Number.isFinite(sellTime) && Date.parse(order.created_at) <= sellTime,
  )
  if (candidates.length === 1) {
    const fromSession = sessionFills.get(candidates[0].id)
    return {
      kind: "resolved",
      buyOrderId: candidates[0].id,
      buy: candidates[0],
      plan: fromSession?.plan ?? null,
      ai5Lop: fromSession?.ai5Lop ?? null,
    }
  }
  if (candidates.length === 0) {
    return { kind: "unresolved", note: `Không tìm thấy lệnh MUA ${sell.symbol.toUpperCase()} nào trước lệnh bán này.` }
  }
  return {
    kind: "unresolved",
    note: `Có ${candidates.length} lệnh MUA ${sell.symbol.toUpperCase()} trước lệnh bán này. Chưa xác định được kế hoạch tương ứng, nên không gán kế hoạch của lệnh khác vào kết sổ.`,
  }
}


/** Kết sổ — the level's own reconciliation, recorded on "Đóng kết sổ". */
function pendingCloseouts(userId?: string): string[] {
  if (!userId) return []
  try {
    const value: unknown = JSON.parse(localStorage.getItem(`iqx.pending-closeouts:${userId}`) ?? "[]")
    return Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : []
  } catch { return [] }
}

export function SellCloseoutDialog({
  data,
  onClose,
  onRecorded,
  onRetry,
}: {
  data: CloseoutData
  onClose: () => void
  onRecorded: () => void
  /** Re-reads order history after an unattributable round trip. */
  onRetry: () => void
}) {
  const journey = useJourney()
  const { user } = useAuth()
  const [emotion, setEmotion] = useState<CamXuc | null>(null)
  const [saving, setSaving] = useState(false)
  const [recordError, setRecordError] = useState<string | null>(null)

  // Real evidence, read back by the BUY order — the same key each route uses.
  // All of them are disabled when the round trip could not be attributed, so
  // no plan is ever shown against an unknown buy.
  const cap0PlanQuery = useCap0Kehoach(data.level === 0 ? data.buyOrderId : null)
  const recoveredQuery = useRecoveredPlan(data.level, data.buyOrderId)
  const cap0Kehoach = cap0PlanQuery.data
  const recovered = recoveredQuery.data
  const { data: cap6Kehoach } = useCap6Kehoach(data.level >= 6 ? data.buyOrderId : null, data.level >= 6)
  const { data: cap1Progress } = useCap1Progress(data.level >= 1)
  const { data: cap1Trades } = useCap1Trades(data.level >= 1)

  const entryPrice = data.entryPrice
  const exitPrice = data.exitPrice
  const quantity = data.quantity
  const pnlPct = entryPrice != null && entryPrice > 0 ? ((exitPrice - entryPrice) / entryPrice) * 100 : null
  const pnlVnd = entryPrice == null ? null : (exitPrice - entryPrice) * quantity
  const tax = Math.round(exitPrice * quantity * 0.001)
  // Without the buy's own date there is no honest holding time — 0 phiên would
  // be a claim, not a measurement.
  const buyDate = data.buyDate ?? recovered?.bought_at ?? null
  const soPhienGiu = buyDate == null ? null : countTradingSessions(buyDate, data.sellDate)
  const soNgayLich = buyDate == null ? null : countCalendarDays(buyDate, data.sellDate)
  const displayPct = pnlPct ?? 0

  const lyDo = recovered?.lyDo ?? data.plan?.lyDo ?? null
  const trangThai = recovered?.trangThai_luc_dat ?? data.plan?.trangThai_luc_dat ?? null
  const vungMua = recovered?.vung_mua ?? data.plan?.vung_mua ?? null
  const catLo = recovered?.cat_lo ?? data.plan?.cat_lo ?? null
  const chotLoi = recovered?.chot_loi ?? data.plan?.chot_loi ?? null
  const soPhuongPhap: PhuongPhapSlTp | null = recovered?.phuong_phap_sl_tp ?? data.plan?.phuong_phap_sl_tp ?? null
  const pctVon = recovered?.pct_von ?? null
  const doc5Lop = recovered?.doc_5_lop ?? null
  const ai5Lop = recovered?.ai_5_lop ?? data.ai5Lop
  const flags =
    entryPrice != null && catLo != null && soPhienGiu != null
      ? computeKetsoFlagsCap2({ entryPrice, exitPrice, catLo, soPhienGiu })
      : null
  const evidenceLoading = data.level === 0 ? cap0PlanQuery.isFetching : recoveredQuery.isFetching
  const evidenceError = data.level === 0 ? cap0PlanQuery.error : recoveredQuery.error
  const evidenceMissing = data.level >= 2 && (!flags || !soPhuongPhap || catLo == null || chotLoi == null)
  const canRecord = !evidenceLoading && !evidenceError && !evidenceMissing

  // The Cấp 0 chip carries its own `so_phien_giu` (server-measured from the buy
  // it filed), so it can speak even when the buy order itself is unattributed.
  const holdText =
    data.level === 0 && data.buyDate == null
      ? holdTimeText(cap0Kehoach?.so_phien_giu ?? null)
      : holdTimeText(soPhienGiu)
  const source = data.level >= 5 ? sourceLine(recovered) : null

  const coach =
    pnlPct == null
      ? null
      : data.level === 0
        ? data.n == null ? null : coachTemplateCap0({ pnlPositive: (pnlVnd ?? 0) > 0, orderNo: data.n })
        : trangThai == null || lyDo == null || soPhienGiu == null ? null : coachTemplateCap1(
            { pnlPositive: (pnlVnd ?? 0) > 0, trangThaiLucDat: trangThai, soPhienGiu },
            { pnlPct, lyDo, soPhienGiu, emotion },
          )

  const record = async () => {
    if (!canRecord || saving || !user) return
    setRecordError(null)
    setSaving(true)
    const failures: string[] = []
    try {
      localStorage.setItem(`iqx.pending-closeouts:${user.id}`, JSON.stringify([...new Set([...pendingCloseouts(user.id), data.sellOrderId])]))
      if (data.level === 0) {
        // The single behaviour gate of Cấp 0: READING the Kết sổ is nhiệm vụ ⑤,
        // so `task_5_done_at` + `task5_debrief_done` are stamped only here —
        // never on submit of the SELL order above.
        await journey.completeTask(5, "debrief")
      } else {
        // ── Cấp 1 FIRST. Every higher level's row extends this one, and
        // `/cap2/ketso` 404s without it ("cần kết sổ (Cấp 1) trước").
        let cap1RowOk = false
        try {
          await api("/cap1/ketso", {
            method: "POST",
            body: JSON.stringify({ order_id: data.sellOrderId, cam_xuc: emotion }),
          })
          cap1RowOk = true
        } catch (error) {
          const message = errorMessage(error)
          if (/đã được chốt/i.test(message)) cap1RowOk = true
          else failures.push(message)
        }
        if (cap1RowOk && data.level >= 2 && flags && soPhuongPhap && catLo != null && chotLoi != null) {
          try {
            await api("/cap2/ketso", {
              method: "POST",
              body: JSON.stringify({
                order_id: data.sellOrderId,
                cham_SL_cuoi_phien: flags.cham_SL_cuoi_phien,
                cham_SL_cat_dung_phien_ke: flags.cham_SL_cat_dung_phien_ke,
                cham_SL_khong_cat: flags.cham_SL_khong_cat,
                giu_cham_SL_bao_nhieu_phien: flags.giu_cham_SL_bao_nhieu_phien ?? null,
                cham_TP_giu_lam_hut: flags.cham_TP_giu_lam_hut,
                ban_som_khi_lo_nhe: flags.ban_som_khi_lo_nhe,
                nhoi_lenh_khi_lo: flags.nhoi_lenh_khi_lo,
              }),
            })
          } catch (error) {
            failures.push(errorMessage(error))
          }
        }
        // Refresh reads recompute server counters; higher levels have no task 5.
      }
      await journey.refresh()
    } catch (error) {
      failures.push(errorMessage(error))
    } finally {
      setSaving(false)
    }
    if (failures.length > 0) {
      setRecordError(failures[0])
      toast.error(`Chưa ghi được kết sổ: ${failures[0]}`)
      return
    }
    localStorage.setItem(`iqx.pending-closeouts:${user.id}`, JSON.stringify(pendingCloseouts(user.id).filter(id => id !== data.sellOrderId)))
    toast.success("Đã ghi kết sổ lệnh.")
    onRecorded()
  }

  const rows: { label: string; plan?: string; actual?: string; span?: boolean }[] = []
  if (data.level === 0) {
    rows.push({ label: "Lý do mua", plan: cap0Kehoach?.ly_do_label ?? UNKNOWN, span: true })
  } else {
    rows.push({ label: "Lý do", plan: lyDo ? lyDoLabel(lyDo) : UNKNOWN, span: true })
    rows.push({
      label: "Trạng thái lúc đặt",
      plan: trangThai ? TRANG_THAI_LABEL[trangThai] : UNKNOWN,
      span: true,
    })
    rows.push({ label: "Vùng mua", plan: vungMua == null ? UNKNOWN : fmtVnd(vungMua) })
    if (data.level >= 2) {
      rows.push({
        label: "Cắt lỗ · Chốt lời",
        plan:
          catLo == null || chotLoi == null
            ? UNKNOWN
            : `${fmtVnd(catLo)} · ${fmtVnd(chotLoi)}${
                soPhuongPhap === "bien_do_dao_dong" ? " (biên độ)" : soPhuongPhap ? " (hỗ trợ/kháng cự)" : ""
              }`,
        actual:
          catLo != null && exitPrice <= catLo
            ? "Giá ra đã chạm/vượt cắt lỗ"
            : chotLoi != null && exitPrice >= chotLoi
              ? "Giá ra đã chạm/vượt chốt lời"
              : "Không chạm ngưỡng nào",
      })
    }
    if (data.level >= 3) {
      rows.push({
        label: "Khối lượng · % vốn",
        plan:
          pctVon == null
            ? recovered?.khoi_luong == null
              ? UNKNOWN
              : `${recovered.khoi_luong.toLocaleString("vi-VN")} CP`
            : `${pctVon.toFixed(1)}% vốn`,
        actual: `${quantity.toLocaleString("vi-VN")} CP`,
      })
    }
    if (data.level >= 5 && source) {
      rows.push({ label: "Nguồn săn", plan: source, span: true })
    }
    if (data.level >= 6) {
      rows.push({
        label: "Nhận định mâu thuẫn",
        plan: cap6Kehoach?.conflict_level_ten ?? conflictLevelLabel(cap6Kehoach?.conflict_level ?? null),
        actual: cap6Kehoach?.nhat_quan == null ? UNKNOWN : cap6Kehoach.nhat_quan ? "Nhất quán" : "Lệch",
      })
    }
  }
  rows.push({
    label: data.entryPriceIsAverage ? "Giá vào (giá vốn bình quân)" : "Giá vào",
    plan: entryPrice == null ? UNKNOWN : fmtVnd(entryPrice),
    actual: entryPrice == null ? UNKNOWN : fmtVnd(entryPrice),
  })
  rows.push({
    label: "Giá ra · thuế",
    plan: UNKNOWN,
    actual: `${fmtVnd(exitPrice)} · ${fmtVnd(tax)}`,
  })
  rows.push({
    label: "Thời gian giữ",
    plan: UNKNOWN,
    actual: holdText ?? UNKNOWN,
  })

  return (
    <Dialog open onOpenChange={() => undefined}>
      <DialogContent showCloseButton={false} className="max-h-[90vh] overflow-hidden sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-xs tracking-wide text-primary">
            {`Kết sổ lệnh${data.n == null ? "" : ` #${data.n}`} · ${data.level === 0 ? "Sân tập" : "Thực chiến mô phỏng"}`}
          </DialogTitle>
          <DialogDescription className="sr-only">
            Đối chiếu kế hoạch đặt lệnh với kết quả thực tế của vòng mua bán vừa đóng.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[62vh]">
          <div className="space-y-3 pr-2">
        {data.unattributed && (
          <div className="space-y-2 rounded-md border border-price-ceiling/50 bg-price-ceiling/10 p-2">
            <p className="text-xs">{data.unattributed}</p>
            <p className="text-[11px] text-muted-foreground">
              Kết sổ chỉ hiện những gì đọc được từ dữ liệu thật: giá ra, thuế, và giá vốn bình quân do hệ
              thống chốt lúc bán. Phần kế hoạch của lệnh mua để trống thay vì đoán.
            </p>
            <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={onRetry}>
              Thử lại
            </Button>
          </div>
        )}

        <div className="space-y-1">
          <p
            className={`font-heading text-4xl font-black tabular-nums ${
              (pnlVnd ?? 0) > 0 ? "text-price-up" : (pnlVnd ?? 0) < 0 ? "text-price-down" : ""
            }`}
          >
            {pnlPct == null ? UNKNOWN : fmtPct(displayPct)}
          </p>
          <p className="text-sm text-muted-foreground tabular-nums">
            {pnlVnd == null ? UNKNOWN : fmtVndSigned(pnlVnd)} · MUA {quantity.toLocaleString("vi-VN")} {data.symbol}{" "}
            → BÁN
            {holdText ? (soPhienGiu != null && soPhienGiu > 0 ? ` · Giữ ${holdText}` : ` · ${holdText}`) : ""}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {soNgayLich == null || soPhienGiu == null
              ? "Chưa xác định được thời gian giữ"
              : `Giữ ${soNgayLich} ngày lịch · ${soPhienGiu} phiên`}
          </p>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-semibold">Đối chiếu kế hoạch với thực tế</p>
          <table className="w-full text-xs">
            <caption className="sr-only">Đối chiếu kế hoạch và kết quả lệnh</caption>
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="w-1/3 font-medium" />
                <th className="font-medium">Kế hoạch</th>
                <th className="font-medium">Thực tế</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.label} className="border-t border-border">
                  <td className="py-1 pr-2 text-muted-foreground">{row.label}</td>
                  {row.span ? (
                    <td className="py-1 font-medium" colSpan={2}>
                      {row.plan}
                    </td>
                  ) : (
                    <>
                      <td className="py-1 tabular-nums">{row.plan ?? UNKNOWN}</td>
                      <td className="py-1 tabular-nums">{row.actual ?? UNKNOWN}</td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {data.level >= 4 && (
          <div className="space-y-1 rounded-md border border-border bg-muted/40 p-2 text-[11px]">
            <p className="text-xs font-semibold">Đọc 5 lớp</p>
            {doc5Lop ? (
              <>
                {Object.entries(doc5Lop).map(([lop, value]) => (
                  <p key={lop} className="tabular-nums">
                    {lopLabel(lop as keyof typeof doc5Lop)}: bạn {nhanDinhLabel(value)} · AI{" "}
                    {ai5Lop?.[lop as keyof typeof doc5Lop]
                      ? nhanDinhLabel(ai5Lop[lop as keyof typeof doc5Lop])
                      : "chưa có dữ liệu"}
                  </p>
                ))}
                <p className="text-muted-foreground">
                  {recovered?.so_lop_dong_thuan != null
                    ? `Đồng thuận ${recovered.so_lop_dong_thuan}/5 · góc nhìn khác AI ${recovered.so_lop_khac_ai ?? 0} lớp (khác quan điểm, không phải sai).`
                    : `Góc nhìn khác AI: ${countKhacAi(doc5Lop, ai5Lop)} lớp (khác quan điểm, không phải sai).`}
                </p>
              </>
            ) : (
              <p className="text-muted-foreground">
                Không đọc lại được bản chấm 5 lớp của lệnh này (lệnh đặt trước phiên bản hiện tại hoặc
                chưa đồng bộ) — Kết sổ không suy diễn thay bạn.
              </p>
            )}
          </div>
        )}

        {data.level >= 2 && (
          <div className="space-y-1 rounded-md border border-border bg-muted/40 p-2 text-[11px]">
            <p className="text-xs font-semibold">Kỷ luật</p>
            {flags ? (
              <>
                <p>
                  Cắt lỗ đúng phiên: {flags.cham_SL_cat_dung_phien_ke ? "Có" : "Không"} · Cắt lỗ chậm:{" "}
                  {flags.cham_SL_khong_cat ? `Có (${flags.giu_cham_SL_bao_nhieu_phien ?? 0} phiên)` : "Không"}
                </p>
                <p>Bán sớm khi lỗ nhẹ: {flags.ban_som_khi_lo_nhe ? "Có" : "Không"}</p>
                <p className="text-muted-foreground">
                  “Chạm chốt lời rồi giữ làm hụt” và “mua thêm khi đang lỗ” cần dữ liệu trong phiên nên
                  Kết sổ không kết luận.
                </p>
              </>
            ) : (
              <p className="text-muted-foreground">
                Thiếu ngưỡng cắt lỗ đã cam kết của lệnh này nên chưa đo được kỷ luật.
              </p>
            )}
          </div>
        )}

        {data.level >= 6 && (
          <div className="space-y-1 rounded-md border border-border bg-muted/40 p-2 text-[11px]">
            <p className="text-xs font-semibold">Nhận định so với hành động</p>
            {cap6Kehoach?.nhat_quan == null ? (
              <p className="text-muted-foreground">
                Chưa xét được sự nhất quán của lệnh này (thiếu mức nhận định hoặc khối lượng đã ghi).
              </p>
            ) : (
              <>
                <p>
                  Mức bạn đọc: {cap6Kehoach.conflict_level_ten ?? conflictLevelLabel(cap6Kehoach.conflict_level)} ·{" "}
                  {cap6Kehoach.nhat_quan ? "hành động khớp nhận định" : "hành động LỆCH nhận định"}
                </p>
                {cap6Kehoach.khoi_luong_pct_von != null && (
                  <p className="tabular-nums">
                    % vốn đã mua: {cap6Kehoach.khoi_luong_pct_von.toFixed(1)}% · mức tự tin:{" "}
                    {cap6Kehoach.muc_tu_tin ?? UNKNOWN}
                  </p>
                )}
                {cap6Kehoach.had_veto && (
                  <p className="text-muted-foreground">
                    Lớp phủ quyết đang xấu: {(cap6Kehoach.veto_layers_ten ?? []).join(", ") || "—"}
                  </p>
                )}
              </>
            )}
          </div>
        )}

        {coach && (
          <div className="space-y-1 rounded-md border border-primary/40 bg-primary/5 p-2">
            <p className="text-xs font-semibold text-primary">NHÌN LẠI</p>
            <p className="text-xs leading-relaxed">{renderBold(coach)}</p>
          </div>
        )}

        {data.level >= 1 && (
          <>
            <div className="space-y-1.5">
              <Label className="text-xs">Lúc bán, bạn thấy thế nào?</Label>
              <div className="grid grid-cols-2 gap-1.5">
                {CAM_XUC_OPTIONS.map((option) => (
                  <Button
                    key={option.value}
                    type="button"
                    size="sm"
                    variant={emotion === option.value ? "default" : "outline"}
                    className="h-7 text-xs"
                    aria-pressed={emotion === option.value}
                    onClick={() => setEmotion(option.value)}
                  >
                    {option.label}
                  </Button>
                ))}
              </div>
              {emotion && soPhienGiu != null && pnlPct != null && isLenhCoChuyen({ pnlPct, soPhienGiu }) && (
                <p className="text-[11px] text-muted-foreground">
                  Lệnh này “có chuyện” (lỗ, giữ quá lâu hoặc bán trong phiên đầu) — cảm xúc bạn ghi lại
                  được lưu cùng kết sổ: {camXucLabel(emotion)}.
                </p>
              )}
            </div>

            <ProfileBlock progress={cap1Progress ?? null} trades={cap1Trades ?? []} lyDo={lyDo} />
          </>
        )}
          </div>
        </ScrollArea>
        {evidenceLoading && <p role="status" className="text-xs text-muted-foreground">Đang tải kế hoạch đã lưu trước khi ghi kết sổ…</p>}
        {(evidenceError || evidenceMissing) && !evidenceLoading && <div role="alert" className="space-y-2 text-xs text-destructive"><p>{evidenceError ? errorMessage(evidenceError) : "Chưa đủ dữ liệu kế hoạch và thời gian nắm giữ để ghi kết sổ kỷ luật. Giao dịch đã khớp vẫn được giữ nguyên."}</p><Button variant="outline" size="sm" onClick={() => { onRetry(); void recoveredQuery.refetch(); if (data.level === 0) void cap0PlanQuery.refetch() }}>Tải lại kế hoạch</Button></div>}
        {recordError && <p role="alert" className="text-xs text-destructive">{recordError}</p>}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            Để sau
          </Button>
          <Button type="button" onClick={() => void record()} disabled={saving || !canRecord}>
            {saving && <LoaderCircle className="size-4 animate-spin" />}
            Đóng kết sổ
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** The cap1 Kết sổ's 3-line "HỒ SƠ CỦA BẠN", from server progress + trades. */
function ProfileBlock({
  progress,
  trades,
  lyDo,
}: {
  progress: Cap1Progress | null
  trades: Cap1TradeRow[]
  lyDo: JourneyPlanInput["lyDo"] | null
}) {
  const soLenh = progress?.so_lenh_thuc_chien ?? 0
  const conLai = Math.max(0, TARGET_CAP1_ORDERS - soLenh)
  const line1 =
    progress == null
      ? "Chưa đọc được tiến trình Cấp 1."
      : conLai > 0
        ? `Đây là lệnh Thực chiến thứ ${soLenh}/${TARGET_CAP1_ORDERS} — còn ${conLai} lệnh nữa để xét tốt nghiệp Cấp 1.`
        : `Đây là lệnh Thực chiến thứ ${soLenh}/${TARGET_CAP1_ORDERS} — bạn đã đủ số lệnh để xét tốt nghiệp Cấp 1.`

  const usedLyDo = new Set([...trades.map((trade) => trade.lyDo), ...(lyDo ? [lyDo] : [])])
  const daDung = Math.max(progress?.so_ly_do_da_dung ?? 0, usedLyDo.size)
  const line2 =
    daDung >= 5
      ? "Bạn đã dùng đủ 5/5 lý do — nhiệm vụ ③ hoàn thành."
      : `Bạn đã dùng ${daDung}/5 lý do mua.`

  const sameLyDo = lyDo ? trades.filter((trade) => trade.lyDo === lyDo) : []
  const wins = sameLyDo.filter((trade) => trade.pnl_pct > 0).length
  const line3 =
    sameLyDo.length >= MIN_TRADES_FOR_STAT
      ? `Với lý do ${lyDoLabel(lyDo)}, bạn có ${wins}/${sameLyDo.length} lệnh lãi.`
      : `Còn ${MIN_TRADES_FOR_STAT - sameLyDo.length} lệnh nữa để hệ thống tìm mẫu riêng của bạn.`

  return (
    <div className="space-y-1 rounded-md border border-border bg-muted/40 p-2 text-[11px]">
      <p className="text-xs font-semibold">HỒ SƠ CỦA BẠN</p>
      <p>{line1}</p>
      <p>{line2}</p>
      <p>{line3}</p>
    </div>
  )
}

/** Cấp 5's source stamp — three states, "chưa biết" is never rendered as "không". */
function sourceLine(recovered: RecoveredPlan | null | undefined): string {
  if (!recovered || recovered.source_known !== true) return "Chưa chụp được nguồn săn khi đặt lệnh"
  if (recovered.tu_san_ma === true) {
    return recovered.hunt_filter_ten
      ? `Đến từ săn mã · bộ lọc ${recovered.hunt_filter_ten}${recovered.hunt_signal ? ` · ${recovered.hunt_signal}` : ""}`
      : "Đến từ săn mã"
  }
  return "Không đến từ săn mã"
}

/** `**bold**` markers in the coach copy (the legacy modals' own convention). */
function renderBold(text: string) {
  return text.split("**").map((part, index) => (index % 2 === 1 ? <strong key={index}>{part}</strong> : part))
}

/** Stop-loss alert card wrapper (dismiss is local; the server keeps the row). */
function StopLossCard({
  alert,
  pending,
  onDismiss,
  onSellAto,
}: {
  alert: Cap2Alert
  pending: boolean
  onDismiss: () => void
  onSellAto: (quantity: number) => void
}) {
  const [saving, setSaving] = useState(false)
  const action = useCap2AlertAction()
  const quantity = alert.position_quantity ?? 0
  return (
    <div className="relative">
      <StopLossBanner
        alert={alert}
        phienGiuQuaNguong={alert.breach_session_no}
        pending={pending || saving}
        onSellAto={() => {
          setSaving(true)
          void action
            .mutateAsync({ alertId: alert.id, action: "sell_ato" })
            .then((result) => {
              if (result.next_step === "confirm_ato_sell" && quantity > 0) onSellAto(quantity)
              else toast.success("Đã ghi nhận: bạn chọn bán theo kế hoạch.")
            })
            .catch((error) => toast.error(errorMessage(error)))
            .finally(() => setSaving(false))
        }}
        onHold={(phrase) => {
          setSaving(true)
          void action
            .mutateAsync({ alertId: alert.id, action: "hold", confirmationPhrase: phrase })
            .then(() => toast.warning("Đã ghi nhận: bạn giữ tiếp dù giá đã chạm cắt lỗ."))
            .catch((error) => toast.error(errorMessage(error)))
            .finally(() => setSaving(false))
        }}
      />
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="absolute right-1 top-1 h-6 text-[11px]"
        onClick={onDismiss}
      >
        Ẩn
      </Button>
    </div>
  )
}

