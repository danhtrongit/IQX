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
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

import { ADMIN_ROLES, ASSIGNABLE_STATUSES, type AdminUserPatch } from "../api"
import { labelForRole, labelForStatus } from "../labels"

export type AccessMode = "role" | "status"

const OPTIONS: Record<AccessMode, { value: string; label: string }[]> = {
  role: ADMIN_ROLES.map((role) => ({ value: role, label: labelForRole(role) })),
  status: ASSIGNABLE_STATUSES.map((status) => ({ value: status, label: labelForStatus(status) })),
}

const TITLES: Record<AccessMode, string> = { role: "Đổi vai trò", status: "Đổi trạng thái" }

/**
 * Privilege change. The admin sees current → new before submitting, and the new
 * value only becomes visible anywhere after the server accepts it — nothing is
 * applied optimistically.
 */
export function UserAccessDialog({
  mode,
  current,
  pending,
  error,
  onClose,
  onSubmit,
}: {
  mode: AccessMode
  current: string
  pending: boolean
  error: string | null
  onClose: () => void
  onSubmit: (patch: AdminUserPatch) => void
}) {
  const [value, setValue] = useState(current)
  const unchanged = value === current

  return (
    <Dialog open onOpenChange={(open) => !open && !pending && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{TITLES[mode]}</DialogTitle>
          <DialogDescription>
            {mode === "role"
              ? "Vai trò quyết định quyền truy cập. Thay đổi có hiệu lực ngay khi máy chủ xác nhận."
              : "Trạng thái điều khiển việc đăng nhập của người dùng. Thay đổi có hiệu lực ngay khi máy chủ xác nhận."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Hiện tại:</span>
            <span className="font-medium">
              {mode === "role" ? labelForRole(current) : labelForStatus(current)}
            </span>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="access-value">Giá trị mới</Label>
            <Select value={value} onValueChange={setValue}>
              <SelectTrigger id="access-value" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {OPTIONS[mode].map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" disabled={pending} onClick={onClose}>
            Hủy
          </Button>
          <Button
            disabled={pending || unchanged}
            onClick={() => onSubmit(mode === "role" ? { role: value } : { status: value })}
          >
            {pending && <LoaderCircle className="animate-spin" />}
            {TITLES[mode]}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
