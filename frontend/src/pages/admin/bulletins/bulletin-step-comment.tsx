import { TrendingDown, TrendingUp } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

import type { AdminBulletinDetail, CommentKey, LevelKey } from "./bulletin-admin-api"
import {
  applySuggestion,
  COMMENT_FIELDS,
  COMMENT_LIMIT,
  formatLevelInput,
  parseLevelInput,
  type ContentDraft,
} from "./bulletin-admin-format"
import { StepCard } from "./bulletin-step-card"

const RESISTANCE_FIELDS: { key: LevelKey; label: string }[] = [
  { key: "r1", label: "Kháng cự 1" },
  { key: "r2", label: "Kháng cự 2" },
]
const SUPPORT_FIELDS: { key: LevelKey; label: string }[] = [
  { key: "s1", label: "Hỗ trợ 1" },
  { key: "s2", label: "Hỗ trợ 2" },
]

function LevelInput({
  id,
  label,
  value,
  onChange,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
}) {
  const invalid = !parseLevelInput(value).ok
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      <Input
        id={id}
        inputMode="decimal"
        autoComplete="off"
        placeholder="1.755,5"
        value={value}
        aria-invalid={invalid || undefined}
        aria-describedby={invalid ? `${id}-error` : undefined}
        onChange={(event) => onChange(event.target.value)}
        className="tabular-nums"
      />
      {invalid && (
        <p id={`${id}-error`} className="text-xs text-destructive">
          Nhập số điểm, ví dụ 1.755,5.
        </p>
      )}
    </div>
  )
}

/** Bước 2: ba ô nhận định, hai kháng cự, hai hỗ trợ (kèm gợi ý) và kịch bản tham khảo. */
export function BulletinStepComment({
  detail,
  draft,
  onChange,
  errorFields,
}: {
  detail: AdminBulletinDetail
  draft: ContentDraft
  onChange: (next: ContentDraft) => void
  errorFields: ReadonlySet<string>
}) {
  const setText = (key: CommentKey, value: string) => onChange({ ...draft, [key]: value })
  const setLevel = (key: LevelKey, value: string) => onChange({ ...draft, levels: { ...draft.levels, [key]: value } })

  return (
    <StepCard step={2} title="Nhận định" tag="Quản trị viên viết" tourId="tour-bantin-admin-comment">
      <div className="space-y-4">
        {COMMENT_FIELDS.map((field) => {
          const failing = errorFields.has(field.key)
          const length = draft[field.key].length
          const id = `bulletin-${field.key}`
          return (
            <div key={field.key} className="space-y-1.5">
              <div className="flex items-baseline justify-between gap-2">
                <Label htmlFor={id} className="text-sm font-medium">
                  {field.label}
                </Label>
                <span className={cn("text-xs tabular-nums", length >= COMMENT_LIMIT ? "text-destructive" : "text-muted-foreground")}>
                  {length} / {COMMENT_LIMIT}
                </span>
              </div>
              <Textarea
                id={id}
                rows={4}
                maxLength={COMMENT_LIMIT}
                value={draft[field.key]}
                aria-invalid={failing || undefined}
                className={cn("min-h-24 text-sm leading-6", failing && "border-destructive")}
                onChange={(event) => setText(field.key, event.target.value)}
              />
            </div>
          )
        })}
      </div>

      <div className="space-y-3 border-t border-border pt-4">
        <h3 className="text-sm font-medium">Hỗ trợ và kháng cự</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          {RESISTANCE_FIELDS.map((field) => (
            <LevelInput key={field.key} id={`bulletin-${field.key}`} label={field.label} value={draft.levels[field.key]} onChange={(value) => setLevel(field.key, value)} />
          ))}
          {SUPPORT_FIELDS.map((field) => (
            <LevelInput key={field.key} id={`bulletin-${field.key}`} label={field.label} value={draft.levels[field.key]} onChange={(value) => setLevel(field.key, value)} />
          ))}
        </div>

        {detail.suggestions.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs text-muted-foreground">Gợi ý từ dữ liệu phiên (bấm để điền vào ô trống đầu tiên):</p>
            <div className="flex flex-wrap gap-2">
              {detail.suggestions.map((suggestion) => (
                <Button
                  key={`${suggestion.label}-${suggestion.value}`}
                  type="button"
                  size="sm"
                  variant="outline"
                  className={cn(
                    "tabular-nums",
                    suggestion.side === "resistance"
                      ? "border-price-down/40 text-price-down hover:bg-price-down/10 hover:text-price-down"
                      : "border-price-up/40 text-price-up hover:bg-price-up/10 hover:text-price-up",
                  )}
                  onClick={() => onChange({ ...draft, levels: applySuggestion(draft.levels, suggestion) })}
                >
                  {suggestion.label} {formatLevelInput(suggestion.value)}
                </Button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="space-y-3 border-t border-border pt-4">
        <h3 className="text-sm font-medium">
          Kịch bản tham khảo <span className="font-normal text-muted-foreground">(không bắt buộc)</span>
        </h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <p className="flex items-center gap-1.5 text-xs font-medium text-price-up">
              <TrendingUp className="size-3.5" aria-hidden="true" />
              Tích cực: giữ trên → hồi về
            </p>
            <LevelInput id="bulletin-pa" label="Giữ trên" value={draft.levels.pa} onChange={(value) => setLevel("pa", value)} />
            <LevelInput id="bulletin-pt" label="Hồi về" value={draft.levels.pt} onChange={(value) => setLevel("pt", value)} />
          </div>
          <div className="space-y-2">
            <p className="flex items-center gap-1.5 text-xs font-medium text-price-down">
              <TrendingDown className="size-3.5" aria-hidden="true" />
              Tiêu cực: thủng → về
            </p>
            <LevelInput id="bulletin-na" label="Thủng" value={draft.levels.na} onChange={(value) => setLevel("na", value)} />
            <LevelInput id="bulletin-nt" label="Về" value={draft.levels.nt} onChange={(value) => setLevel("nt", value)} />
          </div>
        </div>
      </div>
    </StepCard>
  )
}
