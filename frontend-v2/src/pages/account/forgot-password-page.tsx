/**
 * `/quen-mat-khau` — yêu cầu liên kết đặt lại mật khẩu.
 *
 * `POST /auth/forgot-password` luôn trả 200 với đúng một thông điệp, kể cả khi
 * email không tồn tại (không cho phép dò tài khoản). Vì vậy UI chỉ hiển thị
 * nguyên văn thông điệp server trả về — không tự hứa "email đã được gửi" và
 * cũng không tiết lộ email nào có trong hệ thống.
 *
 * Lỗi thật vẫn được nói thẳng: 429 khi vượt giới hạn tần suất, lỗi mạng, hoặc
 * 422 khi email sai định dạng.
 */
import { useState, type FormEvent } from "react"
import { Link, useNavigate } from "react-router"
import { ArrowLeft, CircleCheck, LoaderCircle, MailCheck, TriangleAlert } from "lucide-react"

import { PanelState } from "@/components/layout/panel-state"
import { WorkspacePage } from "@/components/layout/workspace-page"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useAuth } from "@/hooks/use-auth"
import { errorMessage } from "@/lib/api"
import { useRequestPasswordReset } from "./hooks"

export function ForgotPasswordPage() {
  return (
    <WorkspacePage
      title="Quên mật khẩu"
      description="Nhập email tài khoản IQX — hệ thống sẽ gửi liên kết đặt lại mật khẩu nếu email tồn tại."
    >
      <ForgotPasswordBody />
    </WorkspacePage>
  )
}

function ForgotPasswordBody() {
  const auth = useAuth()
  const navigate = useNavigate()
  const request = useRequestPasswordReset()
  const [email, setEmail] = useState("")
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [serverMessage, setServerMessage] = useState("")
  const [error, setError] = useState("")

  if (auth.sessionError) {
    return (
      <PanelState
        title="Không xác minh được phiên đăng nhập"
        description={auth.sessionError.message}
        action={{ label: "Tải lại trang", onClick: () => window.location.reload() }}
      />
    )
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const value = email.trim()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      setError("Email không hợp lệ.")
      return
    }
    setError("")
    try {
      setServerMessage(await request.mutateAsync(value))
      setSentTo(value)
    } catch (cause) {
      setError(errorMessage(cause))
    }
  }

  if (sentTo) {
    return (
      <div className="mx-auto max-w-md space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CircleCheck className="size-4 text-primary" />
              Kiểm tra hộp thư của bạn
            </CardTitle>
            <CardDescription>{serverMessage}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              Địa chỉ đã yêu cầu: <span className="font-medium text-foreground">{sentTo}</span>
            </p>
            <p className="text-xs leading-5">
              Liên kết đặt lại mật khẩu có hiệu lực một lần và hết hạn sau ít giờ. Nếu chưa thấy
              email, hãy kiểm tra mục thư rác trước khi yêu cầu lại.
            </p>
          </CardContent>
          <CardFooter className="flex-wrap gap-2">
            <Button
              variant="outline"
              disabled={request.isPending}
              onClick={() => {
                setSentTo(null)
                setServerMessage("")
              }}
            >
              <MailCheck />
              Gửi lại / đổi email khác
            </Button>
            <Button variant="ghost" asChild>
              <Link to="/">Về trang chủ</Link>
            </Button>
          </CardFooter>
        </Card>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-md space-y-4">
      {auth.isAuthenticated && auth.user && (
        <Alert>
          <TriangleAlert />
          <AlertTitle>Bạn đang đăng nhập</AlertTitle>
          <AlertDescription>
            Đổi mật khẩu sẽ thu hồi mọi phiên đăng nhập, kể cả phiên hiện tại của {auth.user.email}.
            Nếu chỉ muốn xem hồ sơ, hãy vào{" "}
            <Link className="underline" to="/cai-dat">
              cài đặt tài khoản
            </Link>
            .
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MailCheck className="size-4 text-primary" />
            Gửi liên kết đặt lại
          </CardTitle>
          <CardDescription>
            Vì lý do bảo mật, hệ thống trả về cùng một thông báo dù email có tồn tại hay không.
          </CardDescription>
        </CardHeader>
        <form onSubmit={submit}>
          <CardContent className="space-y-4">
            <div className="grid gap-1.5">
              <Label htmlFor="forgot-email">Email tài khoản</Label>
              <Input
                id="forgot-email"
                name="email"
                type="email"
                required
                autoComplete="email"
                placeholder="name@company.com"
                value={email}
                disabled={request.isPending}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>
            {error && (
              <Alert variant="destructive">
                <TriangleAlert />
                <AlertTitle>Không gửi được yêu cầu</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </CardContent>
          <CardFooter className="flex-wrap gap-2">
            <Button type="submit" disabled={request.isPending}>
              {request.isPending && <LoaderCircle className="animate-spin" />}
              {request.isPending ? "Đang gửi…" : "Gửi liên kết đặt lại"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => (auth.isAuthenticated ? navigate("/cai-dat") : navigate("/"))}
            >
              <ArrowLeft />
              Quay lại
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}
