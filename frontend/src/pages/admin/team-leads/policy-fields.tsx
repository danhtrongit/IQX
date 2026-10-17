import { useId } from "react"
import { TriangleAlert } from "lucide-react"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

import { TEAM_LEAD_OFFER_DAYS, type TeamLeadOfferDays, type TeamLeadOfferType } from "./api"
import { OFFER_TYPE_LABELS } from "./labels"
import { parseCommission, type PolicyDraft } from "./policy-draft"

const OFFER_TYPES: TeamLeadOfferType[] = ["none", "days", "lifetime"]

/** Hoa hồng và ưu đãi, dùng chung cho Bổ nhiệm và Sửa chính sách (§5.2). */
export function PolicyFields({
  value,
  disabled,
  onChange,
}: {
  value: PolicyDraft
  disabled?: boolean
  onChange: (next: PolicyDraft) => void
}) {
  const id = useId()
  const commissionPct = parseCommission(value.commission)
  const commissionInvalid = value.commission.trim() !== "" && commissionPct === null
  const lifetimeWarning = value.offerType === "lifetime" && commissionPct !== null && commissionPct !== 0

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor={`${id}-commission`}>Hoa hồng trực tiếp (%)</Label>
        <div className="flex items-center gap-2">
          <Input
            id={`${id}-commission`}
            inputMode="numeric"
            className="w-24 tabular-nums"
            value={value.commission}
            disabled={disabled}
            aria-invalid={commissionInvalid || undefined}
            aria-describedby={`${id}-commission-hint`}
            onChange={(event) => onChange({ ...value, commission: event.target.value.replace(/[^\d]/g, "").slice(0, 3) })}
          />
          <span className="text-sm text-muted-foreground">% doanh thu</span>
        </div>
        <p id={`${id}-commission-hint`} className={commissionInvalid ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
          {commissionInvalid ? "Hoa hồng phải là số nguyên từ 0 đến 100." : "Số nguyên từ 0 đến 100."}
        </p>
      </div>

      <fieldset className="space-y-2" disabled={disabled}>
        <legend className="mb-1.5 text-sm font-medium">Ưu đãi cho người dùng nhập mã</legend>
        <RadioGroup
          value={value.offerType}
          onValueChange={(next) => onChange({ ...value, offerType: next as TeamLeadOfferType })}
          className="gap-2"
        >
          {OFFER_TYPES.map((type) => (
            <div key={type} className="flex min-h-8 flex-wrap items-center gap-x-2.5 gap-y-1.5">
              <RadioGroupItem id={`${id}-offer-${type}`} value={type} />
              <Label htmlFor={`${id}-offer-${type}`} className="font-normal">
                {OFFER_TYPE_LABELS[type]}
              </Label>
              {type === "days" && (
                <Select
                  value={String(value.offerDays)}
                  disabled={disabled || value.offerType !== "days"}
                  onValueChange={(next) => onChange({ ...value, offerDays: Number(next) as TeamLeadOfferDays })}
                >
                  <SelectTrigger size="sm" className="w-28" aria-label="Số ngày miễn phí">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TEAM_LEAD_OFFER_DAYS.map((days) => (
                      <SelectItem key={days} value={String(days)}>
                        {days} ngày
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          ))}
        </RadioGroup>
      </fieldset>

      {lifetimeWarning && (
        <p role="status" className="flex gap-2 rounded-md bg-status-warning/10 px-3 py-2 text-sm text-status-warning">
          <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          Người dùng nhập mã được miễn phí Premium trọn đời nên không phát sinh thanh toán và hoa hồng.
        </p>
      )}
    </div>
  )
}
