import { useState } from "react"
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
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { errorMessage } from "@/lib/api"

import type { DatasetConfig } from "./flashback-dataset-api"
import {
  DATASET_APPLIES_NEXT_BUILD,
  DATASET_NUMERIC_FIELDS,
  DATASET_SOURCE_CHOICES,
  buildDatasetPatch,
  datasetFieldError,
  initialDrafts,
  type DatasetDrafts,
  type DatasetNumericKey,
} from "./flashback-dataset-fields"
import { useUpdateDatasetConfig } from "./flashback-dataset-hooks"

function DatasetConfigForm({ config, onClose }: { config: DatasetConfig; onClose: () => void }) {
  const update = useUpdateDatasetConfig()
  const [drafts, setDrafts] = useState<DatasetDrafts>(() => initialDrafts(config))
  const [sourceValue, setSourceValue] = useState(config.priceSources.join(","))

  const errors = Object.fromEntries(
    DATASET_NUMERIC_FIELDS.map((field) => [field.key, datasetFieldError(field, drafts[field.key])]),
  ) as Record<DatasetNumericKey, string | null>
  const invalid = DATASET_NUMERIC_FIELDS.some((field) => errors[field.key] !== null)
  const patch = invalid ? {} : buildDatasetPatch(config, drafts, sourceValue)
  const changed = Object.keys(patch).length

  async function save() {
    try {
      await update.mutateAsync(patch)
      toast.success("Đã lưu tham số kho dữ liệu")
      onClose()
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault()
        if (!invalid && changed > 0) void save()
      }}
    >
      <div className="max-h-[60vh] space-y-4 overflow-y-auto pr-1">
        {DATASET_NUMERIC_FIELDS.map((field) => {
          const id = `dataset-config-${field.key}`
          const error = errors[field.key]
          return (
            <div key={field.key} className="space-y-1.5">
              <Label htmlFor={id}>{field.label}</Label>
              <div className="flex items-center gap-2">
                <Input
                  id={id}
                  type="number"
                  inputMode="decimal"
                  min={field.min}
                  max={field.max}
                  step={field.step}
                  value={drafts[field.key]}
                  aria-invalid={error !== null}
                  aria-describedby={`${id}-note`}
                  className="max-w-40 tabular-nums"
                  onChange={(event) => setDrafts((current) => ({ ...current, [field.key]: event.target.value }))}
                />
                <span className="text-xs text-muted-foreground">{field.unit}</span>
              </div>
              <p id={`${id}-note`} className={error ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
                {error ?? field.note}
              </p>
            </div>
          )
        })}

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Nguồn nến ngày</legend>
          <RadioGroup value={sourceValue} onValueChange={setSourceValue} aria-label="Nguồn nến ngày">
            {DATASET_SOURCE_CHOICES.map((choice) => (
              <div key={choice.value} className="flex items-start gap-2">
                <RadioGroupItem value={choice.value} id={`dataset-source-${choice.value}`} className="mt-0.5" />
                <Label htmlFor={`dataset-source-${choice.value}`} className="flex-col items-start gap-0.5">
                  <span>{choice.label}</span>
                  <span className="text-xs font-normal text-muted-foreground">{choice.note}</span>
                </Label>
              </div>
            ))}
          </RadioGroup>
          <p className="text-xs text-muted-foreground">{DATASET_APPLIES_NEXT_BUILD}</p>
        </fieldset>
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" disabled={update.isPending} onClick={onClose}>
          Hủy
        </Button>
        <Button type="submit" disabled={invalid || changed === 0 || update.isPending}>
          {update.isPending && <LoaderCircle className="animate-spin" aria-hidden="true" />}
          Lưu tham số
        </Button>
      </DialogFooter>
    </form>
  )
}

/**
 * Hộp thoại đổi tham số kho (spec §5). Nội dung chỉ dựng khi hộp thoại mở nên mỗi lần mở lại bắt
 * đầu từ giá trị hiện hành của máy chủ. Máy chủ kiểm tra lại khoảng giá trị và ghi nhật ký.
 */
export function DatasetConfigDialog({
  open,
  onOpenChange,
  config,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  config: DatasetConfig
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Sửa tham số kho dữ liệu</DialogTitle>
          <DialogDescription>
            Chỉ các tham số bạn đổi được gửi lên. Máy chủ ghi nhật ký kiểm tra cho thao tác này.
          </DialogDescription>
        </DialogHeader>
        <DatasetConfigForm config={config} onClose={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  )
}
