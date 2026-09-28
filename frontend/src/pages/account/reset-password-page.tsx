/**
 * `/reset-password?token=...` — đặt mật khẩu mới bằng token trong email.
 *
 * Hợp đồng URL: backend gửi liên kết
 * `${EMAIL_LINK_BASE_URL || APP_PUBLIC_URL}/api/v2/auth/reset-password?token=<jwt>`
 * (`EmailService.resetLink`) — token nằm ở query param tên `token` và là JWT gắn
 * với hash mật khẩu hiện tại, nên chỉ dùng được MỘT lần. Route SPA này đọc đúng
 * param đó để liên kết cũ có thể trỏ sang app khi cấu hình đổi.
 *
 * `POST /auth/reset-password`:
 * - 200 → mật khẩu đã đổi, mọi refresh token bị thu hồi (phải đăng nhập lại).
 * - 400 → token sai/hết hạn/đã dùng (thông điệp chung, không tiết lộ lý do).
 * - 422 → mật khẩu không đạt chính sách; danh sách điều kiện dưới đây khớp
 *   `src/common/password.ts` của backend-v2 nên lỗi thường được chặn từ trước.
 */
import { useState, type FormEvent } from "react"
import { Link, useNavigate, useSearchParams } from "react-router"
import {
  Check,
  CircleAlert,
  CircleCheck,
  KeyRound,
  Link2,
  LoaderCircle,
  TriangleAlert,
  X,
} from "lucide-react"

import { PanelState } from "@/components/layout/panel-state"
import { WorkspacePage } from "@/components/layout/workspace-page"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useAuth } from "@/hooks/use-auth"
import { ApiError, errorMessage } from "@/lib/api"
import { passwordChecks } from "./api"
import { useResetPassword } from "./hooks"

export function ResetPasswordPage() {
  return (
    <WorkspacePage
      title="Đặt lại mật khẩu"
      description="Chọn mật khẩu mới cho tài khoản IQX của bạn. Liên kết trong email chỉ dùng được một lần."
    >
      <ResetPasswordBody />
    </WorkspacePage>
  )
}

function ResetPasswordBody() {
  const auth = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const token = (params.get("token") ?? "").trim()
  const reset = useResetPassword()
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [error, setError] = useState("")
  const [linkInvalid, setLinkInvalid] = useState(false)
  const [successMessage, setSuccessMessage] = useState("")

  if (auth.sessionError) {
    return (
      <PanelState
        title="Không xác minh được phiên đăng nhập"
        description={auth.sessionError.message}
        action={{ label: "Tải lại trang", onClick: () => window.location.reload() }}
      />
    )
  }

  if (!token || linkInvalid) {
    return (
      <div className="mx-auto max-w-md">
        <Alert variant="destructive">
          <Link2 />
          <AlertTitle>Liên kết đặt lại mật khẩu không hợp lệ</AlertTitle>
          <AlertDescription>
            {!token
              ? "Địa chỉ này thiếu tham số token. Hãy mở liên kết trong email đặt lại mật khẩu, hoặc yêu cầu một liên kết mới."
              : "Liên kết đã hết hạn, đã được dùng, hoặc mật khẩu của bạn vừa thay đổi. Hãy yêu cầu một liên kết mới."}
          </AlertDescription>
          <div className="col-start-2 mt-3 flex flex-wrap gap-2">
            <Button size="sm" asChild>
              <Link to="/quen-mat-khau">Yêu cầu liên kết mới</Link>
            </Button>
            <Button size="sm" variant="outline" asChild>
              <Link to="/">Về trang chủ</Link>
            </Button>
          </div>
        </Alert>
      </div>
    )
  }

  if (successMessage) {
    return (
      <div className="mx-auto max-w-md">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CircleCheck className="size-4 text-primary" />
              Mật khẩu đã được đặt lại
            </CardTitle>
            <CardDescription>{successMessage}</CardDescription>
          </CardHeader>
          <CardContent className="text-xs leading-5 text-muted-foreground">
            Mọi phiên đăng nhập của tài khoản đã bị thu hồi trên máy chủ, nên bạn cần đăng nhập lại
            bằng mật khẩu mới.
          </CardContent>
          <CardFooter className="flex-wrap gap-2">
            <Button
              onClick={() => {
                auth.openAuth("login")
                navigate("/")
              }}
            >
              Đăng nhập ngay
            </Button>
            <Button variant="ghost" asChild>
              <Link to="/">Về trang chủ</Link>
            </Button>
          </CardFooter>
        </Card>
      </div>
    )
  }

  const checks = passwordChecks(password)
  const ready = password !== "" && checks.every((entry) => entry.met)
  const mismatch = confirm !== "" && confirm !== password
  const canSubmit = ready && confirm === password && !reset.isPending

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const failed = checks.find((entry) => !entry.met)
    if (failed) {
      setError(failed.label)
      return
    }
    if (confirm !== password) {
      setError("Hai mật khẩu không khớp.")
      return
    }
    setError("")
    try {
      setSuccessMessage(await reset.mutateAsync({ token, password }))
    } catch (cause) {
      // 400 = token hỏng/đã dùng → form vô nghĩa, chuyển sang màn "liên kết lỗi".
      if (cause instanceof ApiError && cause.status === 400) setLinkInvalid(true)
      else setError(errorMessage(cause))
    }
  }

  return (
    <div className="mx-auto max-w-md">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="size-4 text-primary" />
            Mật khẩu mới
          </CardTitle>
          <CardDescription>
            Đặt mật khẩu mới cho {auth.user?.email ?? "tài khoản IQX của bạn"}.
          </CardDescription>
        </CardHeader>
        <form onSubmit={submit}>
          <CardContent className="space-y-4">
            <div className="grid gap-1.5">
              <Label htmlFor="reset-password">Mật khẩu mới</Label>
              <Input
                id="reset-password"
                type="password"
                autoComplete="new-password"
                required
                value={password}
                disabled={reset.isPending}
                onChange={(event) => setPassword(event.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="reset-confirm">Nhập lại mật khẩu mới</Label>
              <Input
                id="reset-confirm"
                type="password"
                autoComplete="new-password"
                required
                value={confirm}
                disabled={reset.isPending}
                aria-invalid={mismatch}
                onChange={(event) => setConfirm(event.target.value)}
              />
              {mismatch && <p className="text-xs text-destructive">Hai mật khẩu không khớp.</p>}
            </div>

            <ul className="space-y-1.5 rounded-sm bg-muted/40 p-3">
              {checks.map((entry) => (
                <li key={entry.label} className="flex items-center gap-2 text-xs">
                  {entry.met ? (
                    <Check className="size-3.5 text-primary" />
                  ) : (
                    <X className="size-3.5 text-muted-foreground" />
                  )}
                  <span className={entry.met ? "text-foreground" : "text-muted-foreground"}>
                    {entry.label}
                  </span>
                </li>
              ))}
            </ul>

            {error && (
              <Alert variant="destructive">
                <TriangleAlert />
                <AlertTitle>Không đặt lại được mật khẩu</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </CardContent>
          <CardFooter className="flex-wrap gap-2">
            <Button type="submit" disabled={!canSubmit}>
              {reset.isPending && <LoaderCircle className="animate-spin" />}
              {reset.isPending ? "Đang xử lý…" : "Đặt lại mật khẩu"}
            </Button>
            <Button type="button" variant="ghost" asChild>
              <Link to="/quen-mat-khau">
                <CircleAlert />
                Liên kết không dùng được?
              </Link>
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}
