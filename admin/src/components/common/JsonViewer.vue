<script setup lang="ts">
import { computed } from "vue"

const props = withDefaults(defineProps<{ data: unknown; maxHeight?: string }>(), {
  maxHeight: "360px",
})

const json = computed(() => JSON.stringify(props.data ?? null, null, 2))
</script>

<template>
  <pre class="json-viewer" :style="{ maxHeight }">{{ json }}</pre>
</template>

<style scoped>
.json-viewer {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  color: #334155;
  font-size: 12px;
  line-height: 1.5;
  margin: 0;
  overflow: auto;
  padding: 12px;
  white-space: pre-wrap;
}
</style>
