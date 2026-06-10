<script setup lang="ts">
import { computed } from "vue"
import { NTag } from "naive-ui"

const props = defineProps<{
  status: string | boolean | null | undefined
  label?: string
}>()

const statusText = computed(() => props.label ?? labelFor(props.status))
const tagType = computed(() => typeFor(props.status))

function labelFor(status: string | boolean | null | undefined) {
  if (status === true) return "Có"
  if (status === false) return "Không"
  const map: Record<string, string> = {
    active: "Đang hoạt động",
    inactive: "Không hoạt động",
    suspended: "Bị đình chỉ",
    deleted: "Đã xóa",
    paid: "Đã thanh toán",
    pending: "Đang chờ",
    failed: "Thất bại",
    refunded: "Đã hoàn tiền",
    cancelled: "Đã hủy",
    expired: "Hết hạn",
    success: "Thành công",
    reconciled: "Đã đối soát",
    filled: "Khớp lệnh",
    rejected: "Từ chối",
  }
  return map[String(status ?? "")] ?? String(status ?? "-")
}

function typeFor(status: string | boolean | null | undefined) {
  if (status === true) return "success"
  if (status === false) return "default"
  if (["active", "paid", "success", "reconciled", "filled"].includes(String(status))) return "success"
  if (["pending", "trial", "admin_grant"].includes(String(status))) return "warning"
  if (["failed", "cancelled", "expired", "suspended", "deleted", "refunded", "rejected"].includes(String(status))) return "error"
  return "info"
}
</script>

<template>
  <n-tag size="small" :type="tagType" round>{{ statusText }}</n-tag>
</template>
