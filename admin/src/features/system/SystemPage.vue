<script setup lang="ts">
import { h, onMounted, onUnmounted, ref } from "vue"
import { Activity, Database, Play, RefreshCw, Server } from "lucide-vue-next"
import { NButton, NCard, NDataTable, NSpace, type DataTableColumns } from "naive-ui"
import KpiCard from "@/components/common/KpiCard.vue"
import JsonViewer from "@/components/common/JsonViewer.vue"
import StatusTag from "@/components/common/StatusTag.vue"
import ErrorState from "@/components/common/ErrorState.vue"
import { feedback } from "@/lib/feedback"
import { fmtDateTime, fmtRelative } from "@/lib/format"
import { systemApi, type JobInfo, type SystemStatus } from "@/lib/api/system"

const status = ref<SystemStatus | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)
const runningJob = ref<string | null>(null)
let timer: ReturnType<typeof setTimeout> | null = null

const columns: DataTableColumns<JobInfo> = [
  { title: "Job", key: "id", width: 180, className: "mono" },
  { title: "Tên", key: "name", minWidth: 260 },
  { title: "Next run", key: "nextRunAt", minWidth: 220, render: (row) => row.nextRunAt ? `${fmtDateTime(row.nextRunAt)} (${fmtRelative(row.nextRunAt)})` : "-" },
  { title: "Trigger", key: "trigger", minWidth: 180 },
  { title: "Thao tác", key: "action", width: 130, render: (row) => h(NButton, { size: "small", secondary: true, loading: runningJob.value === row.id, onClick: () => confirmRun(row) }, { icon: () => h(Play, { size: 14 }), default: () => "Chạy" }) },
]

async function load() {
  loading.value = true
  error.value = null
  try {
    status.value = await systemApi.status()
  } catch (err) {
    error.value = err instanceof Error ? err.message : "Không thể tải trạng thái hệ thống"
  } finally {
    loading.value = false
  }
}

function schedule() {
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => void load().then(schedule), 30_000)
}

function confirmRun(job: JobInfo) {
  feedback.dialog?.warning({
    title: "Chạy job thủ công?",
    content: `Bạn đang kích hoạt "${job.name}" ngay lập tức.`,
    positiveText: "Chạy ngay",
    negativeText: "Hủy",
    onPositiveClick: () => runJob(job.id),
  })
}

async function runJob(jobId: string) {
  runningJob.value = jobId
  try {
    const result = await systemApi.runJob(jobId)
    feedback.notification?.success({ title: `Job ${jobId} hoàn thành`, content: () => h(JsonViewer, { data: result.result, maxHeight: "220px" }) })
    await load()
  } catch (err) {
    feedback.message?.error(err instanceof Error ? err.message : "Chạy job thất bại")
  } finally {
    runningJob.value = null
  }
}

onMounted(() => void load().then(schedule))
onUnmounted(() => { if (timer) clearTimeout(timer) })
</script>

<template>
  <div class="page-stack">
    <div class="page-header">
      <div><h1 class="page-title">Hệ thống</h1><p v-if="status" class="page-subtitle">Cập nhật lúc {{ fmtDateTime(status.generatedAt) }}</p></div>
      <n-button secondary :loading="loading" @click="load"><template #icon><RefreshCw :size="16" /></template>Làm mới</n-button>
    </div>
    <ErrorState v-if="error" :message="error" @retry="load" />
    <div class="grid-kpis">
      <KpiCard label="Phiên bản" :value="status?.version ?? '-'" :sub-text="`Môi trường: ${status?.environment ?? '-'}`" :icon="Server" :loading="loading" />
      <KpiCard label="Users" :value="status?.dbStats.users ?? 0" :icon="Database" :loading="loading" />
      <KpiCard label="Subscriptions" :value="status?.dbStats.subscriptions ?? 0" :loading="loading" />
      <KpiCard label="IPN 24h" :value="status?.lastIpnProcessedCount24h ?? 0" :icon="Activity" :loading="loading" />
    </div>
    <n-card title="Scheduler"><n-space vertical><StatusTag :status="status?.schedulerRunning ?? false" :label="status?.schedulerRunning ? 'Running' : 'Stopped'" /><n-data-table :columns="columns" :data="status?.jobs ?? []" :loading="loading" :bordered="true" /></n-space></n-card>
  </div>
</template>
