<script setup lang="ts">
import { h, onMounted, ref } from "vue"
import { NButton, NCard, NInput, NModal, NSelect, NSpace, type DataTableColumns } from "naive-ui"
import RemoteDataTable from "@/components/table/RemoteDataTable.vue"
import JsonViewer from "@/components/common/JsonViewer.vue"
import StatusTag from "@/components/common/StatusTag.vue"
import ErrorState from "@/components/common/ErrorState.vue"
import { feedback } from "@/lib/feedback"
import { fmtDateTime } from "@/lib/format"
import { labelForStatus } from "@/lib/labels"
import { useRemotePage } from "@/composables/useRemotePage"
import { ipnApi, type IPNLogDetail, type IPNLogRow } from "@/lib/api/ipn"

const searchText = ref(""); const resultStatus = ref<string | null>(null); const detail = ref<IPNLogDetail | null>(null); const detailOpen = ref(false)
const page = useRemotePage<IPNLogRow>((p) => ipnApi.list({ page: Number(p.page), pageSize: Number(p.pageSize), search: searchText.value || undefined, resultStatus: resultStatus.value || undefined }))
const resultOptions = ["success", "failed", "ignored"].map((value) => ({ label: labelForStatus(value), value }))
const columns: DataTableColumns<IPNLogRow> = [
  { title: "Thời điểm nhận", key: "receivedAt", render: (row) => fmtDateTime(row.receivedAt) },
  { title: "Khóa bí mật", key: "secretKeyValid", render: (row) => h(StatusTag, { status: row.secretKeyValid, label: row.secretKeyValid ? "Key hợp lệ" : "Key sai" }) },
  { title: "Kết quả", key: "resultStatus", render: (row) => h(StatusTag, { status: row.resultStatus }) },
  { title: "Đơn hàng", key: "matchedOrderId", className: "mono" },
  { title: "Sepay TX", key: "sepayTransactionId", className: "mono" },
  { title: "Lỗi", key: "errorMessage" },
  { title: "Thao tác", key: "actions", render: (row) => h(NSpace, { size: 4 }, { default: () => [h(NButton, { size: "small", secondary: true, onClick: () => openDetail(row.id) }, { default: () => "Chi tiết" }), h(NButton, { size: "small", secondary: true, onClick: () => retry(row.id) }, { default: () => "Thử lại" })] }) },
]
function search() { void page.load({ page: 1 }) }
async function openDetail(id: string) { detail.value = await ipnApi.get(id); detailOpen.value = true }
async function retry(id: string) { const res = await ipnApi.retry(id); feedback.message?.success(res.message); await page.load() }
onMounted(() => void page.load())
</script>
<template><div class="page-stack"><div class="page-header"><div><h1 class="page-title">Nhật ký IPN</h1><p class="page-subtitle">{{ page.total.value }} bản ghi</p></div></div><n-card><n-space><n-input v-model:value="searchText" clearable placeholder="Tìm kiếm" style="width: 260px" @keyup.enter="search" /><n-select v-model:value="resultStatus" clearable :options="resultOptions" placeholder="Kết quả" style="width: 160px" /><n-button type="primary" @click="search">Lọc</n-button></n-space></n-card><ErrorState v-if="page.error.value" :message="page.error.value" @retry="page.load" /><RemoteDataTable :columns="columns" :rows="page.rows.value" :loading="page.loading.value" :page="page.params.page" :page-size="page.params.pageSize" :item-count="page.total.value" @page-change="page.setPage" @page-size-change="page.setPageSize" /><n-modal v-model:show="detailOpen" preset="card" title="Chi tiết IPN" style="max-width: 900px"><JsonViewer :data="detail" /></n-modal></div></template>
