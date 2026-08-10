<script setup lang="ts">
import { h, onMounted, ref } from "vue"
import { useRoute, useRouter, RouterLink } from "vue-router"
import { ArrowLeft } from "lucide-vue-next"
import { NAlert, NButton, NCard, NDescriptions, NDescriptionsItem, NInput, NModal, NSpace } from "naive-ui"
import JsonViewer from "@/components/common/JsonViewer.vue"
import StatusTag from "@/components/common/StatusTag.vue"
import ErrorState from "@/components/common/ErrorState.vue"
import { feedback } from "@/lib/feedback"
import { fmtDateTime, fmtVnd } from "@/lib/format"
import { labelForGrantType } from "@/lib/labels"
import { paymentsApi, type PaymentDetail } from "@/lib/api/payments"

const route = useRoute(); const router = useRouter(); const payment = ref<PaymentDetail | null>(null); const loading = ref(true); const error = ref<string | null>(null)
async function load() { loading.value = true; error.value = null; try { payment.value = await paymentsApi.get(String(route.params.paymentId)) } catch (err) { error.value = err instanceof Error ? err.message : "Không thể tải đơn hàng" } finally { loading.value = false } }
function errText(err: unknown, fallback: string) {
  // Lỗi server đã được ky gắn vào message (lib/api/client.ts) — hiện nguyên văn.
  return err instanceof Error && err.message ? err.message : fallback
}
function refund() { if (!payment.value) return; const reason = ref(""); feedback.dialog?.warning({ title: "Hoàn tiền đơn hàng?", content: () => h(NInput, { value: reason.value, type: "textarea", placeholder: "Lý do hoàn tiền", onUpdateValue: (v: string) => { reason.value = v } }), positiveText: "Hoàn tiền", negativeText: "Hủy", onPositiveClick: async () => { if (!reason.value.trim()) { feedback.message?.error("Lý do bắt buộc"); return false } try { payment.value = await paymentsApi.refund(payment.value!.id, reason.value); feedback.message?.success("Đã hoàn tiền") } catch (err) { feedback.message?.error(errText(err, "Không hoàn tiền được")); return false } } }) }
function reconcile() {
  if (!payment.value) return
  feedback.dialog?.info({
    title: "Đối chiếu IPN từ SePay?",
    content: `Hệ thống sẽ tìm bản ghi IPN hợp lệ mà SePay đã gửi cho đơn ${payment.value.invoiceNumber}. Nếu SePay chưa từng gọi webhook thì không có gì để đối chiếu và đơn giữ nguyên trạng thái.`,
    positiveText: "Đối chiếu",
    negativeText: "Hủy",
    onPositiveClick: async () => {
      try {
        const res = await paymentsApi.reconcile(payment.value!.id)
        if (res.status === "reconciled") { feedback.message?.success("Đã đối chiếu: tìm thấy IPN hợp lệ, đơn chuyển sang đã thanh toán."); await load() }
        else feedback.notification?.warning({ title: "Không có IPN nào khớp", content: `SePay chưa từng gửi webhook hợp lệ cho ${payment.value!.invoiceNumber}, nên không có bằng chứng để đối chiếu. Đơn giữ nguyên trạng thái. Nếu bạn đã tự kiểm tra và thấy tiền về, hãy dùng “Xác nhận đã thanh toán”.`, duration: 12000 })
      } catch (err) { feedback.message?.error(errText(err, "Đối chiếu IPN không thực hiện được")); return false }
    },
  })
}

// ── Xác nhận thủ công (khi SePay không hề gửi IPN) ───────────────────────────
const markPaidOpen = ref(false)
const markPaidNote = ref("")
const markPaidError = ref<string | null>(null)
const markPaidSubmitting = ref(false)
function openMarkPaid() { markPaidNote.value = ""; markPaidError.value = null; markPaidOpen.value = true }
async function submitMarkPaid() {
  const trimmed = markPaidNote.value.trim()
  if (!payment.value || !trimmed) return
  markPaidSubmitting.value = true
  markPaidError.value = null
  try {
    payment.value = await paymentsApi.markPaid(payment.value.id, trimmed)
    feedback.message?.success("Đã xác nhận thanh toán. Premium đã được kích hoạt.")
    markPaidOpen.value = false
  } catch (err) { markPaidError.value = errText(err, "Không xác nhận được thanh toán") } finally { markPaidSubmitting.value = false }
}
onMounted(() => void load())
</script>
<template>
  <div class="page-stack">
    <div class="page-header"><div><n-button quaternary size="small" @click="router.back()"><template #icon><ArrowLeft :size="16" /></template>Quay lại</n-button><h1 class="page-title">{{ payment?.invoiceNumber ?? 'Chi tiết thanh toán' }}</h1><p class="page-subtitle mono">{{ route.params.paymentId }}</p></div><n-space v-if="payment"><n-button v-if="payment.status === 'paid'" type="error" @click="refund">Hoàn tiền</n-button><n-button v-if="payment.status === 'pending'" type="primary" @click="openMarkPaid">Xác nhận đã thanh toán</n-button><n-button v-if="payment.status === 'pending'" secondary @click="reconcile">Đối chiếu IPN</n-button></n-space></div><ErrorState v-if="error" :message="error" @retry="load" /><n-card v-if="payment" :loading="loading"><n-descriptions bordered :column="2"><n-descriptions-item label="Số tiền">{{ fmtVnd(payment.amountVnd) }}</n-descriptions-item><n-descriptions-item label="Trạng thái"><StatusTag :status="payment.status" /></n-descriptions-item><n-descriptions-item label="Nguồn xác nhận">{{ labelForGrantType(payment.grantType) }}</n-descriptions-item><n-descriptions-item label="Người dùng"><RouterLink :to="`/users/${payment.userId}`">{{ payment.userEmail ?? payment.userId }}</RouterLink></n-descriptions-item><n-descriptions-item label="Gói">{{ payment.planName ?? payment.planCode ?? '-' }}</n-descriptions-item><n-descriptions-item label="Tạo lúc">{{ fmtDateTime(payment.createdAt) }}</n-descriptions-item><n-descriptions-item label="Thanh toán lúc">{{ payment.paidAt ? fmtDateTime(payment.paidAt) : '-' }}</n-descriptions-item><n-descriptions-item v-if="payment.subscriptionId" label="Thuê bao"><RouterLink :to="`/subscriptions/${payment.subscriptionId}`">{{ payment.subscriptionId }}</RouterLink></n-descriptions-item><n-descriptions-item v-if="payment.grantNote" label="Ghi chú">{{ payment.grantNote }}</n-descriptions-item></n-descriptions></n-card><n-card v-if="payment?.rawIpn" title="Dữ liệu IPN gốc"><JsonViewer :data="payment.rawIpn" /></n-card><n-card v-if="payment?.ipnLogs.length" title="Nhật ký IPN"><JsonViewer :data="payment.ipnLogs" /></n-card>
    <n-modal v-model:show="markPaidOpen" preset="card" title="Xác nhận đã thanh toán" style="max-width: 560px" :mask-closable="!markPaidSubmitting">
      <template v-if="payment">
        <n-alert type="warning" :bordered="false" title="Chỉ dùng khi bạn đã tự kiểm tra tiền về">
          Đơn <strong>{{ payment.invoiceNumber }}</strong> ({{ fmtVnd(payment.amountVnd) }} — {{ payment.userEmail ?? payment.userId }}) sẽ được đánh dấu đã thanh toán và Premium kích hoạt/gia hạn ngay.
          Đơn được ghi nhận là <strong>Admin xác nhận</strong>, không phải do SePay báo về, và ghi lại tên bạn trong nhật ký kiểm toán.
        </n-alert>
        <div style="margin-top: 16px">
          <div style="margin-bottom: 6px">Bằng chứng đã đối chiếu (bắt buộc)</div>
          <n-input v-model:value="markPaidNote" type="textarea" :rows="3" placeholder="VD: CK VCB 09/08 20:14, ref FT25081234567 — đã khớp sao kê" :disabled="markPaidSubmitting" />
        </div>
        <n-alert v-if="markPaidError" type="error" :bordered="false" style="margin-top: 12px">{{ markPaidError }}</n-alert>
        <n-space justify="end" style="margin-top: 16px">
          <n-button secondary :disabled="markPaidSubmitting" @click="markPaidOpen = false">Hủy</n-button>
          <n-button type="primary" :disabled="!markPaidNote.trim() || markPaidSubmitting" :loading="markPaidSubmitting" @click="submitMarkPaid">Xác nhận đã nhận tiền</n-button>
        </n-space>
      </template>
    </n-modal>
  </div>
</template>
