import { useState, useEffect } from "react"
import { useNavigate } from "react-router"
import {
  Crown,
  Zap,
  Rocket,
  Check,
  ArrowLeft,
  Loader2,
  Shield,
  TrendingUp,
  BrainCircuit,
  Bell,
  BarChart3,
  Headphones,
  Sparkles,
  BadgePercent,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/contexts/auth-context"
import { paymentsApi, type PlanInfo } from "@/lib/api"
import { toast } from "sonner"

/* ── Plan metadata (discount/original prices) ──────── */

interface PlanMeta {
  icon: React.ReactNode
  originalMonthly: number   // giá gốc 1 tháng
  discount: number          // % giảm
  badge: string | null
  tagline: string
}

const PLAN_META: Record<string, PlanMeta> = {
  MONTHLY: {
    icon: <Zap className="size-5" />,
    originalMonthly: 100_000,
    discount: 50,
    badge: "Giảm 50%",
    tagline: "Trải nghiệm linh hoạt theo tháng",
  },
  SEMI_ANNUAL: {
    icon: <Crown className="size-5" />,
    originalMonthly: 100_000,
    discount: 55,
    badge: "Phổ biến nhất · Giảm 55%",
    tagline: "Lựa chọn tiêu chuẩn, tối ưu chi phí",
  },
  ANNUAL: {
    icon: <Rocket className="size-5" />,
    originalMonthly: 100_000,
    discount: 60,
    badge: "Tiết kiệm tối đa · Giảm 60%",
    tagline: "Đầu tư dài hạn, tiết kiệm tối đa",
  },
}

const PREMIUM_FEATURES = [
  { icon: <BrainCircuit className="size-4" />, text: "Truy cập đầy đủ 6 lớp AI Insight" },
  { icon: <TrendingUp className="size-4" />, text: "Phân tích & kịch bản hành động chi tiết" },
  { icon: <BarChart3 className="size-4" />, text: "Tra cứu dữ liệu thị trường real-time" },
  { icon: <Bell className="size-4" />, text: "Hệ thống cảnh báo điểm mua/bán sớm" },
  { icon: <Shield className="size-4" />, text: "Lưu trữ danh mục theo dõi không giới hạn" },
  { icon: <Headphones className="size-4" />, text: "Hỗ trợ khách hàng ưu tiên 24/7" },
]

function fmtPrice(amount: number) {
  return new Intl.NumberFormat("vi-VN").format(amount)
}

export default function PremiumPage() {
  const navigate = useNavigate()
  const { user, isAuthenticated, setShowAuthModal, setAuthModalTab } = useAuth()
  const [plans, setPlans] = useState<PlanInfo[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [checkingOut, setCheckingOut] = useState<string | null>(null)

  const isPremium = user?.role === "PREMIUM" || user?.role === "ADMIN"

  useEffect(() => {
    loadPlans()
  }, [])

  async function loadPlans() {
    try {
      const res = await paymentsApi.getPlans()
      setPlans(res.data)
    } catch {
      toast.error("Không thể tải danh sách gói")
    } finally {
      setIsLoading(false)
    }
  }

  async function handleSelectPlan(planKey: string) {
    if (!isAuthenticated) {
      setAuthModalTab("register")
      setShowAuthModal(true)
      return
    }

    if (isPremium) {
      toast.info("Bạn đã là thành viên Premium!")
      return
    }

    setCheckingOut(planKey)
    try {
      const res = await paymentsApi.createCheckout(planKey)
      const { checkoutUrl, fields } = res.data

      const form = document.createElement("form")
      form.method = "POST"
      form.action = `${checkoutUrl}`
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
    } catch (err: any) {
      let msg = "Không thể tạo đơn thanh toán"
      try {
        const body = await err?.response?.json()
        const detail = body?.detail || body?.message
        if (detail) msg = typeof detail === "string" ? detail : msg
      } catch { /* */ }
      toast.error(msg)
      setCheckingOut(null)
    }
  }

  const popularPlan = "SEMI_ANNUAL"

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      {/* Background decorations */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] rounded-full bg-primary/5 blur-[120px]" />
        <div className="absolute bottom-0 right-0 w-[400px] h-[300px] rounded-full bg-amber-500/5 blur-[100px]" />
      </div>

      {/* Top bar */}
      <div className="border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-20 relative">
        <div className="max-w-5xl mx-auto flex items-center gap-3 px-4 h-12">
          <Button variant="ghost" size="icon" className="size-8" onClick={() => navigate(-1)}>
            <ArrowLeft className="size-4" />
          </Button>
          <h1 className="text-sm font-semibold flex items-center gap-1.5">
            <Crown className="size-4 text-amber-500" />
            Nâng cấp Premium
          </h1>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-10 relative z-10">
        {/* Hero */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-500 text-xs font-medium mb-4">
            <Sparkles className="size-3" />
            Ưu đãi đặc biệt — Giảm đến 60%
          </div>
          <h2 className="text-3xl font-bold tracking-tight mb-3">
            Mở khóa toàn bộ sức mạnh{" "}
            <span className="bg-gradient-to-r from-amber-400 to-orange-500 bg-clip-text text-transparent">
              AI IQX
            </span>
          </h2>
          <p className="text-sm text-muted-foreground max-w-lg mx-auto leading-relaxed">
            Truy cập không giới hạn tất cả công cụ phân tích chuyên sâu, tín hiệu giao dịch và AI Insight
            để đưa ra quyết định đầu tư chính xác nhất.
          </p>
        </div>

        {/* Plans Grid */}
        {isLoading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="size-6 animate-spin text-primary" />
          </div>
        ) : (
          <div className="grid md:grid-cols-3 gap-5 max-w-4xl mx-auto mb-12">
            {plans.map((plan) => {
              const meta = PLAN_META[plan.plan] || PLAN_META.MONTHLY
              const isPopular = plan.plan === popularPlan
              const isCheckingOut = checkingOut === plan.plan
              const monthlyPrice = Math.round(plan.price / plan.months)
              const originalTotal = meta.originalMonthly * plan.months

              return (
                <div
                  key={plan.plan}
                  className={`relative rounded-2xl border transition-all duration-300 hover:-translate-y-1 ${
                    isPopular
                      ? "border-amber-500/30 bg-gradient-to-b from-amber-500/[0.04] to-transparent shadow-lg shadow-amber-500/5"
                      : "border-border bg-card hover:border-border/80 hover:shadow-lg hover:shadow-black/10"
                  }`}
                >
                  {/* Badge */}
                  {meta.badge && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                      <span className={`text-[10px] font-bold px-3 py-1 rounded-full whitespace-nowrap flex items-center gap-1 ${
                        isPopular
                          ? "bg-gradient-to-r from-amber-500 to-orange-500 text-white"
                          : "bg-red-500/10 text-red-500 border border-red-500/20"
                      }`}>
                        <BadgePercent className="size-3" />
                        {meta.badge}
                      </span>
                    </div>
                  )}

                  {/* Top glow for popular */}
                  {isPopular && (
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3/4 h-px bg-gradient-to-r from-transparent via-amber-500 to-transparent" />
                  )}

                  <div className="p-6">
                    {/* Plan name */}
                    <div className="flex items-center gap-2.5 mb-1">
                      <div className={`${isPopular ? "text-amber-500" : "text-primary"}`}>
                        {meta.icon}
                      </div>
                      <h3 className="text-lg font-bold">{plan.label}</h3>
                    </div>
                    <p className="text-xs text-muted-foreground mb-5">
                      {meta.tagline}
                    </p>

                    {/* Price section */}
                    <div className="mb-1">
                      <div className="flex items-baseline gap-2 mb-0.5">
                        <span className="text-3xl font-extrabold tracking-tight">
                          {fmtPrice(monthlyPrice)}
                        </span>
                        <span className="text-sm text-muted-foreground">₫/tháng</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground line-through">
                          {fmtPrice(meta.originalMonthly)}₫
                        </span>
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-500/10 text-red-500">
                          -{meta.discount}%
                        </span>
                      </div>
                    </div>

                    {plan.months > 1 ? (
                      <p className="text-[11px] text-muted-foreground mb-5">
                        Thanh toán <span className="font-semibold text-foreground">{fmtPrice(plan.price)}₫</span>{" "}
                        cho {plan.months} tháng
                        <span className="ml-1 line-through text-muted-foreground/60">{fmtPrice(originalTotal)}₫</span>
                      </p>
                    ) : (
                      <p className="text-[11px] text-muted-foreground mb-5">
                        Thanh toán <span className="font-semibold text-foreground">{fmtPrice(plan.price)}₫</span>/tháng
                      </p>
                    )}

                    {/* CTA */}
                    <Button
                      className={`w-full h-10 font-semibold text-sm mb-5 ${
                        isPopular
                          ? "bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white border-none shadow-md shadow-amber-500/20"
                          : ""
                      }`}
                      variant={isPopular ? "default" : "outline"}
                      disabled={isCheckingOut || isPremium}
                      onClick={() => handleSelectPlan(plan.plan)}
                    >
                      {isCheckingOut ? (
                        <>
                          <Loader2 className="size-4 animate-spin mr-2" />
                          Đang chuyển tới thanh toán...
                        </>
                      ) : isPremium ? (
                        "Bạn đã là Premium ✓"
                      ) : (
                        <>
                          Chọn gói này
                          {isPopular && <Sparkles className="size-3.5 ml-1.5" />}
                        </>
                      )}
                    </Button>

                    {/* Features */}
                    <div className="space-y-2.5">
                      {PREMIUM_FEATURES.map((f, i) => (
                        <div key={i} className="flex items-start gap-2.5">
                          <Check
                            className={`size-3.5 mt-0.5 shrink-0 ${
                              isPopular ? "text-amber-500" : "text-primary/60"
                            }`}
                          />
                          <span className="text-xs text-muted-foreground leading-relaxed">
                            {f.text}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Trust badges */}
        <div className="flex flex-wrap items-center justify-center gap-6 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Shield className="size-3.5" />
            Thanh toán bảo mật qua SePay
          </span>
          <span className="flex items-center gap-1.5">
            <Check className="size-3.5" />
            Kích hoạt tự động sau thanh toán
          </span>
          <span className="flex items-center gap-1.5">
            <Headphones className="size-3.5" />
            Hỗ trợ 24/7
          </span>
        </div>
      </div>
    </div>
  )
}
