<script setup lang="ts">
import { h, onMounted, ref } from "vue"
import { RouterLink } from "vue-router"
import { NButton, NCard, NInput, NSelect, NSpace, type DataTableColumns } from "naive-ui"
import RemoteDataTable from "@/components/table/RemoteDataTable.vue"
import StatusTag from "@/components/common/StatusTag.vue"
import ErrorState from "@/components/common/ErrorState.vue"
import { fmtDateTime, fmtVnd } from "@/lib/format"
import { useRemotePage } from "@/composables/useRemotePage"
import { paymentsApi, type PaymentRow } from "@/lib/api/payments"

const searchText = ref("")
const status = ref<string | null>(null)
const grantType = ref<string | null>(null)
const page = useRemotePage<PaymentRow>((p) => paymentsApi.list({ page: Number(p.page), pageSize: Number(p.pageSize), search: searchText.value || undefined, status: status.value || undefined, grantType: grantType.value || undefined }))
const columns: DataTableColumns<PaymentRow> = [
  { title: "Invoice", key: "invoiceNumber", render: (row) => h(RouterLink, { to: `/payments/${row.id}` }, { default: () => row.invoiceNumber }) },
  { title: "User", key: "userEmail", render: (row) => h(RouterLink, { to: `/users/${row.userId}` }, { default: () => row.userEmail ?? row.userId }) },
  { title: "Gói", key: "planName", render: (row) => row.planName ?? row.planCode ?? "-" },
  { title: "Số tiền", key: "amountVnd", render: (row) => fmtVnd(row.amountVnd) },
  { title: "Trạng thái", key: "status", render: (row) => h(StatusTag, { status: row.status }) },
  { title: "Loại", key: "grantType", render: (row) => row.grantType ?? "payment" },
  { title: "Tạo lúc", key: "createdAt", render: (row) => fmtDateTime(row.createdAt) },
]
const statusOptions = ["pending", "paid", "failed", "refunded"].map((value) => ({ label: value, value }))
const grantOptions = ["payment", "admin_grant"].map((value) => ({ label: value, value }))
function search() { void page.load({ page: 1 }) }
onMounted(() => void page.load())
</script>
<template><div class="page-stack"><div class="page-header"><div><h1 class="page-title">Thanh toán</h1><p class="page-subtitle">{{ page.total.value }} đơn hàng</p></div></div><n-card><n-space wrap><n-input v-model:value="searchText" clearable placeholder="Invoice, email..." style="width: 260px" @keyup.enter="search" /><n-select v-model:value="status" clearable :options="statusOptions" placeholder="Trạng thái" style="width: 160px" /><n-select v-model:value="grantType" clearable :options="grantOptions" placeholder="Loại" style="width: 160px" /><n-button type="primary" @click="search">Lọc</n-button></n-space></n-card><ErrorState v-if="page.error.value" :message="page.error.value" @retry="page.load" /><RemoteDataTable :columns="columns" :rows="page.rows.value" :loading="page.loading.value" :page="page.params.page" :page-size="page.params.pageSize" :item-count="page.total.value" @page-change="page.setPage" @page-size-change="page.setPageSize" /></div></template>
