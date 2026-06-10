<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue"
import { BarChart3, CreditCard, RefreshCw, TrendingUp, UserPlus, Users } from "lucide-vue-next"
import { BarChart, LineChart } from "echarts/charts"
import { GridComponent, TooltipComponent } from "echarts/components"
import { use } from "echarts/core"
import { CanvasRenderer } from "echarts/renderers"
import VChart from "vue-echarts"
import { NButton, NCard, NSpace } from "naive-ui"
import KpiCard from "@/components/common/KpiCard.vue"
import ErrorState from "@/components/common/ErrorState.vue"
import { metricsApi, type DailyRevenuePoint, type MetricsOverview, type PlanDistributionPoint } from "@/lib/api/metrics"
import { fmtCompact, fmtDate, fmtVnd } from "@/lib/format"

use([CanvasRenderer, LineChart, BarChart, GridComponent, TooltipComponent])

const overview = ref<MetricsOverview | null>(null)
const revenue = ref<DailyRevenuePoint[]>([])
const planDist = ref<PlanDistributionPoint[]>([])
const loading = ref(true)
const error = ref<string | null>(null)
let timer: ReturnType<typeof setInterval> | null = null

const revenueOption = computed(() => ({
  backgroundColor: "transparent",
  tooltip: { trigger: "axis", valueFormatter: (value: number) => fmtVnd(value) },
  grid: { left: 52, right: 16, top: 20, bottom: 32 },
  xAxis: { type: "category", data: revenue.value.map((p) => fmtDate(p.date).slice(0, 5)), axisLabel: { color: "#64748B" } },
  yAxis: { type: "value", axisLabel: { color: "#64748B", formatter: (value: number) => fmtCompact(value) }, splitLine: { lineStyle: { color: "#E2E8F0" } } },
  series: [{ type: "line", smooth: true, data: revenue.value.map((p) => p.revenue_vnd), showSymbol: false, lineStyle: { color: "#2563EB", width: 3 }, areaStyle: { color: "rgba(37, 99, 235, .12)" } }],
}))

const planOption = computed(() => ({
  backgroundColor: "transparent",
  tooltip: { trigger: "axis" },
  grid: { left: 92, right: 16, top: 20, bottom: 24 },
  xAxis: { type: "value", axisLabel: { color: "#64748B" }, splitLine: { lineStyle: { color: "#E2E8F0" } } },
  yAxis: { type: "category", data: planDist.value.map((p) => p.plan_name), axisLabel: { color: "#64748B" } },
  series: [{ type: "bar", data: planDist.value.map((p) => p.active_subscriptions), itemStyle: { color: "#0284C7", borderRadius: [0, 4, 4, 0] } }],
}))

async function load() {
  loading.value = true
  error.value = null
  try {
    const [ov, rv, pd] = await Promise.all([metricsApi.overview(), metricsApi.revenue(30), metricsApi.planDistribution()])
    overview.value = ov
    revenue.value = rv
    planDist.value = pd
  } catch (err) {
    error.value = err instanceof Error ? err.message : "Không thể tải dữ liệu"
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  void load()
  timer = setInterval(() => void load(), 60_000)
})
onUnmounted(() => { if (timer) clearInterval(timer) })
</script>

<template>
  <div class="page-stack">
    <div class="page-header">
      <div>
        <h1 class="page-title">Tổng quan</h1>
        <p class="page-subtitle">KPI người dùng, premium và giao dịch ảo</p>
      </div>
      <n-button secondary :loading="loading" @click="load"><template #icon><RefreshCw :size="16" /></template>Làm mới</n-button>
    </div>
    <ErrorState v-if="error" :message="error" @retry="load" />
    <div class="grid-kpis">
      <KpiCard label="Tổng người dùng" :value="fmtCompact(overview?.total_users ?? 0)" :sub-text="`Hôm nay: +${overview?.new_users_today ?? 0}`" :icon="Users" :loading="loading" />
      <KpiCard label="Người dùng mới" :value="overview?.new_users_today ?? 0" :sub-text="`7 ngày: ${overview?.new_users_last_7d ?? 0}`" :icon="UserPlus" :loading="loading" />
      <KpiCard label="Premium active" :value="overview?.active_paid_count ?? 0" :sub-text="`Trial: ${overview?.active_trial_count ?? 0}`" :icon="CreditCard" :loading="loading" />
      <KpiCard label="MRR" :value="fmtVnd(overview?.mrr_vnd ?? 0)" :sub-text="`30 ngày: ${fmtVnd(overview?.revenue_last_30d_vnd ?? 0)}`" :icon="TrendingUp" :loading="loading" />
    </div>
    <div class="charts">
      <n-card title="Doanh thu 30 ngày"><v-chart class="chart" :option="revenueOption" autoresize /></n-card>
      <n-card title="Phân bổ gói Premium"><v-chart class="chart" :option="planOption" autoresize /></n-card>
    </div>
    <n-space>
      <KpiCard label="VT active" :value="overview?.vt_active_accounts ?? 0" :icon="BarChart3" :loading="loading" />
      <KpiCard label="VT orders hôm nay" :value="overview?.vt_orders_today ?? 0" :loading="loading" />
    </n-space>
  </div>
</template>

<style scoped>
.charts {
  display: grid;
  gap: 16px;
  grid-template-columns: 7fr 3fr;
}
.chart {
  height: 300px;
}
@media (max-width: 1000px) {
  .charts { grid-template-columns: 1fr; }
}
</style>
