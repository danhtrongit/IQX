/**
 * `OrderPanel` — the demo-trading order ticket ("Đặt lệnh").
 *
 * Level semantics (cumulative, server-owned — `JourneyPlanService`):
 * Cấp 0 = 5-chip Kế hoạch + practice cash; Cấp 1 adds lý do + vùng mua;
 * Cấp 2 adds cắt lỗ/chốt lời + the durable nhồi-lệnh pre-flight; Cấp 3 adds
 * khẩu vị × tự tin × cách khối lượng; Cấp 4/5 replace the lý-do field with the
 * five-layer self-read; Cấp 6 replaces it with the server's conflict table.
 *
 * What each level requires is enforced twice: `planGate` disables the button,
 * and the backend re-validates the same cumulative `journey_plan` atomically
 * before any cash moves, so a rejected BUY cannot leave an order without its
 * learning snapshot. Trading stays available at every journey level. Premium
 * only unlocks AI/BCTC reads; without it, the form records an unavailable
 * verdict rather than blocking practice.
 *
 * Must be rendered inside `JourneyProvider` (it reads the level from there).
 */
import { useMemo, useRef, useState } from "react"
import { LoaderCircle, Star } from "lucide-react"
import { toast } from "sonner"

import { SidebarPanel } from "@/components/layout/sidebar-panel"
import { PanelState } from "@/components/layout/panel-state"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useAuth } from "@/hooks/use-auth"
import { useTradingAccount, useTradingPortfolio } from "@/hooks/use-trading"
import { errorMessage } from "@/lib/api"
import { formatMoney, formatNumber } from "@/lib/format"
import { useJourney } from "../journey/use-journey"
import { useQuote } from "../market/use-quote"
import { NhoiLenhDialog } from "./blocks/alerts"
import { QuanLyVonBlock, SlTpBlock } from "./blocks/commitments"
import { AiInsightDetailDialog, AiThanhTraCard, PlanBlockCap0, PlanFormCap1 } from "./blocks/plan-form"
import { Doc5LopBlock, MauThuanBlock } from "./blocks/reading"
import type { PlanContext, PlanDraft } from "./journey-plan"
import { buildJourneyPlan, effectiveLyDo, emptyPlanDraft, planGate } from "./journey-plan"
import type { Lop, NhanDinhLop, Verdict } from "./plan-math"
import { BOARD_LOT, coBangMauThuan, conflictLevelLabel, roundToLo } from "./plan-math"
import { aiFiveLayers, verdictForLyDo, verdictForValuation } from "./stock-insight"
import type { StockInsight, StockValuation } from "./stock-insight"
import type { Cap2Alert } from "./use-plan-data"
import {
  useCap2AlertAction,
  useCap2PreBuyAlert,
  useCap3Progress,
  useCap6MauThuan,
  useCap6Skip,
  useSetKhauVi,
} from "./use-plan-data"
import { useStockInsight, useValuation } from "./use-stock-insight"
import { useActivateAccount, usePlaceOrder } from "./use-trading-orders"

const FEE_RATE = 0.0015

export type OrderPanelProps = {
  symbol: string
  /** Switch the panel to another symbol (keeps the shell, unlike a route change). */
  onSymbolChange: (symbol: string) => void
}

export function OrderPanel({ symbol, onSymbolChange }: OrderPanelProps) {
  // A symbol change starts a NEW investment decision: remounting drops buy
  // reason, AI read, vùng mua, SL/TP, confidence, sizing and the five-layer
  // answers, so none of them can be filed against a different stock's order.
  return <OrderTicket key={symbol} symbol={symbol} onSymbolChange={onSymbolChange} />
}

function OrderTicket({ symbol, onSymbolChange }: OrderPanelProps) {
  const { isAuthenticated, isPremium, isLoading: authLoading, openAuth } = useAuth()
  const journey = useJourney()
  const { data: quote, isLoading: quoteLoading } = useQuote(symbol)
  const { data: account } = useTradingAccount()
  const { data: portfolio } = useTradingPortfolio()
  const activate = useActivateAccount()
  const placeOrder = usePlaceOrder()
  const setKhauVi = useSetKhauVi()
  const preBuyAlert = useCap2PreBuyAlert()
  const alertAction = useCap2AlertAction()
  const skipCap6 = useCap6Skip()

  const level = isAuthenticated ? journey.level : null
  const [side, setSide] = useState<"buy" | "sell">("buy")
  const [method, setMethod] = useState<"market" | "limit">("market")
  const [limitPrice, setLimitPrice] = useState<number | null>(null)
  const [quantity, setQuantity] = useState<number>(BOARD_LOT)
  const [draft, setDraft] = useState<PlanDraft>(emptyPlanDraft)
  const [detailOpen, setDetailOpen] = useState(false)
  const [skipMarked, setSkipMarked] = useState(false)
  const [pendingAlert, setPendingAlert] = useState<{
    alert: Cap2Alert
    intendedQuantity: number
    intendedPrice: number
    signature: string
  } | null>(null)
  const attemptKeyRef = useRef<string | null>(null)
  const inFlightRef = useRef(false)

  const patch = (partial: Partial<PlanDraft>) => setDraft((previous) => ({ ...previous, ...partial }))

  const position = portfolio?.positions?.find((row) => row.symbol === symbol.toUpperCase())
  const sellable = position?.quantity_sellable ?? 0
  const currentPrice = quote?.price ?? 0
  const holdingElsewhere = (portfolio?.positions ?? []).find(
    (row) => row.quantity_total > 0 && row.symbol !== symbol.toUpperCase(),
  )

  /* ── level-scoped data ──────────────────────────────────────────────── */
  const needsAiRead = side === "buy" && level !== null && level >= 1
  const { data: insight, isLoading: insightLoading, isError: insightError } = useStockInsight(symbol, needsAiRead)
  const { data: valuation, isLoading: valuationLoading } = useValuation(symbol, needsAiRead)
  const { data: cap3Progress } = useCap3Progress(level !== null && level >= 3)
  const { data: mauThuan, isLoading: mauThuanLoading } = useCap6MauThuan(symbol, level !== null && level >= 6)
  const cap6HasConflict = coBangMauThuan(mauThuan ?? null)

  /* ── derived plan values ────────────────────────────────────────────── */
  const ai5Lop = useMemo(
    () => aiFiveLayers(insight ?? null, valuation ?? null, currentPrice),
    [insight, valuation, currentPrice],
  )
  const lyDo = effectiveLyDo({
    level: level ?? 0,
    draft,
    ai5Lop,
    mauThuan: mauThuan ?? null,
  })
  const vungMua = draft.vungMua === undefined ? (currentPrice > 0 ? currentPrice : null) : draft.vungMua
  // The recorded trạng thái + snapshot come from the SAME read the user sees,
  // so the AI Thanh tra card and the stored evidence can never disagree.
  const aiRead: { verdict: Verdict; snapshot: Record<string, unknown> } | null =
    needsAiRead && lyDo
      ? lyDo === "dinh_gia"
        ? valuationRead(valuation ?? null, currentPrice, valuationLoading)
        : insightRead(insight ?? null, insightError, insightLoading, lyDo)
      : null
  const planContext: PlanContext = {
    level,
    draft: {
      ...draft,
      vungMua,
      // Khẩu vị is SERVER state (Cấp 3–6): fall back to the saved value when
      // this order did not change it, so the body always carries what the
      // backend's cumulative validation requires.
      khauVi: draft.khauVi ?? cap3Progress?.khau_vi ?? null,
    },
    lyDo,
    verdict: aiRead?.verdict ?? null,
    snapshot: aiRead?.snapshot ?? null,
    requiresReason: !journey.progress?.task_1_done_at,
  }
  const gate = planGate(planContext)
  const buyDisabled = side === "buy" && !gate.ok

  const effectivePrice = method === "limit" ? (limitPrice ?? 0) : currentPrice
  const orderValue = effectivePrice * quantity
  const fee = Math.round(orderValue * FEE_RATE)
  const showPriceField = level === 0 ? !!journey.progress?.task_1_done_at : level !== null

  /* ── quantity helpers ───────────────────────────────────────────────── */
  const applyPercent = (percent: number) => {
    if (side === "buy") {
      if (currentPrice <= 0 || !account) return
      const maxShares =
        Math.floor(account.cash_available_vnd / (currentPrice * (1 + FEE_RATE)) / BOARD_LOT) * BOARD_LOT
      setQuantity(Math.max(BOARD_LOT, roundToLo((maxShares * percent) / 100)))
      return
    }
    if (sellable <= 0) return
    setQuantity(Math.max(BOARD_LOT, roundToLo((sellable * percent) / 100)))
  }

  /* ── submit ─────────────────────────────────────────────────────────── */
  async function submit(boundAlertId: string | null) {
    if (!quote || currentPrice <= 0) {
      toast.error("Không có dữ liệu mã CK")
      return
    }
    if (quantity < BOARD_LOT) {
      toast.warning(`Khối lượng tối thiểu là ${BOARD_LOT} CP`)
      return
    }
    if (quantity % BOARD_LOT !== 0) {
      toast.warning(`Khối lượng phải là bội số của ${BOARD_LOT}`)
      return
    }
    if (method === "limit" && (limitPrice ?? 0) <= 0) {
      toast.warning("Vui lòng nhập giá hợp lệ cho lệnh giới hạn")
      return
    }
    if (side === "buy" && !gate.ok) {
      toast.warning(gate.message)
      return
    }

    const price = method === "limit" ? (limitPrice ?? 0) : currentPrice

    // Cấp 2 §9 — the durable nhồi-lệnh check MUST run before the order. The
    // backend owns loss detection, quota, auto-mute and escalation; a failing
    // warning endpoint is a SOFT intervention and never hard-blocks a trade.
    let alertId = boundAlertId
    if (side === "buy" && (level ?? 0) >= 2 && alertId === null) {
      if (inFlightRef.current) return
      inFlightRef.current = true
      try {
        const key =
          attemptKeyRef.current ??
          `cap2-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`
        attemptKeyRef.current = key
        const result = await preBuyAlert.mutateAsync({
          symbol,
          idempotencyKey: key,
          quantity,
          orderType: method,
          limitPriceVnd: method === "limit" ? price : null,
        })
        if (result.triggered && result.alert) {
          if (result.alert.status === "shown") {
            setPendingAlert({
              alert: result.alert,
              intendedQuantity: quantity,
              intendedPrice: price,
              signature: JSON.stringify([symbol, method, quantity, method === "limit" ? price : null]),
            })
            return
          }
          // A suppressed trigger shows no impression, but the attempt must
          // still be recorded so the clean-10 auto-mute can re-enable it.
          if (
            result.alert.status === "suppressed" &&
            result.alert.suppression_reason === "auto_mute_last_10_clean"
          ) {
            await alertAction.mutateAsync({ alertId: result.alert.id, action: "proceed_buy" })
            alertId = result.alert.id
          }
        }
        attemptKeyRef.current = null
        if (result.data_status === "unavailable") {
          toast.warning("Chưa kiểm tra được cảnh báo nhồi lệnh; lệnh vẫn có thể tiếp tục.")
        }
      } catch {
        toast.warning("Chưa kiểm tra được cảnh báo nhồi lệnh; lệnh vẫn có thể tiếp tục.")
        attemptKeyRef.current = null
      } finally {
        inFlightRef.current = false
      }
    }

    const plan = buildJourneyPlan(
      alertId ? { ...planContext, draft: { ...planContext.draft, alertId } } : planContext,
    )
    const label = side === "buy" ? "MUA" : "BÁN"
    try {
      const order = await placeOrder.mutateAsync({
        symbol,
        side,
        method,
        quantity,
        price,
        journeyPlan: side === "buy" ? plan : null,
        level: side === "buy" ? level : null,
        vonBanDau: cap3Progress?.von_ban_dau ?? null,
        ai5Lop,
      })
      const filled = order.filled_price_vnd ?? order.limit_price_vnd ?? price
      const total = (order.gross_amount_vnd ?? filled * order.quantity).toLocaleString("vi-VN")
      toast.success(
        `Đặt lệnh ${label} ${symbol} thành công — ${order.quantity.toLocaleString("vi-VN")} CP × ${filled.toLocaleString(
          "vi-VN",
        )} = ${total} VND${order.status.toLowerCase() === "pending" ? " (chờ khớp)" : ""}`,
      )
      setDraft(emptyPlanDraft())
      setQuantity(BOARD_LOT)
      setLimitPrice(null)
      setMethod("market")
      setSkipMarked(false)
    } catch (error) {
      const message = errorMessage(error)
      if (/premium/i.test(message)) {
        toast.error(message, { duration: 6000 })
        if (!isAuthenticated) openAuth()
      } else {
        toast.error(message)
      }
    }
  }

  const savingOrder = placeOrder.isPending || preBuyAlert.isPending || alertAction.isPending

  if (authLoading || (isAuthenticated && journey.isLoading)) {
    return (
      <SidebarPanel title="Đặt lệnh" description={symbol}>
        <PanelState title="Đang tải hành trình" loading />
      </SidebarPanel>
    )
  }

  // All journey levels are free; premium only controls the AI evidence blocks.

  return (
    <SidebarPanel
      title="Đặt lệnh"
      description={`${symbol}${quote?.reference ? ` · TC ${formatNumber(quote.reference)}` : ""}`}
      footer={
        !isAuthenticated ? undefined : (
          <div className="space-y-2">
            {level !== null && level >= 6 && side === "buy" && cap6HasConflict && (
              <>
                <Button
                  type="button"
                  variant={skipMarked ? "default" : "outline"}
                  className="w-full"
                  aria-pressed={skipMarked}
                  onClick={() => {
                    if (skipMarked) {
                      setSkipMarked(false)
                      return
                    }
                    setSkipMarked(true)
                    // Only a level the user actually picked is recorded — the
                    // note below says so when they picked none, instead of
                    // filing a judgement they never made.
                    if (draft.conflictLevel) {
                      void skipCap6
                        .mutateAsync({ symbol, conflictLevel: draft.conflictLevel })
                        .catch((error) => toast.error(errorMessage(error)))
                    }
                  }}
                >
                  Không mua lần này
                </Button>
                {skipMarked && (
                  <p className="text-[11px] text-muted-foreground">
                    {draft.conflictLevel
                      ? `Bạn đọc mâu thuẫn ở mức “${conflictLevelLabel(draft.conflictLevel)}” và chọn đứng ngoài. Lần đứng ngoài này sẽ hiện ở Phân tích danh mục như một hành động có kỷ luật.`
                      : "Bạn chưa chọn mức nhận định nào, nên IQX chỉ ghi nhận quyết định đứng ngoài — chọn một mức ở trên thì lần này mới được xếp vào đúng nhóm ở Phân tích danh mục."}
                  </p>
                )}
              </>
            )}
            <Button
              type="button"
              className={`w-full font-bold text-white ${
                side === "buy" ? "bg-price-up hover:bg-price-up/90" : "bg-price-down hover:bg-price-down/90"
              }`}
              disabled={savingOrder || buyDisabled || !!pendingAlert}
              onClick={() => void submit(null)}
            >
              {savingOrder && <LoaderCircle className="size-4 animate-spin" />}
              {side === "buy" ? "ĐẶT LỆNH MUA" : "ĐẶT LỆNH BÁN"}
            </Button>
            {buyDisabled && (
              <p className="text-[11px] text-muted-foreground">
                {level === 0 && !gate.ok && gate.reason === "reason"
                  ? "Chọn lý do ở khối Kế hoạch để mở nút đặt lệnh."
                  : gate.ok
                    ? ""
                    : gate.message}
              </p>
            )}
            {pendingAlert && (
              <p className="text-[11px] text-price-ceiling">
                Chọn Huỷ hoặc Vẫn mua thêm trong cảnh báo trước.
              </p>
            )}
          </div>
        )
      }
    >
      {/* MUA / BÁN */}
      <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1" role="tablist" aria-label="Chiều lệnh">
        {(["buy", "sell"] as const).map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={side === value}
            tabIndex={side === value ? 0 : -1}
            onKeyDown={(event) => {
              if (event.key !== "ArrowLeft" && event.key !== "ArrowRight" && event.key !== "Home" && event.key !== "End") return
              event.preventDefault()
              const next = event.key === "Home" || event.key === "ArrowLeft" ? "buy" : "sell"
              setSide(next)
              document.getElementById(`order-side-${next}`)?.focus()
            }}
            id={`order-side-${value}`}
            onClick={() => setSide(value)}
            className={`rounded-md px-2 py-1.5 text-sm font-semibold transition-colors ${
              side === value
                ? value === "buy"
                  ? "bg-price-up text-white"
                  : "bg-price-down text-white"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {value === "buy" ? "MUA" : "BÁN"}
          </button>
        ))}
      </div>

      <TickerCard
        symbol={symbol}
        quote={quote ?? null}
        loading={quoteLoading}
        revealStats={level !== null && level >= 1}
        onSwitchSymbol={onSymbolChange}
        otherHoldingSymbol={holdingElsewhere?.symbol ?? null}
      />

      {/* Account + activation */}
      <Card className="gap-2 py-3">
        <CardContent className="space-y-2 px-3">
          {!isAuthenticated ? (
            <>
              <p className="text-xs text-muted-foreground">
                Đăng nhập để mở Sân tập 100 triệu VND và bắt đầu hành trình.
              </p>
              <Button type="button" size="sm" className="w-full" onClick={() => openAuth("login")}>
                Đăng nhập
              </Button>
            </>
          ) : account === undefined ? (
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <LoaderCircle className="size-3.5 animate-spin" /> Đang đọc tài khoản Đấu trường ảo…
            </p>
          ) : account === null ? (
            <>
              <p className="text-xs text-muted-foreground">Bạn chưa có tài khoản Đấu trường ảo.</p>
              <Button
                type="button"
                size="sm"
                className="w-full"
                disabled={activate.isPending}
                onClick={() => {
                  activate.mutate(undefined, {
                    onSuccess: (created) =>
                      toast.success(
                        `Kích hoạt Đấu trường ảo thành công — bạn nhận ${created.cash_available_vnd.toLocaleString(
                          "vi-VN",
                        )} VND ảo.`,
                      ),
                    onError: (error) => toast.error(errorMessage(error)),
                  })
                }}
              >
                {activate.isPending && <LoaderCircle className="size-4 animate-spin" />}
                Kích hoạt Đấu trường ảo
              </Button>
            </>
          ) : (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-muted-foreground">
                  {level === 0 ? "Số dư Sân tập" : "Số dư khả dụng"}
                </span>
                <span className="text-sm font-bold tabular-nums">{formatMoney(account.cash_available_vnd)}</span>
              </div>
              {level !== 0 && (
                <div className="flex flex-wrap items-center gap-3 text-[11px]">
                  <span
                    className={`font-medium tabular-nums ${
                      portfolio?.total_unrealized_pnl_vnd == null
                        ? "text-muted-foreground"
                        : portfolio.total_unrealized_pnl_vnd >= 0
                          ? "text-price-up"
                          : "text-price-down"
                    }`}
                  >
                    {portfolio?.total_unrealized_pnl_vnd == null
                      ? "—"
                      : `${formatMoney(portfolio.total_unrealized_pnl_vnd)} (${portfolio.return_pct.toFixed(2)}%)`}
                  </span>
                  {position && (
                    <span className="tabular-nums text-muted-foreground">
                      Đang giữ {position.quantity_total.toLocaleString("vi-VN")} CP
                      {position.quantity_sellable !== position.quantity_total &&
                        ` · bán được ${position.quantity_sellable.toLocaleString("vi-VN")}`}
                    </span>
                  )}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {!isAuthenticated ? (
        <Card className="gap-2 py-3">
          <CardContent className="px-3 text-xs text-muted-foreground">
            Phiếu lệnh mở sau khi bạn đăng nhập. Hành trình và dữ liệu thị trường vẫn xem được.
          </CardContent>
        </Card>
      ) : (
        <>
          {showPriceField && (
            <div className="space-y-2">
              <div className="space-y-1">
                <Label className="text-xs">Loại lệnh</Label>
                <Select value={method} onValueChange={(value) => setMethod(value as "market" | "limit")}>
                  <SelectTrigger className="w-full" size="sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="market">MP — Thị trường</SelectItem>
                    <SelectItem value="limit">LO — Giới hạn</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="limit-price" className="text-xs">
                  Giá
                </Label>
                <Input
                  id="limit-price"
                  inputMode="numeric"
                  disabled={method === "market"}
                  value={limitPrice == null ? "" : String(limitPrice)}
                  placeholder={currentPrice > 0 ? String(Math.round(currentPrice)) : "0"}
                  onChange={(event) => {
                    const raw = event.target.value.replace(/[^\d]/g, "")
                    setLimitPrice(raw === "" ? null : Number(raw))
                  }}
                  className="tabular-nums"
                />
                <p className="text-[11px] text-muted-foreground">
                  MP khớp ngay ở giá bên bán; LO chỉ khớp khi giá về đúng mức bạn nhập.
                </p>
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="quantity" className="text-xs">
                Khối lượng ({BOARD_LOT} CP/lô)
              </Label>
              {side === "sell" && (
                <span className="text-[11px] tabular-nums text-muted-foreground">
                  Tối đa: {sellable.toLocaleString("vi-VN")}
                </span>
              )}
            </div>
            <Input
              id="quantity"
              inputMode="numeric"
              value={String(quantity)}
              onChange={(event) => {
                const raw = event.target.value.replace(/[^\d]/g, "")
                setQuantity(raw === "" ? 0 : Number(raw))
              }}
              className="tabular-nums"
            />
            {level !== 0 && (
              <div className="flex gap-1.5 pt-0.5">
                {[10, 25, 50, 100].map((percent) => (
                  <Button
                    key={percent}
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-6 flex-1 text-[11px]"
                    onClick={() => applyPercent(percent)}
                  >
                    {percent}%
                  </Button>
                ))}
              </div>
            )}
          </div>

          {/* Cấp 3 — explains how the quantity above was arrived at. Shown as
              soon as the Cấp 3 row exists: when khẩu vị was never chosen the
              block IS the choice (the server owns the value, this only asks
              for it once and saves it). */}
          {side === "buy" && level !== null && level >= 3 && cap3Progress != null && (
            <QuanLyVonBlock
              khauVi={draft.khauVi ?? cap3Progress.khau_vi}
              vonBanDau={cap3Progress.von_ban_dau}
              giaVao={vungMua ?? currentPrice}
              mucTuTin={draft.mucTuTin}
              cachKhoiLuong={draft.cachKhoiLuong}
              onMucTuTin={(value) => patch({ mucTuTin: value })}
              onCachKhoiLuong={(value) => patch({ cachKhoiLuong: value })}
              onKhoiLuong={(suggested) => setQuantity(suggested)}
              dangDoiKhauVi={setKhauVi.isPending}
              onChonKhauVi={(value) => {
                setKhauVi.mutate(value, {
                  onSuccess: () => patch({ khauVi: value }),
                  onError: (error) => toast.error(errorMessage(error)),
                })
              }}
            />
          )}

          <div className="space-y-1 rounded-lg bg-muted/50 p-2 text-xs">
            {level !== 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Giá trị</span>
                <span className="font-medium tabular-nums">
                  {orderValue > 0 ? formatMoney(orderValue) : "—"}
                </span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-muted-foreground">Phí giao dịch (0,15%)</span>
              <span className="font-medium tabular-nums">{fee > 0 ? formatMoney(fee) : "—"}</span>
            </div>
            {level !== 0 && (
              <div className="flex justify-between border-t border-border pt-1 text-sm font-semibold">
                <span>Tổng</span>
                <span className="tabular-nums text-primary">
                  {orderValue > 0 ? formatMoney(orderValue + fee) : "—"}
                </span>
              </div>
            )}
          </div>

          {side === "buy" && level === 0 && (
            <PlanBlockCap0 symbol={symbol} reason={draft.reason} onReason={(slug) => patch({ reason: slug })} />
          )}

          {side === "buy" && level !== null && level >= 1 && (
            <div className="space-y-2">
              <PlanFormCap1
                symbol={symbol}
                lyDo={draft.lyDo}
                onLyDoChange={(value) => patch({ lyDo: value, docChiTiet: false })}
                hideLyDo={(level >= 4 && level <= 5) || (level >= 6 && lyDo != null)}
                derivedLyDo={lyDo}
                vungMua={vungMua}
                onVungMuaChange={(value) => patch({ vungMua: value })}
                currentPrice={currentPrice}
              />

              {level >= 4 && level <= 5 && (
                <Doc5LopBlock
                  symbol={symbol}
                  doc5Lop={draft.doc5Lop}
                  ai5Lop={ai5Lop}
                  insight={insight ?? null}
                  valuation={valuation ?? null}
                  currentPrice={currentPrice}
                  insightLoading={insightLoading || valuationLoading}
                  premiumBlocked={!isPremium}
                  onRate={(lop: Lop, value: NhanDinhLop) =>
                    patch({ doc5Lop: { ...draft.doc5Lop, [lop]: value } })
                  }
                />
              )}

              {level >= 6 && (
                <MauThuanBlock
                  mauThuan={mauThuan ?? null}
                  nhanDinh={draft.conflictLevel}
                  onNhanDinh={(value) => patch({ conflictLevel: value })}
                  loading={mauThuanLoading}
                />
              )}

              {level >= 1 && level <= 3 && draft.lyDo && (
                <AiThanhTraCard
                  symbol={symbol}
                  lyDo={draft.lyDo}
                  insight={insight ?? null}
                  valuation={valuation ?? null}
                  currentPrice={currentPrice}
                  loading={insightLoading || valuationLoading}
                  failed={insightError}
                  premiumBlocked={!isPremium}
                  onDocChiTiet={() => patch({ docChiTiet: true })}
                  onChonLyDoKhac={() => patch({ lyDo: null })}
                  onOpenDetail={() => setDetailOpen(true)}
                />
              )}

              {level >= 2 && (
                <SlTpBlock
                  giaVao={vungMua ?? currentPrice}
                  selected={draft.slTpMethod}
                  catLo={draft.catLo}
                  chotLoi={draft.chotLoi}
                  insight={insight ?? null}
                  loading={insightLoading}
                  onSelect={(slTpMethod, catLo, chotLoi) => patch({ slTpMethod, catLo, chotLoi })}
                />
              )}
            </div>
          )}

          {/* Sổ lệnh — Cấp 2 and up only ("không hiện ở Cấp 0 và Cấp 1"). */}
          {level !== null && level >= 2 && quote && <OrderBook bids={quote.bids} asks={quote.asks} />}
        </>
      )}

      {pendingAlert && (
        <NhoiLenhDialog
          alert={pendingAlert.alert}
          intendedQuantity={pendingAlert.intendedQuantity}
          intendedPrice={pendingAlert.intendedPrice}
          pending={alertAction.isPending}
          onCancel={() => {
            const current = pendingAlert
            setPendingAlert(null)
            attemptKeyRef.current = null
            void alertAction
              .mutateAsync({ alertId: current.alert.id, action: "cancel_buy" })
              .then(() => toast.success("Đã huỷ lệnh mua theo cảnh báo."))
              .catch((error) => toast.error(errorMessage(error)))
          }}
          onProceed={(phrase) => {
            const current = pendingAlert
            setPendingAlert(null)
            void alertAction
              .mutateAsync({ alertId: current.alert.id, action: "proceed_buy", confirmationPhrase: phrase })
              .then(() => {
                attemptKeyRef.current = null
                return submit(current.alert.id)
              })
              .catch((error) => toast.error(errorMessage(error)))
          }}
        />
      )}

      <AiInsightDetailDialog
        open={detailOpen}
        onOpenChange={setDetailOpen}
        symbol={symbol}
        insight={insight ?? null}
        valuation={valuation ?? null}
        currentPrice={currentPrice}
        loading={insightLoading || valuationLoading}
      />
    </SidebarPanel>
  )
}

/* ── helpers ──────────────────────────────────────────────────────────── */

function valuationRead(
  valuation: StockValuation | null,
  currentPrice: number,
  loading: boolean,
): { verdict: Verdict; snapshot: Record<string, unknown> } | null {
  if (loading) return null
  const verdict = verdictForValuation(valuation, currentPrice)
  if (!verdict) return null
  return {
    verdict,
    snapshot: {
      lyDo: "dinh_gia",
      currentPrice: currentPrice > 0 ? currentPrice : (valuation?.current_price ?? null),
      median: valuation?.fair_median ?? null,
    },
  }
}

function insightRead(
  insight: StockInsight | null,
  failed: boolean,
  loading: boolean,
  lyDo: Lop,
): { verdict: Verdict; snapshot: Record<string, unknown> } | null {
  if (failed || loading) return null
  const read = verdictForLyDo(insight, lyDo)
  if (!read) return null
  return { verdict: read.verdict, snapshot: { lyDo, statusLabel: read.statusLabel } }
}

type QuoteView = {
  price: number | null
  reference: number | null
  ceiling: number | null
  floor: number | null
  high: number | null
  low: number | null
  volume: number | null
}

function TickerCard({
  symbol,
  quote,
  loading,
  revealStats,
  onSwitchSymbol,
  otherHoldingSymbol,
}: {
  symbol: string
  quote: QuoteView | null
  loading: boolean
  revealStats: boolean
  onSwitchSymbol: (symbol: string) => void
  otherHoldingSymbol: string | null
}) {
  if (loading) {
    return (
      <Card className="py-3">
        <CardContent className="flex items-center gap-2 px-3 text-xs text-muted-foreground">
          <LoaderCircle className="size-3.5 animate-spin" /> Đang tải giá {symbol}…
        </CardContent>
      </Card>
    )
  }
  if (!quote) {
    return (
      <Card className="py-3">
        <CardContent className="space-y-2 px-3">
          <p className="text-xs text-muted-foreground">Chưa có dữ liệu giá cho mã {symbol}.</p>
          {otherHoldingSymbol && (
            <Button type="button" size="sm" variant="outline" onClick={() => onSwitchSymbol(otherHoldingSymbol)}>
              Mở mã đang nắm giữ: {otherHoldingSymbol}
            </Button>
          )}
        </CardContent>
      </Card>
    )
  }
  const { price, reference } = quote
  const tone =
    price == null || reference == null
      ? "text-foreground"
      : quote.ceiling != null && price >= quote.ceiling
        ? "text-price-ceiling"
        : quote.floor != null && price <= quote.floor
          ? "text-price-floor"
          : price > reference
            ? "text-price-up"
            : price < reference
              ? "text-price-down"
              : "text-muted-foreground"
  const changePct =
    price != null && reference != null && reference > 0 ? ((price - reference) / reference) * 100 : null
  const stats: { label: string; value: string }[] = [
    { label: "Trần", value: quote.ceiling == null ? "—" : formatNumber(quote.ceiling) },
    { label: "TC", value: quote.reference == null ? "—" : formatNumber(quote.reference) },
    { label: "Sàn", value: quote.floor == null ? "—" : formatNumber(quote.floor) },
  ]
  if (revealStats) {
    stats.push(
      { label: "Cao", value: quote.high == null ? "—" : formatNumber(quote.high) },
      { label: "Thấp", value: quote.low == null ? "—" : formatNumber(quote.low) },
      { label: "KL", value: quote.volume == null ? "—" : formatNumber(quote.volume) },
    )
  }

  return (
    <Card className="gap-2 py-3">
      <CardContent className="space-y-2 px-3">
        <div className="flex items-baseline justify-between gap-2">
          <span className="flex items-center gap-1.5 font-heading text-base font-bold">
            <Star className="size-3.5 text-muted-foreground" />
            {symbol}
          </span>
          <span className={`flex items-baseline gap-2 text-xl font-black tabular-nums ${tone}`}>
            {price == null ? "—" : formatNumber(price)}
            {changePct != null && (
              <span className={`text-xs font-semibold ${changePct >= 0 ? "text-price-up" : "text-price-down"}`}>
                {changePct >= 0 ? "+" : ""}
                {changePct.toFixed(2)}%
              </span>
            )}
          </span>
        </div>
        <div className="grid grid-cols-3 gap-x-3 gap-y-0.5 text-[11px]">
          {stats.map((stat) => (
            <div key={stat.label} className="flex justify-between">
              <span className="text-muted-foreground">{stat.label}</span>
              <span className="font-medium tabular-nums">{stat.value}</span>
            </div>
          ))}
        </div>
        {otherHoldingSymbol && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-6 w-full text-[11px]"
            onClick={() => onSwitchSymbol(otherHoldingSymbol)}
          >
            Đang giữ {otherHoldingSymbol} — mở mã này
          </Button>
        )}
      </CardContent>
    </Card>
  )
}

/** Bid/ask ladder — Cấp 2+ only. Bids descend, asks ascend, both from real depth. */
function OrderBook({
  bids,
  asks,
}: {
  bids: { price: number; volume: number }[]
  asks: { price: number; volume: number }[]
}) {
  const topBids = bids.slice(0, 3)
  const topAsks = [...asks].sort((a, b) => a.price - b.price).slice(0, 3)
  return (
    <Card className="gap-2 py-3">
      <CardContent className="space-y-1.5 px-3">
        <p className="text-xs font-semibold">Sổ lệnh</p>
        <div className="grid grid-cols-2 gap-x-3 text-[11px]">
          <div className="space-y-0.5">
            <p className="text-muted-foreground">Bên mua</p>
            {topBids.length === 0 && <p className="text-muted-foreground">—</p>}
            {topBids.map((level) => (
              <div key={`bid-${level.price}`} className="flex justify-between tabular-nums">
                <span className="text-price-up">{formatNumber(level.price)}</span>
                <span className="text-muted-foreground">{formatNumber(level.volume)}</span>
              </div>
            ))}
          </div>
          <div className="space-y-0.5">
            <p className="text-muted-foreground">Bên bán</p>
            {topAsks.length === 0 && <p className="text-muted-foreground">—</p>}
            {topAsks.map((level) => (
              <div key={`ask-${level.price}`} className="flex justify-between tabular-nums">
                <span className="text-price-down">{formatNumber(level.price)}</span>
                <span className="text-muted-foreground">{formatNumber(level.volume)}</span>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
