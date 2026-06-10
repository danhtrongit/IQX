<script setup lang="ts">
import { NAlert, NButton, NSpace } from "naive-ui"

defineProps<{ message: string }>()
defineEmits<{ retry: [] }>()
</script>

<template>
  <n-alert type="error" :title="message">
    <n-space vertical size="small">
      <span>Không thể tải dữ liệu quản trị.</span>
      <n-button size="small" secondary @click="$emit('retry')">Thử lại</n-button>
    </n-space>
  </n-alert>
</template>
