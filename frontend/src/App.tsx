import { lazy, useMemo, useState, type ComponentType } from "react"
import { createBrowserRouter, Navigate, RouterProvider, useLocation, useParams, type RouteObject } from "react-router"

import { AdminLayout } from "@/components/layout/admin-layout"
import { AdminScopeRoute } from "@/components/layout/admin-scope-route"
import { AppShell } from "@/components/layout/app-shell"
import { demoChrome, emptyChrome } from "@/config/chrome"
import { demoRouteRedirect } from "@/lib/demo-route-redirect"
import { AcademyRedirect } from "@/pages/demo-trading/academy-redirect"
import { demoTradingLoader } from "@/pages/demo-trading/workspace-url"
import { MaintenancePage, NotFoundPage } from "@/pages/system/route-states"


/* eslint-disable @typescript-eslint/no-explicit-any -- route pages have heterogeneous props */
/** A lazy page whose module can be preloaded (used to hydrate SSR pages without a Suspense flash). */
export type PreloadableComponent = ComponentType<any> & { preload: () => Promise<unknown> }

function lazyPage(load: () => Promise<{ default: ComponentType<any> }>): PreloadableComponent {
  let loaded: ComponentType<any> | undefined
  const remember = (module: { default: ComponentType<any> }) => {
    loaded = module.default
    return module
  }
  const Lazy = lazy(() => load().then(remember))
  // Once the module is known (preloaded for SSR/hydration) render it directly so
  // no Suspense boundary is involved; otherwise fall back to React.lazy.
  const Page = ((props: object) => {
    // Chosen once per mount so the component identity never flips afterwards.
    const [Component] = useState<ComponentType<any>>(() => loaded ?? Lazy)
    return <Component {...props} />
  }) as PreloadableComponent
  Page.preload = () => load().then(remember)
  return Page
}

/* eslint-enable @typescript-eslint/no-explicit-any */

const IntroductionPage = lazyPage(() => import("@/pages/introduction/introduction-page").then(module => ({ default: module.IntroductionPage })))
const StockDirectoryPage = lazyPage(() => import("@/pages/securities/stock-directory/stock-directory-page").then(module => ({ default: module.StockDirectoryPage })))
const StockDetailPage = lazyPage(() => import("@/pages/charts/stock-detail-page").then(module => ({ default: module.StockDetailPage })))
const DemoTradingPage = lazyPage(() => import("@/pages/demo-trading/demo-trading-page").then(module => ({ default: module.DemoTradingPage })))
const StrategyPage = lazyPage(() => import("@/pages/strategy/strategy-page").then(module => ({ default: module.StrategyPage })))
const SettingsPage = lazyPage(() => import("@/pages/account/settings-page").then(module => ({ default: module.SettingsPage })))
const PremiumPage = lazyPage(() => import("@/pages/account/premium-page").then(module => ({ default: module.PremiumPage })))
const PaymentResultPage = lazyPage(() => import("@/pages/account/payment-result-page").then(module => ({ default: module.PaymentResultPage })))
const ForgotPasswordPage = lazyPage(() => import("@/pages/account/forgot-password-page").then(module => ({ default: module.ForgotPasswordPage })))
const ResetPasswordPage = lazyPage(() => import("@/pages/account/reset-password-page").then(module => ({ default: module.ResetPasswordPage })))
const CatalogPage = lazyPage(() => import("@/pages/learning/catalog-page").then(module => ({ default: module.CatalogPage })))
const CourseDetailPage = lazyPage(() => import("@/pages/learning/course-detail-page").then(module => ({ default: module.CourseDetailPage })))
const EpisodeViewerPage = lazyPage(() => import("@/pages/learning/episode-viewer-page").then(module => ({ default: module.EpisodeViewerPage })))
const AdminDashboardPage = lazyPage(() => import("@/pages/admin/core/dashboard-page").then(module => ({ default: module.AdminDashboardPage })))
const UsersPage = lazyPage(() => import("@/pages/admin/core/users-page").then(module => ({ default: module.UsersPage })))
const UserDetailPage = lazyPage(() => import("@/pages/admin/core/user-detail-page").then(module => ({ default: module.UserDetailPage })))
const TeamDashboardPage = lazyPage(() => import("@/pages/admin/team/team-dashboard-page").then(module => ({ default: module.TeamDashboardPage })))
const TeamUsersPage = lazyPage(() => import("@/pages/admin/team/team-users-page").then(module => ({ default: module.TeamUsersPage })))
const TeamUserDetailPage = lazyPage(() => import("@/pages/admin/team/team-user-detail-page").then(module => ({ default: module.TeamUserDetailPage })))
const TeamLeadsPage = lazyPage(() => import("@/pages/admin/team-leads/team-leads-page").then(module => ({ default: module.TeamLeadsPage })))
const TeamLeadDetailPage = lazyPage(() => import("@/pages/admin/team-leads/team-lead-detail-page").then(module => ({ default: module.TeamLeadDetailPage })))
const SystemPage = lazyPage(() => import("@/pages/admin/core/system-page").then(module => ({ default: module.SystemPage })))
const AuditPage = lazyPage(() => import("@/pages/admin/core/audit-page").then(module => ({ default: module.AuditPage })))
const AlertSignalsPage = lazyPage(() => import("@/pages/admin/core/alerts-page").then(module => ({ default: module.AlertSignalsPage })))
const PlansPage = lazyPage(() => import("@/pages/admin/revenue/plans-page").then(module => ({ default: module.PlansPage })))
const SubscriptionsPage = lazyPage(() => import("@/pages/admin/revenue/subscriptions-page").then(module => ({ default: module.SubscriptionsPage })))
const SubscriptionDetailPage = lazyPage(() => import("@/pages/admin/revenue/subscription-detail-page").then(module => ({ default: module.SubscriptionDetailPage })))
const PaymentsPage = lazyPage(() => import("@/pages/admin/revenue/payments-page").then(module => ({ default: module.PaymentsPage })))
const PaymentDetailPage = lazyPage(() => import("@/pages/admin/revenue/payment-detail-page").then(module => ({ default: module.PaymentDetailPage })))
const IpnLogsPage = lazyPage(() => import("@/pages/admin/revenue/ipn-logs-page").then(module => ({ default: module.IpnLogsPage })))
const VTAccountsPage = lazyPage(() => import("@/pages/admin/trading/vt-accounts-page").then(module => ({ default: module.VTAccountsPage })))
const VTAccountDetailPage = lazyPage(() => import("@/pages/admin/trading/vt-account-detail-page").then(module => ({ default: module.VTAccountDetailPage })))
const VTConfigPage = lazyPage(() => import("@/pages/admin/trading/vt-config-page").then(module => ({ default: module.VTConfigPage })))
const CoursesPage = lazyPage(() => import("@/pages/admin/learning/courses-page").then(module => ({ default: module.CoursesPage })))
const AboutPage = lazyPage(() => import("@/pages/about/about-page").then(module => ({ default: module.AboutPage })))
const CourseEditPage = lazyPage(() => import("@/pages/admin/learning/course-edit-page").then(module => ({ default: module.CourseEditPage })))

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

export const routes: RouteObject[] = [
  {
    path: "/",
    Component: AppShell,
    children: [
      { index: true, Component: IntroductionPage, handle: { chrome: emptyChrome } },
      { path: "about", Component: AboutPage, handle: { chrome: emptyChrome } },
      { path: "gioi-thieu", element: <RedirectWithSearch to="/" />, handle: { chrome: emptyChrome } },
      { path: "thi-truong", element: <DemoContentRedirect content="ai-analysis" />, handle: { chrome: emptyChrome } },
      { path: "co-phieu", Component: StockDirectoryPage, handle: { chrome: emptyChrome } },
      { path: "co-phieu/:symbol", Component: StockDetailPage, handle: { chrome: emptyChrome } },
      { path: "bang-gia", element: <DemoContentRedirect content="board" />, handle: { chrome: emptyChrome } },
      { path: "bieu-do", element: <DemoContentRedirect content="chart" />, handle: { chrome: emptyChrome } },
      { path: "dashboard", element: <DemoContentRedirect content="chart" />, handle: { chrome: emptyChrome } },
      { path: "demo-trading", Component: DemoTradingPage, loader: demoTradingLoader, handle: { chrome: demoChrome } },
      { path: "dau-truong", element: <RedirectWithSearch to="/demo-trading" />, handle: { chrome: emptyChrome } },
      { path: "chien-luoc", Component: StrategyPage, handle: { chrome: emptyChrome } },
      { path: "canh-bao", element: <RedirectWithSearch to="/chien-luoc" tab="canh-bao" />, handle: { chrome: emptyChrome } },
      { path: "backtest", element: <RedirectWithSearch to="/chien-luoc" tab="backtest" />, handle: { chrome: emptyChrome } },
      { path: "backtest/:symbol", Component: BacktestSymbolRedirect, handle: { chrome: emptyChrome } },
      { path: "bai-hoc", Component: CatalogPage, handle: { chrome: emptyChrome } },
      { path: "bai-hoc/:slug", Component: CourseDetailPage, handle: { chrome: emptyChrome } },
      { path: "bai-hoc/:slug/:episodeId", Component: EpisodeViewerPage, handle: { chrome: emptyChrome } },
      { path: "hoc-vien", Component: AcademyRedirect, handle: { chrome: emptyChrome } },
      { path: "hoc-vien/:lessonId", Component: AcademyRedirect, handle: { chrome: emptyChrome } },
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
          // Trưởng nhóm dùng chung 3 URL này với bản `team/*` (admin spec v1.1 §5.1).
          { index: true, element: <AdminScopeRoute admin={AdminDashboardPage} team={TeamDashboardPage} /> },
          { path: "users", element: <AdminScopeRoute admin={UsersPage} team={TeamUsersPage} /> },
          { path: "users/:userId", element: <AdminScopeRoute admin={UserDetailPage} team={TeamUserDetailPage} /> },
          { path: "team-leads", Component: TeamLeadsPage },
          { path: "team-leads/:leadId", Component: TeamLeadDetailPage },
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
]

let clientRouter: ReturnType<typeof createBrowserRouter> | undefined

/** Test hook: drop the memoised browser router so a new URL can be mounted. */
export function resetClientRouter() {
  clientRouter?.dispose()
  clientRouter = undefined
}

export function App() {
  const router = useMemo(() => (clientRouter ??= createBrowserRouter(routes)), [])
  return <RouterProvider router={router} />
}

export default App
