<script setup lang="ts">
import { h, onMounted, ref } from "vue"
import { RouterLink } from "vue-router"
import { Download, KeyRound, Mail, Search } from "lucide-vue-next"
import { NButton, NCard, NInput, NSelect, NSpace, type DataTableColumns } from "naive-ui"
import RemoteDataTable from "@/components/table/RemoteDataTable.vue"
import StatusTag from "@/components/common/StatusTag.vue"
import ErrorState from "@/components/common/ErrorState.vue"
import { feedback } from "@/lib/feedback"
import { fmtDateTime } from "@/lib/format"
import { labelForRole } from "@/lib/labels"
import { useRemotePage } from "@/composables/useRemotePage"
import { usersApi, type AdminUserRow, type BulkOp } from "@/lib/api/users"

const searchText = ref("")
const role = ref<string | null>(null)
const status = ref<string | null>(null)
const checked = ref<Array<string | number>>([])
const bulkOp = ref<BulkOp | null>(null)
const bulkValue = ref<string | null>(null)
const exporting = ref(false)

const page = useRemotePage<AdminUserRow>((params) => usersApi.list({ page: Number(params.page), pageSize: Number(params.pageSize), sortBy: "created_at", sortDir: "desc", search: searchText.value || undefined, role: role.value || undefined, status: status.value || undefined }))

const roleOptions = [
  { label: "Người dùng", value: "user" },
  { label: "Premium", value: "premium" },
  { label: "Quản trị viên", value: "admin" },
]
const statusOptions = [
  { label: "Đang hoạt động", value: "active" },
  { label: "Không hoạt động", value: "inactive" },
  { label: "Bị đình chỉ", value: "suspended" },
]

const columns: DataTableColumns<AdminUserRow> = [
  { type: "selection" },
  { title: "Email", key: "email", minWidth: 240, render: (row) => h(RouterLink, { to: `/users/${row.id}` }, { default: () => row.email }) },
  { title: "Tên", key: "fullName", minWidth: 180, render: (row) => row.fullName ?? "-" },
  { title: "Vai trò", key: "role", width: 120, render: (row) => h(StatusTag, { status: row.role, label: labelForRole(row.role) }) },
  { title: "Trạng thái", key: "status", width: 150, render: (row) => h(StatusTag, { status: row.status }) },
  { title: "Xác thực", key: "isEmailVerified", width: 110, render: (row) => h(StatusTag, { status: row.isEmailVerified }) },
  { title: "Đăng nhập", key: "lastLoginAt", width: 160, render: (row) => row.lastLoginAt ? fmtDateTime(row.lastLoginAt) : "-" },
  { title: "Tạo lúc", key: "createdAt", width: 160, render: (row) => fmtDateTime(row.createdAt) },
  { title: "Thao tác", key: "actions", width: 170, render: (row) => h(NSpace, { size: 4 }, { default: () => [h(NButton, { size: "small", secondary: true, onClick: () => resetPassword(row) }, { icon: () => h(KeyRound, { size: 14 }), default: () => "Đặt lại" }), h(NButton, { size: "small", secondary: true, onClick: () => resend(row) }, { icon: () => h(Mail, { size: 14 }) })] }) },
]

function loadFirstPage() { void page.load({ page: 1 }) }

function resetPassword(user: AdminUserRow) {
  feedback.dialog?.warning({
    title: "Đặt lại mật khẩu?",
    content: `Tạo mật khẩu tạm thời cho ${user.email}.`,
    positiveText: "Đặt lại",
    negativeText: "Hủy",
    onPositiveClick: async () => {
      const res = await usersApi.resetPassword(user.id)
      feedback.dialog?.success({ title: "Mật khẩu tạm thời", content: res.temporary_password, positiveText: "Đã lưu" })
    },
  })
}

async function resend(user: AdminUserRow) {
  try {
    await usersApi.resendVerification(user.id)
    feedback.message?.success(`Đã gửi lại email xác thực cho ${user.email}`)
  } catch (error) {
    feedback.message?.error(error instanceof Error ? error.message : "Gửi thất bại")
  }
}

function applyBulk() {
  if (!bulkOp.value || checked.value.length === 0) return
  if (bulkOp.value !== "soft_delete" && !bulkValue.value) {
    feedback.message?.error("Vui lòng chọn giá trị áp dụng")
    return
  }
  feedback.dialog?.warning({
    title: "Áp dụng thao tác hàng loạt?",
    content: `Cập nhật ${checked.value.length} người dùng.`,
    positiveText: "Áp dụng",
    negativeText: "Hủy",
    onPositiveClick: async () => {
      const res = await usersApi.bulk({ user_ids: checked.value.map(String), op: bulkOp.value!, value: bulkOp.value === "soft_delete" ? null : bulkValue.value })
      feedback.message?.success(`Đã cập nhật ${res.affected} người dùng`)
      checked.value = []
      bulkOp.value = null
      bulkValue.value = null
      await page.load()
    },
  })
}

async function exportCsv() {
  exporting.value = true
  try {
    const filters: Record<string, string> = {}
    if (searchText.value) filters.search = searchText.value
    if (role.value) filters.role = role.value
    if (status.value) filters.status = status.value
    await usersApi.exportCsv(filters)
    feedback.message?.success("Đã xuất CSV thành công")
  } catch (error) {
    feedback.message?.error(error instanceof Error ? error.message : "Xuất CSV thất bại")
  } finally {
    exporting.value = false
  }
}

onMounted(() => void page.load())
</script>

<template>
  <div class="page-stack">
    <div class="page-header"><div><h1 class="page-title">Người dùng</h1><p class="page-subtitle">{{ page.total.value }} người dùng</p></div><n-button secondary :loading="exporting" @click="exportCsv"><template #icon><Download :size="16" /></template>Xuất CSV</n-button></div>
    <n-card>
      <n-space align="center" wrap>
        <n-input v-model:value="searchText" clearable placeholder="Tìm email, tên..." style="width: 260px" @keyup.enter="loadFirstPage"><template #prefix><Search :size="16" /></template></n-input>
        <n-select v-model:value="role" clearable :options="roleOptions" placeholder="Vai trò" style="width: 160px" @update:value="loadFirstPage" />
        <n-select v-model:value="status" clearable :options="statusOptions" placeholder="Trạng thái" style="width: 180px" @update:value="loadFirstPage" />
        <n-button type="primary" @click="loadFirstPage">Lọc</n-button>
      </n-space>
    </n-card>
    <n-card v-if="checked.length" size="small">
      <n-space align="center" wrap>
        <span>Đã chọn {{ checked.length }} người dùng</span>
        <n-select v-model:value="bulkOp" placeholder="Thao tác" :options="[{ label: 'Đặt vai trò', value: 'set_role' }, { label: 'Đặt trạng thái', value: 'set_status' }, { label: 'Xóa mềm', value: 'soft_delete' }]" style="width: 180px" @update:value="bulkValue = null" />
        <n-select v-if="bulkOp === 'set_role'" v-model:value="bulkValue" :options="roleOptions" placeholder="Vai trò" style="width: 160px" />
        <n-select v-if="bulkOp === 'set_status'" v-model:value="bulkValue" :options="statusOptions" placeholder="Trạng thái" style="width: 180px" />
        <n-button type="primary" @click="applyBulk">Áp dụng</n-button>
        <n-button secondary @click="checked = []">Bỏ chọn</n-button>
      </n-space>
    </n-card>
    <ErrorState v-if="page.error.value" :message="page.error.value" @retry="page.load" />
    <RemoteDataTable :columns="columns" :rows="page.rows.value" :loading="page.loading.value" :page="page.params.page" :page-size="page.params.pageSize" :item-count="page.total.value" :row-key="(row) => row.id" :checked-row-keys="checked" @update-checked-row-keys="checked = $event" @page-change="page.setPage" @page-size-change="page.setPageSize" />
  </div>
</template>
