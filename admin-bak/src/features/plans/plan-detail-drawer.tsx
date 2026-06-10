import { useEffect } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { PlanForm, planSchema, type PlanFormValues } from "@/components/forms/plan-form"
import { plansApi, type PlanRow } from "@/lib/api/plans"

interface PlanDetailDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  plan?: PlanRow | null // null = create mode
  onSuccess: (plan: PlanRow) => void
}

export function PlanDetailDrawer({
  open,
  onOpenChange,
  plan,
  onSuccess,
}: PlanDetailDrawerProps) {
  const isEdit = !!plan

  const form = useForm<PlanFormValues>({
    resolver: zodResolver(planSchema),
    defaultValues: {
      code: "",
      name: "",
      description: null,
      price_vnd: 0,
      duration_days: 30,
      is_active: true,
      sort_order: 0,
    },
  })

  // Sync form values when plan changes
  useEffect(() => {
    if (plan) {
      form.reset({
        code: plan.code,
        name: plan.name,
        description: plan.description,
        price_vnd: plan.priceVnd,
        duration_days: plan.durationDays,
        is_active: plan.isActive,
        sort_order: plan.sortOrder,
      })
    } else {
      form.reset({
        code: "",
        name: "",
        description: null,
        price_vnd: 0,
        duration_days: 30,
        is_active: true,
        sort_order: 0,
      })
    }
  }, [plan, form, open])

  const onSubmit = async (values: PlanFormValues) => {
    try {
      let result: PlanRow
      if (isEdit && plan) {
        result = await plansApi.update(plan.id, {
          name: values.name,
          description: values.description,
          price_vnd: values.price_vnd,
          duration_days: values.duration_days,
          is_active: values.is_active,
          sort_order: values.sort_order,
        })
        toast.success("Đã cập nhật gói thành công")
      } else {
        result = await plansApi.create(values)
        toast.success("Đã tạo gói mới thành công")
      }
      onSuccess(result)
      onOpenChange(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Thao tác thất bại")
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{isEdit ? "Chỉnh sửa gói" : "Tạo gói mới"}</SheetTitle>
          <SheetDescription>
            {isEdit
              ? `Đang chỉnh sửa: ${plan?.code}`
              : "Điền thông tin để tạo gói premium mới"}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6">
          <PlanForm form={form} isEdit={isEdit} />
        </div>

        <div className="mt-6 flex gap-2">
          <Button
            className="flex-1"
            onClick={() => { void form.handleSubmit(onSubmit)() }}
            disabled={form.formState.isSubmitting}
          >
            {form.formState.isSubmitting
              ? "Đang lưu..."
              : isEdit
                ? "Lưu thay đổi"
                : "Tạo gói"}
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Hủy
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
