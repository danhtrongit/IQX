<script setup lang="ts">
import { h, onMounted, ref } from "vue"
import { NButton, NCard, NCollapse, NCollapseItem, NInput, NSpace, type DataTableColumns } from "naive-ui"
import RemoteDataTable from "@/components/table/RemoteDataTable.vue"
import JsonViewer from "@/components/common/JsonViewer.vue"
import ErrorState from "@/components/common/ErrorState.vue"
import { auditApi, type AuditLogRow } from "@/lib/api/audit"
import { fmtDateTime } from "@/lib/format"
import { useRemotePage } from "@/composables/useRemotePage"

const actionPrefix = ref("")
const targetEntity = ref("")
const page = useRemotePage<AuditLogRow>((params) => auditApi.list({ page: Number(params.page), pageSize: Number(params.pageSize), actionPrefix: actionPrefix.value || undefined, targetEntity: targetEntity.value || undefined }))

const columns: DataTableColumns<AuditLogRow> = [
  { title: "Thời gian", key: "createdAt", width: 160, render: (row) => fmtDateTime(row.createdAt) },
  { title: "Admin", key: "adminEmail", width: 220, render: (row) => row.adminEmail ?? row.adminUserId ?? "system" },
  { title: "Action", key: "action", minWidth: 220 },
  { title: "Target", key: "target", minWidth: 180, render: (row) => `${row.targetEntity ?? "-"}/${row.targetId ?? "-"}` },
  { title: "IP", key: "ip", width: 140 },
  { title: "Payload", key: "payload", width: 120, render: (row) => h(NCollapse, { accordion: true }, { default: () => h(NCollapseItem, { title: "JSON", name: row.id }, { default: () => h(JsonViewer, { data: { before: row.payloadBefore, after: row.payloadAfter, note: row.note }, maxHeight: "260px" }) }) }) },
]

function search() { void page.load({ page: 1 }) }
onMounted(() => void page.load())
</script>

<template>
  <div class="page-stack">
    <div class="page-header"><div><h1 class="page-title">Audit Log</h1><p class="page-subtitle">Theo dõi các mutation từ admin</p></div></div>
    <n-card>
      <n-space>
        <n-input v-model:value="actionPrefix" clearable placeholder="Action prefix" style="width: 220px" @keyup.enter="search" />
        <n-input v-model:value="targetEntity" clearable placeholder="Target entity" style="width: 220px" @keyup.enter="search" />
        <n-button type="primary" @click="search">Lọc</n-button>
      </n-space>
    </n-card>
    <ErrorState v-if="page.error.value" :message="page.error.value" @retry="page.load" />
    <RemoteDataTable :columns="columns" :rows="page.rows.value" :loading="page.loading.value" :page="page.params.page" :page-size="page.params.pageSize" :item-count="page.total.value" @page-change="page.setPage" @page-size-change="page.setPageSize" />
  </div>
</template>
