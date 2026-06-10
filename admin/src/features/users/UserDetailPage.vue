<script setup lang="ts">
import { h, onMounted, ref } from "vue"
import { useRoute, useRouter, RouterLink } from "vue-router"
import { ArrowLeft } from "lucide-vue-next"
import { NButton, NCard, NDataTable, NDescriptions, NDescriptionsItem, NSpace, NTabs, NTabPane, type DataTableColumns } from "naive-ui"
import StatusTag from "@/components/common/StatusTag.vue"
import ErrorState from "@/components/common/ErrorState.vue"
import { fmtDateTime, fmtVnd } from "@/lib/format"
import { labelForRole, labelForVtSide } from "@/lib/labels"
import { usersApi, type LoginHistoryRow, type PaymentOrderBrief, type SubscriptionBrief, type User360, type VTOrderBrief } from "@/lib/api/users"

const route = useRoute()
const router = useRouter()
const user360 = ref<User360 | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)

const subscriptionColumns: DataTableColumns<SubscriptionBrief> = [
  { title: "ID", key: "id", minWidth: 220, className: "mono" },
  { title: "Gói", key: "plan", render: (row) => row.plan?.name ?? "-" },
  { title: "Trạng thái", key: "status", render: (row) => h(StatusTag, { status: row.status }) },
  { title: "Bắt đầu", key: "currentPeriodStart" },
  { title: "Kết thúc", key: "currentPeriodEnd" },
]
const paymentColumns: DataTableColumns<PaymentOrderBrief> = [
  { title: "Mã hóa đơn", key: "invoiceNumber", render: (row) => h(RouterLink, { to: `/payments/${row.id}` }, { default: () => row.invoiceNumber }) },
  { title: "Số tiền", key: "amountVnd", render: (row) => fmtVnd(row.amountVnd) },
  { title: "Trạng thái", key: "status", render: (row) => h(StatusTag, { status: row.status }) },
  { title: "Tạo lúc", key: "createdAt", render: (row) => fmtDateTime(row.createdAt) },
]
const vtOrderColumns: DataTableColumns<VTOrderBrief> = [
  { title: "Mã", key: "symbol" },
  { title: "Chiều", key: "side", render: (row) => labelForVtSide(row.side) },
  { title: "SL", key: "quantity" },
  { title: "Giá", key: "priceVnd", render: (row) => row.priceVnd ? fmtVnd(row.priceVnd) : "-" },
  { title: "Trạng thái", key: "status", render: (row) => h(StatusTag, { status: row.status }) },
]
const loginColumns: DataTableColumns<LoginHistoryRow> = [
  { title: "Thời gian", key: "loginAt", render: (row) => fmtDateTime(row.loginAt) },
  { title: "Email", key: "email" },
  { title: "Kết quả", key: "success", render: (row) => h(StatusTag, { status: row.success, label: row.success ? "Thành công" : "Thất bại" }) },
  { title: "IP", key: "ip" },
  { title: "Lý do", key: "failureReason" },
]

async function load() {
  loading.value = true
  error.value = null
  try {
    user360.value = await usersApi.get360(String(route.params.userId))
  } catch (err) {
    error.value = err instanceof Error ? err.message : "Không thể tải dữ liệu"
  } finally {
    loading.value = false
  }
}
onMounted(() => void load())
</script>

<template>
  <div class="page-stack">
    <div class="page-header"><div><n-button quaternary size="small" @click="router.back()"><template #icon><ArrowLeft :size="16" /></template>Quay lại</n-button><h1 class="page-title">Chi tiết người dùng</h1><p class="page-subtitle mono">{{ route.params.userId }}</p></div></div>
    <ErrorState v-if="error" :message="error" @retry="load" />
    <n-card v-if="user360" :loading="loading">
      <n-descriptions bordered :column="2">
        <n-descriptions-item label="Email">{{ user360.user.email }}</n-descriptions-item>
        <n-descriptions-item label="Tên">{{ user360.user.fullName ?? '-' }}</n-descriptions-item>
        <n-descriptions-item label="Vai trò"><StatusTag :status="user360.user.role" :label="labelForRole(user360.user.role)" /></n-descriptions-item>
        <n-descriptions-item label="Trạng thái"><StatusTag :status="user360.user.status" /></n-descriptions-item>
        <n-descriptions-item label="Đã dùng thử">{{ user360.trialUsed ? 'Có' : 'Không' }}</n-descriptions-item>
        <n-descriptions-item label="Ngày tạo">{{ fmtDateTime(user360.user.createdAt) }}</n-descriptions-item>
      </n-descriptions>
    </n-card>
    <n-tabs v-if="user360" type="line" :animated="false">
      <n-tab-pane name="subs" tab="Thuê bao"><n-data-table :columns="subscriptionColumns" :data="user360.subscriptionHistory" /></n-tab-pane>
      <n-tab-pane name="payments" tab="Thanh toán"><n-data-table :columns="paymentColumns" :data="user360.paymentHistory" /></n-tab-pane>
      <n-tab-pane name="vt" tab="Giao dịch ảo"><n-space vertical><n-card v-if="user360.vtAccount" title="Tài khoản VT"><n-descriptions :column="2"><n-descriptions-item label="Số dư">{{ fmtVnd(user360.vtAccount.cashAvailableVnd) }}</n-descriptions-item><n-descriptions-item label="Trạng thái"><StatusTag :status="user360.vtAccount.status" /></n-descriptions-item></n-descriptions></n-card><n-data-table :columns="vtOrderColumns" :data="user360.vtRecentOrders" /></n-space></n-tab-pane>
      <n-tab-pane name="login" tab="Lịch sử đăng nhập"><n-data-table :columns="loginColumns" :data="user360.loginHistory" /></n-tab-pane>
    </n-tabs>
  </div>
</template>
