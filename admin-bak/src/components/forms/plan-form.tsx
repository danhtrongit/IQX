import type { UseFormReturn } from "react-hook-form"
import { z } from "zod"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"

export const planSchema = z.object({
  code: z
    .string()
    .min(1, "Bắt buộc")
    .max(50, "Tối đa 50 ký tự")
    .regex(/^[A-Z0-9_]+$/, "Chỉ ký tự hoa, số, _"),
  name: z.string().min(1, "Bắt buộc").max(200, "Tối đa 200 ký tự"),
  description: z.string().max(2000, "Tối đa 2000 ký tự").optional().nullable(),
  price_vnd: z.coerce
    .number({ invalid_type_error: "Phải là số" })
    .int("Phải là số nguyên")
    .positive("Phải lớn hơn 0"),
  duration_days: z.coerce
    .number({ invalid_type_error: "Phải là số" })
    .int("Phải là số nguyên")
    .positive("Phải lớn hơn 0"),
  is_active: z.boolean().default(true),
  sort_order: z.coerce.number().int().default(0),
})

export type PlanFormValues = z.infer<typeof planSchema>

interface PlanFormProps {
  form: UseFormReturn<PlanFormValues>
  isEdit?: boolean
}

export function PlanForm({ form, isEdit = false }: PlanFormProps) {
  return (
    <Form {...form}>
      <div className="space-y-4">
        <FormField
          control={form.control}
          name="code"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Mã gói (CODE)</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  placeholder="VD: MONTHLY_PRO"
                  disabled={isEdit}
                  className={isEdit ? "bg-muted" : ""}
                />
              </FormControl>
              {isEdit && (
                <p className="text-xs text-muted-foreground">Mã gói không thể thay đổi sau khi tạo</p>
              )}
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Tên gói</FormLabel>
              <FormControl>
                <Input {...field} placeholder="VD: Gói Tháng" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Mô tả (tuỳ chọn)</FormLabel>
              <FormControl>
                <Textarea
                  {...field}
                  value={field.value ?? ""}
                  placeholder="Mô tả gói premium..."
                  rows={3}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="price_vnd"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Giá (VND)</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    type="number"
                    min={1}
                    placeholder="99000"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="duration_days"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Thời hạn (ngày)</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    type="number"
                    min={1}
                    placeholder="30"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="sort_order"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Thứ tự hiển thị</FormLabel>
                <FormControl>
                  <Input {...field} type="number" placeholder="0" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="is_active"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Trạng thái</FormLabel>
                <FormControl>
                  <div className="flex items-center gap-2 pt-1.5">
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      id="is_active"
                    />
                    <Label htmlFor="is_active" className="cursor-pointer text-sm">
                      {field.value ? "Đang hoạt động" : "Không hoạt động"}
                    </Label>
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      </div>
    </Form>
  )
}
