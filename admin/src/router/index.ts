import { createRouter, createWebHistory, type RouteRecordRaw } from "vue-router"
import { feedback } from "@/lib/feedback"
import { useAuthStore } from "@/stores/auth"
import AdminShell from "@/components/layout/AdminShell.vue"

declare module "vue-router" {
  interface RouteMeta {
    requiresAuth?: boolean
    title?: string
  }
}

const routes: RouteRecordRaw[] = [
  { path: "/login", name: "login", meta: { title: "Đăng nhập" }, component: () => import("@/features/auth/LoginPage.vue") },
  {
    path: "/",
    component: AdminShell,
    meta: { requiresAuth: true },
    children: [
      { path: "", name: "dashboard", meta: { title: "Tổng quan" }, component: () => import("@/features/dashboard/DashboardPage.vue") },
      { path: "users", name: "users", meta: { title: "Người dùng" }, component: () => import("@/features/users/UsersPage.vue") },
      { path: "users/:userId", name: "user-detail", meta: { title: "Chi tiết người dùng" }, component: () => import("@/features/users/UserDetailPage.vue") },
      { path: "plans", name: "plans", meta: { title: "Gói Premium" }, component: () => import("@/features/premium/PlansPage.vue") },
      { path: "subscriptions", name: "subscriptions", meta: { title: "Thuê bao" }, component: () => import("@/features/premium/SubscriptionsPage.vue") },
      { path: "subscriptions/:subId", name: "subscription-detail", meta: { title: "Chi tiết thuê bao" }, component: () => import("@/features/premium/SubscriptionDetailPage.vue") },
      { path: "payments", name: "payments", meta: { title: "Thanh toán" }, component: () => import("@/features/premium/PaymentsPage.vue") },
      { path: "payments/:paymentId", name: "payment-detail", meta: { title: "Chi tiết thanh toán" }, component: () => import("@/features/premium/PaymentDetailPage.vue") },
      { path: "ipn", name: "ipn", meta: { title: "Nhật ký IPN" }, component: () => import("@/features/premium/IpnLogsPage.vue") },
      { path: "vt/accounts", name: "vt-accounts", meta: { title: "Tài khoản giao dịch ảo" }, component: () => import("@/features/vt/VTAccountsPage.vue") },
      { path: "vt/accounts/:accountId", name: "vt-account-detail", meta: { title: "Chi tiết tài khoản VT" }, component: () => import("@/features/vt/VTAccountDetailPage.vue") },
      { path: "vt/config", name: "vt-config", meta: { title: "Cấu hình VT" }, component: () => import("@/features/vt/VTConfigPage.vue") },
      { path: "audit", name: "audit", meta: { title: "Nhật ký kiểm toán" }, component: () => import("@/features/audit/AuditPage.vue") },
      { path: "system", name: "system", meta: { title: "Hệ thống" }, component: () => import("@/features/system/SystemPage.vue") },
      { path: "lessons", name: "lessons", meta: { title: "Khoá học" }, component: () => import("@/features/lessons/CoursesListPage.vue") },
      { path: "lessons/new", name: "lesson-new", meta: { title: "Tạo khoá học" }, component: () => import("@/features/lessons/CourseEditPage.vue") },
      { path: "lessons/:id", name: "lesson-edit", meta: { title: "Sửa khoá học" }, component: () => import("@/features/lessons/CourseEditPage.vue") },
    ],
  },
  { path: "/:pathMatch(.*)*", redirect: "/" },
]

export const router = createRouter({
  history: createWebHistory(),
  routes,
})

router.beforeEach(async (to) => {
  feedback.loadingBar?.start()
  const auth = useAuthStore()
  if (to.meta.requiresAuth) {
    await auth.bootstrap()
    if (!auth.isAuthenticated) return { path: "/login", query: { redirect: to.fullPath } }
  }
  if (to.name === "login") {
    await auth.bootstrap()
    if (auth.isAuthenticated) return { path: "/" }
  }
  return true
})

router.afterEach(() => feedback.loadingBar?.finish())
router.onError(() => feedback.loadingBar?.error())

window.addEventListener("auth:logout", () => {
  const auth = useAuthStore()
  auth.handleForcedLogout()
  if (router.currentRoute.value.name !== "login") void router.replace("/login")
})
