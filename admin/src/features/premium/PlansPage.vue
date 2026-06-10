<script setup lang="ts">
import { h, onMounted, reactive, ref } from "vue"
import { Plus } from "lucide-vue-next"
import { NButton, NCard, NDataTable, NForm, NFormItem, NInput, NInputNumber, NModal, NSpace, NSwitch, type DataTableColumns } from "naive-ui"
import StatusTag from "@/components/common/StatusTag.vue"
import ErrorState from "@/components/common/ErrorState.vue"
import { feedback } from "@/lib/feedback"
import { fmtDateTime, fmtVnd } from "@/lib/format"
import { plansApi, type PlanCreate, type PlanRow } from "@/lib/api/plans"

const plans = ref<PlanRow[]>([])
const loading = ref(true)
const error = ref<string | null>(null)
const modalOpen = ref(false)
const editing = ref<PlanRow | null>(null)
const form = reactive({ code: "", name: "", description: "", priceVnd: 0, durationDays: 30, isActive: true, sortOrder: 0 })

const columns: DataTableColumns<PlanRow> = [
  { title: "Mã", key: "code", width: 140, className: "mono" },
  { title: "Tên", key: "name", minWidth: 180 },
  { title: "Giá", key: "priceVnd", render: (row) => fmtVnd(row.priceVnd) },
  { title: "Thời hạn", key: "durationDays", render: (row) => `${row.durationDays} ngày` },
  { title: "Thứ tự", key: "sortOrder" },
  { title: "Trạng thái", key: "isActive", render: (row) => h(StatusTag, { status: row.isActive, label: row.isActive ? "Đang hoạt động" : "Không hoạt động" }) },
  { title: "Ngày tạo", key: "createdAt", render: (row) => fmtDateTime(row.createdAt) },
  { title: "Thao tác", key: "actions", width: 180, render: (row) => h(NSpace, { size: 4 }, { default: () => [h(NButton, { size: "small", secondary: true, onClick: () => openEdit(row) }, { default: () => "Sửa" }), h(NButton, { size: "small", secondary: true, type: "error", disabled: row.code === "TRIAL_7D" || !row.isActive, onClick: () => deactivate(row) }, { default: () => "Ngưng" })] }) },
]

async function load() {
  loading.value = true
  error.value = null
  try {
    plans.value = (await plansApi.list()).sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
  } catch (err) { error.value = err instanceof Error ? err.message : "Không thể tải gói" } finally { loading.value = false }
}
function openCreate() { editing.value = null; Object.assign(form, { code: "", name: "", description: "", priceVnd: 0, durationDays: 30, isActive: true, sortOrder: plans.value.length + 1 }); modalOpen.value = true }
function openEdit(row: PlanRow) { editing.value = row; Object.assign(form, { code: row.code, name: row.name, description: row.description ?? "", priceVnd: row.priceVnd, durationDays: row.durationDays, isActive: row.isActive, sortOrder: row.sortOrder }); modalOpen.value = true }
async function save() {
  const body: PlanCreate = { code: form.code, name: form.name, description: form.description || null, price_vnd: form.priceVnd, duration_days: form.durationDays, is_active: form.isActive, sort_order: form.sortOrder }
  try {
    if (editing.value) await plansApi.update(editing.value.id, body)
    else await plansApi.create(body)
    feedback.message?.success("Đã lưu gói")
    modalOpen.value = false
    await load()
  } catch (err) { feedback.message?.error(err instanceof Error ? err.message : "Lưu thất bại") }
}
function deactivate(row: PlanRow) {
  feedback.dialog?.warning({ title: "Ngưng kích hoạt gói?", content: row.name, positiveText: "Ngưng", negativeText: "Hủy", onPositiveClick: async () => { await plansApi.delete(row.id); feedback.message?.success("Đã ngưng kích hoạt gói"); await load() } })
}
onMounted(() => void load())
</script>

<template>
  <div class="page-stack">
    <div class="page-header"><div><h1 class="page-title">Gói Premium</h1><p class="page-subtitle">Quản lý các gói premium</p></div><n-button type="primary" @click="openCreate"><template #icon><Plus :size="16" /></template>Tạo gói</n-button></div>
    <ErrorState v-if="error" :message="error" @retry="load" />
    <n-card><n-data-table :columns="columns" :data="plans" :loading="loading" /></n-card>
    <n-modal v-model:show="modalOpen" preset="card" :title="editing ? 'Sửa gói' : 'Tạo gói'" style="max-width: 560px">
      <n-form label-placement="top">
        <n-form-item label="Mã"><n-input v-model:value="form.code" :disabled="!!editing" /></n-form-item>
        <n-form-item label="Tên"><n-input v-model:value="form.name" /></n-form-item>
        <n-form-item label="Mô tả"><n-input v-model:value="form.description" type="textarea" /></n-form-item>
        <n-space><n-form-item label="Giá"><n-input-number v-model:value="form.priceVnd" :min="0" /></n-form-item><n-form-item label="Thời hạn"><n-input-number v-model:value="form.durationDays" :min="1" /></n-form-item><n-form-item label="Thứ tự"><n-input-number v-model:value="form.sortOrder" :min="0" /></n-form-item></n-space>
        <n-form-item label="Đang hoạt động"><n-switch v-model:value="form.isActive" /></n-form-item>
        <n-space justify="end"><n-button secondary @click="modalOpen = false">Hủy</n-button><n-button type="primary" @click="save">Lưu</n-button></n-space>
      </n-form>
    </n-modal>
  </div>
</template>
