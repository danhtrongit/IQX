import { lazy } from "react"
import { createBrowserRouter, Navigate, RouterProvider, useLocation, useParams } from "react-router"

import { AdminLayout } from "@/components/layout/admin-layout"
import { AppShell } from "@/components/layout/app-shell"
import { demoChrome, emptyChrome } from "@/config/chrome"
import { demoRouteRedirect } from "@/lib/demo-route-redirect"
import { MaintenancePage, NotFoundPage } from "@/pages/system/route-states"

const IntroductionPage = lazy(() => import("@/pages/introduction/introduction-page").then(module => ({ default: module.IntroductionPage })))
const StockDirectoryPage = lazy(() => import("@/pages/securities/stock-directory/stock-directory-page").then(module => ({ default: module.StockDirectoryPage })))
const StockDetailPage = lazy(() => import("@/pages/charts/stock-detail-page").then(module => ({ default: module.StockDetailPage })))
const DemoTradingPage = lazy(() => import("@/pages/demo-trading/demo-trading-page").then(module => ({ default: module.DemoTradingPage })))
const StrategyPage = lazy(() => import("@/pages/strategy/strategy-page").then(module => ({ default: module.StrategyPage })))
const SettingsPage = lazy(() => import("@/pages/account/settings-page").then(module => ({ default: module.SettingsPage })))
const PremiumPage = lazy(() => import("@/pages/account/premium-page").then(module => ({ default: module.PremiumPage })))
const PaymentResultPage = lazy(() => import("@/pages/account/payment-result-page").then(module => ({ default: module.PaymentResultPage })))
const ForgotPasswordPage = lazy(() => import("@/pages/account/forgot-password-page").then(module => ({ default: module.ForgotPasswordPage })))
const ResetPasswordPage = lazy(() => import("@/pages/account/reset-password-page").then(module => ({ default: module.ResetPasswordPage })))
const CatalogPage = lazy(() => import("@/pages/learning/catalog-page").then(module => ({ default: module.CatalogPage })))
const CourseDetailPage = lazy(() => import("@/pages/learning/course-detail-page").then(module => ({ default: module.CourseDetailPage })))
const EpisodeViewerPage = lazy(() => import("@/pages/learning/episode-viewer-page").then(module => ({ default: module.EpisodeViewerPage })))
const AdminDashboardPage = lazy(() => import("@/pages/admin/core/dashboard-page").then(module => ({ default: module.AdminDashboardPage })))
const UsersPage = lazy(() => import("@/pages/admin/core/users-page").then(module => ({ default: module.UsersPage })))
const UserDetailPage = lazy(() => import("@/pages/admin/core/user-detail-page").then(module => ({ default: module.UserDetailPage })))
const SystemPage = lazy(() => import("@/pages/admin/core/system-page").then(module => ({ default: module.SystemPage })))
const AuditPage = lazy(() => import("@/pages/admin/core/audit-page").then(module => ({ default: module.AuditPage })))
const AlertSignalsPage = lazy(() => import("@/pages/admin/core/alerts-page").then(module => ({ default: module.AlertSignalsPage })))
const PlansPage = lazy(() => import("@/pages/admin/revenue/plans-page").then(module => ({ default: module.PlansPage })))
const SubscriptionsPage = lazy(() => import("@/pages/admin/revenue/subscriptions-page").then(module => ({ default: module.SubscriptionsPage })))
const SubscriptionDetailPage = lazy(() => import("@/pages/admin/revenue/subscription-detail-page").then(module => ({ default: module.SubscriptionDetailPage })))
const PaymentsPage = lazy(() => import("@/pages/admin/revenue/payments-page").then(module => ({ default: module.PaymentsPage })))
const PaymentDetailPage = lazy(() => import("@/pages/admin/revenue/payment-detail-page").then(module => ({ default: module.PaymentDetailPage })))
const IpnLogsPage = lazy(() => import("@/pages/admin/revenue/ipn-logs-page").then(module => ({ default: module.IpnLogsPage })))
const VTAccountsPage = lazy(() => import("@/pages/admin/trading/vt-accounts-page").then(module => ({ default: module.VTAccountsPage })))
const VTAccountDetailPage = lazy(() => import("@/pages/admin/trading/vt-account-detail-page").then(module => ({ default: module.VTAccountDetailPage })))
const VTConfigPage = lazy(() => import("@/pages/admin/trading/vt-config-page").then(module => ({ default: module.VTConfigPage })))
const CoursesPage = lazy(() => import("@/pages/admin/learning/courses-page").then(module => ({ default: module.CoursesPage })))
const CourseEditPage = lazy(() => import("@/pages/admin/learning/course-edit-page").then(module => ({ default: module.CourseEditPage })))

function RedirectWithSearch({ to, tab }: { to: string; tab?: string }) {
  const location = useLocation()
  const search = new URLSearchParams(location.search)
  if (tab) search.set("tab", tab)
  return <Navigate replace to={{ pathname: to, search: search.toString() }} />
}

function BacktestSymbolRedirect() {
  const { symbol = "" } = useParams()
  const location = useLocation()
  const search = new URLSearchParams(location.search)
  search.set("tab", "backtest")
  search.set("symbol", symbol.toUpperCase())
  return <Navigate replace to={{ pathname: "/chien-luoc", search: `?${search}` }} />
}

function DemoContentRedirect({ content }: { content: "chart" | "board" | "ai-analysis" }) {
  const location = useLocation()
  return <Navigate replace to={demoRouteRedirect(content, location.search, location.hash)} />
}

const router = createBrowserRouter([
  {
    path: "/",
    Component: AppShell,
    children: [
      { index: true, Component: IntroductionPage, handle: { chrome: emptyChrome } },
      { path: "gioi-thieu", element: <RedirectWithSearch to="/" />, handle: { chrome: emptyChrome } },
      { path: "thi-truong", element: <DemoContentRedirect content="ai-analysis" />, handle: { chrome: emptyChrome } },
      { path: "co-phieu", Component: StockDirectoryPage, handle: { chrome: emptyChrome } },
      { path: "co-phieu/:symbol", Component: StockDetailPage, handle: { chrome: emptyChrome } },
      { path: "bang-gia", element: <DemoContentRedirect content="board" />, handle: { chrome: emptyChrome } },
      { path: "bieu-do", element: <DemoContentRedirect content="chart" />, handle: { chrome: emptyChrome } },
      { path: "dashboard", element: <DemoContentRedirect content="chart" />, handle: { chrome: emptyChrome } },
      { path: "demo-trading", Component: DemoTradingPage, handle: { chrome: demoChrome } },
      { path: "dau-truong", element: <RedirectWithSearch to="/demo-trading" />, handle: { chrome: emptyChrome } },
      { path: "chien-luoc", Component: StrategyPage, handle: { chrome: emptyChrome } },
      { path: "canh-bao", element: <RedirectWithSearch to="/chien-luoc" tab="canh-bao" />, handle: { chrome: emptyChrome } },
      { path: "backtest", element: <RedirectWithSearch to="/chien-luoc" tab="backtest" />, handle: { chrome: emptyChrome } },
      { path: "backtest/:symbol", Component: BacktestSymbolRedirect, handle: { chrome: emptyChrome } },
      { path: "bai-hoc", Component: CatalogPage, handle: { chrome: emptyChrome } },
      { path: "bai-hoc/:slug", Component: CourseDetailPage, handle: { chrome: emptyChrome } },
      { path: "bai-hoc/:slug/:episodeId", Component: EpisodeViewerPage, handle: { chrome: emptyChrome } },
      { path: "kien-thuc", Component: CatalogPage, handle: { chrome: emptyChrome } },
      { path: "cai-dat", Component: SettingsPage, handle: { chrome: emptyChrome } },
      { path: "nang-cap", Component: PremiumPage, handle: { chrome: emptyChrome } },
      { path: "quen-mat-khau", Component: ForgotPasswordPage, handle: { chrome: emptyChrome } },
      { path: "reset-password", Component: ResetPasswordPage, handle: { chrome: emptyChrome } },
      { path: "payment/success", element: <PaymentResultPage type="success" />, handle: { chrome: emptyChrome } },
      { path: "payment/error", element: <PaymentResultPage type="error" />, handle: { chrome: emptyChrome } },
      { path: "payment/cancel", element: <PaymentResultPage type="cancel" />, handle: { chrome: emptyChrome } },
      { path: "thanh-toan/thanh-cong", element: <PaymentResultPage type="success" />, handle: { chrome: emptyChrome } },
      { path: "thanh-toan/that-bai", element: <PaymentResultPage type="error" />, handle: { chrome: emptyChrome } },
      { path: "thanh-toan/huy", element: <PaymentResultPage type="cancel" />, handle: { chrome: emptyChrome } },
      {
        path: "admin",
        Component: AdminLayout,
        handle: { chrome: emptyChrome },
        children: [
          { index: true, Component: AdminDashboardPage },
          { path: "users", Component: UsersPage },
          { path: "users/:userId", Component: UserDetailPage },
          { path: "plans", Component: PlansPage },
          { path: "subscriptions", Component: SubscriptionsPage },
          { path: "subscriptions/:subId", Component: SubscriptionDetailPage },
          { path: "payments", Component: PaymentsPage },
          { path: "payments/:paymentId", Component: PaymentDetailPage },
          { path: "ipn", Component: IpnLogsPage },
          { path: "vt/accounts", Component: VTAccountsPage },
          { path: "vt/accounts/:accountId", Component: VTAccountDetailPage },
          { path: "vt/config", Component: VTConfigPage },
          { path: "audit", Component: AuditPage },
          { path: "system", Component: SystemPage },
          { path: "alerts", Component: AlertSignalsPage },
          { path: "lessons", Component: CoursesPage },
          { path: "lessons/new", Component: CourseEditPage },
          { path: "lessons/:id", Component: CourseEditPage },
        ],
      },
      { path: "503", Component: MaintenancePage, handle: { chrome: emptyChrome } },
      { path: "*", Component: NotFoundPage, handle: { chrome: emptyChrome } },
    ],
  },
])

export function App() {
  return <RouterProvider router={router} />
}

export default App
