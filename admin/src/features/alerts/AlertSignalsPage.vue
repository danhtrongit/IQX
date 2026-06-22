<script setup lang="ts">
import { h, onMounted, ref } from "vue"
import { GripVertical, Plus, RefreshCw, Trash2 } from "lucide-vue-next"
import {
  NButton,
  NCard,
  NDataTable,
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
  RAW_FIELD_LABELS,
  alertsAdminApi,
  fetchIndicatorOptions,
  type AlertSignal,
  type AlertSignalUpsert,
} from "@/lib/api/alerts"

interface EditableCondition {
  indicator: string
  op: string
  value: string // edited as text; parsed on save
  join: "AND" | "OR" // connector to the previous row (ignored on the first)
}
interface EditForm {
  key: string
  side: "buy" | "sell"
  taName: string
  messageTitle: string
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
const dragIndex = ref<number | null>(null)

/** Falls back to raw id as label if the backend fetch fails. */
const RAW_PRICE_IDS = new Set(Object.keys(RAW_FIELD_LABELS))
const fallbackIndicatorOptions = ALERT_INDICATORS.map((i) => ({
  label: RAW_PRICE_IDS.has(i) ? (RAW_FIELD_LABELS[i] ?? i) : i,
  value: i,
}))
const indicatorOptions = ref(fallbackIndicatorOptions)
const opOptions = ALERT_OPS.map((o) => ({ label: o, value: o }))
const sideOptions = [
  { label: "MUA", value: "buy" },
  { label: "BÁN", value: "sell" },
]
const joinOptions = [
  { label: "VÀ", value: "AND" },
  { label: "HOẶC", value: "OR" },
]

function blankCondition(): EditableCondition {
  return { indicator: "rsi_14", op: "<", value: "30", join: "AND" }
}
function blankForm(): EditForm {
  return {
    key: "",
    side: "buy",
    taName: "",
    messageTitle: "",
    conditions: [blankCondition()],
    isEnabled: true,
    sortOrder: 0,
  }
}

async function load() {
  loading.value = true
  error.value = null
  try {
    const [signalList] = await Promise.allSettled([
      alertsAdminApi.list(),
      fetchIndicatorOptions().then((opts) => {
        // Build options from backend display names + 5 raw price fields appended client-side
        const backendOpts = opts.map((o) => ({ label: o.label, value: o.id }))
        const rawOpts = Object.entries(RAW_FIELD_LABELS).map(([id, label]) => ({ label, value: id }))
        indicatorOptions.value = [...backendOpts, ...rawOpts]
      }).catch(() => {
        // Fetch failed — keep fallback options already set (raw ids + translated price fields)
      }),
    ])
    if (signalList.status === "fulfilled") {
      signals.value = signalList.value
    } else {
      throw signalList.reason
    }
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
    isEnabled: s.isEnabled,
    sortOrder: s.sortOrder,
    conditions: s.combination.conditions.map((c) => ({
      indicator: c.indicator,
      op: c.op,
      value: c.value == null ? "" : String(c.value),
      join: (c.join ?? s.combination.logic) as "AND" | "OR",
    })),
  }
  if (form.value.conditions.length === 0) form.value.conditions = [blankCondition()]
  modalOpen.value = true
}

function openCreate() {
  isCreate.value = true
  form.value = blankForm()
  modalOpen.value = true
}

function addCondition() {
  form.value.conditions.push(blankCondition())
}
function removeCondition(i: number) {
  form.value.conditions.splice(i, 1)
  if (form.value.conditions.length === 0) form.value.conditions.push(blankCondition())
}
function onDragStart(i: number) {
  dragIndex.value = i
}
function onDrop(i: number) {
  const from = dragIndex.value
  dragIndex.value = null
  if (from === null || from === i) return
  const arr = form.value.conditions
  const [moved] = arr.splice(from, 1)
  arr.splice(i, 0, moved)
}

function buildPayload(): AlertSignalUpsert {
  return {
    side: form.value.side,
    taName: form.value.taName,
    messageTitle: form.value.messageTitle,
    isEnabled: form.value.isEnabled,
    sortOrder: form.value.sortOrder,
    combination: {
      logic: "AND", // default; per-row `join` drives mixed logic
      conditions: form.value.conditions.map((c, i) => {
        let value: number | string | null
        if (c.op === "is_true") value = null
        else if (c.value.trim() === "") value = null
        else if (!Number.isNaN(Number(c.value))) value = Number(c.value)
        else value = c.value.trim()
        const cond: { indicator: string; op: string; value: number | string | null; join?: "AND" | "OR" } = {
          indicator: c.indicator,
          op: c.op,
          value,
        }
        if (i > 0) cond.join = c.join
        return cond
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

async function seed() {
  try {
    const res = await alertsAdminApi.seed(false)
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
    minWidth: 110,
    render: (row) => `${row.combination.conditions.length} điều kiện`,
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
        <p class="page-subtitle">Cấu hình tổ hợp chỉ số cho các tín hiệu gửi qua Telegram.</p>
      </div>
      <n-space>
        <n-button secondary :loading="loading" @click="load"><template #icon><RefreshCw :size="16" /></template>Làm mới</n-button>
        <n-button secondary @click="seed">Tạo 10 mặc định</n-button>
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
      style="width: 760px"
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

          <n-form-item label="Điều kiện (kéo ⠿ để sắp xếp · VÀ/HOẶC cho từng dòng)">
            <div class="cond-editor">
              <div
                v-for="(c, i) in form.conditions"
                :key="i"
                class="cond-row"
                :class="{ dragging: dragIndex === i }"
                @dragover.prevent
                @drop="onDrop(i)"
              >
                <span class="grip" draggable="true" @dragstart="onDragStart(i)" title="Kéo để sắp xếp">
                  <GripVertical :size="15" />
                </span>
                <n-select
                  v-if="i > 0"
                  v-model:value="c.join"
                  :options="joinOptions"
                  size="small"
                  style="width: 84px"
                />
                <span v-else class="when">KHI</span>
                <n-select v-model:value="c.indicator" :options="indicatorOptions" filterable size="small" style="width: 188px" />
                <n-select v-model:value="c.op" :options="opOptions" size="small" style="width: 122px" />
                <n-input
                  v-model:value="c.value"
                  size="small"
                  :disabled="c.op === 'is_true' || BINARY_INDICATORS.has(c.indicator)"
                  :placeholder="c.op === 'is_true' ? '(không cần)' : 'ngưỡng / chỉ số'"
                  style="width: 150px"
                />
                <n-button quaternary circle size="small" type="error" @click="removeCondition(i)" title="Xóa điều kiện">
                  <template #icon><Trash2 :size="14" /></template>
                </n-button>
              </div>
              <n-button dashed size="small" class="add-cond" @click="addCondition">
                <template #icon><Plus :size="14" /></template>Thêm điều kiện
              </n-button>
            </div>
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

<style scoped>
.cond-editor {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
}
.cond-row {
  align-items: center;
  background: var(--card-color, #fff);
  border: 1px solid var(--n-border-color, #e2e8f0);
  border-radius: 6px;
  display: flex;
  gap: 8px;
  padding: 6px 8px;
}
.cond-row.dragging {
  opacity: 0.5;
}
.grip {
  align-items: center;
  color: #94a3b8;
  cursor: grab;
  display: flex;
}
.when {
  color: #64748b;
  font-size: 12px;
  font-weight: 600;
  width: 84px;
}
.add-cond {
  align-self: flex-start;
}
</style>
