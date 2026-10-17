/**
 * Đổi tên đăng nhập một lần (DECISION 1). Tài khoản cũ được tự sinh tên từ email và
 * `username_change_allowed = true`; sau một lần đổi, hoặc khi đã là trưởng nhóm (tên đăng
 * nhập là mã giới thiệu), backend trả 422 `USERNAME_LOCKED`.
 */
import { useState, type FormEvent } from "react"
import { LoaderCircle, PencilLine } from "lucide-react"
import { toast } from "sonner"

import {
  checkUsernameAvailable,
  normalizeUsernameInput,
  USERNAME_AVAILABLE_MESSAGE,
  USERNAME_MAX_LENGTH,
  USERNAME_TAKEN_MESSAGE,
  usernameFormatProblem,
} from "@/components/layout/auth-identity"
import { FieldNote, type FieldNoteValue } from "@/components/layout/field-note"
import { useLiveCheck } from "@/components/layout/use-live-check"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useAuth } from "@/hooks/use-auth"
import { ApiError, errorMessage } from "@/lib/api"
import { useChangeUsername } from "./hooks"

export function UsernameChangeDialog({ current }: { current: string }) {
  const [open, setOpen] = useState(false)
  const change = useChangeUsername()
  return (
    <Dialog open={open} onOpenChange={next => { if (!change.isPending) setOpen(next) }}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <PencilLine />
          Đổi tên đăng nhập
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Đổi tên đăng nhập</DialogTitle>
          <DialogDescription>
            Tên đăng nhập hiện tại được tạo tự động từ email. Bạn chỉ đổi được một lần, sau đó tên
            mới không thể thay đổi nữa.
          </DialogDescription>
        </DialogHeader>
        {open && <UsernameChangeForm current={current} change={change} onDone={() => setOpen(false)} />}
      </DialogContent>
    </Dialog>
  )
}

function UsernameChangeForm({
  current,
  change,
  onDone,
}: {
  current: string
  change: ReturnType<typeof useChangeUsername>
  onDone: () => void
}) {
  const auth = useAuth()
  const [value, setValue] = useState("")
  const [touched, setTouched] = useState(false)
  const [fieldError, setFieldError] = useState("")
  const [error, setError] = useState("")

  const problem = value ? usernameFormatProblem(value) : null
  const unchanged = value === current
  const check = useLiveCheck(value && !problem && !unchanged ? value : null, checkUsernameAvailable)
  const ready = !!value && !problem && !unchanged && !fieldError
    && (check.status === "error" || (check.status === "done" && check.result))

  let note: FieldNoteValue
  if (fieldError) note = { tone: "error", text: fieldError }
  else if (problem && (touched || value.length >= 4)) note = { tone: "error", text: problem }
  else if (unchanged) note = { tone: "muted", text: "Đây là tên đăng nhập hiện tại của bạn." }
  else if (check.status === "checking") note = { tone: "checking", text: "Đang kiểm tra tên đăng nhập…" }
  else if (check.status === "done") note = check.result
    ? { tone: "success", text: USERNAME_AVAILABLE_MESSAGE }
    : { tone: "error", text: USERNAME_TAKEN_MESSAGE }
  else if (check.status === "error") note = { tone: "muted", text: "Chưa kiểm tra được lúc này. Hệ thống sẽ kiểm tra lại khi lưu." }
  else note = { tone: "muted", text: "4 đến 30 ký tự: chữ thường không dấu, số, dấu chấm hoặc gạch dưới." }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!ready || change.isPending) return
    setError("")
    try {
      await change.mutateAsync(value)
    } catch (cause) {
      if (cause instanceof ApiError && cause.code === "USERNAME_TAKEN") setFieldError(USERNAME_TAKEN_MESSAGE)
      else setError(errorMessage(cause))
      return
    }
    toast.success("Đã đổi tên đăng nhập.")
    onDone()
    try {
      await auth.refreshUser()
    } catch {
      // Tên mới đã lưu; header sẽ đồng bộ ở lần tải trang sau.
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-4" noValidate>
      <div className="grid gap-1.5">
        <Label htmlFor="settings-new-username">Tên đăng nhập mới</Label>
        <Input
          id="settings-new-username"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          maxLength={USERNAME_MAX_LENGTH}
          placeholder={current}
          value={value}
          disabled={change.isPending}
          aria-invalid={note.tone === "error"}
          aria-describedby="settings-new-username-note"
          onChange={event => {
            setValue(normalizeUsernameInput(event.target.value))
            setFieldError("")
            setError("")
          }}
          onBlur={() => setTouched(true)}
        />
        <FieldNote id="settings-new-username-note" note={note} />
      </div>
      {error && <p role="alert" className="rounded-sm bg-destructive/10 p-3 text-xs text-destructive">{error}</p>}
      <DialogFooter>
        <Button type="button" variant="ghost" disabled={change.isPending} onClick={onDone}>
          Huỷ
        </Button>
        <Button type="submit" disabled={!ready || change.isPending}>
          {change.isPending && <LoaderCircle className="animate-spin" />}
          Lưu tên đăng nhập
        </Button>
      </DialogFooter>
    </form>
  )
}
