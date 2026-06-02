import type { ReactNode } from "react"
import { Navigate } from "react-router"
import { useAuth } from "@/contexts/auth-context"
import { PageLoader } from "@/components/common/page-loader"

interface RequireAdminProps {
  children: ReactNode
}

export function RequireAdmin({ children }: RequireAdminProps) {
  const { user, isAuthenticated, isLoading } = useAuth()

  if (isLoading) return <PageLoader />

  if (!isAuthenticated || user?.role !== "admin") {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}
