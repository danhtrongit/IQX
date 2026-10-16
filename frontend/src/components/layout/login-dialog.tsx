import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react"
import { Crown, LoaderCircle, LogOut, Settings2, ShieldCheck, UserRound } from "lucide-react"
import { Link, useLocation } from "react-router"
import { toast } from "sonner"

import { BrainWaveLogo } from "@/components/brand/brain-wave-logo"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useAuth } from "@/hooks/use-auth"
import { ApiError, errorMessage } from "@/lib/api"
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, PASSWORD_SPECIAL_CHARACTERS, passwordViolation } from "@/pages/account/api"
import {
  checkReferralCode,
  checkUsernameAvailable,
  normalizeUsernameInput,
  normalizeVietnamMobile,
  PHONE_INVALID_MESSAGE,
  REFERRAL_INVALID_MESSAGE,
  referralValidMessage,
  USERNAME_AVAILABLE_MESSAGE,
  USERNAME_MAX_LENGTH,
  USERNAME_TAKEN_MESSAGE,
  usernameFormatProblem,
} from "./auth-identity"
import { FieldNote, type FieldNoteValue } from "./field-note"
import { normalizeReferralCode } from "./referral"
import { useLiveCheck } from "./use-live-check"

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function LoginDialog() {
  const auth = useAuth()
  const location = useLocation()
  const lastAutoOpenedReferral = useRef<string | null>(null)
  const [pending, setPending] = useState(false)
  const queryReferralValue = new URLSearchParams(location.search).get("ref")?.trim() ?? ""
  const queryReferralCode = normalizeReferralCode(queryReferralValue)
  const invalidReferral = queryReferralValue.length > 0 && !queryReferralCode
  const referralPrefill = queryReferralCode ?? (queryReferralValue || auth.referralCode || "")

  useEffect(() => {
    if (auth.isLoading || auth.user || (!queryReferralCode && !invalidReferral)) return
    const referralMarker = queryReferralCode ?? queryReferralValue
    if (lastAutoOpenedReferral.current === referralMarker) return
    lastAutoOpenedReferral.current = referralMarker
    auth.openAuth("register", queryReferralCode ?? undefined)
  }, [auth, auth.isLoading, auth.user, invalidReferral, queryReferralCode, queryReferralValue])

  return (
    <>
      {auth.user ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="max-w-40"><UserRound /><span className="truncate">{auth.user.full_name || auth.user.username || auth.user.email}</span></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuLabel className="break-all">
              {auth.user.email}
              {auth.user.username && <span className="block text-xs font-normal text-muted-foreground">{auth.user.username}</span>}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild><Link to="/cai-dat"><Settings2 />Cài đặt tài khoản</Link></DropdownMenuItem>
            <DropdownMenuItem asChild><Link to="/nang-cap"><Crown />Gói Premium</Link></DropdownMenuItem>
            {auth.user.role === "admin" && <DropdownMenuItem asChild><Link to="/admin"><ShieldCheck />Quản trị</Link></DropdownMenuItem>}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => { void auth.logout().catch(cause => toast.error(errorMessage(cause))) }}><LogOut />Đăng xuất</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : <Button disabled={auth.isLoading} onClick={() => auth.openAuth()}>Đăng nhập</Button>}
      <Dialog open={auth.authOpen} onOpenChange={open => { if (!pending) auth.setAuthOpen(open) }}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center gap-2.5">
              <BrainWaveLogo size="sm" aria-hidden="true" />
              <DialogTitle>{auth.authMode === "login" ? "Đăng nhập IQX" : "Tạo tài khoản IQX"}</DialogTitle>
            </div>
            <DialogDescription>Lưu hành trình học và thực hành giao dịch bằng tiền mô phỏng.</DialogDescription>
          </DialogHeader>
          <Tabs value={auth.authMode} onValueChange={mode => { if (!pending) auth.openAuth(mode === "register" ? "register" : "login") }}>
            <TabsList className="w-full"><TabsTrigger value="login">Đăng nhập</TabsTrigger><TabsTrigger value="register">Đăng ký</TabsTrigger></TabsList>
          </Tabs>
          {auth.authMode === "login"
            ? <LoginForm key="login" pending={pending} setPending={setPending} />
            : <RegisterForm key={`register:${referralPrefill}`} referralPrefill={referralPrefill} pending={pending} setPending={setPending} />}
        </DialogContent>
      </Dialog>
    </>
  )
}

type FormProps = { pending: boolean; setPending: (pending: boolean) => void }

function LoginForm({ pending, setPending }: FormProps) {
  const auth = useAuth()
  const [error, setError] = useState("")
  const [remember, setRemember] = useState(true)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setPending(true)
    setError("")
    try {
      await auth.login(String(form.get("identifier") ?? "").trim(), String(form.get("password") ?? ""), remember)
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-4">
      <div className="grid gap-1.5">
        <Label htmlFor="auth-identifier">Email hoặc tên đăng nhập</Label>
        <Input id="auth-identifier" name="identifier" type="text" autoComplete="username" autoCapitalize="none" spellCheck={false} maxLength={320} required disabled={pending} onChange={() => setError("")} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="auth-password">Mật khẩu</Label>
        <Input id="auth-password" name="password" type="password" autoComplete="current-password" required disabled={pending} onChange={() => setError("")} />
      </div>
      <div className="flex items-center gap-2"><Checkbox id="auth-remember" checked={remember} onCheckedChange={value => setRemember(value === true)} disabled={pending} /><Label htmlFor="auth-remember">Ghi nhớ đăng nhập</Label></div>
      <Link to="/quen-mat-khau" onClick={() => auth.setAuthOpen(false)} className="w-fit text-sm text-primary underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-ring">Quên mật khẩu?</Link>
      {error && <p role="alert" className="rounded-sm bg-destructive/10 p-3 text-xs text-destructive">{error}</p>}
      <Button type="submit" disabled={pending} className="w-full">{pending && <LoaderCircle className="animate-spin" />}Đăng nhập</Button>
    </form>
  )
}

type RegisterField = "fullName" | "username" | "email" | "phone" | "referral" | "password"

const CHECK_UNAVAILABLE = "Chưa kiểm tra được lúc này. Hệ thống sẽ kiểm tra lại khi tạo tài khoản."

/**
 * Khung đăng ký theo admin spec v1.1 §2.2: thứ tự ô cố định, ô có kiểm soát, kiểm tra tên
 * đăng nhập và mã giới thiệu trực tiếp (debounce) và chỉ bật "Tạo tài khoản" khi mọi ô bắt
 * buộc hợp lệ. Server vẫn là nơi chốt; lỗi trả về được gắn lại đúng ô.
 */
function RegisterForm({ referralPrefill, pending, setPending }: FormProps & { referralPrefill: string }) {
  const auth = useAuth()
  const [values, setValues] = useState<Record<RegisterField, string>>({
    fullName: "", username: "", email: "", phone: "", referral: referralPrefill, password: "",
  })
  const [touched, setTouched] = useState<Partial<Record<RegisterField, boolean>>>({})
  const [serverErrors, setServerErrors] = useState<Partial<Record<RegisterField, string>>>({})
  const [error, setError] = useState("")

  const username = values.username
  const usernameProblem = username ? usernameFormatProblem(username) : null
  const usernameCheck = useLiveCheck(username && !usernameProblem ? username : null, checkUsernameAvailable)
  const enteredReferral = values.referral.trim()
  const referralCode = normalizeReferralCode(enteredReferral)
  const referralCheck = useLiveCheck(referralCode, checkReferralCode)
  const phoneValid = normalizeVietnamMobile(values.phone) !== null
  const emailValid = EMAIL_PATTERN.test(values.email.trim())
  const passwordProblem = values.password.length < PASSWORD_MIN_LENGTH
    ? `Mật khẩu cần tối thiểu ${PASSWORD_MIN_LENGTH} ký tự.`
    : values.password.length > PASSWORD_MAX_LENGTH
      ? `Mật khẩu tối đa ${PASSWORD_MAX_LENGTH} ký tự.`
      : passwordViolation(values.password)

  const usernameOk = !!username && !usernameProblem && !serverErrors.username
    && (usernameCheck.status === "error" || (usernameCheck.status === "done" && usernameCheck.result))
  const referralOk = !serverErrors.referral && (enteredReferral === ""
    || (!!referralCode && (referralCheck.status === "error" || (referralCheck.status === "done" && referralCheck.result !== null))))
  const ready = values.fullName.trim() !== "" && usernameOk && emailValid && !serverErrors.email
    && phoneValid && !serverErrors.phone && referralOk && passwordProblem === null

  function edit(field: RegisterField, value: string) {
    setValues(current => ({ ...current, [field]: field === "username" ? normalizeUsernameInput(value) : value }))
    setServerErrors(current => ({ ...current, [field]: undefined }))
    setError("")
  }

  function touch(field: RegisterField) {
    setTouched(current => ({ ...current, [field]: true }))
  }

  const notes: Partial<Record<RegisterField, FieldNoteValue>> = {}
  if (touched.fullName && values.fullName.trim() === "") notes.fullName = { tone: "error", text: "Vui lòng nhập họ và tên." }
  if (serverErrors.username) notes.username = { tone: "error", text: serverErrors.username }
  else if (usernameProblem && (touched.username || username.length >= 4)) notes.username = { tone: "error", text: usernameProblem }
  else if (usernameCheck.status === "checking") notes.username = { tone: "checking", text: "Đang kiểm tra tên đăng nhập…" }
  else if (usernameCheck.status === "done") notes.username = usernameCheck.result
    ? { tone: "success", text: USERNAME_AVAILABLE_MESSAGE }
    : { tone: "error", text: USERNAME_TAKEN_MESSAGE }
  else if (usernameCheck.status === "error") notes.username = { tone: "muted", text: CHECK_UNAVAILABLE }
  else notes.username = { tone: "muted", text: "4 đến 30 ký tự: chữ thường không dấu, số, dấu chấm hoặc gạch dưới. Không đổi được sau khi tạo." }
  if (serverErrors.email) notes.email = { tone: "error", text: serverErrors.email }
  else if (touched.email && values.email.trim() && !emailValid) notes.email = { tone: "error", text: "Email chưa đúng định dạng." }
  if (serverErrors.phone) notes.phone = { tone: "error", text: serverErrors.phone }
  else if (values.phone.trim() && !phoneValid && (touched.phone || values.phone.replace(/\D/g, "").length >= 10)) notes.phone = { tone: "error", text: PHONE_INVALID_MESSAGE }
  if (serverErrors.referral) notes.referral = { tone: "error", text: serverErrors.referral }
  else if (enteredReferral && !referralCode) notes.referral = { tone: "error", text: REFERRAL_INVALID_MESSAGE }
  else if (referralCheck.status === "checking") notes.referral = { tone: "checking", text: "Đang kiểm tra mã giới thiệu…" }
  else if (referralCheck.status === "done") notes.referral = referralCheck.result
    ? { tone: "success", text: referralValidMessage(referralCheck.result) }
    : { tone: "error", text: REFERRAL_INVALID_MESSAGE }
  else if (referralCheck.status === "error") notes.referral = { tone: "muted", text: CHECK_UNAVAILABLE }
  else notes.referral = { tone: "muted", text: "Có thể để trống nếu bạn không có mã giới thiệu." }
  notes.password = touched.password && values.password && passwordProblem
    ? { tone: "error", text: passwordProblem }
    : { tone: "muted", text: `Tối thiểu ${PASSWORD_MIN_LENGTH} ký tự, có chữ hoa, chữ thường, số và một ký tự đặc biệt trong ${PASSWORD_SPECIAL_CHARACTERS}` }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!ready || pending) return
    setPending(true)
    setError("")
    try {
      await auth.register({
        full_name: values.fullName.trim(),
        username,
        email: values.email.trim(),
        phone_number: values.phone.trim(),
        password: values.password,
        ...(referralCode ? { referral_code: referralCode } : {}),
      })
    } catch (cause) {
      const field = registerErrorField(cause)
      if (field) setServerErrors(current => ({ ...current, [field.field]: field.message }))
      else setError(errorMessage(cause))
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-4" noValidate>
      <RegisterInput id="auth-name" label="Họ và tên" note={notes.fullName}>
        <Input id="auth-name" name="full_name" autoComplete="name" required maxLength={200} disabled={pending} value={values.fullName} onChange={event => edit("fullName", event.target.value)} onBlur={() => touch("fullName")} aria-invalid={notes.fullName?.tone === "error"} aria-describedby={notes.fullName ? "auth-name-note" : undefined} />
      </RegisterInput>
      <RegisterInput id="auth-username" label="Tên đăng nhập" note={notes.username}>
        <Input id="auth-username" name="username" autoComplete="username" autoCapitalize="none" spellCheck={false} required maxLength={USERNAME_MAX_LENGTH} disabled={pending} value={values.username} onChange={event => edit("username", event.target.value)} onBlur={() => touch("username")} aria-invalid={notes.username?.tone === "error"} aria-describedby="auth-username-note" />
      </RegisterInput>
      <RegisterInput id="auth-email" label="Email" note={notes.email}>
        <Input id="auth-email" name="email" type="email" autoComplete="email" required maxLength={320} disabled={pending} value={values.email} onChange={event => edit("email", event.target.value)} onBlur={() => touch("email")} aria-invalid={notes.email?.tone === "error"} aria-describedby={notes.email ? "auth-email-note" : undefined} />
      </RegisterInput>
      <RegisterInput id="auth-phone" label="Số điện thoại" note={notes.phone}>
        <Input id="auth-phone" name="phone_number" type="tel" inputMode="tel" autoComplete="tel" placeholder="0912 345 678" required maxLength={30} disabled={pending} value={values.phone} onChange={event => edit("phone", event.target.value)} onBlur={() => touch("phone")} aria-invalid={notes.phone?.tone === "error"} aria-describedby={notes.phone ? "auth-phone-note" : undefined} />
      </RegisterInput>
      <RegisterInput id="auth-referral-code" label="Mã giới thiệu (không bắt buộc)" note={notes.referral}>
        <Input id="auth-referral-code" name="referral_code" placeholder="Nhập mã giới thiệu nếu có" autoComplete="off" autoCapitalize="none" spellCheck={false} maxLength={32} disabled={pending} value={values.referral} onChange={event => edit("referral", event.target.value)} onBlur={() => touch("referral")} aria-invalid={notes.referral?.tone === "error"} aria-describedby="auth-referral-code-note" />
      </RegisterInput>
      <RegisterInput id="auth-password" label="Mật khẩu" note={notes.password}>
        <Input id="auth-password" name="password" type="password" autoComplete="new-password" required minLength={PASSWORD_MIN_LENGTH} maxLength={PASSWORD_MAX_LENGTH} disabled={pending} value={values.password} onChange={event => edit("password", event.target.value)} onBlur={() => touch("password")} aria-invalid={notes.password?.tone === "error"} aria-describedby="auth-password-note" />
      </RegisterInput>
      {error && <p role="alert" className="rounded-sm bg-destructive/10 p-3 text-xs text-destructive">{error}</p>}
      <Button type="submit" disabled={pending || !ready} className="w-full">{pending && <LoaderCircle className="animate-spin" />}Tạo tài khoản</Button>
    </form>
  )
}

function RegisterInput({ id, label, note, children }: { id: string; label: string; note?: FieldNoteValue; children: ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {note && <FieldNote id={`${id}-note`} note={note} />}
    </div>
  )
}

/** Gắn lỗi nghiệp vụ của `POST auth/register` vào đúng ô thay vì báo chung. */
function registerErrorField(cause: unknown): { field: RegisterField; message: string } | null {
  if (!(cause instanceof ApiError)) return null
  switch (cause.code) {
    case "USERNAME_TAKEN": return { field: "username", message: USERNAME_TAKEN_MESSAGE }
    case "REFERRAL_CODE_INVALID": return { field: "referral", message: REFERRAL_INVALID_MESSAGE }
    case "PHONE_INVALID": return { field: "phone", message: PHONE_INVALID_MESSAGE }
    case "PHONE_EXISTS": return { field: "phone", message: cause.message || "Số điện thoại đã được sử dụng." }
    case "EMAIL_EXISTS": return { field: "email", message: cause.message || "Email đã được sử dụng." }
    default: return null
  }
}
