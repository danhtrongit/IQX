import { Button, InputNumber, Modal, Radio, Slider } from "@arco-design/web-react"
import { useEffect, useMemo, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { usePlaceOrder, type FilledSellOrderEvent } from "@/features/trading"
import { cap7Keys } from "@/features/cap7"
import { getErrorMessage } from "@/shared/http/client"
import { cap8Api } from "./api"
import { boardLotPartialBounds } from "./exitMath"
import { useCap8ExitContext, useCap8ExitImpact, useSetCap8DynamicStop } from "./hooks"
import { cap8Keys } from "./keys"

function vnd(value: number | null): string {
  return value == null ? "Chưa có giá" : `${value.toLocaleString("en-US")} đ`
}

function ErrorMessage({ error, fallback, className }: { error: unknown; fallback: string; className?: string }) {
  const [message, setMessage] = useState(fallback)

  useEffect(() => {
    let cancelled = false
    void getErrorMessage(error, fallback).then((nextMessage) => {
      if (!cancelled) setMessage(nextMessage)
    })
    return () => {
      cancelled = true
    }
  }, [error, fallback])

  return <p className={className}>{message}</p>
}


export function ExitModalCap8({
  symbol,
  visible,
  onClose,
  onFilledSell,
}: {
  symbol: string | null
  visible: boolean
  onClose: () => void
  onFilledSell?: (order: FilledSellOrderEvent) => void
}) {
  const queryClient = useQueryClient()
  const { data: context, isLoading, error } = useCap8ExitContext(symbol, visible)
  const [mode, setMode] = useState<"full" | "partial">("full")
  const [partialQuantity, setPartialQuantity] = useState<number | undefined>()
  const [dynamicStop, setDynamicStop] = useState<number | undefined>()
  const [evidenceSellId, setEvidenceSellId] = useState<string | null>(null)
  const [evidenceOrder, setEvidenceOrder] = useState<FilledSellOrderEvent | null>(null)
  const [evidenceError, setEvidenceError] = useState<unknown>(null)
  const [orderError, setOrderError] = useState<unknown>(null)
  const [retryingEvidence, setRetryingEvidence] = useState(false)
  const dynamic = useSetCap8DynamicStop(symbol ?? "")
  const recordEvidence = async (sellOrderId: string) => {
    await cap8Api.recordExit(sellOrderId)
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: cap8Keys.progress() }),
      queryClient.invalidateQueries({ queryKey: cap8Keys.exitContext(symbol ?? "") }),
      queryClient.invalidateQueries({ queryKey: cap7Keys.progress() }),
      queryClient.invalidateQueries({ queryKey: cap7Keys.portfolio() }),
    ])
  }
  const dispatchCloseout = (order: FilledSellOrderEvent) => {
    try {
      onFilledSell?.(order)
    } catch (nextError) {
      console.error("Không thể mở Kết sổ sau khi đã ghi nhận thoát lệnh", nextError)
    }
  }
  const sell = usePlaceOrder(async (order) => {
    if (order.status.toLowerCase() !== "filled") {
      setOrderError(new Error("Lệnh bán không được khớp."))
      return
    }
    const filledSell: FilledSellOrderEvent = {
      symbol: context?.symbol ?? symbol ?? "",
      side: "sell",
      quantity: order.quantity,
      price: order.price,
      orderId: order.id,
    }
    try {
      await recordEvidence(order.id)
      dispatchCloseout(filledSell)
      onClose()
    } catch (nextError) {
      // Selling already succeeded. Keep this modal in evidence-retry mode and
      // never offer the same position to the order mutation a second time.
      setEvidenceSellId(order.id)
      setEvidenceOrder(filledSell)
      setEvidenceError(nextError)
    }
  })

  const partial = useMemo(
    () => context
      ? boardLotPartialBounds(context.quantity_sellable, context.board_lot_size, partialQuantity)
      : { min: 0, max: 0, value: 0, available: false },
    [context, partialQuantity],
  )

  const quantity = mode === "full" ? context?.quantity_sellable ?? 0 : partial.value
  const impact = useCap8ExitImpact(symbol, quantity, visible && context != null)
  const impactContext = impact.data?.proposed_sale_quantity === quantity
    ? impact.data
    : context?.proposed_sale_quantity === quantity ? context : undefined
  const projectedImpact = impactContext?.sector_impact as {
    can_doi_ok?: boolean
    max_symbol?: string | null
    max_symbol_weight_pct?: number | null
    max_sector?: string | null
    max_sector_weight_pct?: number | null
  } | undefined
  const emotionalWarning = Boolean(
    context && mode === "full" && context.current_price_vnd != null
      && context.current_price_vnd > context.avg_cost_vnd
      && context.original_take_profit_vnd != null
      && context.current_price_vnd < context.original_take_profit_vnd,
  )
  const plannedExitBar = useMemo(() => {
    if (
      context?.current_price_vnd == null
      || context.current_price_vnd <= context.avg_cost_vnd
      || context.original_stop_vnd == null
      || context.original_take_profit_vnd == null
    ) return null
    const floor = Math.min(context.original_stop_vnd, context.avg_cost_vnd, context.current_price_vnd)
    const ceiling = Math.max(context.original_take_profit_vnd, context.avg_cost_vnd, context.current_price_vnd)
    const position = (value: number) => `${((value - floor) / Math.max(ceiling - floor, 1)) * 100}%`
    return {
      stop: position(context.original_stop_vnd),
      cost: position(context.avg_cost_vnd),
      current: position(context.current_price_vnd),
      target: position(context.original_take_profit_vnd),
    }
  }, [context])

  return (
    <Modal visible={visible} title={symbol ? `Thoát lệnh ${symbol}` : "Thoát lệnh"} onCancel={onClose} footer={null}>
      {isLoading ? <p>Đang tải kế hoạch vị thế…</p> : error || !context ? <ErrorMessage error={error} fallback="Không tải được ngữ cảnh thoát lệnh." /> : (
        <div className="space-y-4" data-testid="cap8-exit-modal">
          <div className="rounded border border-[var(--color-border-2)] p-3 text-sm">
            <b>Kế hoạch gốc</b>
            <div>Giá vốn: {vnd(context.avg_cost_vnd)} · Giá hiện tại: {vnd(context.current_price_vnd)}</div>
            <div>Cắt lỗ: {vnd(context.original_stop_vnd)} · Chốt lời: {vnd(context.original_take_profit_vnd)}</div>
            {context.dynamic_stop_vnd != null && <div>Cắt lỗ động đang dùng: {vnd(context.dynamic_stop_vnd)}</div>}
            {plannedExitBar && (
              <div className="relative mt-4 h-10 border-y border-[var(--color-border-2)]" data-testid="cap8-planned-exit-price-bar">
                <span className="absolute inset-x-0 top-1/2 h-px bg-[var(--color-border-3)]" />
                <span className="absolute top-0 h-full border-l border-danger" style={{ left: plannedExitBar.stop }} title="Cắt lỗ" />
                <span className="absolute top-0 h-full border-l border-[var(--color-text-3)]" style={{ left: plannedExitBar.cost }} title="Giá vốn" />
                <span className="absolute top-0 h-full border-l-2 border-primary" style={{ left: plannedExitBar.current }} title="Giá hiện tại" />
                <span className="absolute top-0 h-full border-l border-success" style={{ left: plannedExitBar.target }} title="Chốt lời" />
              </div>
            )}
          </div>
          <div className="rounded border border-[var(--color-border-2)] p-3 text-xs">
            <b>Tác động phân bổ ngành sau bán</b>
            <p>
              Dự kiến bán {quantity.toLocaleString("en-US")} cổ phiếu:
              {projectedImpact == null
                ? " Đang tính phân bổ sau bán."
                : projectedImpact.can_doi_ok
                  ? " danh mục sau bán đạt điều kiện cân đối."
                  : " xem lại tỷ trọng mã/ngành sau khi bán."}
            </p>
            {projectedImpact != null && (
              <p>
                Mã lớn nhất: {projectedImpact.max_symbol ?? "—"} {projectedImpact.max_symbol_weight_pct?.toFixed(1) ?? "—"}%
                {" · "}Ngành lớn nhất: {projectedImpact.max_sector ?? "—"} {projectedImpact.max_sector_weight_pct?.toFixed(1) ?? "—"}%
              </p>
            )}
          </div>
          <Radio.Group value={mode} onChange={(value) => setMode(value)}>
            <Radio value="full">Bán toàn bộ ({context.quantity_sellable.toLocaleString("en-US")})</Radio>
            <Radio value="partial" disabled={!partial.available}>Bán một phần</Radio>
          </Radio.Group>
          {mode === "partial" && partial.available && (
            <div><Slider min={partial.min} max={partial.max} step={context.board_lot_size} value={partial.value} onChange={(value) => setPartialQuantity(Number(value))} />
              <span>{partial.value.toLocaleString("en-US")} cổ phiếu (lô {context.board_lot_size})</span></div>
          )}
          {emotionalWarning && <p className="text-warning">Bạn đang bán toàn bộ khi có lãi nhưng chưa chạm chốt lời. Lệnh vẫn được gửi, nhưng có thể không được tính là thoát theo kế hoạch.</p>}
          {context.quantity_sellable === 0 && (
            <p className="text-warning">Cổ phiếu chưa về tài khoản để bán (T+2). Bạn vẫn có thể nâng cắt lỗ động nếu vị thế đang có lãi.</p>
          )}
          <Button type="primary" loading={sell.isPending} disabled={quantity <= 0 || evidenceSellId !== null} onClick={() => { setOrderError(null); sell.mutate({ symbol: context.symbol, side: "sell", method: "market", quantity }) }}>
            {mode === "full" ? "Bán toàn bộ" : `Bán ${quantity.toLocaleString("en-US")}`}
          </Button>
          {evidenceSellId !== null && (
            <div className="space-y-2">
              <ErrorMessage error={evidenceError} fallback="Lệnh bán đã khớp, nhưng chưa ghi nhận được bằng chứng thoát lệnh." className="text-warning" />
              <Button
                loading={retryingEvidence}
                onClick={() => {
                  setRetryingEvidence(true)
                  void recordEvidence(evidenceSellId)
                    .then(() => {
                      if (evidenceOrder) dispatchCloseout(evidenceOrder)
                      setEvidenceSellId(null)
                      setEvidenceOrder(null)
                      setEvidenceError(null)
                      onClose()
                    })
                    .catch(setEvidenceError)
                    .finally(() => setRetryingEvidence(false))
                }}
              >
                Thử ghi nhận lại
              </Button>
            </div>
          )}
          {evidenceSellId === null && (orderError || sell.isError) && <ErrorMessage error={orderError ?? sell.error} fallback="Không thể gửi lệnh bán." className="text-danger" />}
          {context.can_update_dynamic_stop && (
            <div className="border-t border-[var(--color-border-2)] pt-3">
              <b>Nâng cắt lỗ động</b>
              <div className="mt-2 flex gap-2"><InputNumber value={dynamicStop} onChange={(value) => setDynamicStop(Number(value))} min={context.avg_cost_vnd + 1} /><Button loading={dynamic.isPending} disabled={!dynamicStop} onClick={() => { if (dynamicStop != null) dynamic.mutate(dynamicStop) }}>Lưu cắt lỗ động</Button></div>
              {dynamic.isError && <ErrorMessage error={dynamic.error} fallback="Không thể cập nhật cắt lỗ động." className="text-danger" />}
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}
