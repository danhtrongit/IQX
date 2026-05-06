import { useState, type FormEvent } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useAuth } from "@/contexts/auth-context"
import { toast } from "sonner"
import {
  Eye,
  EyeOff,
  Mail,
  Lock,
  User,
  Phone,
  Loader2,
  ArrowRight,
  ShieldCheck,
} from "lucide-react"
import type { HTTPError } from "ky"

interface ApiError {
  detail?: string | Array<{ msg: string }>
  message?: string | string[]
  statusCode?: number
}

async function getErrorMessage(err: unknown): Promise<string> {
  try {
    const httpErr = err as HTTPError
    if (httpErr?.response) {
      const body = (await httpErr.response.json()) as ApiError

      // FastAPI format: { detail: "..." } or { detail: [{ msg: "..." }] }
      if (body.detail) {
        if (typeof body.detail === "string") return body.detail
        if (Array.isArray(body.detail) && body.detail.length > 0) {
          return body.detail.map((e) => e.msg).join(", ")
        }
      }

      // Legacy format: { message: "..." | ["..."] }
      if (body.message) {
        return Array.isArray(body.message) ? body.message[0] : body.message
      }
    }
  } catch {
    // JSON parse failed
  }
  return "Không thể kết nối server"
}

export function AuthModal() {
  const {
    showAuthModal,
    setShowAuthModal,
    authModalTab,
    setAuthModalTab,
    login,
    register,
    isLoading,
  } = useAuth()

  return (
    <Dialog open={showAuthModal} onOpenChange={setShowAuthModal}>
      <DialogContent
        className="sm:max-w-[420px] p-0 gap-0 overflow-hidden border-border/50 bg-card"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {/* Decorative top gradient */}
        <div className="h-1 w-full bg-gradient-to-r from-primary via-primary/60 to-primary/20" />

        <div className="p-6 pb-2">
          <DialogHeader className="space-y-1.5 text-left">
            <div className="flex items-center gap-2 mb-1">
              <div className="size-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground text-sm font-black tracking-tighter">
                IQ
              </div>
              <DialogTitle className="text-lg font-bold tracking-tight">
                {authModalTab === "login"
                  ? "Đăng nhập vào IQX"
                  : "Tạo tài khoản IQX"}
              </DialogTitle>
            </div>
            <DialogDescription className="text-xs text-muted-foreground">
              {authModalTab === "login"
                ? "Truy cập bảng phân tích, công cụ AI và danh mục đầu tư cá nhân"
                : "Bắt đầu hành trình đầu tư thông minh cùng IQX"}
            </DialogDescription>
          </DialogHeader>
        </div>

        {/* Tab Switcher */}
        <div className="px-6 pb-4">
          <div className="flex rounded-lg bg-muted p-0.5">
            <button
              type="button"
              onClick={() => setAuthModalTab("login")}
              className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all duration-200 ${
                authModalTab === "login"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Đăng nhập
            </button>
            <button
              type="button"
              onClick={() => setAuthModalTab("register")}
              className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all duration-200 ${
                authModalTab === "register"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Đăng ký
            </button>
          </div>
        </div>

        {/* Form Content */}
        <div className="px-6 pb-6">
          {authModalTab === "login" ? (
            <LoginForm isLoading={isLoading} onSubmit={login} />
          ) : (
            <RegisterForm isLoading={isLoading} onSubmit={register} />
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-border/50 bg-muted/30">
          <div className="flex items-center justify-center gap-1.5 text-[10px] text-muted-foreground">
            <ShieldCheck className="size-3" />
            <span>Dữ liệu được bảo mật với mã hóa SSL 256-bit</span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function LoginForm({
  isLoading,
  onSubmit,
}: {
  isLoading: boolean
  onSubmit: (p: { email: string; password: string }) => Promise<void>
}) {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPw, setShowPw] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    try {
      await onSubmit({ email, password })
      toast.success("Đăng nhập thành công!")
    } catch (err) {
      const msg = await getErrorMessage(err)
      toast.error(msg)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="login-email" className="text-xs font-medium">
          Email
        </Label>
        <div className="relative">
          <Mail className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
          <Input
            id="login-email"
            type="email"
            placeholder="name@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="h-9 pl-8 text-sm"
            autoComplete="email"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="login-password" className="text-xs font-medium">
          Mật khẩu
        </Label>
        <div className="relative">
          <Lock className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
          <Input
            id="login-password"
            type={showPw ? "text" : "password"}
            placeholder="••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            className="h-9 pl-8 pr-9 text-sm"
            autoComplete="current-password"
          />
          <button
            type="button"
            onClick={() => setShowPw(!showPw)}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            tabIndex={-1}
          >
            {showPw ? (
              <EyeOff className="size-3.5" />
            ) : (
              <Eye className="size-3.5" />
            )}
          </button>
        </div>
      </div>

      <Button
        type="submit"
        disabled={isLoading}
        className="w-full h-9 text-sm font-medium group"
      >
        {isLoading ? (
          <>
            <Loader2 className="size-3.5 animate-spin mr-1.5" />
            Đang xử lý...
          </>
        ) : (
          <>
            Đăng nhập
            <ArrowRight className="size-3.5 ml-1.5 transition-transform group-hover:translate-x-0.5" />
          </>
        )}
      </Button>
    </form>
  )
}

function RegisterForm({
  isLoading,
  onSubmit,
}: {
  isLoading: boolean
  onSubmit: (p: {
    email: string
    password: string
    firstName: string
    lastName: string
    phone?: string
  }) => Promise<void>
}) {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [phone, setPhone] = useState("")
  const [showPw, setShowPw] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()

    if (password !== confirmPassword) {
      toast.error("Mật khẩu xác nhận không khớp")
      return
    }

    if (!firstName.trim() || !lastName.trim()) {
      toast.error("Vui lòng nhập họ và tên")
      return
    }

    try {
      await onSubmit({
        email,
        password,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        ...(phone && { phone }),
      })
      toast.success("Đăng ký thành công! Chào mừng bạn đến với IQX 🎉")
    } catch (err) {
      const msg = await getErrorMessage(err)
      toast.error(msg)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="grid grid-cols-2 gap-2.5">
        <div className="space-y-1.5">
          <Label htmlFor="reg-fname" className="text-xs font-medium">
            Họ <span className="text-destructive">*</span>
          </Label>
          <div className="relative">
            <User className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
            <Input
              id="reg-fname"
              type="text"
              placeholder="Nguyễn"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              required
              className="h-9 pl-8 text-sm"
              autoComplete="given-name"
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="reg-lname" className="text-xs font-medium">
            Tên <span className="text-destructive">*</span>
          </Label>
          <div className="relative">
            <User className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
            <Input
              id="reg-lname"
              type="text"
              placeholder="Văn A"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              required
              className="h-9 pl-8 text-sm"
              autoComplete="family-name"
            />
          </div>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="reg-email" className="text-xs font-medium">
          Email <span className="text-destructive">*</span>
        </Label>
        <div className="relative">
          <Mail className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
          <Input
            id="reg-email"
            type="email"
            placeholder="name@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="h-9 pl-8 text-sm"
            autoComplete="email"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="reg-phone" className="text-xs font-medium">
          Số điện thoại{" "}
          <span className="text-muted-foreground font-normal">(tuỳ chọn)</span>
        </Label>
        <div className="relative">
          <Phone className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
          <Input
            id="reg-phone"
            type="tel"
            placeholder="0912 345 678"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="h-9 pl-8 text-sm"
            autoComplete="tel"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <div className="space-y-1.5">
          <Label htmlFor="reg-password" className="text-xs font-medium">
            Mật khẩu <span className="text-destructive">*</span>
          </Label>
          <div className="relative">
            <Lock className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
            <Input
              id="reg-password"
              type={showPw ? "text" : "password"}
              placeholder="••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className="h-9 pl-8 pr-8 text-sm"
              autoComplete="new-password"
            />
            <button
              type="button"
              onClick={() => setShowPw(!showPw)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              tabIndex={-1}
            >
              {showPw ? (
                <EyeOff className="size-3" />
              ) : (
                <Eye className="size-3" />
              )}
            </button>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="reg-confirm" className="text-xs font-medium">
            Xác nhận <span className="text-destructive">*</span>
          </Label>
          <div className="relative">
            <Lock className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
            <Input
              id="reg-confirm"
              type={showPw ? "text" : "password"}
              placeholder="••••••"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={6}
              className="h-9 pl-8 text-sm"
              autoComplete="new-password"
            />
          </div>
        </div>
      </div>

      <Button
        type="submit"
        disabled={isLoading}
        className="w-full h-9 text-sm font-medium group"
      >
        {isLoading ? (
          <>
            <Loader2 className="size-3.5 animate-spin mr-1.5" />
            Đang xử lý...
          </>
        ) : (
          <>
            Tạo tài khoản
            <ArrowRight className="size-3.5 ml-1.5 transition-transform group-hover:translate-x-0.5" />
          </>
        )}
      </Button>
    </form>
  )
}
