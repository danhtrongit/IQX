import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

import { fieldErrorFor, ruleErrorsFor, type ConfigFieldError } from "./api"
import { ConditionRows, type FlaggedField } from "./condition-rows"
import { SIDE_LABEL, sideFields, type DraftErrors, type DraftRow, type DraftSide } from "./draft"
import { CROSS_LABEL, numericParams, operandLabel, ruleOpLabel } from "./labels"
import { isParamsSide, isRowsIndicator, type IndicatorConfig, type ParamsIndicator, type RuleOp, type Side, type TechnicalIndicator } from "./types"
import { rowPathOf } from "./validate"

type EditorProps = {
  indicator: TechnicalIndicator
  side: Side
  draft: DraftSide
  /** The saved config the draft started from (Volume reads its rule templates from it). */
  saved: IndicatorConfig
  errors: DraftErrors[Side]
  serverErrors: readonly ConfigFieldError[]
  idPrefix: string
  onChange: (patch: Partial<DraftSide>) => void
  /** Drops the server errors that no longer apply once the user edited what they were about. */
  dismissServerErrors: (match: (error: ConfigFieldError) => boolean) => void
}

const unique = (messages: readonly string[]) => [...new Set(messages)]

/**
 * The conditions of one tab: the row sentences of the 15 row-based indicators (each row with its
 * own values and switch, errors listed under the rows), or Volume's unchanged param grid and rule
 * templates.
 */
export function ConditionSideEditor(props: EditorProps) {
  const { indicator, side, draft, errors, serverErrors, idPrefix, onChange, dismissServerErrors } = props
  if (!isRowsIndicator(indicator)) return <ParamsSideEditor {...props} indicator={indicator} />

  const serverRows = ruleErrorsFor([...serverErrors], side)
  const invalid: FlaggedField[] = [
    ...errors.rows.map((error) => ({ row: error.row, field: error.field })),
    ...serverRows.flatMap((error) => {
      const at = rowPathOf(error.path)
      return at?.field ? [{ row: at.index + 1, field: at.field }] : []
    }),
  ]
  const messages = unique([...errors.rows.map((error) => error.message), ...serverRows.map((error) => error.message)])
  const changeRow = (index: number, row: DraftRow) => {
    onChange({ rows: draft.rows.map((item, at) => (at === index ? row : item)) })
    // A server message was about the old values of this row.
    dismissServerErrors((error) => {
      const at = rowPathOf(error.path)
      return !!at && at.side === side && at.index === index
    })
  }
  return (
    <div className="space-y-2">
      <h3 className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">Điều kiện</h3>
      <ConditionRows
        definitions={indicator.rows}
        side={side}
        rows={draft.rows}
        onRowChange={changeRow}
        invalid={invalid}
        messages={messages}
        idPrefix={idPrefix}
      />
    </div>
  )
}

/** Volume (SPEC V3 owner decision 4): its side-level params and rule templates, as before. */
function ParamsSideEditor({ indicator, side, draft, saved, errors, serverErrors, idPrefix, onChange, dismissServerErrors }: EditorProps & { indicator: ParamsIndicator }) {
  const params = numericParams(draft.params)
  const savedSide = saved[side]
  const rules = isParamsSide(savedSide) ? savedSide.rules : indicator[side].rules
  const serverRules = ruleErrorsFor([...serverErrors], side)
  const setParam = (key: string, value: string) => {
    onChange({ params: { ...draft.params, [key]: value } })
    // The server message was about the old value.
    dismissServerErrors((entry) => !!fieldErrorFor([entry], side, key))
  }
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        {sideFields(indicator, side).map((field) => {
          const inputId = `${idPrefix}-${side}-${field.key}`
          const hintId = `${inputId}-hint`
          const error = errors.fields[field.key] ?? fieldErrorFor([...serverErrors], side, field.key)
          return (
            <div key={field.key} className="min-w-0 space-y-1.5">
              <Label htmlFor={inputId} className="text-xs font-medium text-muted-foreground">{field.label}</Label>
              <div className="relative">
                {field.options && field.options.length > 0 ? (
                  <select
                    id={inputId}
                    value={draft.params[field.key] ?? ""}
                    aria-invalid={error ? true : undefined}
                    aria-describedby={hintId}
                    className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm tabular-nums focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                    onChange={(event) => setParam(field.key, event.target.value)}
                  >
                    {field.options.map((opt) => (
                      <option key={opt} value={String(opt)}>
                        {opt}{field.unit ? ` ${field.unit}` : ""}
                      </option>
                    ))}
                  </select>
                ) : (
                  <>
                    <Input
                      id={inputId}
                      type="number"
                      inputMode="decimal"
                      min={field.min}
                      max={field.max}
                      step={field.step}
                      value={draft.params[field.key] ?? ""}
                      aria-invalid={error ? true : undefined}
                      aria-describedby={hintId}
                      className={cn("h-9 tabular-nums", field.unit && "pr-14")}
                      onChange={(event) => setParam(field.key, event.target.value)}
                    />
                    {field.unit && (
                      <span aria-hidden="true" className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-[11px] text-muted-foreground">
                        {field.unit}
                      </span>
                    )}
                  </>
                )}
              </div>
              <p id={hintId} className={cn("text-[11px] leading-4", error ? "text-destructive" : "text-muted-foreground")}>
                {error ?? `Từ ${field.min} đến ${field.max}, bước ${field.step}`}
              </p>
            </div>
          )
        })}
      </div>

      <div className="space-y-2">
        <h3 className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">Điều kiện</h3>
        <ul className="divide-y divide-border overflow-hidden rounded-md border border-border bg-background/40">
          {rules.map((rule, index) => (
            <li key={rule.id}>
              {rule.enabled !== undefined && (
                <label className="flex items-center gap-2 bg-muted/30 px-3 py-1.5 text-[11px] font-medium text-muted-foreground">
                  <input
                    type="checkbox"
                    aria-label={`Bật điều kiện ${index + 1} (${SIDE_LABEL[side]})`}
                    checked={draft.rules_enabled?.[rule.id] ?? rule.enabled !== false}
                    onChange={(event) => onChange({ rules_enabled: { ...draft.rules_enabled, [rule.id]: event.target.checked } })}
                  />
                  <span>Điều kiện {index + 1}</span>
                </label>
              )}
              {rule.kind === "cross" && <span className="block bg-muted/60 px-3 py-1.5 text-[11px] text-muted-foreground">{CROSS_LABEL}</span>}
              <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 px-3 py-3 text-xs leading-5">
                <span className="min-w-0 break-words">{operandLabel(rule.lhs, indicator, params)}</span>
                <select
                  aria-label={`Dấu điều kiện ${index + 1} (${SIDE_LABEL[side]})`}
                  className="h-8 min-w-13 rounded-sm border border-border bg-secondary px-2 text-center text-xs font-bold text-primary focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                  value={draft.ops[rule.id] ?? rule.op}
                  onChange={(event) => onChange({ ops: { ...draft.ops, [rule.id]: event.target.value as RuleOp } })}
                >
                  {(rule.allowed_ops as RuleOp[]).map((op) => <option key={op} value={op}>{ruleOpLabel(op)}</option>)}
                </select>
                <span className="min-w-0 text-right break-words">{operandLabel(rule.rhs, indicator, params)}</span>
              </div>
            </li>
          ))}
        </ul>
        {serverRules.length > 0 && (
          <ul className="list-disc pl-5 text-xs text-destructive" role="alert">
            {serverRules.map((error) => <li key={`${error.path}-${error.message}`}>{error.message}</li>)}
          </ul>
        )}
      </div>
    </>
  )
}
