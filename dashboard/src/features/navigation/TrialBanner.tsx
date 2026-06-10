import { useState } from "react"
import { Link } from "react-router"
import { Button } from "@arco-design/web-react"
import { IconClose } from "@arco-design/web-react/icon"
import { usePremiumStatus } from "@/features/premium"
import { IconCrown } from "./icons"

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
  // Locally-dismissed flag for this session (the persisted 12h TTL lives in
  // localStorage and is re-read whenever `daysRemaining` changes — see below).
  const [sessionDismissed, setSessionDismissed] = useState(false)
  // Recompute the persisted-dismiss state during render when `daysRemaining`
  // changes, instead of in an effect (avoids a cascading re-render).
  const [lastDays, setLastDays] = useState(daysRemaining)
  const [persistDismissed, setPersistDismissed] = useState(() => isDismissed(daysRemaining))
  if (lastDays !== daysRemaining) {
    setLastDays(daysRemaining)
    setPersistDismissed(isDismissed(daysRemaining))
    setSessionDismissed(false)
  }

  if (!isTrial || daysRemaining <= 0 || sessionDismissed || persistDismissed) {
    return null
  }

  const handleDismiss = () => {
    localStorage.setItem(DISMISS_KEY, String(Date.now()))
    setSessionDismissed(true)
  }

  return (
    <div
      className="flex items-center justify-between gap-2 px-3 py-1.5 text-xs"
      style={{
        background: "var(--color-primary-light-1)",
        borderBottom: "1px solid var(--color-primary-light-2)",
      }}
    >
      <div className="flex items-center gap-1.5 text-[var(--color-text-1)]">
        <IconCrown style={{ color: "rgb(var(--primary-6))" }} />
        <span>
          Bạn đang dùng thử Premium — còn <strong>{daysRemaining} ngày</strong>.{" "}
          <Link
            to="/nang-cap"
            className="font-medium hover:underline"
            style={{ color: "rgb(var(--primary-6))" }}
          >
            Nâng cấp ngay →
          </Link>
        </span>
      </div>
      <Button
        type="text"
        size="mini"
        shape="circle"
        aria-label="Ẩn"
        icon={<IconClose />}
        onClick={handleDismiss}
      />
    </div>
  )
}
