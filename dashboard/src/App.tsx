import { lazy, Suspense } from "react"
import { Routes, Route } from "react-router"
import { AuthModal } from "@/components/auth/auth-modal"

const HomePage = lazy(() => import("@/pages/home"))
const DashboardPage = lazy(() => import("@/pages/dashboard"))
const StockDirectoryPage = lazy(() => import("@/pages/stock-directory"))
const StockPage = lazy(() => import("@/pages/stock"))
const SettingsPage = lazy(() => import("@/pages/settings"))
const PremiumPage = lazy(() => import("@/pages/premium"))
const PaymentResultPage = lazy(() => import("@/pages/payment-result"))
const ThiTruongPage = lazy(() => import("@/pages/thi-truong"))
const NotFoundPage = lazy(() => import("@/pages/404"))
const MaintenancePage = lazy(() => import("@/pages/503"))
const LessonsCatalogPage = lazy(() => import("@/features/lessons/catalog-page"))
const CourseDetailPage = lazy(() => import("@/features/lessons/course-detail-page"))
const EpisodeViewerPage = lazy(() => import("@/features/lessons/episode-viewer-page"))

function PageLoader() {
  return (
    <div className="flex h-screen items-center justify-center">
      <div className="size-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    </div>
  )
}

export default function App() {
  return (
    <>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/thi-truong" element={<ThiTruongPage />} />
          <Route path="/co-phieu" element={<StockDirectoryPage />} />
          <Route path="/co-phieu/:symbol" element={<StockPage />} />
          <Route path="/cai-dat" element={<SettingsPage />} />
          <Route path="/nang-cap" element={<PremiumPage />} />
          <Route path="/thanh-toan/thanh-cong" element={<PaymentResultPage type="success" />} />
          <Route path="/thanh-toan/that-bai" element={<PaymentResultPage type="error" />} />
          <Route path="/thanh-toan/huy" element={<PaymentResultPage type="cancel" />} />
          <Route path="/payment/success" element={<PaymentResultPage type="success" />} />
          <Route path="/payment/error" element={<PaymentResultPage type="error" />} />
          <Route path="/payment/cancel" element={<PaymentResultPage type="cancel" />} />
          <Route path="/503" element={<MaintenancePage />} />
          <Route path="/bai-hoc" element={<LessonsCatalogPage />} />
          <Route path="/bai-hoc/:slug" element={<CourseDetailPage />} />
          <Route path="/bai-hoc/:slug/:episodeId" element={<EpisodeViewerPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
      <AuthModal />
    </>
  )
}
