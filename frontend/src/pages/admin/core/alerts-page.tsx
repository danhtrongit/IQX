import { useState } from "react"
import { ArrowDown, ArrowUp, GripVertical, LoaderCircle, Plus, RefreshCw, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { WorkspacePage } from "@/components/layout/workspace-page"
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
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { errorMessage } from "@/lib/api"
import { cn } from "@/lib/utils"

import {
  ALERT_INDICATORS,
  ALERT_OPS,
  CROSS_OPS,
  RAW_FIELD_LABELS,
  isBinaryIndicator,
  type AlertCondition,
  type AlertLogic,
  type AlertSide,
  type AlertSignal,
  type AlertSignalUpsert,
} from "./api"
import { AdminDataTable, type AdminColumn } from "./components/admin-data-table"
import { useConfirmDialog } from "./components/use-confirm-dialog"
import { StatusBadge } from "./components/status-badge"
import { useAlertIndicators, useAlertSignals, useDeleteAlertSignal, useSaveAlertSignal, useSeedAlertSignals } from "./hooks"
import { ALERT_SIDE_LABELS } from "./labels"

const JOIN_OPTIONS: { value: AlertLogic; label: string }[] = [
  { value: "AND", label: "VÀ" },
  { value: "OR", label: "HOẶC" },
]

const SIDE_OPTIONS: { value: AlertSide; label: string }[] = [
  { value: "buy", label: "MUA" },
  { value: "sell", label: "BÁN" },
]

type EditableCondition = {
  indicator: string
  op: string
  /** Edited as text; parsed into a number/field name/null on save. */
  value: string
  /** Connector to the previous row (ignored on the first). */
  join: AlertLogic
}

type EditForm = {
  key: string
  side: AlertSide
  taName: string
  messageTitle: string
  conditions: EditableCondition[]
  isEnabled: boolean
  sortOrder: number
}

function blankCondition(): EditableCondition {
  return { indicator: "rsi_14", op: "<", value: "30", join: "AND" }
}

function blankForm(): EditForm {
  return {
    key: "",
    side: "buy",
    taName: "",
    messageTitle: "",
    conditions: [blankCondition()],
    isEnabled: true,
    sortOrder: 0,
  }
}

export function AlertSignalsPage() {
  const signals = useAlertSignals()
  const indicators = useAlertIndicators()
  const saveSignal = useSaveAlertSignal()
  const deleteSignal = useDeleteAlertSignal()
  const seedSignals = useSeedAlertSignals()
  const confirm = useConfirmDialog()

  const [editing, setEditing] = useState<{ form: EditForm; isCreate: boolean } | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [togglingKey, setTogglingKey] = useState<string | null>(null)
  const [dragIndex, setDragIndex] = useState<number | null>(null)

  const rows = signals.data ?? []

  /** Backend catalog when available; otherwise the built-in list with price labels. */
  const options = indicators.data
    ? [
        ...indicators.data.map((option) => ({ value: option.id, label: option.label, kind: option.kind })),
        ...Object.entries(RAW_FIELD_LABELS).map(([value, label]) => ({ value, label, kind: "num" })),
      ]
    : ALERT_INDICATORS.map((id) => ({
        value: id,
        label: RAW_FIELD_LABELS[id] ?? id,
        kind: undefined as string | undefined,
      }))

  function labelFor(id: string) {
    return options.find((option) => option.value === id)?.label ?? id
  }

  function kindFor(id: string) {
    return options.find((option) => option.value === id)?.kind
  }

  function openCreate() {
    setSaveError(null)
    setEditing({ form: blankForm(), isCreate: true })
  }

  function openEdit(signal: AlertSignal) {
    setSaveError(null)
    setEditing({
      isCreate: false,
      form: {
        key: signal.key,
        side: signal.side,
        taName: signal.taName,
        messageTitle: signal.messageTitle,
        isEnabled: signal.isEnabled,
        sortOrder: signal.sortOrder,
        conditions:
          signal.combination.conditions.length > 0
            ? signal.combination.conditions.map((condition) => ({
                indicator: condition.indicator,
                op: condition.op,
                value: condition.value === null ? "" : String(condition.value),
                join: condition.join === "OR" ? "OR" : "AND",
              }))
            : [blankCondition()],
      },
    })
  }

  function updateForm(patch: Partial<EditForm>) {
    setEditing((previous) => (previous ? { ...previous, form: { ...previous.form, ...patch } } : previous))
  }

  function updateCondition(index: number, patch: Partial<EditableCondition>) {
    setEditing((previous) => {
      if (!previous) return previous
      const conditions = previous.form.conditions.map((condition, position) =>
        position === index ? { ...condition, ...patch } : condition,
      )
      return { ...previous, form: { ...previous.form, conditions } }
    })
  }

  function moveCondition(index: number, delta: number) {
    setEditing((previous) => {
      if (!previous) return previous
      const target = index + delta
      const conditions = [...previous.form.conditions]
      if (target < 0 || target >= conditions.length) return previous
      const [moved] = conditions.splice(index, 1)
      conditions.splice(target, 0, moved)
      return { ...previous, form: { ...previous.form, conditions } }
    })
  }

  function removeCondition(index: number) {
    setEditing((previous) => {
      if (!previous) return previous
      const conditions = previous.form.conditions.filter((_, position) => position !== index)
      return {
        ...previous,
        form: { ...previous.form, conditions: conditions.length > 0 ? conditions : [blankCondition()] },
      }
    })
  }

  function dropCondition(index: number) {
    const from = dragIndex
    setDragIndex(null)
    if (from === null || from === index) return
    setEditing((previous) => {
      if (!previous) return previous
      const conditions = [...previous.form.conditions]
      const [moved] = conditions.splice(from, 1)
      conditions.splice(index, 0, moved)
      return { ...previous, form: { ...previous.form, conditions } }
    })
  }

  function buildPayload(form: EditForm): AlertSignalUpsert {
    return {
      side: form.side,
      taName: form.taName.trim(),
      messageTitle: form.messageTitle.trim(),
      isEnabled: form.isEnabled,
      sortOrder: form.sortOrder,
      combination: {
        // Per-row `join` carries the real connector; `logic` is the combination default.
        logic: "AND",
        conditions: form.conditions.map((condition, index) => {
          const parsed: AlertCondition = {
            indicator: condition.indicator,
            op: condition.op,
            value:
              condition.op === "is_true" || condition.value.trim() === ""
                ? null
                : Number.isNaN(Number(condition.value))
                  ? condition.value.trim()
                  : Number(condition.value),
          }
          if (index > 0) parsed.join = condition.join
          return parsed
        }),
      },
    }
  }

  function validate(form: EditForm, isCreate: boolean): string | null {
    if (isCreate && !/^[a-z0-9_]+$/.test(form.key)) return "Key chỉ gồm a-z, 0-9, _"
    if (form.key.length > 40) return "Key tối đa 40 ký tự"
    if (!form.taName.trim()) return "Nhập tên TA"
    if (form.taName.trim().length > 60) return "Tên TA tối đa 60 ký tự"
    if (!form.messageTitle.trim()) return "Nhập tiêu đề tin nhắn"
    if (form.messageTitle.trim().length > 200) return "Tiêu đề tin nhắn tối đa 200 ký tự"
    for (const condition of form.conditions) {
      if (condition.op !== "is_true" && condition.value.trim() === "") {
        return `Điều kiện ${labelFor(condition.indicator)} ${condition.op} thiếu ngưỡng`
      }
    }
    return null
  }

  async function submit() {
    if (!editing) return
    const problem = validate(editing.form, editing.isCreate)
    if (problem) {
      setSaveError(problem)
      return
    }
    setSaveError(null)
    try {
      await saveSignal.mutateAsync({
        key: editing.form.key.trim(),
        body: buildPayload(editing.form),
        create: editing.isCreate,
      })
      toast.success(editing.isCreate ? "Đã tạo tín hiệu" : `Đã lưu tín hiệu ${editing.form.key}`)
      setEditing(null)
    } catch (error) {
      setSaveError(errorMessage(error))
    }
  }

  async function toggleEnabled(signal: AlertSignal, isEnabled: boolean) {
    setTogglingKey(signal.key)
    try {
      await saveSignal.mutateAsync({
        key: signal.key,
        create: false,
        body: {
          side: signal.side,
          taName: signal.taName,
          messageTitle: signal.messageTitle,
          combination: signal.combination,
          isEnabled,
          sortOrder: signal.sortOrder,
        },
      })
      toast.success(`${isEnabled ? "Đã bật" : "Đã tắt"} tín hiệu ${signal.key}`)
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setTogglingKey(null)
    }
  }

  function askDelete(signal: AlertSignal) {
    confirm.ask({
      title: "Xóa tín hiệu?",
      description: `Xóa “${signal.taName}” (${signal.key}).`,
      confirmLabel: "Xóa",
      tone: "destructive",
      body: (
        <p className="text-muted-foreground">
          Người dùng đã theo dõi tín hiệu này không bị ảnh hưởng, nhưng tín hiệu sẽ không còn xuất hiện trong
          danh mục để đăng ký mới.
        </p>
      ),
      run: async () => {
        try {
          await deleteSignal.mutateAsync(signal.key)
          toast.success(`Đã xóa tín hiệu ${signal.key}`)
        } catch (error) {
          toast.error(errorMessage(error))
          throw error
        }
      },
    })
  }

  function askSeed() {
    confirm.ask({
      title: "Tạo 10 tín hiệu mặc định?",
      description: "Chỉ những tín hiệu còn thiếu mới được tạo; tín hiệu đã có giữ nguyên nội dung.",
      confirmLabel: "Tạo",
      run: async () => {
        try {
          const outcome = await seedSignals.mutateAsync(false)
          toast.success(`Đã tạo ${outcome.created} tín hiệu mặc định`)
        } catch (error) {
          toast.error(errorMessage(error))
          throw error
        }
      },
    })
  }

  const columns: AdminColumn<AlertSignal>[] = [
    { id: "key", header: "Key", cell: (signal) => <span className="font-mono text-xs">{signal.key}</span> },
    {
      id: "side",
      header: "Loại",
      cell: (signal) => (
        <StatusBadge
          status={signal.side}
          label={ALERT_SIDE_LABELS[signal.side] ?? signal.side}
          tone={signal.side === "buy" ? "success" : "danger"}
        />
      ),
    },
    { id: "taName", header: "Tên TA", cell: (signal) => signal.taName },
    {
      id: "message",
      header: "Tiêu đề tin nhắn",
      cell: (signal) => (
        <span className="block max-w-[26rem] truncate" title={signal.messageTitle}>
          {signal.messageTitle}
        </span>
      ),
    },
    {
      id: "combination",
      header: "Tổ hợp",
      cell: (signal) => (
        <span className="block max-w-[28rem] whitespace-normal">
          <span className="text-muted-foreground">
            {signal.combination.conditions.length} điều kiện
          </span>
          <span className="mt-0.5 block text-xs text-muted-foreground">
            {signal.combination.conditions
              .map((condition, index) => {
                const head = index === 0 ? "" : `${condition.join === "OR" ? " HOẶC " : " VÀ "}`
                const value =
                  condition.value === null
                    ? ""
                    : ` ${typeof condition.value === "string" ? labelFor(condition.value) : condition.value}`
                return `${head}${labelFor(condition.indicator)} ${condition.op}${value}`
              })
              .join("")}
          </span>
        </span>
      ),
    },
    {
      id: "order",
      header: "Thứ tự",
      align: "right",
      cell: (signal) => <span className="tabular-nums">{signal.sortOrder}</span>,
    },
    {
      id: "enabled",
      header: "Bật",
      cell: (signal) => (
        <span className="flex items-center gap-2">
          <Switch
            checked={signal.isEnabled}
            disabled={togglingKey === signal.key}
            aria-label={`${signal.isEnabled ? "Tắt" : "Bật"} tín hiệu ${signal.key}`}
            onCheckedChange={(checked) => void toggleEnabled(signal, checked)}
          />
          {togglingKey === signal.key && <LoaderCircle className="size-3 animate-spin text-muted-foreground" />}
        </span>
      ),
    },
    {
      id: "actions",
      header: "Thao tác",
      align: "right",
      cell: (signal) => (
        <div className="flex items-center justify-end gap-1">
          <Button variant="ghost" size="sm" onClick={() => openEdit(signal)}>
            Sửa
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Xóa tín hiệu ${signal.key}`}
            className="text-destructive"
            onClick={() => askDelete(signal)}
          >
            <Trash2 />
          </Button>
        </div>
      ),
    },
  ]

  return (
    <WorkspacePage
      title="Tín hiệu cảnh báo"
      description="Cấu hình tổ hợp chỉ số cho các tín hiệu gửi qua Telegram"
      actions={
        <>
          <Button variant="outline" size="sm" disabled={signals.isFetching} onClick={() => void signals.refetch()}>
            <RefreshCw className={signals.isFetching ? "animate-spin" : undefined} />
            Làm mới
          </Button>
          <Button variant="outline" size="sm" disabled={seedSignals.isPending} onClick={askSeed}>
            Tạo 10 mặc định
          </Button>
          <Button size="sm" onClick={openCreate}>
            <Plus />
            Thêm tín hiệu
          </Button>
        </>
      }
    >
      {indicators.isError && (
        <p className="rounded-lg bg-accent/15 px-3 py-2 text-sm text-price-ref">
          Không tải được danh mục chỉ số từ máy chủ — bộ chọn đang dùng danh sách dự phòng kèm mã chỉ số gốc.
        </p>
      )}

      <AdminDataTable
        columns={columns}
        rows={rows}
        rowKey={(signal) => signal.key}
        loading={signals.isLoading || signals.isFetching}
        error={signals.error ? errorMessage(signals.error) : null}
        onRetry={() => void signals.refetch()}
        emptyLabel="Chưa có tín hiệu nào. Dùng “Tạo 10 mặc định” để nạp bộ tín hiệu gốc."
        footer={
          <p className="border-t border-border px-3 py-2 text-xs text-muted-foreground">
            Điều kiện dùng toán tử so sánh, cắt lên/xuống hoặc <span className="font-mono">is_true</span> cho
            chỉ số nhị phân. Máy chủ kiểm tra lại toàn bộ tổ hợp trước khi lưu.
          </p>
        }
      />

      {confirm.element}

      {editing && (
        <Dialog open onOpenChange={(open) => !open && !saveSignal.isPending && setEditing(null)}>
          <DialogContent className="sm:max-w-3xl">
            <DialogHeader>
              <DialogTitle>
                {editing.isCreate ? "Thêm tín hiệu" : `Sửa tín hiệu · ${editing.form.key}`}
              </DialogTitle>
              <DialogDescription>
                Tín hiệu gửi qua Telegram khi tổ hợp điều kiện đúng trên dữ liệu phiên.
              </DialogDescription>
            </DialogHeader>

            <ScrollArea className="-mx-1 max-h-[60vh] px-1">
              <div className="space-y-3">
                {editing.isCreate && (
                  <div className="space-y-1.5">
                    <Label htmlFor="signal-key">Key (a-z, 0-9, _)</Label>
                    <Input
                      id="signal-key"
                      value={editing.form.key}
                      maxLength={40}
                      placeholder="vd: pullback"
                      onChange={(event) => updateForm({ key: event.target.value })}
                    />
                  </div>
                )}

                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="signal-side">Loại</Label>
                    <Select
                      value={editing.form.side}
                      onValueChange={(value) => updateForm({ side: value as AlertSide })}
                    >
                      <SelectTrigger id="signal-side" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {SIDE_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="signal-order">Thứ tự</Label>
                    <Input
                      id="signal-order"
                      type="number"
                      min={0}
                      value={editing.form.sortOrder}
                      onChange={(event) => updateForm({ sortOrder: Number(event.target.value) })}
                    />
                  </div>
                  <div className="flex items-end gap-2 pb-1.5">
                    <Switch
                      id="signal-enabled"
                      checked={editing.form.isEnabled}
                      onCheckedChange={(checked) => updateForm({ isEnabled: checked })}
                    />
                    <Label htmlFor="signal-enabled">Bật tín hiệu</Label>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="signal-ta-name">Tên TA</Label>
                  <Input
                    id="signal-ta-name"
                    value={editing.form.taName}
                    maxLength={60}
                    placeholder="vd: Pullback"
                    onChange={(event) => updateForm({ taName: event.target.value })}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="signal-title">Tiêu đề tin nhắn (gửi Telegram)</Label>
                  <Input
                    id="signal-title"
                    value={editing.form.messageTitle}
                    maxLength={200}
                    placeholder="vd: Mua khi giá điều chỉnh nhẹ"
                    onChange={(event) => updateForm({ messageTitle: event.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <Label>Điều kiện</Label>
                    <span className="text-xs text-muted-foreground">
                      Kéo để sắp xếp · VÀ/HOẶC cho từng dòng
                    </span>
                  </div>
                  {editing.form.conditions.map((condition, index) => {
                    const binary = isBinaryIndicator(condition.indicator, kindFor(condition.indicator))
                    const opOptions = ALERT_OPS.filter((op) =>
                      binary ? !(CROSS_OPS as readonly string[]).includes(op) : op !== "is_true",
                    )
                    return (
                      <div
                        key={index}
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={() => dropCondition(index)}
                        className={cn(
                          "flex flex-wrap items-center gap-2 rounded-md border border-border bg-card p-2",
                          dragIndex === index && "opacity-50",
                        )}
                      >
                        <span
                          draggable
                          onDragStart={() => setDragIndex(index)}
                          onDragEnd={() => setDragIndex(null)}
                          className="flex cursor-grab items-center text-muted-foreground"
                          title="Kéo để sắp xếp"
                          aria-hidden="true"
                        >
                          <GripVertical className="size-3.5" />
                        </span>
                        {index > 0 ? (
                          <Select
                            value={condition.join}
                            onValueChange={(value) => updateCondition(index, { join: value as AlertLogic })}
                          >
                            <SelectTrigger size="sm" className="w-[5.5rem]" aria-label="Liên kết">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {JOIN_OPTIONS.map((option) => (
                                <SelectItem key={option.value} value={option.value}>
                                  {option.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <span className="w-[5.5rem] pl-1 text-xs font-semibold text-muted-foreground">KHI</span>
                        )}
                        <Select
                          value={condition.indicator}
                          onValueChange={(value) => {
                            const nextBinary = isBinaryIndicator(value, kindFor(value))
                            updateCondition(index, {
                              indicator: value,
                              op: nextBinary ? "is_true" : condition.op === "is_true" ? ">" : condition.op,
                            })
                          }}
                        >
                          <SelectTrigger size="sm" className="w-[13rem]" aria-label="Chỉ số">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="max-h-72">
                            {options.map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Select
                          value={condition.op}
                          onValueChange={(value) => updateCondition(index, { op: value })}
                        >
                          <SelectTrigger size="sm" className="w-[8.5rem]" aria-label="Toán tử">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {opOptions.map((op) => (
                              <SelectItem key={op} value={op}>
                                {op}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Input
                          value={condition.value}
                          disabled={condition.op === "is_true"}
                          placeholder={condition.op === "is_true" ? "không cần" : "ngưỡng / chỉ số"}
                          aria-label="Ngưỡng"
                          className="w-[11rem]"
                          onChange={(event) => updateCondition(index, { value: event.target.value })}
                        />
                        <div className="ml-auto flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label="Di chuyển lên"
                            disabled={index === 0}
                            onClick={() => moveCondition(index, -1)}
                          >
                            <ArrowUp />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label="Di chuyển xuống"
                            disabled={index === editing.form.conditions.length - 1}
                            onClick={() => moveCondition(index, 1)}
                          >
                            <ArrowDown />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label="Xóa điều kiện"
                            className="text-destructive"
                            onClick={() => removeCondition(index)}
                          >
                            <Trash2 />
                          </Button>
                        </div>
                      </div>
                    )
                  })}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      updateForm({ conditions: [...editing.form.conditions, blankCondition()] })
                    }
                  >
                    <Plus />
                    Thêm điều kiện
                  </Button>
                </div>

                {saveError && (
                  <p role="alert" className="text-sm text-destructive">
                    {saveError}
                  </p>
                )}
              </div>
            </ScrollArea>

            <DialogFooter>
              <Button variant="outline" disabled={saveSignal.isPending} onClick={() => setEditing(null)}>
                Hủy
              </Button>
              <Button disabled={saveSignal.isPending} onClick={() => void submit()}>
                {saveSignal.isPending && <LoaderCircle className="animate-spin" />}
                Lưu
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </WorkspacePage>
  )
}
