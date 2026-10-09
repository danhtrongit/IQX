import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import type { PracticeEvidence, PracticeForm, PracticeRuleEvidence, Side } from "./practice-api"
import {
  SIDE_LABEL,
  TONE_CLASS,
  formatDec,
  formatInt,
  formatMoneyVnd,
  formatRatioPercent,
  formatSignedMoney,
  sessionLabel,
  toneOf,
  type TradeRowView,
} from "./practice-model"

function Metric({ label, value, tone }: { label: string; value: string; tone?: "up" | "down" | "flat" }) {
  return (
    <div className="rounded-md border border-border bg-card/60 px-3 py-2">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <b className={cn("block text-sm tabular-nums", tone && TONE_CLASS[tone])}>{value}</b>
    </div>
  )
}

const numberOf = (value: unknown): number | null | undefined => (typeof value === "number" ? value : value === null ? null : undefined)

function valueText(rule: PracticeRuleEvidence): string {
  const lower = numberOf(rule["rhs_lower"])
  const upper = numberOf(rule["rhs_upper"])
  const right = rule.kind === "membership" ? `(${formatDec(lower)}; ${formatDec(upper)})` : formatDec(rule.rhs)
  return `${formatDec(rule.lhs)} ${rule.op} ${right}`
}

function ResultTag({ rule }: { rule: PracticeRuleEvidence }) {
  if (rule.missing || rule.result === null) return <Badge variant="outline">Thiếu dữ liệu</Badge>
  return rule.result ? (
    <Badge className="bg-price-up/15 text-price-up">✓ Đạt</Badge>
  ) : (
    <Badge variant="secondary">✕ Không đạt</Badge>
  )
}

function EvidenceGroup({ title, tone, evidence, side, spec }: { title: string; tone: "up" | "down"; evidence: PracticeEvidence; side: Side; spec: PracticeForm }) {
  const fields = spec[side].fields
  const params = Object.entries(evidence.params)
  return (
    <section className="space-y-2" data-evidence={side}>
      <h3 className={cn("text-xs font-semibold", TONE_CLASS[tone])}>
        {title} · {sessionLabel(evidence.signal_session)}
      </h3>
      {!evidence.enabled ? (
        <p className="text-xs text-muted-foreground">Điều kiện {SIDE_LABEL[side]} đang tắt.</p>
      ) : (
        <>
          {params.length > 0 && (
            <p className="text-[11px] text-muted-foreground" data-testid={`evidence-params-${side}`}>
              Tham số:{" "}
              {params
                .map(([key, value]) => {
                  const field = fields.find((item) => item.key === key)
                  return `${field?.label ?? key} ${formatDec(value)}${field?.unit ? ` ${field.unit}` : ""}`
                })
                .join(" · ")}
            </p>
          )}
          <ul className="space-y-1.5">
            {evidence.rules.map((rule) => {
              const previousLeft = numberOf(rule["previous_lhs"])
              const previousRight = numberOf(rule["previous_rhs"])
              const hasPrevious = previousLeft !== undefined || previousRight !== undefined
              return (
                <li key={rule.rule_id} className="flex items-center justify-between gap-3 rounded-md border border-border bg-card/60 px-3 py-2 text-xs" data-rule={rule.rule_id}>
                  <div className="min-w-0 space-y-0.5">
                    <span className="block text-[11px] text-muted-foreground">
                      {rule.left_label} {rule.op} {rule.right_label}
                    </span>
                    <b className="block font-semibold tabular-nums">
                      {rule.kind === "cross" ? "Giao cắt: " : ""}
                      {valueText(rule)}
                    </b>
                    {hasPrevious && (
                      <span className="block text-[11px] text-muted-foreground tabular-nums">
                        Phiên trước (T−1): {formatDec(previousLeft)} / {formatDec(previousRight)}
                      </span>
                    )}
                  </div>
                  <ResultTag rule={rule} />
                </li>
              )
            })}
          </ul>
        </>
      )}
    </section>
  )
}

/**
 * Decision detail of one trade, read from the locked snapshot: parameters, left/right values, the
 * operator and pass/fail of every rule, holding time, fees and the fill sessions. Never recomputed
 * from the form on screen.
 */
export function TradeDetailDialog({
  row,
  spec,
  indicatorName,
  onClose,
  onFocusSession,
}: {
  row: TradeRowView | null
  spec: PracticeForm
  indicatorName: string
  onClose: () => void
  onFocusSession: (session: number) => void
}) {
  const trade = row?.trade
  const sell = trade?.sell ?? null
  const holding = row?.holding ?? false
  return (
    <Dialog open={row !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent showCloseButton={false} className="max-h-[88vh] gap-4 overflow-y-auto sm:max-w-2xl" data-testid="trade-detail">
        {row && trade && (
          <>
            <DialogHeader>
              <DialogTitle>
                Giao dịch {trade.ordinal} · {indicatorName}
              </DialogTitle>
              <DialogDescription>Điều kiện tại phiên quyết định, giá khớp và phí của giao dịch này.</DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-2 min-[560px]:grid-cols-3">
              <Metric label="Mua" value={sessionLabel(trade.buy.session)} />
              <Metric label={holding ? "Trạng thái" : "Bán"} value={holding || row.sellSession === null ? "Đang giữ" : sessionLabel(row.sellSession)} />
              <Metric label="Thời gian giữ" value={`${row.heldSessions} phiên`} />
              <Metric label="Khối lượng" value={`${formatInt(trade.qty)} CP`} />
              <Metric label={row.provisional ? "Lãi/lỗ tạm tính" : "Lãi/lỗ sau phí"} value={formatRatioPercent(row.pnlRatio)} tone={toneOf(row.pnlVnd)} />
              <Metric label="Giá trị lãi/lỗ" value={formatSignedMoney(row.pnlVnd)} tone={toneOf(row.pnlVnd)} />
            </div>

            <dl className="grid grid-cols-1 gap-x-6 gap-y-1 rounded-md border border-border bg-card/60 px-3 py-2 text-xs min-[560px]:grid-cols-2" data-testid="trade-fees">
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Khớp Mua</dt>
                <dd className="tabular-nums">
                  giá mở cửa {sessionLabel(trade.buy.session)}: {formatInt(trade.buy.price)} đ
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Phí mua</dt>
                <dd className="tabular-nums">{formatMoneyVnd(trade.buy.fee)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Tổng vốn vào lệnh</dt>
                <dd className="tabular-nums">{formatMoneyVnd(trade.buy.total_cost)}</dd>
              </div>
              {sell ? (
                <>
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">Khớp Bán</dt>
                    <dd className="tabular-nums">
                      giá mở cửa {sessionLabel(sell.session)}: {formatInt(sell.price)} đ
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">Phí và thuế bán</dt>
                    <dd className="tabular-nums">{formatMoneyVnd(sell.fee)}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">Tiền thu về ròng</dt>
                    <dd className="tabular-nums">{formatMoneyVnd(sell.net_proceeds)}</dd>
                  </div>
                </>
              ) : (
                trade.mark && (
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">Giá trị tạm tính</dt>
                    <dd className="tabular-nums">
                      đóng cửa {sessionLabel(trade.mark.session)}: {formatMoneyVnd(trade.mark.market_value)}
                    </dd>
                  </div>
                )
              )}
            </dl>

            <EvidenceGroup title="Điều kiện Mua" tone="up" evidence={trade.buy.evidence} side="buy" spec={spec} />

            {sell && (
              <section className="space-y-2">
                {sell.reason === "max_holding" ? (
                  <>
                    <h3 className="text-xs font-semibold text-price-down">
                      Hết thời gian giữ · {sessionLabel(sell.signal_session)}
                    </h3>
                    <p className="rounded-md border border-border bg-card/60 px-3 py-2 text-xs leading-relaxed" data-testid="time-exit">
                      Đã giữ {sell.time_exit.held_sessions_at_signal} phiên tại phiên tín hiệu; giới hạn của lượt là {sell.time_exit.hold_max_sessions} phiên. Đây là giới hạn thời gian của lượt luyện, không phải tín hiệu {indicatorName}.
                    </p>
                    <EvidenceGroup title="Điều kiện Bán lúc đó (chưa đạt)" tone="down" evidence={sell.evidence} side="sell" spec={spec} />
                  </>
                ) : (
                  <>
                    <EvidenceGroup title="Điều kiện Bán" tone="down" evidence={sell.evidence} side="sell" spec={spec} />
                    {sell.time_due && (
                      <p className="text-[11px] text-muted-foreground">Thời gian giữ cũng đến hạn; chỉ ghi một lần Bán.</p>
                    )}
                  </>
                )}
              </section>
            )}

            <div className="flex flex-wrap justify-between gap-2 border-t border-border pt-3">
              <Button type="button" variant="outline" size="sm" onClick={() => onFocusSession(trade.buy.session)}>
                Xem điểm Mua
              </Button>
              <div className="flex gap-2">
                {sell && (
                  <Button type="button" variant="outline" size="sm" onClick={() => onFocusSession(sell.session)}>
                    Xem điểm Bán
                  </Button>
                )}
                <Button type="button" size="sm" onClick={onClose}>
                  Đóng
                </Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
