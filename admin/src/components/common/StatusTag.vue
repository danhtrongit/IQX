<script setup lang="ts">
import { computed } from "vue"
import { NTag } from "naive-ui"
import { labelForStatus, tagTypeForStatus } from "@/lib/labels"

const props = defineProps<{
  status: string | boolean | null | undefined
  label?: string
}>()

const statusText = computed(() => props.label ?? labelForStatus(props.status))
const tagType = computed(() => tagTypeForStatus(props.status))
</script>

<template>
  <n-tag size="small" :type="tagType" round>{{ statusText }}</n-tag>
</template>
