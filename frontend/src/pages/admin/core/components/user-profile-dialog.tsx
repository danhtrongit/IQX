import { useState } from "react"
import { LoaderCircle } from "lucide-react"

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
import { DatePicker } from "@/components/ui/date-picker"
import { formatISODate } from "@/lib/date-only"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"

import type { AdminUserDetail, AdminUserPatch } from "../api"

type ProfileFieldName =
  | "full_name"
  | "phone_number"
  | "avatar_url"
  | "date_of_birth"
  | "gender"
  | "country"
  | "province_state"
  | "city"
  | "district"
  | "ward"
  | "street_address"
  | "postal_code"

type ProfileField = {
  name: ProfileFieldName
  label: string
  maxLength?: number
  type?: "date"
  placeholder?: string
  wide?: boolean
}

/** Same order, labels and length caps as the server's `UserUpdate` schema. */
const PROFILE_FIELDS: ProfileField[] = [
  { name: "full_name", label: "Họ tên", maxLength: 200 },
  { name: "phone_number", label: "Số điện thoại", maxLength: 30, placeholder: "0901234567" },
  { name: "date_of_birth", label: "Ngày sinh", type: "date" },
  { name: "gender", label: "Giới tính", maxLength: 20 },
  { name: "avatar_url", label: "Ảnh đại diện (URL)", maxLength: 2048, wide: true },
  { name: "country", label: "Quốc gia", maxLength: 100 },
  { name: "province_state", label: "Tỉnh / Bang", maxLength: 100 },
  { name: "city", label: "Thành phố", maxLength: 100 },
  { name: "district", label: "Quận / Huyện", maxLength: 100 },
  { name: "ward", label: "Phường / Xã", maxLength: 100 },
  { name: "street_address", label: "Địa chỉ", maxLength: 500, wide: true },
  { name: "postal_code", label: "Mã bưu chính", maxLength: 20 },
]

function profileValues(detail: AdminUserDetail): Record<ProfileFieldName, string> {
  return {
    full_name: detail.fullName ?? "",
    phone_number: detail.phoneNumber ?? "",
    avatar_url: detail.avatarUrl ?? "",
    date_of_birth: detail.dateOfBirth ?? "",
    gender: detail.gender ?? "",
    country: detail.country ?? "",
    province_state: detail.provinceState ?? "",
    city: detail.city ?? "",
    district: detail.district ?? "",
    ward: detail.ward ?? "",
    street_address: detail.streetAddress ?? "",
    postal_code: detail.postalCode ?? "",
  }
}

/**
 * Profile editor over the admin `PATCH /users/{id}` route. Only fields the admin
 * actually changed are sent, so an untouched value (or a field this screen does
 * not show) is never overwritten with an empty string.
 */
export function UserProfileDialog({
  detail,
  pending,
  error,
  onClose,
  onSubmit,
}: {
  detail: AdminUserDetail
  pending: boolean
  error: string | null
  onClose: () => void
  onSubmit: (patch: AdminUserPatch) => void
}) {
  const initial = profileValues(detail)
  const [values, setValues] = useState(initial)
  const changed = PROFILE_FIELDS.filter((field) => values[field.name].trim() !== initial[field.name])

  function submit() {
    const patch: AdminUserPatch = {}
    for (const field of changed) {
      const next = values[field.name].trim()
      patch[field.name] = next === "" ? null : next
    }
    onSubmit(patch)
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !pending && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Sửa hồ sơ</DialogTitle>
          <DialogDescription>
            {detail.email} · chỉ những trường bạn thay đổi mới được gửi lên máy chủ.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="-mx-1 max-h-[60vh] px-1">
          <div className="grid gap-3 sm:grid-cols-2">
            {PROFILE_FIELDS.map((field) => (
              <div key={field.name} className={field.wide ? "space-y-1.5 sm:col-span-2" : "space-y-1.5"}>
                <Label htmlFor={`profile-${field.name}`}>{field.label}</Label>
                {field.type === "date" ? <DatePicker
                  id={`profile-${field.name}`}
                  name={field.name}
                  value={values[field.name]}
                  onChange={(value) => setValues((previous) => ({ ...previous, [field.name]: value }))}
                  max={formatISODate(new Date())}
                  captionLayout="dropdown"
                  aria-label={field.label}
                /> : <Input
                  id={`profile-${field.name}`}
                  type={field.type ?? "text"}
                  value={values[field.name]}
                  maxLength={field.maxLength}
                  placeholder={field.placeholder}
                  onChange={(event) =>
                    setValues((previous) => ({ ...previous, [field.name]: event.target.value }))
                  }
                />}
              </div>
            ))}
          </div>
        </ScrollArea>

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        <DialogFooter>
          <span className="mr-auto self-center text-xs text-muted-foreground">
            {changed.length === 0 ? "Chưa có thay đổi" : `${changed.length} trường sẽ được cập nhật`}
          </span>
          <Button variant="outline" disabled={pending} onClick={onClose}>
            Hủy
          </Button>
          <Button disabled={pending || changed.length === 0} onClick={submit}>
            {pending && <LoaderCircle className="animate-spin" />}
            Lưu thay đổi
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
