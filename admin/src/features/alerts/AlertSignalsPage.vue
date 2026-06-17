<script setup lang="ts">
import { h, onMounted, ref } from "vue"
import { Plus, RefreshCw } from "lucide-vue-next"
import {
  NButton,
  NCard,
  NDataTable,
  NDynamicInput,
  NForm,
  NFormItem,
  NInput,
  NInputNumber,
  NModal,
  NSelect,
  NSpace,
  NSwitch,
  NTag,
  type DataTableColumns,
} from "naive-ui"
import ErrorState from "@/components/common/ErrorState.vue"
import { feedback } from "@/lib/feedback"
import {
  ALERT_INDICATORS,
  ALERT_OPS,
  BINARY_INDICATORS,
  alertsAdminApi,
  type AlertSignal,
  type AlertSignalUpsert,
} from "@/lib/api/alerts"

interface EditableCondition {
  indicator: string
  op: string
  value: string // edited as text; parsed on save
}
interface EditForm {
  key: string
  side: "buy" | "sell"
  taName: string
  messageTitle: string
  logic: "AND" | "OR"
  conditions: EditableCondition[]
  isEnabled: boolean
  sortOrder: number
}

const signals = ref<AlertSignal[]>([])
const loading = ref(true)
const error = ref<string | null>(null)
const modalOpen = ref(false)
const saving = ref(false)
const isCreate = ref(false)
const form = ref<EditForm>(blankForm())

const indicatorOptions = ALERT_INDICATORS.map((i) => ({ label: i, value: i }))
const opOptions = ALERT_OPS.map((o) => ({ label: o, value: o }))
const sideOptions = [
  { label: "MUA", value: "buy" },
  { label: "BÁN", value: "sell" },
]
const logicOptions = [
  { label: "AND (tất cả điều kiện)", value: "AND" },
  { label: "OR (một trong số)", value: "OR" },
]

function blankForm(): EditForm {
  return {
    key: "",
    side: "buy",
    taName: "",
    messageTitle: "",
    logic: "AND",
    conditions: [{ indicator: "rsi_14", op: "<", value: "30" }],
    isEnabled: true,
    sortOrder: 0,
  }
}

async function load() {
  loading.value = true
  error.value = null
  try {
    signals.value = await alertsAdminApi.list()
  } catch (err) {
    error.value = err instanceof Error ? err.message : "Không tải được danh sách tín hiệu"
  } finally {
    loading.value = false
  }
}

function openEdit(s: AlertSignal) {
  isCreate.value = false
  form.value = {
    key: s.key,
    side: s.side,
    taName: s.taName,
    messageTitle: s.messageTitle,
    logic: s.combination.logic,
    conditions: s.combination.conditions.map((c) => ({
      indicator: c.indicator,
      op: c.op,
      value: c.value == null ? "" : String(c.value),
    })),
    isEnabled: s.isEnabled,
    sortOrder: s.sortOrder,
  }
  modalOpen.value = true
}

function openCreate() {
  isCreate.value = true
  form.value = blankForm()
  modalOpen.value = true
}

function buildPayload(): AlertSignalUpsert {
  return {
    side: form.value.side,
    taName: form.value.taName,
    messageTitle: form.value.messageTitle,
    isEnabled: form.value.isEnabled,
    sortOrder: form.value.sortOrder,
    combination: {
      logic: form.value.logic,
      conditions: form.value.conditions.map((c) => {
        let value: number | string | null
        if (c.op === "is_true") value = null
        else if (c.value.trim() === "") value = null
        else if (!Number.isNaN(Number(c.value))) value = Number(c.value)
        else value = c.value.trim()
        return { indicator: c.indicator, op: c.op, value }
      }),
    },
  }
}

async function save() {
  if (!form.value.taName.trim() || !form.value.messageTitle.trim()) {
    feedback.message?.warning("Nhập tên TA và tiêu đề tin nhắn")
    return
  }
  if (isCreate.value && !/^[a-z0-9_]+$/.test(form.value.key)) {
    feedback.message?.warning("Key chỉ gồm a-z, 0-9, _")
    return
  }
  saving.value = true
  try {
    const payload = buildPayload()
    if (isCreate.value) await alertsAdminApi.create(form.value.key, payload)
    else await alertsAdminApi.update(form.value.key, payload)
    feedback.message?.success("Đã lưu tín hiệu")
    modalOpen.value = false
    await load()
  } catch (err) {
    feedback.message?.error(err instanceof Error ? err.message : "Lưu thất bại")
  } finally {
    saving.value = false
  }
}

function confirmDelete(s: AlertSignal) {
  feedback.dialog?.warning({
    title: "Xóa tín hiệu?",
    content: `Xóa "${s.taName}" (${s.key}). Người dùng đã theo dõi sẽ không bị ảnh hưởng.`,
    positiveText: "Xóa",
    negativeText: "Hủy",
    onPositiveClick: async () => {
      try {
        await alertsAdminApi.remove(s.key)
        feedback.message?.success("Đã xóa")
        await load()
      } catch (err) {
        feedback.message?.error(err instanceof Error ? err.message : "Xóa thất bại")
      }
    },
  })
}

async function seed(overwrite: boolean) {
  try {
    const res = await alertsAdminApi.seed(overwrite)
    feedback.message?.success(`Đã tạo ${res.created} tín hiệu mặc định`)
    await load()
  } catch (err) {
    feedback.message?.error(err instanceof Error ? err.message : "Seed thất bại")
  }
}

const columns: DataTableColumns<AlertSignal> = [
  { title: "Key", key: "key", width: 140, className: "mono" },
  {
    title: "Loại",
    key: "side",
    width: 80,
    render: (row) => h(NTag, { type: row.side === "buy" ? "success" : "error", size: "small" }, { default: () => (row.side === "buy" ? "MUA" : "BÁN") }),
  },
  { title: "Tên TA", key: "taName", minWidth: 140 },
  { title: "Tiêu đề tin nhắn", key: "messageTitle", minWidth: 220, ellipsis: { tooltip: true } },
  {
    title: "Tổ hợp",
    key: "combination",
    minWidth: 120,
    render: (row) => `${row.combination.conditions.length} điều kiện (${row.combination.logic})`,
  },
  {
    title: "Bật",
    key: "isEnabled",
    width: 70,
    render: (row) =>
      h(NSwitch, {
        size: "small",
        value: row.isEnabled,
        onUpdateValue: async (v: boolean) => {
          try {
            await alertsAdminApi.update(row.key, {
              side: row.side,
              taName: row.taName,
              messageTitle: row.messageTitle,
              combination: row.combination,
              isEnabled: v,
              sortOrder: row.sortOrder,
            })
            await load()
          } catch (err) {
            feedback.message?.error(err instanceof Error ? err.message : "Cập nhật thất bại")
          }
        },
      }),
  },
  {
    title: "Thao tác",
    key: "action",
    width: 150,
    render: (row) =>
      h(NSpace, { size: 8 }, {
        default: () => [
          h(NButton, { size: "small", secondary: true, onClick: () => openEdit(row) }, { default: () => "Sửa" }),
          h(NButton, { size: "small", secondary: true, type: "error", onClick: () => confirmDelete(row) }, { default: () => "Xóa" }),
        ],
      }),
  },
]

onMounted(load)
</script>

<template>
  <div class="page-stack">
    <div class="page-header">
      <div>
        <h1 class="page-title">Tín hiệu cảnh báo</h1>
        <p class="page-subtitle">Cấu hình tổ hợp chỉ số cho 10 tín hiệu gửi qua Telegram.</p>
      </div>
      <n-space>
        <n-button secondary :loading="loading" @click="load"><template #icon><RefreshCw :size="16" /></template>Làm mới</n-button>
        <n-button secondary @click="seed(false)">Tạo 10 mặc định</n-button>
        <n-button type="primary" @click="openCreate"><template #icon><Plus :size="16" /></template>Thêm tín hiệu</n-button>
      </n-space>
    </div>

    <ErrorState v-if="error" :message="error" @retry="load" />

    <n-card>
      <n-data-table :columns="columns" :data="signals" :loading="loading" :bordered="true" />
    </n-card>

    <n-modal
      v-model:show="modalOpen"
      preset="card"
      style="width: 680px"
      :title="isCreate ? 'Thêm tín hiệu' : `Sửa tín hiệu · ${form.key}`"
    >
      <n-form label-placement="top">
        <n-space vertical size="medium">
          <n-form-item v-if="isCreate" label="Key (a-z, 0-9, _)">
            <n-input v-model:value="form.key" placeholder="vd: pullback" />
          </n-form-item>
          <n-space>
            <n-form-item label="Loại">
              <n-select v-model:value="form.side" :options="sideOptions" style="width: 120px" />
            </n-form-item>
            <n-form-item label="Bật">
              <n-switch v-model:value="form.isEnabled" />
            </n-form-item>
            <n-form-item label="Thứ tự">
              <n-input-number v-model:value="form.sortOrder" :min="0" style="width: 100px" />
            </n-form-item>
          </n-space>
          <n-form-item label="Tên TA">
            <n-input v-model:value="form.taName" placeholder="vd: Pullback" />
          </n-form-item>
          <n-form-item label="Tiêu đề tin nhắn (gửi Telegram)">
            <n-input v-model:value="form.messageTitle" placeholder="vd: Mua khi giá điều chỉnh nhẹ" />
          </n-form-item>
          <n-form-item label="Logic kết hợp">
            <n-select v-model:value="form.logic" :options="logicOptions" style="width: 220px" />
          </n-form-item>
          <n-form-item label="Điều kiện">
            <n-dynamic-input
              v-model:value="form.conditions"
              :on-create="() => ({ indicator: 'rsi_14', op: '<', value: '30' })"
            >
              <template #default="{ value }">
                <n-space align="center" style="width: 100%">
                  <n-select v-model:value="value.indicator" :options="indicatorOptions" filterable style="width: 200px" />
                  <n-select v-model:value="value.op" :options="opOptions" style="width: 140px" />
                  <n-input
                    v-model:value="value.value"
                    :disabled="value.op === 'is_true' || BINARY_INDICATORS.has(value.indicator)"
                    :placeholder="value.op === 'is_true' ? '(không cần)' : 'ngưỡng / chỉ số'"
                    style="width: 160px"
                  />
                </n-space>
              </template>
            </n-dynamic-input>
          </n-form-item>
        </n-space>
      </n-form>
      <template #footer>
        <n-space justify="end">
          <n-button @click="modalOpen = false">Hủy</n-button>
          <n-button type="primary" :loading="saving" @click="save">Lưu</n-button>
        </n-space>
      </template>
    </n-modal>
  </div>
</template>
