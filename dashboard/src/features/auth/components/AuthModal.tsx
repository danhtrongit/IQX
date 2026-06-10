import { Modal, Tabs, Form, Input, Button, Message, Typography } from "@arco-design/web-react"
import {
  IconUser,
  IconEmail,
  IconPhone,
  IconLock,
  IconArrowRight,
  IconSafe,
} from "@arco-design/web-react/icon"
import { getErrorMessage } from "@/shared/http/client"
import { useAuth } from "../auth-context"
import type { LoginPayload, RegisterPayload } from "../types"

const FormItem = Form.Item
const TabPane = Tabs.TabPane

interface LoginFields {
  email: string
  password: string
}

interface RegisterFields {
  email: string
  password: string
  confirmPassword: string
  fullName: string
  phone?: string
}

/**
 * Login / Register modal. Open state is driven entirely by the auth context
 * (`showAuthModal` / `authModalTab`). The integrator renders <AuthModal /> once,
 * globally; any caller opens it via `setShowAuthModal(true)`.
 */
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
    <Modal
      visible={showAuthModal}
      onCancel={() => setShowAuthModal(false)}
      footer={null}
      autoFocus={false}
      focusLock
      style={{ width: 440, maxWidth: "calc(100vw - 32px)" }}
      title={
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "rgb(var(--primary-6))",
              color: "#fff",
              fontWeight: 900,
              fontSize: 13,
              letterSpacing: "-0.04em",
            }}
          >
            IQ
          </span>
          <span style={{ fontWeight: 700 }}>
            {authModalTab === "login" ? "Đăng nhập vào IQX" : "Tạo tài khoản IQX"}
          </span>
        </div>
      }
    >
      <Typography.Text type="secondary" style={{ fontSize: 12, display: "block", marginBottom: 16 }}>
        {authModalTab === "login"
          ? "Truy cập bảng phân tích, công cụ AI và danh mục đầu tư cá nhân"
          : "Bắt đầu hành trình đầu tư thông minh cùng IQX"}
      </Typography.Text>

      <Tabs
        activeTab={authModalTab}
        onChange={(key) => setAuthModalTab(key as "login" | "register")}
      >
        <TabPane key="login" title="Đăng nhập">
          <LoginForm isLoading={isLoading} onSubmit={login} />
        </TabPane>
        <TabPane key="register" title="Đăng ký">
          <RegisterForm isLoading={isLoading} onSubmit={register} />
        </TabPane>
      </Tabs>

      <div
        style={{
          marginTop: 8,
          paddingTop: 12,
          borderTop: "1px solid var(--color-border-2)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
          color: "var(--color-text-3)",
          fontSize: 11,
        }}
      >
        <IconSafe />
        <span>Dữ liệu được bảo mật với mã hóa SSL 256-bit</span>
      </div>
    </Modal>
  )
}

function LoginForm({
  isLoading,
  onSubmit,
}: {
  isLoading: boolean
  onSubmit: (p: LoginPayload) => Promise<void>
}) {
  const [form] = Form.useForm<LoginFields>()

  async function handleSubmit(values: LoginFields) {
    try {
      await onSubmit({ email: values.email, password: values.password })
      Message.success("Đăng nhập thành công!")
    } catch (err) {
      Message.error(await getErrorMessage(err))
    }
  }

  return (
    <Form form={form} layout="vertical" requiredSymbol={false} onSubmit={handleSubmit}>
      <FormItem
        field="email"
        label="Email"
        rules={[
          { required: true, message: "Vui lòng nhập email" },
          { type: "email", message: "Email không hợp lệ" },
        ]}
      >
        <Input prefix={<IconEmail />} placeholder="name@company.com" autoComplete="email" />
      </FormItem>

      <FormItem
        field="password"
        label="Mật khẩu"
        rules={[
          { required: true, message: "Vui lòng nhập mật khẩu" },
          { minLength: 6, message: "Mật khẩu tối thiểu 6 ký tự" },
        ]}
      >
        <Input.Password
          prefix={<IconLock />}
          placeholder="••••••"
          autoComplete="current-password"
        />
      </FormItem>

      <Button
        type="primary"
        long
        htmlType="submit"
        loading={isLoading}
        icon={!isLoading ? <IconArrowRight /> : undefined}
      >
        {isLoading ? "Đang xử lý..." : "Đăng nhập"}
      </Button>
    </Form>
  )
}

function RegisterForm({
  isLoading,
  onSubmit,
}: {
  isLoading: boolean
  onSubmit: (p: RegisterPayload) => Promise<void>
}) {
  const [form] = Form.useForm<RegisterFields>()

  async function handleSubmit(values: RegisterFields) {
    const fullName = values.fullName.trim()
    try {
      await onSubmit({
        email: values.email,
        password: values.password,
        fullName,
        ...(values.phone ? { phone: values.phone } : {}),
      })
      Message.success({
        content: "Đăng ký thành công! Bạn được tặng 7 ngày dùng thử Premium.",
        duration: 6000,
      })
    } catch (err) {
      Message.error(await getErrorMessage(err))
    }
  }

  return (
    <Form form={form} layout="vertical" requiredSymbol={false} onSubmit={handleSubmit}>
      <FormItem
        field="fullName"
        label="Họ và tên"
        rules={[{ required: true, message: "Vui lòng nhập họ và tên" }]}
      >
        <Input prefix={<IconUser />} placeholder="Nguyễn Văn A" autoComplete="name" />
      </FormItem>

      <FormItem
        field="email"
        label="Email"
        rules={[
          { required: true, message: "Vui lòng nhập email" },
          { type: "email", message: "Email không hợp lệ" },
        ]}
      >
        <Input prefix={<IconEmail />} placeholder="name@company.com" autoComplete="email" />
      </FormItem>

      <FormItem field="phone" label="Số điện thoại (tuỳ chọn)">
        <Input prefix={<IconPhone />} placeholder="0912 345 678" autoComplete="tel" />
      </FormItem>

      <FormItem
        field="password"
        label="Mật khẩu"
        rules={[
          { required: true, message: "Vui lòng nhập mật khẩu" },
          { minLength: 6, message: "Mật khẩu tối thiểu 6 ký tự" },
        ]}
      >
        <Input.Password prefix={<IconLock />} placeholder="••••••" autoComplete="new-password" />
      </FormItem>

      <FormItem
        field="confirmPassword"
        label="Xác nhận mật khẩu"
        rules={[
          { required: true, message: "Vui lòng xác nhận mật khẩu" },
          {
            validator: (value, callback) => {
              if (value && value !== form.getFieldValue("password")) {
                callback("Mật khẩu xác nhận không khớp")
              } else {
                callback()
              }
            },
          },
        ]}
      >
        <Input.Password prefix={<IconLock />} placeholder="••••••" autoComplete="new-password" />
      </FormItem>

      <Button
        type="primary"
        long
        htmlType="submit"
        loading={isLoading}
        icon={!isLoading ? <IconArrowRight /> : undefined}
      >
        {isLoading ? "Đang xử lý..." : "Tạo tài khoản"}
      </Button>
    </Form>
  )
}
