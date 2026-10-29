import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"

import type { DraftRow } from "./draft"
import { enabledCountText, fieldAriaLabel, fieldValueText, rowSwitchLabel, sentenceParts } from "./labels"
import type { RowDefinition, RowField, Side } from "./types"
import { SIDE_LABEL } from "./validate"

/** A flagged field: `row` is 1-based, `field` the field key (`period`, `threshold`…). */
export type FlaggedField = { row: number; field: string }

export type ConditionRowsProps = {
  /** The indicator's registry rows, in order (`GET /strategy/registry/technical` → `rows`). */
  definitions: readonly RowDefinition[]
  side: Side
  /** One entry per definition, same order: the row's switch and its values as text / enum codes. */
  rows: readonly DraftRow[]
  /** `edit` (default): inline inputs, selects and a switch per row. `read`: the same sentences with the values as text. */
  mode?: "edit" | "read"
  /** Called with the whole changed row; the other rows are never touched. Required in `edit` mode. */
  onRowChange?: (index: number, row: DraftRow) => void
  /** Fields to mark invalid (`aria-invalid`). */
  invalid?: readonly FlaggedField[]
  /** Messages listed under the rows (client validation and server errors), shown as given. */
  messages?: readonly string[]
  /** Prefix of the element ids; unique per form. */
  idPrefix?: string
  className?: string
}

const SELECT =
  "h-7 max-w-full rounded-sm border border-border bg-secondary px-1.5 text-xs font-bold text-primary focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none aria-invalid:border-destructive"

function FieldControl({
  field,
  value,
  invalid,
  label,
  id,
  onChange,
}: {
  field: RowField
  value: string
  invalid: boolean
  label: string
  id: string
  onChange: (value: string) => void
}) {
  if (field.type === "enum" || field.options) {
    const options =
      field.type === "enum"
        ? field.options.map((option) => ({ value: option.value, label: option.label }))
        : (field.options ?? []).map((option) => ({ value: String(option), label: String(option) }))
    // A stored value outside the list is shown as is (and flagged by validation), never replaced.
    const known = options.some((option) => option.value === value)
    return (
      <select
        id={id}
        aria-label={label}
        title={field.label}
        aria-invalid={invalid ? true : undefined}
        className={SELECT}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {!known && <option value={value}>{value === "" ? "—" : value}</option>}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    )
  }
  // Text input: the typed text is kept verbatim (`-0.05`, `-100`), never coerced by the browser.
  // A field that takes negatives gets the full keyboard on phones (a decimal pad has no minus key).
  const wide = field.min < 0 || field.max >= 1000
  return (
    <Input
      id={id}
      type="text"
      inputMode={field.min < 0 ? "text" : field.type === "integer" ? "numeric" : "decimal"}
      autoComplete="off"
      spellCheck={false}
      aria-label={label}
      title={field.label}
      aria-invalid={invalid ? true : undefined}
      className={cn("h-7 px-1.5 text-center text-xs tabular-nums md:text-xs", wide ? "w-20" : "w-14")}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  )
}

/**
 * The condition rows of one tab, rendered generically from the registry: each row is one short
 * sentence (`RSI [14] [<] [30]`) with its own inputs in place of the `{field}` slots and its own
 * switch. A row that is off is dimmed and still editable. There is no shared parameter block:
 * every period, threshold and operator lives in its row.
 */
export function ConditionRows({
  definitions,
  side,
  rows,
  mode = "edit",
  onRowChange,
  invalid = [],
  messages = [],
  idPrefix = "condition",
  className,
}: ConditionRowsProps) {
  const editable = mode === "edit" && !!onRowChange
  return (
    <div className={cn("space-y-2", className)}>
      <p className="text-[11px] leading-4 text-muted-foreground" data-testid={`row-count-${side}`}>{enabledCountText(rows)}</p>
      <ul className="divide-y divide-border overflow-hidden rounded-md border border-border bg-background/40" aria-label={`Điều kiện ${SIDE_LABEL[side]}`}>
        {definitions.map((definition, index) => {
          const row = rows[index] ?? { id: definition.id, enabled: false, values: {} }
          const number = index + 1
          const switchLabel = rowSwitchLabel(side, number)
          return (
            <li key={definition.id} data-row-id={definition.id} data-enabled={row.enabled} className="flex items-start gap-3 px-3 py-2.5">
              <Switch
                size="sm"
                className="mt-1.5"
                checked={row.enabled}
                disabled={!editable}
                aria-label={switchLabel}
                onCheckedChange={(checked) => onRowChange?.(index, { ...row, enabled: checked })}
              />
              <div className={cn("flex min-w-0 flex-1 flex-wrap items-center gap-x-1.5 gap-y-1 text-xs leading-7", !row.enabled && "opacity-60")}>
                {sentenceParts(definition.sentence).map((part, at) => {
                  if ("text" in part) {
                    const text = part.text.trim()
                    return text ? <span key={at}>{text}</span> : null
                  }
                  const field = definition.fields.find((item) => item.key === part.field)
                  const value = row.values[part.field] ?? ""
                  if (!field || !editable) {
                    return (
                      <strong key={at} className="font-semibold text-primary tabular-nums">
                        {fieldValueText(field, value)}
                      </strong>
                    )
                  }
                  return (
                    <FieldControl
                      key={at}
                      field={field}
                      value={value}
                      id={`${idPrefix}-${side}-${index}-${field.key}`}
                      label={fieldAriaLabel(field, side, number)}
                      invalid={invalid.some((item) => item.row === number && item.field === field.key)}
                      onChange={(next) => onRowChange?.(index, { ...row, values: { ...row.values, [field.key]: next } })}
                    />
                  )
                })}
              </div>
            </li>
          )
        })}
      </ul>
      {messages.length > 0 && (
        <ul role="alert" className="list-disc space-y-0.5 pl-5 text-xs text-destructive" data-testid={`row-errors-${side}`}>
          {messages.map((message) => <li key={message}>{message}</li>)}
        </ul>
      )}
    </div>
  )
}
