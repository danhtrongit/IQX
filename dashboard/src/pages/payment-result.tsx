import { useEffect } from "react"
import { useNavigate } from "react-router"
import { CheckCircle2, XCircle, Ban, ArrowLeft, Crown, Home } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/contexts/auth-context"

type ResultType = "success" | "error" | "cancel"

const CONFIG: Record<ResultType, {
  icon: React.ReactNode
  title: string
  description: string
  color: string
  bgGlow: string
}> = {
  success: {
    icon: <CheckCircle2 className="size-16" />,
    title: "Thanh toán thành công!",
    description: "Tài khoản của bạn đã được nâng cấp lên Premium. Tận hưởng đầy đủ tính năng ngay bây giờ!",
    color: "text-emerald-500",
    bgGlow: "bg-emerald-500/10",
  },
  error: {
    icon: <XCircle className="size-16" />,
    title: "Thanh toán thất bại",
    description: "Đã xảy ra lỗi trong quá trình thanh toán. Vui lòng thử lại hoặc liên hệ hỗ trợ nếu vấn đề vẫn tiếp diễn.",
    color: "text-destructive",
    bgGlow: "bg-destructive/10",
  },
  cancel: {
    icon: <Ban className="size-16" />,
    title: "Đã hủy thanh toán",
    description: "Bạn đã hủy giao dịch. Không có khoản phí nào bị trừ. Bạn có thể quay lại và chọn gói khác bất cứ lúc nào.",
    color: "text-amber-500",
    bgGlow: "bg-amber-500/10",
  },
}

export default function PaymentResultPage({ type }: { type: ResultType }) {
  const navigate = useNavigate()
  const { refreshUser } = useAuth()
  const config = CONFIG[type]

  // Auto-refresh user data on payment success to update role in header
  useEffect(() => {
    if (type === "success") {
      refreshUser()
    }
  }, [type, refreshUser])

  return (
    <div className="min-h-screen bg-background flex items-center justify-center relative">
      {/* Background glow */}
      <div className={`absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] rounded-full ${config.bgGlow} blur-[120px] pointer-events-none`} />

      <div className="text-center max-w-md px-6 relative z-10">
        <div className={`${config.color} mb-6 flex justify-center`}>
          {config.icon}
        </div>

        <h1 className="text-2xl font-bold tracking-tight mb-3">{config.title}</h1>
        <p className="text-sm text-muted-foreground leading-relaxed mb-8">{config.description}</p>

        <div className="flex flex-col sm:flex-row items-center gap-3 justify-center">
          {type === "success" ? (
            <>
              <Button
                onClick={() => navigate("/cai-dat")}
                className="gap-1.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white border-none"
              >
                <Crown className="size-4" />
                Xem tài khoản Premium
              </Button>
              <Button variant="outline" onClick={() => navigate("/")}>
                <Home className="size-4 mr-1.5" />
                Về trang chủ
              </Button>
            </>
          ) : (
            <>
              <Button onClick={() => navigate("/nang-cap")} className="gap-1.5">
                <ArrowLeft className="size-4" />
                Thử lại
              </Button>
              <Button variant="outline" onClick={() => navigate("/")}>
                <Home className="size-4 mr-1.5" />
                Về trang chủ
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
