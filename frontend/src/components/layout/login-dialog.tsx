import { useEffect, useRef, useState, type FormEvent } from "react"
import { Crown, LoaderCircle, LogOut, Settings2, ShieldCheck, UserRound } from "lucide-react"
import { Link, useLocation } from "react-router"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useAuth } from "@/hooks/use-auth"
import { errorMessage } from "@/lib/api"
import { normalizeReferralCode } from "./referral"

export function LoginDialog() {
  const auth = useAuth()
  const location = useLocation()
  const lastAutoOpenedReferral = useRef<string | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")
  const [referralError, setReferralError] = useState("")
  const [remember, setRemember] = useState(true)
  const queryReferralValue = new URLSearchParams(location.search).get("ref")?.trim() ?? ""
  const queryReferralCode = normalizeReferralCode(queryReferralValue)
  const invalidReferral = queryReferralValue.length > 0 && !queryReferralCode

  useEffect(() => {
    if (auth.isLoading || auth.user || (!queryReferralCode && !invalidReferral)) return
    const referralMarker = queryReferralCode ?? queryReferralValue
    if (lastAutoOpenedReferral.current === referralMarker) return
    lastAutoOpenedReferral.current = referralMarker
    auth.openAuth("register", queryReferralCode ?? undefined)
  }, [auth, auth.isLoading, auth.user, invalidReferral, queryReferralCode, queryReferralValue])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const enteredReferralCode = String(form.get("referral_code") ?? "").trim()
    const referralCode = normalizeReferralCode(enteredReferralCode)
    if (auth.authMode === "register" && enteredReferralCode && !referralCode) {
      setReferralError("Mã giới thiệu phải có 3 đến 32 ký tự, chỉ gồm chữ, số, dấu gạch ngang hoặc gạch dưới.")
      event.currentTarget.querySelector<HTMLInputElement>("[name=referral_code]")?.focus()
      return
    }
    setPending(true)
    setError("")
    setReferralError("")
    try {
      const email = String(form.get("email") ?? "").trim()
      const password = String(form.get("password") ?? "")
      if (auth.authMode === "register") await auth.register({ email, password, full_name: String(form.get("full_name") ?? "").trim(), ...(referralCode ? { referral_code: referralCode } : {}) })
      else await auth.login(email, password, remember)
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setPending(false)
    }
  }

  return (
    <>
      {auth.user ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="max-w-40"><UserRound /><span className="truncate">{auth.user.full_name || auth.user.email}</span></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuLabel className="break-all">{auth.user.email}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild><Link to="/cai-dat"><Settings2 />Cài đặt tài khoản</Link></DropdownMenuItem>
            <DropdownMenuItem asChild><Link to="/nang-cap"><Crown />Gói Premium</Link></DropdownMenuItem>
            {auth.user.role === "admin" && <DropdownMenuItem asChild><Link to="/admin"><ShieldCheck />Quản trị</Link></DropdownMenuItem>}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => { void auth.logout().catch(cause => toast.error(errorMessage(cause))) }}><LogOut />Đăng xuất</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : <Button disabled={auth.isLoading} onClick={() => { setError(""); setReferralError(""); auth.openAuth() }}>Đăng nhập</Button>}
      <Dialog open={auth.authOpen} onOpenChange={open => { if (!pending) { auth.setAuthOpen(open); setError(""); setReferralError("") } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{auth.authMode === "login" ? "Đăng nhập IQX" : "Tạo tài khoản IQX"}</DialogTitle>
            <DialogDescription>Lưu hành trình học và thực hành giao dịch bằng tiền mô phỏng.</DialogDescription>
          </DialogHeader>
          <Tabs value={auth.authMode} onValueChange={mode => { if (!pending) { auth.openAuth(mode === "register" ? "register" : "login"); setError(""); setReferralError("") } }}>
            <TabsList className="w-full"><TabsTrigger value="login">Đăng nhập</TabsTrigger><TabsTrigger value="register">Đăng ký</TabsTrigger></TabsList>
          </Tabs>
          <form key={auth.authMode} onSubmit={submit} className="grid gap-4">
            {auth.authMode === "register" && <div className="grid gap-1.5"><Label htmlFor="auth-name">Họ và tên</Label><Input id="auth-name" name="full_name" autoComplete="name" required disabled={pending} /></div>}
            <div className="grid gap-1.5"><Label htmlFor="auth-email">Email</Label><Input id="auth-email" name="email" type="email" autoComplete="email" required disabled={pending} /></div>
            {auth.authMode === "register" && <div className="grid gap-1.5">
              <Label htmlFor="auth-referral-code">Mã giới thiệu (không bắt buộc)</Label>
              <Input
                key={queryReferralValue || auth.referralCode || "manual"}
                id="auth-referral-code"
                name="referral_code"
                defaultValue={queryReferralCode ?? (queryReferralValue || auth.referralCode || "")}
                placeholder="Nhập mã giới thiệu nếu có"
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                maxLength={32}
                disabled={pending}
                aria-invalid={!!referralError}
                aria-describedby={referralError ? "auth-referral-help auth-referral-error" : "auth-referral-help"}
                onChange={() => { setReferralError(""); setError("") }}
              />
              <p id="auth-referral-help" className="text-xs text-muted-foreground">Có thể để trống nếu bạn không có mã giới thiệu.</p>
              {referralError && <p id="auth-referral-error" role="alert" className="text-xs text-destructive">{referralError}</p>}
            </div>}
            <div className="grid gap-1.5"><Label htmlFor="auth-password">Mật khẩu</Label><Input id="auth-password" name="password" type="password" autoComplete={auth.authMode === "login" ? "current-password" : "new-password"} required minLength={auth.authMode === "register" ? 8 : undefined} disabled={pending} />{auth.authMode === "register" && <p className="text-xs text-muted-foreground">Tối thiểu 8 ký tự, có chữ hoa, chữ thường, số và ký tự đặc biệt.</p>}</div>
            {auth.authMode === "login" && <div className="flex items-center gap-2"><Checkbox id="auth-remember" checked={remember} onCheckedChange={value => setRemember(value === true)} disabled={pending} /><Label htmlFor="auth-remember">Ghi nhớ đăng nhập</Label></div>}
            {auth.authMode === "login" && <Link to="/quen-mat-khau" onClick={() => auth.setAuthOpen(false)} className="w-fit text-sm text-primary underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-ring">Quên mật khẩu?</Link>}
            {error && <p role="alert" className="rounded-sm bg-destructive/10 p-3 text-xs text-destructive">{error}</p>}
            <Button type="submit" disabled={pending} className="w-full">{pending && <LoaderCircle className="animate-spin" />}{auth.authMode === "login" ? "Đăng nhập" : "Tạo tài khoản"}</Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
