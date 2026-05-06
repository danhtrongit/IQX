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
  Timer,
  Star,
  Flame,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/contexts/auth-context"
import { paymentsApi, type PlanInfo } from "@/lib/api"
import { toast } from "sonner"

/* ── Plan metadata ──────────────────────────────────── */

interface PlanMeta {
  icon: React.ReactNode
  originalTotal: number
  discount: number
  badge: string | null
  tagline: string
  highlight?: string
  popular?: boolean
}

const PLAN_META: Record<string, PlanMeta> = {
  MONTHLY: {
    icon: <Zap className="size-5" />,
    originalTotal: 100_000,
    discount: 50,
    badge: "Giảm 50%",
    tagline: "Trải nghiệm linh hoạt",
  },
  SEMI_ANNUAL: {
    icon: <Crown className="size-5" />,
    originalTotal: 600_000,
    discount: 55,
    badge: "Phổ biến nhất",
    tagline: "Tối ưu chi phí dài hạn",
    highlight: "Chỉ 37.500₫/tháng",
    popular: true,
  },
  ANNUAL: {
    icon: <Rocket className="size-5" />,
    originalTotal: 1_200_000,
    discount: 60,
    badge: "Tiết kiệm nhất",
    tagline: "Cam kết đầu tư nghiêm túc",
    highlight: "Chỉ 33.333₫/tháng",
  },
}

const PREMIUM_FEATURES = [
  { icon: <BrainCircuit className="size-4" />, text: "Truy cập đầy đủ 6 lớp AI Insight" },
  { icon: <TrendingUp className="size-4" />, text: "Phân tích & kịch bản hành động chi tiết" },
  { icon: <BarChart3 className="size-4" />, text: "Dữ liệu thị trường real-time không giới hạn" },
  { icon: <Bell className="size-4" />, text: "Cảnh báo điểm mua/bán AI sớm nhất" },
  { icon: <Shield className="size-4" />, text: "Đấu trường giao dịch ảo 1 tỷ VND" },
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

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      {/* Background decorations */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[500px] rounded-full bg-amber-500/4 blur-[150px]" />
        <div className="absolute bottom-0 left-0 w-[500px] h-[400px] rounded-full bg-primary/3 blur-[120px]" />
        <div className="absolute top-1/3 right-0 w-[300px] h-[300px] rounded-full bg-orange-500/3 blur-[100px]" />
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
        <div className="text-center mb-4">
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gradient-to-r from-red-500/10 to-amber-500/10 border border-red-500/20 text-red-500 text-xs font-bold mb-4 animate-pulse">
            <Flame className="size-3.5" />
            Flash Sale — Giảm đến 60% · Số lượng có hạn
          </div>
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-3">
            Mở khóa toàn bộ sức mạnh{" "}
            <span className="bg-gradient-to-r from-amber-400 via-orange-500 to-red-500 bg-clip-text text-transparent">
              AI IQX
            </span>
          </h2>
          <p className="text-sm text-muted-foreground max-w-lg mx-auto leading-relaxed mb-2">
            Truy cập không giới hạn tất cả công cụ phân tích AI, tín hiệu giao dịch real-time
            và hệ thống dự báo 6 lớp chuyên sâu.
          </p>
        </div>

        {/* Social proof */}
        <div className="flex items-center justify-center gap-4 mb-10 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Star className="size-3 text-amber-500 fill-amber-500" />
            <Star className="size-3 text-amber-500 fill-amber-500" />
            <Star className="size-3 text-amber-500 fill-amber-500" />
            <Star className="size-3 text-amber-500 fill-amber-500" />
            <Star className="size-3 text-amber-500 fill-amber-500" />
            <span className="ml-1 font-medium text-foreground">4.9/5</span>
          </span>
          <span className="text-border">|</span>
          <span>Được tin dùng bởi <span className="font-medium text-foreground">500+</span> nhà đầu tư</span>
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
              const isPopular = meta.popular === true
              const isCheckingOut = checkingOut === plan.plan
              const monthlyPrice = Math.round(plan.price / plan.months)

              return (
                <div
                  key={plan.plan}
                  className={`relative rounded-2xl border transition-all duration-300 hover:-translate-y-1.5 hover:shadow-xl ${
                    isPopular
                      ? "border-amber-500/40 bg-gradient-to-b from-amber-500/[0.06] via-amber-500/[0.02] to-transparent shadow-lg shadow-amber-500/10 scale-[1.02]"
                      : "border-border bg-card hover:border-border/80 hover:shadow-black/10"
                  }`}
                >
                  {/* Badge */}
                  {meta.badge && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-10">
                      <span className={`text-[10px] font-bold px-3 py-1 rounded-full whitespace-nowrap flex items-center gap-1 ${
                        isPopular
                          ? "bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-md shadow-amber-500/30"
                          : plan.plan === "ANNUAL"
                            ? "bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-md shadow-emerald-500/20"
                            : "bg-red-500/10 text-red-500 border border-red-500/20"
                      }`}>
                        {isPopular ? <Flame className="size-3" /> : <BadgePercent className="size-3" />}
                        {meta.badge}
                      </span>
                    </div>
                  )}

                  {/* Top glow for popular */}
                  {isPopular && (
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3/4 h-px bg-gradient-to-r from-transparent via-amber-500 to-transparent" />
                  )}

                  <div className="p-6">
                    {/* Plan header */}
                    <div className="flex items-center gap-2.5 mb-1">
                      <div className={`p-1.5 rounded-lg ${
                        isPopular ? "bg-amber-500/10 text-amber-500" : "bg-primary/10 text-primary"
                      }`}>
                        {meta.icon}
                      </div>
                      <h3 className="text-lg font-bold">{plan.label}</h3>
                    </div>
                    <p className="text-xs text-muted-foreground mb-5">{meta.tagline}</p>

                    {/* Price block */}
                    <div className="mb-2">
                      {/* Discount badge */}
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="text-xs text-muted-foreground/70 line-through">
                          {fmtPrice(meta.originalTotal)}₫
                        </span>
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-red-500/10 text-red-500 border border-red-500/15">
                          -{meta.discount}%
                        </span>
                      </div>

                      {/* Sale price */}
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-3xl font-black tracking-tight bg-gradient-to-b from-foreground to-foreground/70 bg-clip-text text-transparent">
                          {fmtPrice(plan.price)}
                        </span>
                        <span className="text-sm text-muted-foreground font-medium">₫</span>
                      </div>

                      {/* Monthly equivalent for multi-month plans */}
                      {plan.months > 1 ? (
                        <p className="text-[11px] text-muted-foreground mt-1">
                          ≈ <span className="font-semibold text-emerald-500">{fmtPrice(monthlyPrice)}₫</span>/tháng
                        </p>
                      ) : (
                        <p className="text-[11px] text-muted-foreground mt-1">cho 1 tháng sử dụng</p>
                      )}
                    </div>

                    {/* Savings callout */}
                    {plan.months > 1 && (
                      <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium mb-4 ${
                        isPopular
                          ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                          : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                      }`}>
                        <Timer className="size-3 shrink-0" />
                        Tiết kiệm {fmtPrice(meta.originalTotal - plan.price)}₫ so với mua lẻ
                      </div>
                    )}
                    {plan.months === 1 && <div className="mb-4" />}

                    {/* CTA */}
                    <Button
                      className={`w-full h-11 font-bold text-sm mb-5 transition-all duration-200 ${
                        isPopular
                          ? "bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white border-none shadow-lg shadow-amber-500/25 hover:shadow-amber-500/40 hover:scale-[1.02]"
                          : plan.plan === "ANNUAL"
                            ? "bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white border-none shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/35 hover:scale-[1.02]"
                            : "hover:scale-[1.02]"
                      }`}
                      variant={isPopular || plan.plan === "ANNUAL" ? "default" : "outline"}
                      disabled={isCheckingOut || isPremium}
                      onClick={() => handleSelectPlan(plan.plan)}
                    >
                      {isCheckingOut ? (
                        <>
                          <Loader2 className="size-4 animate-spin mr-2" />
                          Đang chuyển tới SePay...
                        </>
                      ) : isPremium ? (
                        "Bạn đã là Premium ✓"
                      ) : (
                        <>
                          {isPopular ? "Chọn gói phổ biến nhất" : "Chọn gói này"}
                          <Sparkles className="size-3.5 ml-1.5" />
                        </>
                      )}
                    </Button>

                    {/* Features */}
                    <div className="space-y-2.5">
                      {PREMIUM_FEATURES.map((f, i) => (
                        <div key={i} className="flex items-start gap-2.5">
                          <div className={`mt-0.5 shrink-0 ${
                            isPopular ? "text-amber-500" : "text-primary/60"
                          }`}>
                            <Check className="size-3.5" />
                          </div>
                          <span className="text-xs text-muted-foreground leading-relaxed">{f.text}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Guarantee */}
        <div className="max-w-md mx-auto text-center mb-8">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-card border border-border text-sm">
            <Shield className="size-4 text-emerald-500" />
            <span className="text-muted-foreground">
              <span className="font-semibold text-foreground">Hoàn tiền 100%</span> trong 7 ngày nếu không hài lòng
            </span>
          </div>
        </div>

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
