import { lazy, Suspense } from "react"
import { Route, Routes } from "react-router"
import { AppShell } from "./shell/AppShell"
import { NotFoundPage, MaintenancePage } from "@/pages/placeholder"
import { TopLoadingBar } from "@/shared/ui/TopLoadingBar"

// Feature pages (named exports → default for React.lazy).
const DashboardPage = lazy(() =>
  import("@/features/dashboard").then((m) => ({ default: m.DashboardPage })),
)
const MarketingPage = lazy(() =>
  import("@/features/marketing").then((m) => ({ default: m.MarketingPage })),
)
const SettingsPage = lazy(() =>
  import("@/features/settings").then((m) => ({ default: m.SettingsPage })),
)
const PremiumPage = lazy(() =>
  import("@/features/premium").then((m) => ({ default: m.PremiumPage })),
)
const PaymentResultPage = lazy(() =>
  import("@/features/premium").then((m) => ({ default: m.PaymentResultPage })),
)
const StockDirectoryPage = lazy(() =>
  import("@/features/stock-directory").then((m) => ({ default: m.StockDirectoryPage })),
)
const BangGiaPage = lazy(() =>
  import("@/features/price-board").then((m) => ({ default: m.BangGiaPage })),
)
const StockPage = lazy(() =>
  import("@/features/stock").then((m) => ({ default: m.StockPage })),
)
const MarketOverviewPage = lazy(() =>
  import("@/features/market-overview").then((m) => ({ default: m.MarketOverviewPage })),
)
const DuBaoPage = lazy(() =>
  import("@/features/forecast").then((m) => ({ default: m.DuBaoPage })),
)
const CatalogPage = lazy(() =>
  import("@/features/lessons").then((m) => ({ default: m.CatalogPage })),
)
const CourseDetailPage = lazy(() =>
  import("@/features/lessons").then((m) => ({ default: m.CourseDetailPage })),
)
const EpisodeViewerPage = lazy(() =>
  import("@/features/lessons").then((m) => ({ default: m.EpisodeViewerPage })),
)

function PageLoader() {
  // Route chunk loading → top progress bar (no spinner).
  return <TopLoadingBar loading />
}

/**
 * Route table. Marketing keeps its own chrome (standalone). Everything else
 * renders inside <AppShell> (header + footer). Routes still being rebuilt in
 * the feature phase use <Placeholder>.
 */
export function AppRouter() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        {/* Standalone (own chrome / full-screen terminal) */}
        <Route path="/" element={<DashboardPage />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/gioi-thieu" element={<MarketingPage />} />
        <Route path="/co-phieu/:symbol" element={<StockPage />} />

        {/* App shell */}
        <Route element={<AppShell />}>
          <Route path="/thi-truong" element={<MarketOverviewPage />} />
          <Route path="/du-bao" element={<DuBaoPage />} />
          <Route path="/co-phieu" element={<StockDirectoryPage />} />
          <Route path="/bang-gia" element={<BangGiaPage />} />
          <Route path="/cai-dat" element={<SettingsPage />} />
          <Route path="/nang-cap" element={<PremiumPage />} />
          <Route path="/thanh-toan/thanh-cong" element={<PaymentResultPage type="success" />} />
          <Route path="/thanh-toan/that-bai" element={<PaymentResultPage type="error" />} />
          <Route path="/thanh-toan/huy" element={<PaymentResultPage type="cancel" />} />
          <Route path="/payment/success" element={<PaymentResultPage type="success" />} />
          <Route path="/payment/error" element={<PaymentResultPage type="error" />} />
          <Route path="/payment/cancel" element={<PaymentResultPage type="cancel" />} />
          <Route path="/bai-hoc" element={<CatalogPage />} />
          <Route path="/bai-hoc/:slug" element={<CourseDetailPage />} />
          <Route path="/bai-hoc/:slug/:episodeId" element={<EpisodeViewerPage />} />
          <Route path="/503" element={<MaintenancePage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </Suspense>
  )
}
