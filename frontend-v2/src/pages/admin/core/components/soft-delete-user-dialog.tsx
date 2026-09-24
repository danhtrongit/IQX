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
import { Label } from "@/components/ui/label"

/**
 * Soft delete is reversible in the database but not from this screen, so the
 * admin has to type the account's email before the button unlocks.
 */
export function SoftDeleteUserDialog({
  email,
  pending,
  error,
  onClose,
  onConfirm,
}: {
  email: string
  pending: boolean
  error: string | null
  onClose: () => void
  onConfirm: () => void
}) {
  const [typed, setTyped] = useState("")
  const matches = typed.trim().toLowerCase() === email.toLowerCase()

  return (
    <Dialog open onOpenChange={(open) => !open && !pending && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Xóa mềm người dùng?</DialogTitle>
          <DialogDescription>
            Tài khoản chuyển sang trạng thái “Đã xóa” và đặt mốc thời gian xóa. Dữ liệu thuê bao, thanh toán
            và nhật ký vẫn được giữ lại.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label htmlFor="confirm-email">
            Nhập <span className="font-mono">{email}</span> để xác nhận
          </Label>
          <Input
            id="confirm-email"
            value={typed}
            autoComplete="off"
            onChange={(event) => setTyped(event.target.value)}
          />
        </div>

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" disabled={pending} onClick={onClose}>
            Hủy
          </Button>
          <Button variant="destructive" disabled={pending || !matches} onClick={onConfirm}>
            {pending && <LoaderCircle className="animate-spin" />}
            Xóa mềm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
