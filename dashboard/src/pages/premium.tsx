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
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/contexts/auth-context"
import { paymentsApi, type PlanInfo } from "@/lib/api"
import { toast } from "sonner"

const PLAN_ICONS: Record<string, React.ReactNode> = {
  MONTHLY: <Zap className="size-5" />,
  QUARTERLY: <Zap className="size-5" />,
  SEMI_ANNUAL: <Crown className="size-5" />,
  ANNUAL: <Rocket className="size-5" />,
}

const PLAN_BADGES: Record<string, string> = {
  QUARTERLY: "Tiết kiệm 5%",
  SEMI_ANNUAL: "Phổ biến nhất",
  ANNUAL: "Tiết kiệm 20%",
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

      // Create hidden form and submit to SePay
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
        msg = Array.isArray(body.message) ? body.message[0] : body.message || msg
      } catch { /* */ }
      toast.error(msg)
      setCheckingOut(null)
    }
  }

  // Determine which plan is "popular"
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
            Đầu tư thông minh hơn
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
            {plans
              .filter((p) => p.plan !== "QUARTERLY")
              .map((plan) => {
                const isPopular = plan.plan === popularPlan
                const icon = PLAN_ICONS[plan.plan] || <Zap className="size-5" />
                const badge = PLAN_BADGES[plan.plan]
                const monthlyPrice = Math.round(plan.price / plan.months)
                const isCheckingOut = checkingOut === plan.plan

                return (
                  <div
                    key={plan.plan}
                    className={`relative rounded-2xl border transition-all duration-300 hover:-translate-y-1 ${
                      isPopular
                        ? "border-amber-500/30 bg-gradient-to-b from-amber-500/[0.04] to-transparent shadow-lg shadow-amber-500/5"
                        : "border-border bg-card hover:border-border/80 hover:shadow-lg hover:shadow-black/10"
                    }`}
                  >
                    {/* Popular badge */}
                    {badge && (
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                        <span className={`text-[10px] font-bold px-3 py-1 rounded-full ${
                          isPopular
                            ? "bg-gradient-to-r from-amber-500 to-orange-500 text-white"
                            : "bg-primary/10 text-primary border border-primary/20"
                        }`}>
                          {badge}
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
                          {icon}
                        </div>
                        <h3 className="text-lg font-bold">{plan.label}</h3>
                      </div>
                      <p className="text-xs text-muted-foreground mb-5">
                        {plan.months === 1
                          ? "Trải nghiệm linh hoạt theo tháng"
                          : plan.months === 6
                            ? "Lựa chọn tiêu chuẩn, tối ưu chi phí"
                            : "Đầu tư dài hạn, tiết kiệm tối đa"}
                      </p>

                      {/* Price */}
                      <div className="mb-1">
                        <span className="text-3xl font-extrabold tracking-tight">
                          {fmtPrice(monthlyPrice)}
                        </span>
                        <span className="text-sm text-muted-foreground ml-1">₫/tháng</span>
                      </div>
                      {plan.months > 1 && (
                        <p className="text-[11px] text-muted-foreground mb-5">
                          Thanh toán {fmtPrice(plan.price)} ₫ cho {plan.months} tháng
                        </p>
                      )}
                      {plan.months === 1 && (
                        <p className="text-[11px] text-muted-foreground mb-5">&nbsp;</p>
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
                            Đang xử lý...
                          </>
                        ) : isPremium ? (
                          "Bạn đã là Premium"
                        ) : (
                          "Chọn gói này"
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
