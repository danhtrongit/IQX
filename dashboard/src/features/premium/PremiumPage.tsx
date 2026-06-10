import type { ReactNode } from "react"
import { useNavigate } from "react-router"
import { Button, Card, Grid, Message, Space, Spin, Tag } from "@arco-design/web-react"
import {
  IconArrowLeft,
  IconArrowRise,
  IconCheck,
  IconCustomerService,
  IconDashboard,
  IconFire,
  IconNotification,
  IconRobot,
  IconSafe,
  IconStorage,
  IconThunderbolt,
  IconTrophy,
} from "@arco-design/web-react/icon"
import { useAuth } from "@/features/auth"
import { usePlans, useCheckout, usePremiumStatus } from "./hooks"
import type { PlanInfo } from "./api"

const { Row, Col } = Grid

/* ── Plan metadata ──────────────────────────────────── */

interface PlanMeta {
  icon: ReactNode
  originalTotal: number
  discount: number
  badge: string | null
  tagline: string
  popular?: boolean
  color: "gold" | "green" | "blue"
}

const PLAN_META: Record<string, PlanMeta> = {
  MONTHLY: {
    icon: <IconThunderbolt />,
    originalTotal: 100_000,
    discount: 50,
    badge: "Giảm 50%",
    tagline: "Trải nghiệm linh hoạt",
    color: "blue",
  },
  SEMI_ANNUAL: {
    icon: <IconTrophy />,
    originalTotal: 600_000,
    discount: 55,
    badge: "Phổ biến nhất",
    tagline: "Tối ưu chi phí dài hạn",
    popular: true,
    color: "gold",
  },
  ANNUAL: {
    icon: <IconArrowRise />,
    originalTotal: 1_200_000,
    discount: 60,
    badge: "Tiết kiệm nhất",
    tagline: "Cam kết đầu tư nghiêm túc",
    color: "green",
  },
}

const PREMIUM_FEATURES = [
  { icon: <IconRobot />, text: "Truy cập đầy đủ 6 lớp AI Insight" },
  { icon: <IconDashboard />, text: "Phân tích & kịch bản hành động chi tiết" },
  { icon: <IconStorage />, text: "Dữ liệu thị trường real-time không giới hạn" },
  { icon: <IconNotification />, text: "Cảnh báo điểm mua/bán AI sớm nhất" },
  { icon: <IconSafe />, text: "Đấu trường giao dịch ảo 1 tỷ VND" },
  { icon: <IconCustomerService />, text: "Hỗ trợ khách hàng ưu tiên 24/7" },
]

function fmtPrice(amount: number) {
  return new Intl.NumberFormat("vi-VN").format(amount)
}

export default function PremiumPage() {
  const navigate = useNavigate()
  const { isAuthenticated, setShowAuthModal, setAuthModalTab } = useAuth()
  const { isPremium } = usePremiumStatus()
  const { data: plans, isLoading } = usePlans()
  const checkout = useCheckout()

  async function handleSelectPlan(planKey: string) {
    if (!isAuthenticated) {
      setAuthModalTab("register")
      setShowAuthModal(true)
      return
    }
    if (isPremium) {
      Message.info("Bạn đã là thành viên Premium!")
      return
    }
    try {
      const { checkoutUrl, fields } = await checkout.mutateAsync(planKey)
      // POST the SePay form (browser navigation away from the SPA).
      const form = document.createElement("form")
      form.method = "POST"
      form.action = checkoutUrl
      form.style.display = "none"
      Object.entries(fields).forEach(([key, value]) => {
        const input = document.createElement("input")
        input.type = "hidden"
        input.name = key
        input.value = value
        form.appendChild(input)
      })
      document.body.appendChild(form)
      form.submit()
    } catch {
      Message.error("Không thể tạo đơn thanh toán")
    }
  }

  return (
    <div className="min-h-screen" style={{ background: "var(--color-bg-1)" }}>
      {/* Top bar */}
      <div
        className="sticky top-0 z-20 border-b backdrop-blur-sm"
        style={{
          borderColor: "var(--color-border-2)",
          background: "var(--color-bg-2)",
        }}
      >
        <div className="max-w-5xl mx-auto flex items-center gap-2 px-4 h-12">
          <Button
            shape="circle"
            type="text"
            icon={<IconArrowLeft />}
            onClick={() => navigate(-1)}
          />
          <h1 className="text-sm font-semibold flex items-center gap-1.5">
            <IconTrophy style={{ color: "rgb(var(--gold-6))" }} />
            Nâng cấp Premium
          </h1>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-10">
        {/* Hero */}
        <div className="text-center mb-8">
          <Tag color="red" icon={<IconFire />} className="mb-4" size="medium">
            Flash Sale — Giảm đến 60% · Số lượng có hạn
          </Tag>
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-3">
            Mở khóa toàn bộ sức mạnh{" "}
            <span style={{ color: "rgb(var(--gold-6))" }}>AI IQX</span>
          </h2>
          <p
            className="text-sm max-w-lg mx-auto leading-relaxed"
            style={{ color: "var(--color-text-3)" }}
          >
            Truy cập không giới hạn tất cả công cụ phân tích AI, tín hiệu giao dịch
            real-time và hệ thống dự báo 6 lớp chuyên sâu.
          </p>
        </div>

        {/* Plans Grid */}
        {isLoading ? (
          <div className="flex justify-center py-20">
            <Spin size={28} />
          </div>
        ) : (
          <Row gutter={[20, 20]} className="mb-12">
            {(plans ?? []).map((plan: PlanInfo) => {
              const meta = PLAN_META[plan.plan] ?? PLAN_META.MONTHLY
              const isPopular = meta.popular === true
              const isCheckingOut =
                checkout.isPending && checkout.variables === plan.plan
              const monthlyPrice = Math.round(plan.price / plan.months)
              const accent =
                meta.color === "gold"
                  ? "rgb(var(--gold-6))"
                  : meta.color === "green"
                    ? "rgb(var(--green-6))"
                    : "rgb(var(--primary-6))"

              return (
                <Col key={plan.plan} xs={24} md={8}>
                  <Card
                    bordered
                    hoverable
                    className="h-full relative"
                    style={
                      isPopular
                        ? { borderColor: accent, boxShadow: "0 8px 24px rgba(0,0,0,0.08)" }
                        : undefined
                    }
                    bodyStyle={{ padding: 20 }}
                  >
                    {meta.badge && (
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-10">
                        <Tag
                          color={
                            meta.color === "gold"
                              ? "gold"
                              : meta.color === "green"
                                ? "green"
                                : "red"
                          }
                          icon={isPopular ? <IconFire /> : undefined}
                          bordered
                        >
                          {meta.badge}
                        </Tag>
                      </div>
                    )}

                    {/* Plan header */}
                    <Space align="center" className="mb-1">
                      <span style={{ color: accent, fontSize: 18 }}>{meta.icon}</span>
                      <h3 className="text-lg font-bold">{plan.label}</h3>
                    </Space>
                    <p className="text-xs mb-4" style={{ color: "var(--color-text-3)" }}>
                      {meta.tagline}
                    </p>

                    {/* Price block */}
                    <div className="mb-1">
                      <Space size="small" className="mb-1.5">
                        <span
                          className="text-xs line-through"
                          style={{ color: "var(--color-text-4)" }}
                        >
                          {fmtPrice(meta.originalTotal)}₫
                        </span>
                        <Tag color="red" size="small">
                          -{meta.discount}%
                        </Tag>
                      </Space>
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-3xl font-black tracking-tight">
                          {fmtPrice(plan.price)}
                        </span>
                        <span
                          className="text-sm font-medium"
                          style={{ color: "var(--color-text-3)" }}
                        >
                          ₫
                        </span>
                      </div>
                      {plan.months > 1 ? (
                        <p className="text-[11px] mt-1" style={{ color: "var(--color-text-3)" }}>
                          ≈{" "}
                          <span className="font-semibold" style={{ color: "rgb(var(--green-6))" }}>
                            {fmtPrice(monthlyPrice)}₫
                          </span>
                          /tháng
                        </p>
                      ) : (
                        <p className="text-[11px] mt-1" style={{ color: "var(--color-text-3)" }}>
                          cho 1 tháng sử dụng
                        </p>
                      )}
                    </div>

                    {/* Savings callout */}
                    {plan.months > 1 && (
                      <div
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium my-3"
                        style={{
                          background: meta.color === "gold" ? "rgb(var(--gold-1))" : "rgb(var(--green-1))",
                          color: accent,
                        }}
                      >
                        <IconThunderbolt />
                        Tiết kiệm {fmtPrice(meta.originalTotal - plan.price)}₫ so với mua lẻ
                      </div>
                    )}

                    {/* CTA */}
                    <Button
                      long
                      type="primary"
                      size="large"
                      className="my-3 font-bold"
                      loading={isCheckingOut}
                      disabled={isPremium}
                      onClick={() => handleSelectPlan(plan.plan)}
                    >
                      {isCheckingOut
                        ? "Đang chuyển tới SePay..."
                        : isPremium
                          ? "Bạn đã là Premium"
                          : isPopular
                            ? "Chọn gói phổ biến nhất"
                            : "Chọn gói này"}
                    </Button>

                    {/* Features */}
                    <Space direction="vertical" size="small" style={{ width: "100%" }}>
                      {PREMIUM_FEATURES.map((f, i) => (
                        <div key={i} className="flex items-start gap-2.5">
                          <IconCheck
                            style={{ color: accent, marginTop: 3, flexShrink: 0 }}
                          />
                          <span className="text-xs leading-relaxed" style={{ color: "var(--color-text-2)" }}>
                            {f.text}
                          </span>
                        </div>
                      ))}
                    </Space>
                  </Card>
                </Col>
              )
            })}
          </Row>
        )}

        {/* Guarantee */}
        <div className="max-w-md mx-auto text-center mb-6">
          <Tag size="medium" icon={<IconSafe style={{ color: "rgb(var(--green-6))" }} />}>
            Hoàn tiền 100% trong 7 ngày nếu không hài lòng
          </Tag>
        </div>

        {/* Trust badges */}
        <div
          className="flex flex-wrap items-center justify-center gap-6 text-[11px]"
          style={{ color: "var(--color-text-3)" }}
        >
          <span className="flex items-center gap-1.5">
            <IconSafe />
            Thanh toán bảo mật qua SePay
          </span>
          <span className="flex items-center gap-1.5">
            <IconCheck />
            Kích hoạt tự động sau thanh toán
          </span>
          <span className="flex items-center gap-1.5">
            <IconCustomerService />
            Hỗ trợ 24/7
          </span>
        </div>
      </div>
    </div>
  )
}
