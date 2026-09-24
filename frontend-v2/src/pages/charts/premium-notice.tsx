/**
 * Premium notice for the gated stock surfaces (AI Insight, BCTC AI memo).
 *
 * Backend entitlement is authoritative. Guests sign in; free users can upgrade.
 */
import { LockKeyhole } from "lucide-react"
import { Link } from "react-router"

import { Button } from "@/components/ui/button"
import { useAuth } from "@/hooks/use-auth"

export function PremiumNotice({ featureName, description }: { featureName: string; description?: string }) {
  const { user, isLoading, openAuth } = useAuth()

  return (
    <div className="flex min-w-0 flex-col items-center gap-3 px-4 py-10 text-center">
      <LockKeyhole className="size-6 text-muted-foreground/70" aria-hidden="true" />
      <div className="space-y-1">
        <p className="text-sm font-semibold">{featureName} là tính năng Premium</p>
        <p className="max-w-md text-xs leading-5 text-muted-foreground">
          {description ??
            "Nâng cấp tài khoản Premium để mở khoá nội dung này. Dữ liệu bên dưới vẫn hiển thị đầy đủ sau khi nâng cấp."}
        </p>
      </div>
      {!user && !isLoading && (
        <Button type="button" variant="outline" onClick={() => openAuth()}>
          Đăng nhập
        </Button>
      )}
      {user && <Button asChild><Link to="/nang-cap">Nâng cấp Premium</Link></Button>}
    </div>
  )
}
