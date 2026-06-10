import { useEffect } from "react"
import { useNavigate } from "react-router"
import {
  Button,
  Card,
  Form,
  Input,
  Message,
  Spin,
  Tag,
  Typography,
} from "@arco-design/web-react"
import {
  IconArrowLeft,
  IconUser,
  IconEmail,
  IconPhone,
  IconLock,
  IconSafe,
  IconTrophy,
  IconCalendar,
  IconSave,
  IconRight,
} from "@arco-design/web-react/icon"
import { getErrorMessage } from "@/shared/http/client"
import { useAuth } from "@/features/auth"
import { useProfile, useUpdateProfile } from "./hooks"

const FormItem = Form.Item

interface ProfileFields {
  fullName: string
  phone: string
}

function fmtDate(dateStr: string | null | undefined) {
  if (!dateStr) return "—"
  return new Date(dateStr).toLocaleDateString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  })
}

export function SettingsPage() {
  const navigate = useNavigate()
  const { user, isAuthenticated, setShowAuthModal, setAuthModalTab, refreshUser } = useAuth()
  const [form] = Form.useForm<ProfileFields>()

  const { data: profile, isLoading } = useProfile()
  const updateProfile = useUpdateProfile()

  // Gate: unauthenticated users get the login modal and bounced home.
  useEffect(() => {
    if (!isAuthenticated) {
      setAuthModalTab("login")
      setShowAuthModal(true)
      navigate("/")
    }
  }, [isAuthenticated, setAuthModalTab, setShowAuthModal, navigate])

  // Seed the form once the profile arrives.
  useEffect(() => {
    if (profile) {
      form.setFieldsValue({
        fullName: profile.fullName || "",
        phone: profile.phone || "",
      })
    }
  }, [profile, form])

  async function handleSaveProfile(values: ProfileFields) {
    try {
      await updateProfile.mutateAsync({
        fullName: values.fullName || undefined,
        phone: values.phone || undefined,
      })
      // Keep the auth context user (and its localStorage copy) in sync.
      await refreshUser()
      Message.success("Đã cập nhật thông tin!")
    } catch (err) {
      Message.error(await getErrorMessage(err))
    }
  }

  const isPremium = profile?.role === "premium" || profile?.role === "admin"
  const premiumExpiry = profile?.premiumExpiresAt
  const isExpired = premiumExpiry ? new Date(premiumExpiry) < new Date() : false
  const activePremium = isPremium && !isExpired

  if (!isAuthenticated) return null

  if (isLoading) {
    return (
      <div
        style={{
          minHeight: "60vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Spin size={28} />
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "16px 16px 48px" }}>
      {/* Top bar */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
        <Button
          shape="circle"
          type="text"
          icon={<IconArrowLeft />}
          onClick={() => navigate(-1)}
          aria-label="Quay lại"
        />
        <Typography.Title heading={6} style={{ margin: 0 }}>
          Cài đặt tài khoản
        </Typography.Title>
      </div>

      {/* ── Subscription status ── */}
      <Card style={{ marginBottom: 16 }} bordered>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span
              style={{
                width: 40,
                height: 40,
                borderRadius: 10,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: activePremium ? "rgb(var(--gold-6))" : "var(--color-fill-2)",
                color: activePremium ? "#fff" : "var(--color-text-3)",
                fontSize: 20,
              }}
            >
              <IconTrophy />
            </span>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Typography.Text style={{ fontWeight: 600 }}>
                  {activePremium ? "Premium" : "Gói miễn phí"}
                </Typography.Text>
                <Tag color={activePremium ? "gold" : "gray"} size="small">
                  {activePremium ? "Đang hoạt động" : "Free"}
                </Tag>
                {isExpired && (
                  <Tag color="red" size="small">
                    Hết hạn
                  </Tag>
                )}
              </div>
              {premiumExpiry && !isExpired && (
                <Typography.Text
                  type="secondary"
                  style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 4, marginTop: 2 }}
                >
                  <IconCalendar />
                  Hết hạn: {fmtDate(premiumExpiry)}
                </Typography.Text>
              )}
            </div>
          </div>
          {!activePremium && (
            <Button type="primary" onClick={() => navigate("/nang-cap")} icon={<IconTrophy />}>
              Nâng cấp Premium
              <IconRight />
            </Button>
          )}
        </div>
      </Card>

      {/* ── Profile ── */}
      <Card
        style={{ marginBottom: 16 }}
        bordered
        title={
          <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <IconUser style={{ color: "rgb(var(--primary-6))" }} />
            Thông tin cá nhân
          </span>
        }
      >
        <Form
          form={form}
          layout="vertical"
          requiredSymbol={false}
          onSubmit={handleSaveProfile}
        >
          <FormItem label="Email" extra="Email không thể thay đổi">
            <Input prefix={<IconEmail />} value={profile?.email || ""} disabled />
          </FormItem>

          <FormItem field="fullName" label="Họ và tên">
            <Input prefix={<IconUser />} placeholder="Nguyễn Văn A" autoComplete="name" />
          </FormItem>

          <FormItem
            field="phone"
            label="Số điện thoại"
            extra="Dùng định dạng E.164, ví dụ: +84901234567"
          >
            <Input prefix={<IconPhone />} placeholder="+84901234567" />
          </FormItem>

          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <Button
              type="primary"
              htmlType="submit"
              loading={updateProfile.isPending}
              icon={<IconSave />}
            >
              Lưu thay đổi
            </Button>
          </div>
        </Form>
      </Card>

      {/* ── Security (no self-change-password endpoint on backend) ── */}
      <Card
        style={{ marginBottom: 16 }}
        bordered
        title={
          <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <IconSafe style={{ color: "rgb(var(--primary-6))" }} />
            Bảo mật
          </span>
        }
      >
        <Form layout="vertical" requiredSymbol={false}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
              gap: 12,
            }}
          >
            <FormItem label="Mật khẩu mới">
              <Input.Password prefix={<IconLock />} placeholder="••••••••" disabled />
            </FormItem>
            <FormItem label="Xác nhận mật khẩu">
              <Input.Password prefix={<IconLock />} placeholder="••••••••" disabled />
            </FormItem>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <Button
              type="outline"
              icon={<IconLock />}
              onClick={() =>
                Message.info("Tính năng đổi mật khẩu chưa sẵn sàng trên hệ thống mới")
              }
            >
              Đổi mật khẩu
            </Button>
          </div>
        </Form>
      </Card>

      {/* Account info footer */}
      <Typography.Text
        type="secondary"
        style={{ display: "block", textAlign: "center", fontSize: 11 }}
      >
        Tham gia từ {fmtDate(profile?.createdAt)} · ID: {profile?.id?.slice(0, 8)}
        {user?.email ? ` · ${user.email}` : ""}
      </Typography.Text>
    </div>
  )
}
