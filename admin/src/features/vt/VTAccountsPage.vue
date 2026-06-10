<script setup lang="ts">
import { h, onMounted, ref } from "vue"
import { RouterLink } from "vue-router"
import { NButton, NCard, NInput, NSelect, NSpace, type DataTableColumns } from "naive-ui"
import RemoteDataTable from "@/components/table/RemoteDataTable.vue"
import StatusTag from "@/components/common/StatusTag.vue"
import ErrorState from "@/components/common/ErrorState.vue"
import { fmtDateTime, fmtVnd } from "@/lib/format"
import { labelForStatus } from "@/lib/labels"
import { useRemotePage } from "@/composables/useRemotePage"
import { vtApi, type VTAccountRow } from "@/lib/api/vt"

const searchText = ref(""); const status = ref<string | null>(null); const frozenFilter = ref<"frozen" | "all" | null>(null)
const page = useRemotePage<VTAccountRow>((p) => vtApi.listAccounts({ page: Number(p.page), pageSize: Number(p.pageSize), search: searchText.value || undefined, status: status.value || undefined, frozenOnly: frozenFilter.value ? frozenFilter.value === "frozen" : null }))
const statusOptions = ["active", "suspended"].map((value) => ({ label: labelForStatus(value), value }))
const frozenOptions = [{ label: "Chỉ tài khoản đã khóa", value: "frozen" }, { label: "Tất cả", value: "all" }]
const columns: DataTableColumns<VTAccountRow> = [
  { title: "Người dùng", key: "userEmail", render: (row) => h(RouterLink, { to: `/vt/accounts/${row.id}` }, { default: () => row.userEmail ?? row.userId }) },
  { title: "Tên", key: "userName" },
  { title: "Trạng thái", key: "status", render: (row) => h(NSpace, { size: 4 }, { default: () => [h(StatusTag, { status: row.status }), row.frozenAt ? h(StatusTag, { status: "frozen" }) : null] }) },
  { title: "Tiền khả dụng", key: "cashAvailableVnd", render: (row) => fmtVnd(row.cashAvailableVnd) },
  { title: "Tiền giữ", key: "cashReservedVnd", render: (row) => fmtVnd(row.cashReservedVnd) },
  { title: "Kích hoạt", key: "activatedAt", render: (row) => row.activatedAt ? fmtDateTime(row.activatedAt) : "-" },
  { title: "Chi tiết", key: "action", render: (row) => h(RouterLink, { to: `/vt/accounts/${row.id}` }, { default: () => "Mở" }) },
]
function search() { void page.load({ page: 1 }) }
onMounted(() => void page.load())
</script>
<template><div class="page-stack"><div class="page-header"><div><h1 class="page-title">Tài khoản giao dịch ảo</h1><p class="page-subtitle">{{ page.total.value }} tài khoản</p></div></div><n-card><n-space wrap><n-input v-model:value="searchText" clearable placeholder="Email, tên" style="width:260px" @keyup.enter="search" /><n-select v-model:value="status" clearable :options="statusOptions" placeholder="Trạng thái" style="width:160px" /><n-select v-model:value="frozenFilter" clearable :options="frozenOptions" placeholder="Trạng thái khóa" style="width:190px" /><n-button type="primary" @click="search">Lọc</n-button></n-space></n-card><ErrorState v-if="page.error.value" :message="page.error.value" @retry="page.load" /><RemoteDataTable :columns="columns" :rows="page.rows.value" :loading="page.loading.value" :page="page.params.page" :page-size="page.params.pageSize" :item-count="page.total.value" @page-change="page.setPage" @page-size-change="page.setPageSize" /></div></template>
