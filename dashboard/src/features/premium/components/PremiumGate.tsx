import type { ReactNode } from "react"
import { Spin } from "@arco-design/web-react"
import { usePremiumStatus } from "../hooks"
import { PremiumLockedOverlay } from "./PremiumLockedOverlay"

interface PremiumGateProps {
  featureName: string
  description?: string
  children: ReactNode
  onAuthRequested?: () => void
}

/**
 * Wraps premium-only content: shows a spinner while status loads, renders
 * children for premium users, otherwise blurs them behind a locked overlay.
 */
export function PremiumGate({
  featureName,
  description,
  children,
  onAuthRequested,
}: PremiumGateProps) {
  const { isPremium, isLoading } = usePremiumStatus()

  if (isLoading) {
    return (
      <div className="relative h-full w-full">
        <div className="absolute inset-0 flex items-center justify-center">
          <Spin />
        </div>
      </div>
    )
  }

  if (isPremium) return <>{children}</>

  return (
    <div className="relative h-full w-full overflow-hidden">
      <div aria-hidden className="pointer-events-none blur-sm opacity-40 h-full w-full">
        {children}
      </div>
      <PremiumLockedOverlay
        featureName={featureName}
        description={description}
        onAuthRequested={onAuthRequested}
      />
    </div>
  )
}
