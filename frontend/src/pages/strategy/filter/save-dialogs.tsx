/**
 * Hộp thoại lưu của Bộ lọc: lưu bộ lọc (phiên bản mới hoặc bộ lọc mới) và lưu
 * danh sách tĩnh từ các mã đạt; cùng hộp thoại xem một danh sách đã lưu.
 */
import { useState } from "react"
import { LoaderCircle } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
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

import { staticListLabel } from "./definition"
import type { SavedList } from "./types"

export function SaveFilterDialog({
  open,
  onOpenChange,
  initialName,
  loadedFilter,
  pending,
  error,
  onSave,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialName: string
  loadedFilter: { id: string; name: string; version: number } | null
  pending: boolean
  error: string | null
  onSave: (input: { name: string; asNewVersionOf: string | null }) => void
}) {
  const [name, setName] = useState(initialName)
  const trimmed = name.trim()
  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>Lưu bộ lọc</DialogTitle>
          <DialogDescription>
            Bộ lọc lưu điều kiện, phạm vi và kỳ dữ liệu. Mỗi lần lưu lại tạo một phiên bản mới; phiên bản cũ được giữ nguyên.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="filter-save-name">Tên bộ lọc</Label>
          <Input
            id="filter-save-name"
            value={name}
            maxLength={120}
            onChange={(event) => setName(event.target.value)}
            placeholder="Ví dụ: Tăng trưởng + ROE"
          />
        </div>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <DialogFooter className="gap-2">
          {loadedFilter && (
            <Button
              type="button"
              variant="outline"
              disabled={pending || !trimmed}
              onClick={() => onSave({ name: trimmed, asNewVersionOf: null })}
            >
              Lưu thành bộ lọc mới
            </Button>
          )}
          <Button
            type="button"
            disabled={pending || !trimmed}
            onClick={() => onSave({ name: trimmed, asNewVersionOf: loadedFilter?.id ?? null })}
          >
            {pending && <LoaderCircle className="size-4 animate-spin" />}
            {loadedFilter ? `Lưu phiên bản ${loadedFilter.version + 1}` : "Lưu bộ lọc"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function SaveListDialog({
  open,
  onOpenChange,
  initialName,
  asOf,
  tickerCount,
  pending,
  error,
  onSave,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialName: string
  asOf: string
  tickerCount: number
  pending: boolean
  error: string | null
  onSave: (name: string) => void
}) {
  const [name, setName] = useState(initialName)
  const trimmed = name.trim()
  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>Lưu danh sách</DialogTitle>
          <DialogDescription>{staticListLabel(asOf)}</DialogDescription>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">
          Lưu {tickerCount} mã đạt điều kiện. Đây là danh sách chụp tại thời điểm chạy để thực hành, không phải vị thế đã mua và
          không phải universe động đúng thời điểm khi thử lại quá khứ.
        </p>
        <div className="space-y-1.5">
          <Label htmlFor="filter-list-name">Tên danh sách</Label>
          <Input
            id="filter-list-name"
            value={name}
            maxLength={120}
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <DialogFooter>
          <Button type="button" disabled={pending || !trimmed || tickerCount === 0} onClick={() => onSave(trimmed)}>
            {pending && <LoaderCircle className="size-4 animate-spin" />}
            Lưu danh sách
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function SavedListDialog({
  list,
  onOpenChange,
  pending,
  error,
  onDelete,
}: {
  list: SavedList | null
  onOpenChange: (open: boolean) => void
  pending: boolean
  error: string | null
  onDelete: (id: string) => void
}) {
  return (
    <Dialog open={list !== null} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent className="sm:max-w-[480px]">
        {list && (
          <>
            <DialogHeader>
              <DialogTitle>{list.name}</DialogTitle>
              <DialogDescription>{staticListLabel(list.as_of)}</DialogDescription>
            </DialogHeader>
            <div className="space-y-2 text-xs">
              <div className="text-muted-foreground">
                {list.tickers.length} mã
                {list.data_source ? ` · nguồn ${list.data_source}` : ""}
                {list.filter_id ? ` · từ bộ lọc phiên bản ${list.filter_version ?? "—"}` : ""}
              </div>
              <div className="max-h-48 overflow-auto rounded-md border border-border p-2 font-mono leading-6">
                {list.tickers.length ? list.tickers.join(", ") : "—"}
              </div>
            </div>
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <DialogFooter>
              <Button type="button" variant="destructive" disabled={pending} onClick={() => onDelete(list.id)}>
                {pending && <LoaderCircle className="size-4 animate-spin" />}
                Xoá danh sách
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
