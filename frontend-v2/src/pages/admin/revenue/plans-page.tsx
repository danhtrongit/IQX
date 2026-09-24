/**
 * /admin/plans — quản lý gói Premium (port từ `admin/src/features/premium/PlansPage.vue`).
 *
 * - Danh sách `GET /premium/admin/plans` không phân trang; sắp xếp theo
 *   `sort_order` rồi tên (giống legacy, nhưng đặt trong `useMemo`).
 * - Tạo gói: `POST` với đầy đủ trường `PlanCreate`. Sửa gói: `PATCH` gửi mọi
 *   trường trừ `code` (backend `PlanUpdate` không nhận `code`).
 * - "Ngưng kích hoạt" là soft-delete `DELETE` (backend chỉ đặt `is_active=false`)
 *   nên luôn có đường quay lại: bật lại bằng công tắc trong hộp thoại Sửa.
 *   Gói `TRIAL_7D` bị backend chặn xoá → nút bị vô hiệu hoá kèm giải thích.
 */
import { useMemo, useState } from "react"
import { Plus } from "lucide-react"
import { toast } from "sonner"

import { PanelState } from "@/components/layout/panel-state"
import { WorkspacePage } from "@/components/layout/workspace-page"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { errorMessage } from "@/lib/api"
import { formatDateTime, formatMoney } from "@/lib/format"
import type { Plan, PlanCreateInput } from "./api"
import { useCreatePlan, useDeactivatePlan, usePlans, useUpdatePlan } from "./queries"
import { ActionDialog, FormField, StatusBadge, TableLoadingRows, TableNoticeRow } from "./ui"

/** Backend chặn xoá gói này (`admin_delete_plan`). */
const PROTECTED_PLAN_CODE = "TRIAL_7D"

type FormState = {
  code: string
  name: string
  description: string
  priceVnd: string
  durationDays: string
  sortOrder: string
  isActive: boolean
}

const EMPTY_FORM: FormState = {
  code: "",
  name: "",
  description: "",
  priceVnd: "",
  durationDays: "30",
  sortOrder: "0",
  isActive: true,
}

export function PlansPage() {
  const plansQuery = usePlans()
  const [formTarget, setFormTarget] = useState<Plan | "create" | null>(null)
  const [deactivateTarget, setDeactivateTarget] = useState<Plan | null>(null)

  const plans = useMemo(
    () =>
      [...(plansQuery.data ?? [])].sort(
        (a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, "vi"),
      ),
    [plansQuery.data],
  )

  return (
    <WorkspacePage
      title="Gói Premium"
      description="Giá, thời hạn và trạng thái mở bán của từng gói. Sửa giá chỉ áp dụng cho đơn tạo mới; thuê bao đã mua giữ nguyên kỳ hạn."
      actions={
        <Button type="button" onClick={() => setFormTarget("create")}>
          <Plus data-icon="inline-start" />
          Tạo gói
        </Button>
      }
    >
      {plansQuery.isError ? (
        <PanelState
          title="Không tải được danh sách gói"
          description={errorMessage(plansQuery.error)}
          action={{ label: "Thử lại", onClick: () => void plansQuery.refetch() }}
        />
      ) : (
        <Card className="gap-0 overflow-hidden py-0">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-3">Mã</TableHead>
                <TableHead>Tên</TableHead>
                <TableHead className="text-right">Giá</TableHead>
                <TableHead className="text-right">Thời hạn</TableHead>
                <TableHead className="text-right">Thứ tự</TableHead>
                <TableHead>Trạng thái</TableHead>
                <TableHead>Ngày tạo</TableHead>
                <TableHead className="pr-3 text-right">Thao tác</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {plansQuery.isLoading ? (
                <TableLoadingRows colSpan={8} />
              ) : plans.length === 0 ? (
                <TableNoticeRow colSpan={8}>
                  Chưa có gói Premium nào. Bấm “Tạo gói” để thêm gói đầu tiên.
                </TableNoticeRow>
              ) : (
                plans.map((plan) => (
                  <TableRow key={plan.id}>
                    <TableCell className="pl-3 font-mono text-[11px]">{plan.code}</TableCell>
                    <TableCell className="max-w-[280px] whitespace-normal">
                      <span className="font-medium">{plan.name}</span>
                      {plan.description && (
                        <span className="mt-0.5 block text-[11px] text-muted-foreground">
                          {plan.description}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {formatMoney(plan.price_vnd)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{plan.duration_days} ngày</TableCell>
                    <TableCell className="text-right tabular-nums">{plan.sort_order}</TableCell>
                    <TableCell>
                      <StatusBadge
                        label={plan.is_active ? "Đang hoạt động" : "Không hoạt động"}
                        tone={plan.is_active ? "success" : "neutral"}
                      />
                    </TableCell>
                    <TableCell className="text-muted-foreground">{formatDateTime(plan.created_at)}</TableCell>
                    <TableCell className="pr-3 text-right">
                      <div className="flex justify-end gap-1">
                        <Button type="button" variant="outline" size="xs" onClick={() => setFormTarget(plan)}>
                          Sửa
                        </Button>
                        <Button
                          type="button"
                          variant="destructive"
                          size="xs"
                          disabled={!plan.is_active || plan.code === PROTECTED_PLAN_CODE}
                          title={
                            plan.code === PROTECTED_PLAN_CODE
                              ? "Gói dùng thử không thể ngưng kích hoạt"
                              : plan.is_active
                                ? "Ngưng mở bán gói này"
                                : "Gói đã ở trạng thái không hoạt động"
                          }
                          onClick={() => setDeactivateTarget(plan)}
                        >
                          Ngưng
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          <div className="border-t border-border px-3 py-2 text-xs text-muted-foreground tabular-nums">
            {plans.length} gói · {plans.filter((plan) => plan.is_active).length} đang mở bán
          </div>
        </Card>
      )}

      <PlanFormDialog
        key={formTarget === "create" ? "create" : (formTarget?.id ?? "closed")}
        target={formTarget}
        activePlanCount={plans.length}
        onClose={() => setFormTarget(null)}
      />

      <DeactivatePlanDialog plan={deactivateTarget} onClose={() => setDeactivateTarget(null)} />
    </WorkspacePage>
  )
}

function formFromTarget(target: Plan | "create" | null, activePlanCount: number): FormState {
  if (target === null || target === "create") {
    return { ...EMPTY_FORM, sortOrder: String(activePlanCount + 1) }
  }
  return {
    code: target.code,
    name: target.name,
    description: target.description ?? "",
    priceVnd: String(target.price_vnd),
    durationDays: String(target.duration_days),
    sortOrder: String(target.sort_order),
    isActive: target.is_active,
  }
}

function PlanFormDialog({
  target,
  activePlanCount,
  onClose,
}: {
  target: Plan | "create" | null
  activePlanCount: number
  onClose: () => void
}) {
  const editing = target !== null && target !== "create" ? target : null
  const createPlan = useCreatePlan()
  const updatePlan = useUpdatePlan()
  // Hộp thoại được remount theo `key` khi đổi gói, nên state khởi tạo là đủ.
  const [form, setForm] = useState<FormState>(() => formFromTarget(target, activePlanCount))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [serverError, setServerError] = useState<string | null>(null)

  const pending = createPlan.isPending || updatePlan.isPending

  function validate() {
    const next: Record<string, string> = {}
    const price = Number(form.priceVnd)
    const days = Number(form.durationDays)
    const sortOrder = Number(form.sortOrder)
    if (!editing) {
      if (!form.code.trim()) next.code = "Mã gói là bắt buộc"
      else if (form.code.trim().length > 50) next.code = "Mã gói tối đa 50 ký tự"
    }
    if (!form.name.trim()) next.name = "Tên gói là bắt buộc"
    else if (form.name.trim().length > 200) next.name = "Tên gói tối đa 200 ký tự"
    if (!Number.isInteger(price) || price <= 0) next.priceVnd = "Giá phải là số nguyên lớn hơn 0"
    if (!Number.isInteger(days) || days <= 0) next.durationDays = "Thời hạn phải là số ngày lớn hơn 0"
    if (!Number.isInteger(sortOrder) || sortOrder < 0) next.sortOrder = "Thứ tự phải là số nguyên không âm"
    setErrors(next)
    return Object.keys(next).length === 0
  }

  async function submit() {
    setServerError(null)
    if (!validate()) return
    const values = {
      name: form.name.trim(),
      description: form.description.trim() ? form.description.trim() : null,
      price_vnd: Number(form.priceVnd),
      duration_days: Number(form.durationDays),
      is_active: form.isActive,
      sort_order: Number(form.sortOrder),
    }
    try {
      if (editing) {
        await updatePlan.mutateAsync({ id: editing.id, input: values })
        toast.success(`Đã lưu gói ${values.name}`)
      } else {
        const input: PlanCreateInput = { code: form.code.trim(), ...values }
        await createPlan.mutateAsync(input)
        toast.success(`Đã tạo gói ${values.name}`)
      }
      onClose()
    } catch (error) {
      setServerError(errorMessage(error))
    }
  }

  return (
    <ActionDialog
      open={target !== null}
      onOpenChange={(open) => !open && onClose()}
      title={editing ? "Sửa gói" : "Tạo gói"}
      description={
        editing
          ? "Mã gói không đổi được sau khi tạo. Tắt “Đang hoạt động” để ngừng mở bán gói này."
          : "Gói mới xuất hiện ngay trong danh sách mua của người dùng khi được bật hoạt động."
      }
      confirmLabel={editing ? "Lưu thay đổi" : "Tạo gói"}
      pending={pending}
      error={serverError}
      onConfirm={() => void submit()}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField label="Mã gói" error={errors.code} hint={editing ? "Bất biến sau khi tạo" : undefined}>
          <Input
            value={form.code}
            disabled={!!editing}
            placeholder="VD: PREMIUM_30D"
            onChange={(event) => setForm({ ...form, code: event.target.value })}
          />
        </FormField>
        <FormField label="Tên gói" error={errors.name}>
          <Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
        </FormField>
        <div className="sm:col-span-2">
          <FormField label="Mô tả">
            <Textarea
              rows={2}
              value={form.description}
              placeholder="Quyền lợi hiển thị cho người dùng (không bắt buộc)"
              onChange={(event) => setForm({ ...form, description: event.target.value })}
            />
          </FormField>
        </div>
        <FormField label="Giá (VND)" error={errors.priceVnd}>
          <Input
            type="number"
            min={1}
            step={1000}
            value={form.priceVnd}
            onChange={(event) => setForm({ ...form, priceVnd: event.target.value })}
          />
        </FormField>
        <FormField label="Thời hạn (ngày)" error={errors.durationDays}>
          <Input
            type="number"
            min={1}
            value={form.durationDays}
            onChange={(event) => setForm({ ...form, durationDays: event.target.value })}
          />
        </FormField>
        <FormField label="Thứ tự hiển thị" error={errors.sortOrder} hint="Số nhỏ hiện trước">
          <Input
            type="number"
            min={0}
            value={form.sortOrder}
            onChange={(event) => setForm({ ...form, sortOrder: event.target.value })}
          />
        </FormField>
        <div className="flex items-end">
          <label className="flex h-8 items-center gap-2 text-sm">
            <Switch
              checked={form.isActive}
              onCheckedChange={(checked) => setForm({ ...form, isActive: checked })}
            />
            Đang hoạt động
          </label>
        </div>
      </div>
    </ActionDialog>
  )
}

function DeactivatePlanDialog({ plan, onClose }: { plan: Plan | null; onClose: () => void }) {
  const deactivate = useDeactivatePlan()
  const [serverError, setServerError] = useState<string | null>(null)

  async function confirm() {
    if (!plan) return
    setServerError(null)
    try {
      await deactivate.mutateAsync(plan.id)
      toast.success(`Đã ngưng mở bán gói ${plan.name}`)
      onClose()
    } catch (error) {
      setServerError(errorMessage(error))
    }
  }

  return (
    <ActionDialog
      open={plan !== null}
      onOpenChange={(open) => {
        if (!open) {
          setServerError(null)
          onClose()
        }
      }}
      title="Ngưng kích hoạt gói?"
      description={
        plan
          ? `Gói ${plan.name} (${plan.code}) sẽ không còn hiện cho người dùng mua. Dữ liệu gói và các đơn đã bán vẫn được giữ nguyên.`
          : undefined
      }
      confirmLabel="Ngưng kích hoạt"
      confirmVariant="destructive"
      pending={deactivate.isPending}
      error={serverError}
      onConfirm={() => void confirm()}
    >
      <p className="text-xs text-muted-foreground">
        Muốn mở bán lại: vào “Sửa” và bật “Đang hoạt động”.
      </p>
    </ActionDialog>
  )
}
