import { lazy, Suspense } from "react"
import { Routes, Route } from "react-router"
import { LoginPage } from "@/features/auth/login-page"
import { RequireAdmin } from "@/features/auth/require-admin"
import { AdminShell } from "@/components/layout/admin-shell"
import { PageLoader } from "@/components/common/page-loader"

const DashboardPage = lazy(() => import("@/features/dashboard/dashboard-page"))
const UsersPage = lazy(() => import("@/features/users/users-page"))
const UserDetailPage = lazy(() => import("@/features/users/user-detail-page"))
const PlansPage = lazy(() => import("@/features/plans/plans-page"))
const SubscriptionsPage = lazy(() => import("@/features/subscriptions/subscriptions-page"))
const SubscriptionDetailPage = lazy(() => import("@/features/subscriptions/subscription-detail-page"))
const PaymentsPage = lazy(() => import("@/features/payments/payments-page"))
const PaymentDetailPage = lazy(() => import("@/features/payments/payment-detail-page"))
const IPNLogsPage = lazy(() => import("@/features/ipn/ipn-logs-page"))
const VTAccountsPage = lazy(() => import("@/features/vt/vt-accounts-page"))
const VTAccountDetailPage = lazy(() => import("@/features/vt/vt-account-detail-page"))
const VTConfigPage = lazy(() => import("@/features/vt/vt-config-page"))
const AuditPage = lazy(() => import("@/features/audit/audit-page"))
const SystemPage = lazy(() => import("@/features/system/system-page"))

export default function App() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/"
          element={
            <RequireAdmin>
              <AdminShell />
            </RequireAdmin>
          }
        >
          <Route index element={<DashboardPage />} />
          <Route path="users" element={<UsersPage />} />
          <Route path="users/:userId" element={<UserDetailPage />} />
          <Route path="plans" element={<PlansPage />} />
          <Route path="subscriptions" element={<SubscriptionsPage />} />
          <Route path="subscriptions/:subId" element={<SubscriptionDetailPage />} />
          <Route path="payments" element={<PaymentsPage />} />
          <Route path="payments/:paymentId" element={<PaymentDetailPage />} />
          <Route path="ipn" element={<IPNLogsPage />} />
          <Route path="vt/accounts" element={<VTAccountsPage />} />
          <Route path="vt/accounts/:accountId" element={<VTAccountDetailPage />} />
          <Route path="vt/config" element={<VTConfigPage />} />
          <Route path="audit" element={<AuditPage />} />
          <Route path="system" element={<SystemPage />} />
        </Route>
      </Routes>
    </Suspense>
  )
}
