/**
 * Hộp "Tạo phòng" (spec v2 §3) và hộp nhập mật khẩu phòng (§2.3).
 *
 * Hộp tạo phòng báo đúng một dòng lỗi ngay trong hộp (đúng thứ tự và câu chữ của server), không có
 * chữ hướng dẫn phụ dưới các ô. Chọn 1 người thì ô cược bị khoá vì ván chơi một mình không cược.
 */
import { useState, type FormEvent, type ReactNode } from "react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { FlashbackCreateRoomBody } from "./flashback-api"
import type { JoinOutcome } from "./flashback-context"
import {
  ROOM_BARS_MAX,
  ROOM_BARS_MIN,
  ROOM_FORM_DEFAULTS,
  ROOM_MINUTE_OPTIONS,
  ROOM_PASSWORD_MAX,
  ROOM_PLAYER_OPTIONS,
  ROOM_STAKE_STEP,
  validateRoomForm,
  type RoomForm,
} from "./flashback-model"

const PLACEHOLDER = "placeholder:text-text-secondary"

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: ReactNode }) {
  return (
    <div className="min-w-0 space-y-1.5">
      <Label htmlFor={htmlFor} className="text-xs font-semibold text-text-secondary">
        {label}
      </Label>
      {children}
    </div>
  )
}

/** Hộp tạo phòng; được dựng mới mỗi lần mở nên luôn bắt đầu từ giá trị mặc định. */
export function CreateRoomDialog({
  balance,
  onCreate,
  onClose,
}: {
  /** Số xu đang có nếu đã biết; chưa biết thì để server báo "Bạn chỉ có n xu". */
  balance: number | null
  /** Trả về dòng lỗi của server, hoặc null khi tạo xong. */
  onCreate: (body: FlashbackCreateRoomBody) => Promise<string | null>
  onClose: () => void
}) {
  const [form, setForm] = useState<RoomForm>(ROOM_FORM_DEFAULTS)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const solo = form.maxPlayers === "1"

  function update(field: keyof RoomForm, value: string) {
    setForm((previous) => ({ ...previous, [field]: value }))
    setError(null)
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    const checked = validateRoomForm(form, balance)
    if (!checked.ok) {
      setError(checked.message)
      return
    }
    setBusy(true)
    const failure = await onCreate(checked.body)
    setBusy(false)
    if (failure) setError(failure)
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent showCloseButton={false} className="sm:max-w-[520px]" data-testid="flashback-create-room">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold">Tạo phòng</DialogTitle>
          <DialogDescription className="sr-only">Thiết lập phòng Flashback mới</DialogDescription>
        </DialogHeader>
        <form onSubmit={(event) => void submit(event)} className="grid gap-4" noValidate>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Số phiên xem" htmlFor="flashback-view-bars">
              <Input
                id="flashback-view-bars"
                type="number"
                inputMode="numeric"
                min={ROOM_BARS_MIN}
                max={ROOM_BARS_MAX}
                step={1}
                value={form.viewBars}
                onChange={(event) => update("viewBars", event.target.value)}
                className="tabular-nums"
              />
            </Field>
            <Field label="Số phiên chơi" htmlFor="flashback-play-bars">
              <Input
                id="flashback-play-bars"
                type="number"
                inputMode="numeric"
                min={ROOM_BARS_MIN}
                max={ROOM_BARS_MAX}
                step={1}
                value={form.playBars}
                onChange={(event) => update("playBars", event.target.value)}
                className="tabular-nums"
              />
            </Field>
            <Field label="Thời gian chơi" htmlFor="flashback-minutes">
              <Select value={form.minutes} onValueChange={(value) => update("minutes", value)}>
                <SelectTrigger id="flashback-minutes" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROOM_MINUTE_OPTIONS.map((minutes) => (
                    <SelectItem key={minutes} value={String(minutes)}>
                      {minutes} phút
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Số người tối đa" htmlFor="flashback-max-players">
              <Select value={form.maxPlayers} onValueChange={(value) => update("maxPlayers", value)}>
                <SelectTrigger id="flashback-max-players" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROOM_PLAYER_OPTIONS.map((count) => (
                    <SelectItem key={count} value={String(count)}>
                      {count} người
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Xu cược mỗi người" htmlFor="flashback-stake">
              <Input
                id="flashback-stake"
                type="number"
                inputMode="numeric"
                min={ROOM_STAKE_STEP}
                step={ROOM_STAKE_STEP}
                value={form.stake}
                disabled={solo}
                onChange={(event) => update("stake", event.target.value)}
                className="tabular-nums"
              />
            </Field>
            <Field label="Mật khẩu phòng" htmlFor="flashback-password">
              <Input
                id="flashback-password"
                type="text"
                maxLength={ROOM_PASSWORD_MAX}
                autoComplete="off"
                placeholder="Không bắt buộc"
                value={form.password}
                onChange={(event) => update("password", event.target.value)}
                className={PLACEHOLDER}
              />
            </Field>
          </div>
          {error ? (
            <p role="alert" className="text-sm font-medium text-destructive">
              {error}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Hủy
            </Button>
            <Button type="submit" disabled={busy}>
              Tạo phòng
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** Hộp nhập mật khẩu của một phòng có khoá. */
export function PasswordDialog({
  code,
  onJoin,
  onClose,
}: {
  code: string
  onJoin: (password: string) => Promise<JoinOutcome>
  onClose: () => void
}) {
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    const outcome = await onJoin(password)
    setBusy(false)
    if (outcome.status === "password") setError(outcome.message || "Mật khẩu không đúng")
    // Vào được, hoặc server từ chối vì lý do khác (đã báo bằng thông báo): đóng hộp.
    else onClose()
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent showCloseButton={false} className="sm:max-w-[420px]" data-testid="flashback-password">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold">Phòng {code}</DialogTitle>
          <DialogDescription className="sr-only">Nhập mật khẩu để vào phòng</DialogDescription>
        </DialogHeader>
        <form onSubmit={(event) => void submit(event)} className="grid gap-4" noValidate>
          <Field label="Mật khẩu phòng" htmlFor="flashback-room-password">
            <Input
              id="flashback-room-password"
              type="password"
              autoComplete="off"
              autoFocus
              value={password}
              onChange={(event) => {
                setPassword(event.target.value)
                setError(null)
              }}
            />
          </Field>
          {error ? (
            <p role="alert" className="text-sm font-medium text-destructive">
              {error}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Hủy
            </Button>
            <Button type="submit" disabled={busy}>
              Vào phòng
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
