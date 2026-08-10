<script setup lang="ts">
import { computed, h, onMounted, ref } from "vue"
import { RouterLink } from "vue-router"
import { NAlert, NButton, NCard, NInput, NModal, NSelect, NSpace, type DataTableColumns } from "naive-ui"
import RemoteDataTable from "@/components/table/RemoteDataTable.vue"
import StatusTag from "@/components/common/StatusTag.vue"
import ErrorState from "@/components/common/ErrorState.vue"
import { feedback } from "@/lib/feedback"
import { fmtDateTime, fmtVnd } from "@/lib/format"
import { labelForGrantType, labelForStatus } from "@/lib/labels"
import { useRemotePage } from "@/composables/useRemotePage"
import { paymentsApi, type PaymentRow } from "@/lib/api/payments"

const searchText = ref("")
const status = ref<string | null>(null)
const grantType = ref<string | null>(null)
const page = useRemotePage<PaymentRow>((p) => paymentsApi.list({ page: Number(p.page), pageSize: Number(p.pageSize), search: searchText.value || undefined, status: status.value || undefined, grantType: grantType.value || undefined }))

// ── Hộp thoại thao tác ─────────────────────────────────────────────────────
// Hai thao tác dùng chung một modal nhưng KHÁC hẳn nhau về hệ quả, nên tiêu đề,
// cảnh báo và nhãn nút đều đổi theo `action` để không ai bấm nhầm.
type ActionKind = "markPaid" | "grant"
const action = ref<ActionKind | null>(null)
const target = ref<PaymentRow | null>(null)
const note = ref("")
const submitting = ref(false)
const actionError = ref<string | null>(null)

const modalOpen = computed({ get: () => action.value !== null, set: (v: boolean) => { if (!v) closeAction() } })
const canSubmit = computed(() => note.value.trim().length > 0 && !submitting.value)
const modalTitle = computed(() => (action.value === "markPaid" ? "Xác nhận đã thanh toán" : "Cấp Premium thủ công"))
const submitLabel = computed(() => (action.value === "markPaid" ? "Xác nhận đã nhận tiền" : "Cấp Premium (không có thanh toán)"))
const noteLabel = computed(() => (action.value === "markPaid" ? "Bằng chứng đã đối chiếu (bắt buộc)" : "Lý do cấp (bắt buộc)"))
const notePlaceholder = computed(() => (action.value === "markPaid" ? "VD: CK VCB 09/08 20:14, ref FT25081234567 — đã khớp sao kê" : "VD: Đền bù sự cố, KH đối tác, quà tặng sự kiện..."))

function openAction(kind: ActionKind, row: PaymentRow) {
  action.value = kind
  target.value = row
  note.value = ""
  actionError.value = null
}
function closeAction() {
  action.value = null
  target.value = null
  note.value = ""
  actionError.value = null
}
function errText(err: unknown, fallback: string) {
  // Lỗi từ server đã được ky gắn vào message (xem lib/api/client.ts) — hiện nguyên văn.
  return err instanceof Error && err.message ? err.message : fallback
}

async function submitAction() {
  const row = target.value
  const kind = action.value
  const trimmed = note.value.trim()
  if (!row || !kind || !trimmed) return
  submitting.value = true
  actionError.value = null
  try {
    if (kind === "markPaid") {
      await paymentsApi.markPaid(row.id, trimmed)
      feedback.message?.success(`Đã xác nhận thanh toán cho ${row.invoiceNumber}. Premium đã được kích hoạt.`)
    } else {
      if (!row.planId) { actionError.value = "Đơn hàng này không gắn với gói nào nên không thể cấp Premium."; return }
      const granted = await paymentsApi.grantPremium(row.userId, row.planId, trimmed)
      feedback.message?.success(`Đã cấp Premium thủ công. Đơn mới: ${granted.invoiceNumber}`)
    }
    closeAction()
    await page.load()
  } catch (err) {
    actionError.value = errText(err, kind === "markPaid" ? "Không xác nhận được thanh toán" : "Không cấp được Premium")
  } finally {
    submitting.value = false
  }
}

function reconcile(row: PaymentRow) {
  feedback.dialog?.info({
    title: "Đối chiếu IPN từ SePay?",
    content: `Hệ thống sẽ tìm bản ghi IPN hợp lệ mà SePay đã gửi cho đơn ${row.invoiceNumber}. Nếu SePay chưa từng gọi webhook thì sẽ không có gì để đối chiếu và đơn giữ nguyên trạng thái.`,
    positiveText: "Đối chiếu",
    negativeText: "Hủy",
    onPositiveClick: async () => {
      try {
        const res = await paymentsApi.reconcile(row.id)
        if (res.status === "reconciled") {
          feedback.message?.success(`Đã đối chiếu ${row.invoiceNumber}: tìm thấy IPN hợp lệ, đơn chuyển sang đã thanh toán.`)
          await page.load()
        } else {
          // KHÔNG phải lỗi nút bấm — chỉ đơn giản là không tồn tại bằng chứng webhook.
          feedback.notification?.warning({
            title: "Không có IPN nào khớp",
            content: `SePay chưa từng gửi webhook hợp lệ cho ${row.invoiceNumber}, nên không có bằng chứng để đối chiếu. Đơn giữ nguyên trạng thái. Nếu bạn đã tự kiểm tra và thấy tiền về, hãy dùng "Xác nhận đã thanh toán".`,
            duration: 12000,
          })
        }
      } catch (err) {
        feedback.message?.error(errText(err, "Đối chiếu IPN không thực hiện được"))
        return false
      }
    },
  })
}

const columns: DataTableColumns<PaymentRow> = [
  { title: "Mã hóa đơn", key: "invoiceNumber", render: (row) => h(RouterLink, { to: `/payments/${row.id}` }, { default: () => row.invoiceNumber }) },
  { title: "Người dùng", key: "userEmail", render: (row) => h(RouterLink, { to: `/users/${row.userId}` }, { default: () => row.userEmail ?? row.userId }) },
  { title: "Gói", key: "planName", render: (row) => row.planName ?? row.planCode ?? "-" },
  { title: "Số tiền", key: "amountVnd", render: (row) => fmtVnd(row.amountVnd) },
  { title: "Trạng thái", key: "status", render: (row) => h(StatusTag, { status: row.status }) },
  { title: "Loại", key: "grantType", render: (row) => labelForGrantType(row.grantType) },
  { title: "Tạo lúc", key: "createdAt", render: (row) => fmtDateTime(row.createdAt) },
  {
    title: "Thao tác",
    key: "actions",
    width: 330,
    render: (row) => h(NSpace, { size: 4, wrap: false }, {
      default: () => [
        row.status === "pending"
          ? h(NButton, { size: "small", type: "primary", onClick: () => openAction("markPaid", row) }, { default: () => "Xác nhận đã thanh toán" })
          : null,
        row.status === "pending"
          ? h(NButton, { size: "small", secondary: true, onClick: () => reconcile(row) }, { default: () => "Đối chiếu IPN" })
          : null,
        h(NButton, { size: "small", quaternary: true, type: "warning", onClick: () => openAction("grant", row) }, { default: () => "Cấp Premium thủ công" }),
      ],
    }),
  },
]
const statusOptions = ["pending", "paid", "failed", "refunded"].map((value) => ({ label: labelForStatus(value), value }))
const grantOptions = ["payment", "admin_confirmed", "admin_grant"].map((value) => ({ label: labelForGrantType(value), value }))
function search() { void page.load({ page: 1 }) }
onMounted(() => void page.load())
</script>

<template>
  <div class="page-stack">
    <div class="page-header"><div><h1 class="page-title">Thanh toán</h1><p class="page-subtitle">{{ page.total.value }} đơn hàng</p></div></div>
    <n-card>
      <n-space wrap>
        <n-input v-model:value="searchText" clearable placeholder="Mã hóa đơn, email..." style="width: 260px" @keyup.enter="search" />
        <n-select v-model:value="status" clearable :options="statusOptions" placeholder="Trạng thái" style="width: 160px" />
        <n-select v-model:value="grantType" clearable :options="grantOptions" placeholder="Loại" style="width: 180px" />
        <n-button type="primary" @click="search">Lọc</n-button>
      </n-space>
    </n-card>
    <ErrorState v-if="page.error.value" :message="page.error.value" @retry="page.load" />
    <RemoteDataTable :columns="columns" :rows="page.rows.value" :loading="page.loading.value" :page="page.params.page" :page-size="page.params.pageSize" :item-count="page.total.value" @page-change="page.setPage" @page-size-change="page.setPageSize" />

    <n-modal v-model:show="modalOpen" preset="card" :title="modalTitle" style="max-width: 560px" :mask-closable="!submitting">
      <template v-if="target">
        <n-alert v-if="action === 'markPaid'" type="warning" :bordered="false" title="Chỉ dùng khi bạn đã tự kiểm tra tiền về">
          Đơn <strong>{{ target.invoiceNumber }}</strong> ({{ fmtVnd(target.amountVnd) }} — {{ target.userEmail ?? target.userId }}) sẽ được đánh dấu đã thanh toán và Premium kích hoạt/gia hạn ngay.
          Đơn được ghi nhận là <strong>Admin xác nhận</strong>, không phải do SePay báo về, và ghi lại tên bạn trong nhật ký kiểm toán.
        </n-alert>
        <n-alert v-else type="error" :bordered="false" title="Cấp Premium mà KHÔNG có bằng chứng thanh toán">
          Thao tác này tạo một <strong>đơn mới 0đ</strong> cho {{ target.userEmail ?? target.userId }} — gói {{ target.planName ?? target.planCode ?? "?" }}, và kích hoạt Premium ngay.
          Đơn <strong>{{ target.invoiceNumber }}</strong> vẫn giữ nguyên trạng thái hiện tại.
          Nếu khách đã thực sự chuyển tiền cho đơn này, hãy dùng “Xác nhận đã thanh toán” thay vì thao tác này.
        </n-alert>
        <div style="margin-top: 16px">
          <div style="margin-bottom: 6px">{{ noteLabel }}</div>
          <n-input v-model:value="note" type="textarea" :rows="3" :placeholder="notePlaceholder" :disabled="submitting" />
        </div>
        <n-alert v-if="actionError" type="error" :bordered="false" style="margin-top: 12px">{{ actionError }}</n-alert>
        <n-space justify="end" style="margin-top: 16px">
          <n-button secondary :disabled="submitting" @click="closeAction">Hủy</n-button>
          <n-button :type="action === 'markPaid' ? 'primary' : 'error'" :disabled="!canSubmit" :loading="submitting" @click="submitAction">{{ submitLabel }}</n-button>
        </n-space>
      </template>
    </n-modal>
  </div>
</template>
