/**
 * `/cai-dat` — Cài đặt tài khoản.
 *
 * Giữ nguyên nghiệp vụ của `dashboard/src/features/settings`:
 * - Trạng thái gói lấy từ `GET /premium/me` (KHÔNG dùng `role`/`premiumExpiresAt`
 *   của hồ sơ — legacy đọc sai nguồn và luôn hiển thị "Gói miễn phí").
 * - Hồ sơ sửa bằng `PATCH /users/me`; email là định danh đăng nhập nên chỉ đọc.
 * - Sau khi lưu phải gọi `refreshUser()` để `AuthContext` (và header) đổi theo.
 * - Không có endpoint đổi mật khẩu trực tiếp: đổi mật khẩu đi qua liên kết email
 *   (`POST /auth/forgot-password`), và mọi phiên sẽ bị thu hồi sau khi đổi.
 *
 * Ngoài hai trường legacy (họ tên, điện thoại), form còn phơi đầy đủ các trường
 * mà `UserUpdateDto` thật sự nhận (ngày sinh, giới tính, địa chỉ, ảnh đại diện) —
 * bỏ trống = gửi `null` để xoá, backend là nơi chốt giá trị hợp lệ.
 */
import { useMemo, useState, type FormEvent } from "react"
import { Link, useNavigate } from "react-router"
import {
  BadgeCheck,
  CalendarClock,
  KeyRound,
  LoaderCircle,
  LogOut,
  MailWarning,
  MonitorSmartphone,
  ShieldCheck,
  TriangleAlert,
  UserRound,
} from "lucide-react"
import { toast } from "sonner"

import { PanelState } from "@/components/layout/panel-state"
import { WorkspacePage } from "@/components/layout/workspace-page"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { DatePicker } from "@/components/ui/date-picker"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { useAuth } from "@/hooks/use-auth"
import { errorMessage } from "@/lib/api"
import { formatDateTime } from "@/lib/format"
import { formatISODate } from "@/lib/date-only"
import type { AccountProfile, ProfilePatch } from "./api"
import { formatDateOnly } from "./format"
import { useAccountProfile, useRequestPasswordReset, useUpdateAccountProfile } from "./hooks"
import { PremiumStatusPanel, UpgradeButton } from "./premium-status-panel"

/* ── Form hồ sơ ─────────────────────────────────────────────────────────── */

type ProfileDraft = {
  fullName: string
  phoneNumber: string
  dateOfBirth: string
  gender: string
  avatarUrl: string
  country: string
  provinceState: string
  city: string
  district: string
  ward: string
  streetAddress: string
  postalCode: string
}

/** Mười trường tuỳ chọn của `UserUpdateDto` — `wire` là tên gửi lên server. */
type ExtraField =
  | "avatar_url"
  | "date_of_birth"
  | "gender"
  | "country"
  | "province_state"
  | "city"
  | "district"
  | "ward"
  | "street_address"
  | "postal_code"

const EXTRA_FIELDS: ReadonlyArray<{
  wire: ExtraField
  key: keyof ProfileDraft
  label: string
  maxLength: number
  type?: "date" | "url"
}> = [
  { wire: "date_of_birth", key: "dateOfBirth", label: "Ngày sinh", maxLength: 10, type: "date" },
  { wire: "gender", key: "gender", label: "Giới tính", maxLength: 20 },
  { wire: "avatar_url", key: "avatarUrl", label: "Ảnh đại diện (URL)", maxLength: 2048, type: "url" },
  { wire: "street_address", key: "streetAddress", label: "Địa chỉ", maxLength: 500 },
  { wire: "ward", key: "ward", label: "Phường/Xã", maxLength: 100 },
  { wire: "district", key: "district", label: "Quận/Huyện", maxLength: 100 },
  { wire: "city", key: "city", label: "Thành phố", maxLength: 100 },
  { wire: "province_state", key: "provinceState", label: "Tỉnh/Bang", maxLength: 100 },
  { wire: "country", key: "country", label: "Quốc gia", maxLength: 100 },
  { wire: "postal_code", key: "postalCode", label: "Mã bưu chính", maxLength: 20 },
]

const LIMITS = { fullName: 200, phoneNumber: 30 } as const

function draftFrom(profile: AccountProfile): ProfileDraft {
  return {
    fullName: profile.fullName,
    phoneNumber: profile.phoneNumber ?? "",
    dateOfBirth: profile.dateOfBirth ?? "",
    gender: profile.gender ?? "",
    avatarUrl: profile.avatarUrl ?? "",
    country: profile.country ?? "",
    provinceState: profile.provinceState ?? "",
    city: profile.city ?? "",
    district: profile.district ?? "",
    ward: profile.ward ?? "",
    streetAddress: profile.streetAddress ?? "",
    postalCode: profile.postalCode ?? "",
  }
}

/** Chỉ gửi khoá thực sự đổi; `""` nghĩa là xoá giá trị (`null`). */
function buildPatch(draft: ProfileDraft, profile: AccountProfile): ProfilePatch {
  const patch: ProfilePatch = {}
  const name = draft.fullName.trim()
  if (name !== profile.fullName) patch.full_name = name

  const phone = draft.phoneNumber.trim()
  if (phone !== (profile.phoneNumber ?? "")) patch.phone_number = phone === "" ? null : phone

  const current: Record<ExtraField, string> = {
    avatar_url: profile.avatarUrl ?? "",
    date_of_birth: profile.dateOfBirth ?? "",
    gender: profile.gender ?? "",
    country: profile.country ?? "",
    province_state: profile.provinceState ?? "",
    city: profile.city ?? "",
    district: profile.district ?? "",
    ward: profile.ward ?? "",
    street_address: profile.streetAddress ?? "",
    postal_code: profile.postalCode ?? "",
  }
  const extras: Partial<Record<ExtraField, string | null>> = {}
  for (const field of EXTRA_FIELDS) {
    const value = draft[field.key].trim()
    if (value !== current[field.wire]) extras[field.wire] = value === "" ? null : value
  }
  return { ...patch, ...extras }
}

/**
 * Kiểm tra nhẹ phía client. Backend dùng libphonenumber (VN) và là nơi chốt kết
 * quả, nên ở đây chỉ chặn các lỗi rõ ràng; thông điệp 422/409 từ server được
 * hiển thị nguyên văn.
 */
function validateDraft(draft: ProfileDraft): string | null {
  if (draft.fullName.trim() === "") return "Họ và tên không được để trống."
  const phone = draft.phoneNumber.trim()
  if (phone !== "" && !/^\+?[0-9\s.()-]{8,29}$/.test(phone)) {
    return "Số điện thoại không hợp lệ. Ví dụ: 0912345678 hoặc +84912345678"
  }
  const birth = draft.dateOfBirth.trim()
  if (birth !== "" && new Date(birth).getTime() > Date.now()) {
    return "Ngày sinh không thể ở tương lai."
  }
  return null
}

function ProfileField({
  id,
  label,
  hint,
  value,
  maxLength,
  type,
  autoComplete,
  onChange,
}: {
  id: string
  label: string
  hint?: string
  value: string
  maxLength: number
  type?: "date" | "url" | "tel"
  autoComplete?: string
  onChange: (value: string) => void
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {type === "date" ? (
        <DatePicker
          id={id}
          name={id}
          value={value}
          onChange={onChange}
          max={formatISODate(new Date())}
          captionLayout="dropdown"
          aria-label={label}
        />
      ) : <Input
        id={id}
        type={type ?? "text"}
        value={value}
        maxLength={maxLength}
        autoComplete={autoComplete}
        onChange={(event) => onChange(event.target.value)}
      />}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

/* ── Trang ──────────────────────────────────────────────────────────────── */

export function SettingsPage() {
  return (
    <WorkspacePage
      title="Cài đặt tài khoản"
      description="Hồ sơ, gói Premium, bảo mật và phiên đăng nhập của bạn."
    >
      <SettingsBody />
    </WorkspacePage>
  )
}

function SettingsBody() {
  const auth = useAuth()
  const profile = useAccountProfile()

  if (auth.sessionError) {
    return (
      <PanelState
        title="Không xác minh được phiên đăng nhập"
        description={auth.sessionError.message}
        action={{ label: "Tải lại trang", onClick: () => window.location.reload() }}
      />
    )
  }
  if (auth.isLoading) return <PanelState title="Đang kiểm tra phiên đăng nhập" loading />
  if (!auth.isAuthenticated) {
    return (
      <PanelState
        title="Cần đăng nhập để xem cài đặt"
        description="Cài đặt tài khoản gắn với hồ sơ IQX của bạn — đăng nhập để xem và chỉnh sửa."
        action={{ label: "Đăng nhập", onClick: () => auth.openAuth("login") }}
      />
    )
  }
  if (profile.isPending) return <SettingsSkeleton />
  if (profile.isError) {
    return (
      <PanelState
        title="Không tải được hồ sơ"
        description={profile.error.message}
        action={{ label: "Thử lại", onClick: () => void profile.refetch() }}
      />
    )
  }
  // `key` theo mốc cập nhật: hồ sơ đổi (kể cả do phiên khác) thì form được dựng
  // lại từ dữ liệu server thay vì giữ bản nháp cũ.
  return <SettingsContent key={profile.data.updatedAt} profile={profile.data} />
}

function SettingsSkeleton() {
  return (
    <div className="space-y-6">
      {[0, 1].map((card) => (
        <Card key={card}>
          <CardHeader>
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-64" />
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

function SettingsContent({ profile }: { profile: AccountProfile }) {
  const auth = useAuth()
  const navigate = useNavigate()
  const update = useUpdateAccountProfile()
  const resetLink = useRequestPasswordReset()
  const [draft, setDraft] = useState<ProfileDraft>(() => draftFrom(profile))
  const [formError, setFormError] = useState("")

  const patch = useMemo(() => buildPatch(draft, profile), [draft, profile])
  const dirty = Object.keys(patch).length > 0

  function edit(key: keyof ProfileDraft, value: string) {
    setDraft((previous) => ({ ...previous, [key]: value }))
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const invalid = validateDraft(draft)
    if (invalid) {
      setFormError(invalid)
      return
    }
    if (!dirty) return
    setFormError("")
    try {
      await update.mutateAsync(patch)
      toast.success("Đã cập nhật thông tin!")
    } catch (cause) {
      setFormError(errorMessage(cause))
      return
    }
    // Hồ sơ đã lưu xong; đây chỉ là đồng bộ tên hiển thị ở header.
    try {
      await auth.refreshUser()
    } catch {
      toast.warning("Đã lưu hồ sơ, nhưng chưa đồng bộ được tên hiển thị. Tải lại trang để cập nhật.")
    }
  }

  async function sendResetLink() {
    try {
      toast.info(await resetLink.mutateAsync(profile.email))
    } catch (cause) {
      toast.error(errorMessage(cause))
    }
  }

  async function signOutEverywhere() {
    try {
      await auth.logout()
      toast.success("Đã đăng xuất và thu hồi mọi phiên đăng nhập.")
    } catch {
      // `logout()` luôn xoá phiên cục bộ trong `finally`; lỗi ở bước thu hồi
      // refresh token trên máy chủ không ngăn được việc đăng xuất tại máy này.
      toast.warning(
        "Đã đăng xuất trên thiết bị này. Máy chủ chưa xác nhận thu hồi phiên — hãy kiểm tra kết nối mạng.",
      )
    }
    navigate("/")
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PremiumStatusPanel
        action={
          auth.isPremium ? (
            <Button variant="outline" asChild>
              <Link to="/nang-cap">Gia hạn thêm</Link>
            </Button>
          ) : (
            <UpgradeButton />
          )
        }
      />

      <form onSubmit={submit} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserRound className="size-4 text-primary" />
              Thông tin cá nhân
            </CardTitle>
            <CardDescription>Email dùng để đăng nhập nên không thể thay đổi tại đây.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="settings-email">Email</Label>
              <Input id="settings-email" value={profile.email} disabled autoComplete="email" />
              <p className="text-xs text-muted-foreground">
                {profile.isEmailVerified ? "Đã xác thực" : "Chưa xác thực email"}
              </p>
            </div>
            <ProfileField
              id="settings-full-name"
              label="Họ và tên"
              value={draft.fullName}
              maxLength={LIMITS.fullName}
              autoComplete="name"
              onChange={(value) => edit("fullName", value)}
            />
            <ProfileField
              id="settings-phone"
              label="Số điện thoại"
              hint="Định dạng E.164 hoặc số nội địa, ví dụ: +84901234567 hoặc 0912345678"
              value={draft.phoneNumber}
              maxLength={LIMITS.phoneNumber}
              type="tel"
              autoComplete="tel"
              onChange={(value) => edit("phoneNumber", value)}
            />
            <div className="grid gap-1.5">
              <Label>Loại tài khoản</Label>
              <div className="flex h-9 items-center gap-2">
                <Badge variant={auth.isPremium ? "gold" : "secondary"}>
                  {auth.isPremium ? "Premium" : "Miễn phí"}
                </Badge>
                <Badge variant="outline">{profile.role}</Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarClock className="size-4 text-primary" />
              Thông tin bổ sung
            </CardTitle>
            <CardDescription>
              Không bắt buộc. Để trống và lưu nghĩa là xoá giá trị đang có.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            {EXTRA_FIELDS.map((field) => (
              <ProfileField
                key={field.wire}
                id={`settings-${field.wire}`}
                label={field.label}
                value={draft[field.key]}
                maxLength={field.maxLength}
                type={field.type}
                onChange={(value) => edit(field.key, value)}
              />
            ))}
          </CardContent>
        </Card>

        {formError && (
          <Alert variant="destructive">
            <TriangleAlert />
            <AlertTitle>Không lưu được thay đổi</AlertTitle>
            <AlertDescription>{formError}</AlertDescription>
          </Alert>
        )}

        <div className="flex flex-wrap items-center justify-end gap-2">
          {dirty && <span className="mr-auto text-xs text-muted-foreground">Có thay đổi chưa lưu</span>}
          <Button
            type="button"
            variant="ghost"
            disabled={!dirty || update.isPending}
            onClick={() => {
              setDraft(draftFrom(profile))
              setFormError("")
            }}
          >
            Hoàn tác
          </Button>
          <Button type="submit" disabled={!dirty || update.isPending}>
            {update.isPending && <LoaderCircle className="animate-spin" />}
            Lưu thay đổi
          </Button>
        </div>
      </form>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-primary" />
            Bảo mật
          </CardTitle>
          <CardDescription>
            IQX không có màn hình đổi mật khẩu trực tiếp: mật khẩu được đổi bằng liên kết gửi tới
            email tài khoản.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2 text-sm">
            <MailWarning className="size-4 text-muted-foreground" />
            <span className="text-muted-foreground">Trạng thái email:</span>
            <Badge variant={profile.isEmailVerified ? "secondary" : "destructive"}>
              {profile.isEmailVerified ? "Đã xác thực" : "Chưa xác thực"}
            </Badge>
          </div>
          <p className="text-xs leading-5 text-muted-foreground">
            Liên kết đặt lại mật khẩu có hiệu lực một lần và hết hạn sau ít giờ. Sau khi đổi mật
            khẩu, mọi phiên đăng nhập — kể cả phiên này — sẽ bị thu hồi và bạn cần đăng nhập lại.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={resetLink.isPending}
              onClick={() => void sendResetLink()}
            >
              {resetLink.isPending ? <LoaderCircle className="animate-spin" /> : <KeyRound />}
              Gửi liên kết đổi mật khẩu
            </Button>
            <Button type="button" variant="ghost" asChild>
              <Link to="/quen-mat-khau">Mở trang quên mật khẩu</Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MonitorSmartphone className="size-4 text-primary" />
            Phiên đăng nhập
          </CardTitle>
          <CardDescription>
            IQX chỉ lưu một phiên trên trình duyệt này; backend không cung cấp danh sách thiết bị.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">Đăng nhập gần nhất</dt>
              <dd className="font-medium">{formatDateTime(profile.lastLoginAt)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Lưu phiên trên thiết bị</dt>
              <dd className="font-medium">
                {/* Khoá này khớp REMEMBER_KEY trong `@/lib/api` — chỉ đọc để hiển thị. */}
                {localStorage.getItem("iqx.remember") === "true"
                  ? "Ghi nhớ đăng nhập"
                  : "Chỉ trong tab hiện tại"}
              </dd>
            </div>
          </dl>
          <Separator />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="max-w-md text-xs leading-5 text-muted-foreground">
              Đăng xuất sẽ thu hồi toàn bộ refresh token của tài khoản trên máy chủ, nên mọi thiết bị
              đang đăng nhập đều phải đăng nhập lại.
            </p>
            <Button type="button" variant="outline" onClick={() => void signOutEverywhere()}>
              <LogOut />
              Đăng xuất mọi thiết bị
            </Button>
          </div>
        </CardContent>
      </Card>

      <p className="flex flex-wrap items-center justify-center gap-1 text-center text-xs text-muted-foreground">
        <BadgeCheck className="size-3.5" />
        Tham gia từ {formatDateOnly(profile.createdAt)} · ID: {profile.id.slice(0, 8)} ·{" "}
        {profile.email}
      </p>
    </div>
  )
}
