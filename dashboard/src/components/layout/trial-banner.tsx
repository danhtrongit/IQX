import { useEffect, useState } from "react"
import { Link } from "react-router"
import { Crown, X } from "lucide-react"
import { usePremiumStatus } from "@/hooks/use-premium-status"

const DISMISS_KEY = "trial_banner_dismissed_at"
const DISMISS_TTL_MS = 1000 * 60 * 60 * 12 // 12h

function isDismissed(daysRemaining: number): boolean {
  if (daysRemaining <= 2) return false // Hiển thị lại khi sắp hết
  const raw = localStorage.getItem(DISMISS_KEY)
  if (!raw) return false
  const at = parseInt(raw, 10)
  if (Number.isNaN(at)) return false
  return Date.now() - at < DISMISS_TTL_MS
}

export function TrialBanner() {
  const { isTrial, daysRemaining } = usePremiumStatus()
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    setDismissed(isDismissed(daysRemaining))
  }, [daysRemaining])

  if (!isTrial || daysRemaining <= 0 || dismissed) {
    return null
  }

  const handleDismiss = () => {
    localStorage.setItem(DISMISS_KEY, String(Date.now()))
    setDismissed(true)
  }

  return (
    <div className="flex items-center justify-between gap-2 px-3 py-1.5 bg-primary/10 border-b border-primary/20 text-xs">
      <div className="flex items-center gap-1.5 text-foreground">
        <Crown className="size-3.5 text-primary" />
        <span>
          Bạn đang dùng thử Premium — còn <strong>{daysRemaining} ngày</strong>.{" "}
          <Link to="/nang-cap" className="text-primary font-medium hover:underline">
            Nâng cấp ngay →
          </Link>
        </span>
      </div>
      <button
        onClick={handleDismiss}
        className="size-5 rounded hover:bg-primary/20 flex items-center justify-center text-muted-foreground"
        aria-label="Ẩn"
      >
        <X className="size-3" />
      </button>
    </div>
  )
}
