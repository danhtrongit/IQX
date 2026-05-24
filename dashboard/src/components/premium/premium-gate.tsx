import type { ReactNode } from "react"
import { usePremiumStatus } from "@/hooks/use-premium-status"
import { PremiumLockedOverlay } from "./premium-locked-overlay"

interface PremiumGateProps {
  featureName: string
  description?: string
  children: ReactNode
  onAuthRequested?: () => void
}

export function PremiumGate({ featureName, description, children, onAuthRequested }: PremiumGateProps) {
  const { isPremium, isLoading } = usePremiumStatus()

  if (isLoading) {
    return (
      <div className="relative h-full w-full">
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="size-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      </div>
    )
  }

  if (isPremium) {
    return <>{children}</>
  }

  return (
    <div className="relative h-full w-full overflow-hidden">
      <div aria-hidden className="pointer-events-none blur-sm opacity-40 h-full w-full">
        {children}
      </div>
      <PremiumLockedOverlay featureName={featureName} description={description} onAuthRequested={onAuthRequested} />
    </div>
  )
}
