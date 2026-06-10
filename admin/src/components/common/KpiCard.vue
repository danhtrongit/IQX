<script setup lang="ts">
import { NCard, NSkeleton } from "naive-ui"
import type { Component } from "vue"

defineProps<{
  label: string
  value: string | number
  subText?: string
  loading?: boolean
  icon?: Component
}>()
</script>

<template>
  <n-card size="small" :bordered="true">
    <div class="kpi">
      <div class="kpi-main">
        <div class="kpi-label">{{ label }}</div>
        <n-skeleton v-if="loading" text width="72px" />
        <div v-else class="kpi-value">{{ value }}</div>
        <div v-if="subText" class="kpi-sub">{{ subText }}</div>
      </div>
      <div v-if="icon" class="kpi-icon"><component :is="icon" :size="20" /></div>
    </div>
  </n-card>
</template>

<style scoped>
.kpi {
  align-items: flex-start;
  display: flex;
  gap: 12px;
  justify-content: space-between;
}
.kpi-label,
.kpi-sub {
  color: #64748b;
  font-size: 12px;
}
.kpi-value {
  color: #0f172a;
  font-size: 22px;
  font-weight: 700;
  line-height: 1.25;
  margin-top: 4px;
  overflow-wrap: anywhere;
}
.kpi-sub {
  margin-top: 4px;
}
.kpi-icon {
  align-items: center;
  background: #eff6ff;
  border-radius: 8px;
  color: #2563eb;
  display: flex;
  height: 40px;
  justify-content: center;
  width: 40px;
}
</style>
