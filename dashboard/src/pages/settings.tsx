import { useState, useEffect, type FormEvent } from "react"
import { useNavigate } from "react-router"
import {
  User,
  Mail,
  Phone,
  Lock,
  Crown,
  Shield,
  Clock,
  ChevronRight,
  Save,
  Loader2,
  Eye,
  EyeOff,
  ArrowLeft,
  CreditCard,
  Calendar,
  CheckCircle2,
  AlertCircle,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { useAuth } from "@/contexts/auth-context"
import { usersApi, paymentsApi, type UserProfile } from "@/lib/api"
import { toast } from "sonner"
import type { HTTPError } from "ky"

async function getErrorMessage(err: unknown): Promise<string> {
  try {
    const httpErr = err as HTTPError
    if (httpErr?.response) {
      const body = (await httpErr.response.json()) as { message: string | string[] }
      return Array.isArray(body.message) ? body.message[0] : body.message
    }
  } catch { /* */ }
  return "Không thể kết nối server"
}

function fmtDate(dateStr: string | null) {
  if (!dateStr) return "—"
  return new Date(dateStr).toLocaleDateString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  })
}

export default function SettingsPage() {
  const navigate = useNavigate()
  const { user, isAuthenticated, setShowAuthModal, setAuthModalTab } = useAuth()
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [isLoadingProfile, setIsLoadingProfile] = useState(true)

  // Profile form
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [phone, setPhone] = useState("")
  const [isSavingProfile, setIsSavingProfile] = useState(false)

  // Password form
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [showPw, setShowPw] = useState(false)
  const [isSavingPassword] = useState(false)

  // Payment history
  const [payments, setPayments] = useState<any[]>([])
  const [isLoadingPayments, setIsLoadingPayments] = useState(false)

  useEffect(() => {
    if (!isAuthenticated) {
      setAuthModalTab("login")
      setShowAuthModal(true)
      navigate("/")
      return
    }
    loadProfile()
    loadPayments()
  }, [isAuthenticated])

  async function loadProfile() {
    try {
      const res = await usersApi.getProfile()
      setProfile(res.data)
      setFirstName(res.data.firstName || "")
      setLastName(res.data.lastName || "")
      setPhone(res.data.phone || "")
    } catch {
      toast.error("Không thể tải thông tin tài khoản")
    } finally {
      setIsLoadingProfile(false)
    }
  }

  async function loadPayments() {
    setIsLoadingPayments(true)
    try {
      const res = await paymentsApi.getHistory(1, 10)
      setPayments(res.data.items)
    } catch { /* */ }
    finally { setIsLoadingPayments(false) }
  }

  async function handleSaveProfile(e: FormEvent) {
    e.preventDefault()
    setIsSavingProfile(true)
    try {
      const res = await usersApi.updateProfile({
        firstName: firstName || undefined,
        lastName: lastName || undefined,
        phone: phone || undefined,
      })
      setProfile(res.data)
      localStorage.setItem("user", JSON.stringify({
        ...user,
        fullName: res.data.fullName,
        firstName: res.data.firstName,
        lastName: res.data.lastName,
        phone: res.data.phone,
      }))
      toast.success("Đã cập nhật thông tin!")
    } catch (err) {
      toast.error(await getErrorMessage(err))
    } finally {
      setIsSavingProfile(false)
    }
  }

  async function handleChangePassword(e: FormEvent) {
    e.preventDefault()
    // TODO: Backend does not have self-change-password endpoint
    // Do not send password via PATCH /users/me
    toast.error("Tính năng đổi mật khẩu chưa sẵn sàng trên hệ thống mới")
  }

  const isPremium = profile?.role === "premium" || profile?.role === "admin"
  const premiumExpiry = profile?.premiumExpiresAt
  const isExpired = premiumExpiry ? new Date(premiumExpiry) < new Date() : false

  if (isLoadingProfile) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="size-6 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Top bar */}
      <div className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-20">
        <div className="max-w-3xl mx-auto flex items-center gap-3 px-4 h-12">
          <Button variant="ghost" size="icon" className="size-8" onClick={() => navigate(-1)}>
            <ArrowLeft className="size-4" />
          </Button>
          <h1 className="text-sm font-semibold">Cài đặt tài khoản</h1>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">

        {/* ── Subscription Status Card ── */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className={`px-5 py-4 ${isPremium && !isExpired ? "bg-gradient-to-r from-amber-500/10 to-orange-500/10" : "bg-muted/30"}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`size-10 rounded-xl flex items-center justify-center ${isPremium && !isExpired ? "bg-gradient-to-br from-amber-500 to-orange-500" : "bg-muted"}`}>
                  <Crown className={`size-5 ${isPremium && !isExpired ? "text-white" : "text-muted-foreground"}`} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">
                      {isPremium && !isExpired ? "Premium" : "Gói miễn phí"}
                    </span>
                    <Badge variant={isPremium && !isExpired ? "default" : "secondary"} className="text-[10px]">
                      {isPremium && !isExpired ? "Đang hoạt động" : "Free"}
                    </Badge>
                    {isExpired && (
                      <Badge variant="destructive" className="text-[10px]">Hết hạn</Badge>
                    )}
                  </div>
                  {premiumExpiry && !isExpired && (
                    <p className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1">
                      <Calendar className="size-3" />
                      Hết hạn: {fmtDate(premiumExpiry)}
                    </p>
                  )}
                </div>
              </div>
              {(!isPremium || isExpired) && (
                <Button
                  size="sm"
                  onClick={() => navigate("/nang-cap")}
                  className="h-8 text-xs gap-1.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-bold border-none"
                >
                  <Crown className="size-3.5" />
                  Nâng cấp Premium
                  <ChevronRight className="size-3" />
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* ── Profile Section ── */}
        <div className="rounded-xl border border-border bg-card">
          <div className="px-5 py-3.5 border-b border-border flex items-center gap-2">
            <User className="size-4 text-primary" />
            <span className="text-sm font-semibold">Thông tin cá nhân</span>
          </div>
          <form onSubmit={handleSaveProfile} className="p-5 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="s-email" className="text-xs text-muted-foreground">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                <Input
                  id="s-email"
                  value={profile?.email || ""}
                  disabled
                  className="h-9 pl-9 text-sm bg-muted/50 cursor-not-allowed opacity-70"
                />
              </div>
              <p className="text-[10px] text-muted-foreground">Email không thể thay đổi</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="s-fname" className="text-xs">Họ</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                  <Input
                    id="s-fname"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="Nguyễn"
                    className="h-10 pl-9 text-sm"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="s-lname" className="text-xs">Tên</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                  <Input
                    id="s-lname"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="Văn A"
                    className="h-10 pl-9 text-sm"
                  />
                </div>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="s-phone" className="text-xs">Số điện thoại</Label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                <Input
                  id="s-phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+84901234567"
                  className="h-10 pl-9 text-sm"
                />
              </div>
              <p className="text-[10px] text-muted-foreground">Dùng định dạng E.164, ví dụ: +84901234567</p>
            </div>

            <div className="flex justify-end">
              <Button type="submit" size="sm" disabled={isSavingProfile} className="h-8 text-xs gap-1.5">
                {isSavingProfile ? <Loader2 className="size-3 animate-spin" /> : <Save className="size-3" />}
                Lưu thay đổi
              </Button>
            </div>
          </form>
        </div>

        {/* ── Password Section ── */}
        <div className="rounded-xl border border-border bg-card">
          <div className="px-5 py-3.5 border-b border-border flex items-center gap-2">
            <Shield className="size-4 text-primary" />
            <span className="text-sm font-semibold">Bảo mật</span>
          </div>
          <form onSubmit={handleChangePassword} className="p-5 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="s-newpw" className="text-xs">Mật khẩu mới</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                  <Input
                    id="s-newpw"
                    type={showPw ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="••••••••"
                    minLength={6}
                    required
                    className="h-10 pl-9 pr-9 text-sm"
                  />
                  <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" tabIndex={-1}>
                    {showPw ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                  </button>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="s-confirmpw" className="text-xs">Xác nhận mật khẩu</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                  <Input
                    id="s-confirmpw"
                    type={showPw ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    minLength={6}
                    required
                    className="h-10 pl-9 text-sm"
                  />
                </div>
              </div>
            </div>
            <div className="flex justify-end">
              <Button type="submit" size="sm" disabled={isSavingPassword} variant="outline" className="h-8 text-xs gap-1.5">
                {isSavingPassword ? <Loader2 className="size-3 animate-spin" /> : <Lock className="size-3" />}
                Đổi mật khẩu
              </Button>
            </div>
          </form>
        </div>

        {/* ── Payment History ── */}
        <div className="rounded-xl border border-border bg-card">
          <div className="px-5 py-3.5 border-b border-border flex items-center gap-2">
            <CreditCard className="size-4 text-primary" />
            <span className="text-sm font-semibold">Lịch sử thanh toán</span>
          </div>
          <div className="p-5">
            {isLoadingPayments ? (
              <div className="flex justify-center py-8">
                <Loader2 className="size-4 animate-spin text-muted-foreground" />
              </div>
            ) : payments.length === 0 ? (
              <div className="text-center py-8">
                <CreditCard className="size-8 mx-auto text-muted-foreground/30 mb-2" />
                <p className="text-xs text-muted-foreground">Chưa có giao dịch nào</p>
              </div>
            ) : (
              <div className="space-y-2">
                {payments.map((p: any) => (
                  <div key={p.id} className="flex items-center justify-between rounded-lg border border-border p-3 text-xs">
                    <div className="flex items-center gap-3">
                      <div className={`size-7 rounded-lg flex items-center justify-center ${p.status === "COMPLETED" ? "bg-emerald-500/10" : p.status === "PENDING" ? "bg-amber-500/10" : "bg-destructive/10"}`}>
                        {p.status === "COMPLETED" ? (
                          <CheckCircle2 className="size-3.5 text-emerald-500" />
                        ) : p.status === "PENDING" ? (
                          <Clock className="size-3.5 text-amber-500" />
                        ) : (
                          <AlertCircle className="size-3.5 text-destructive" />
                        )}
                      </div>
                      <div>
                        <p className="font-medium">{p.description}</p>
                        <p className="text-muted-foreground">{fmtDate(p.createdAt)}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold">{new Intl.NumberFormat("vi-VN").format(p.amount)} ₫</p>
                      <Badge variant={p.status === "COMPLETED" ? "default" : "secondary"} className="text-[9px]">
                        {p.status === "COMPLETED" ? "Thành công" : p.status === "PENDING" ? "Chờ xử lý" : "Thất bại"}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Account info footer */}
        <div className="text-center pb-8">
          <p className="text-[10px] text-muted-foreground">
            Tham gia từ {fmtDate(profile?.createdAt || null)} · ID: {profile?.id?.slice(0, 8)}
          </p>
        </div>
      </div>
    </div>
  )
}
