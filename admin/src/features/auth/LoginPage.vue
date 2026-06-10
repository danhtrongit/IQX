<script setup lang="ts">
import { ref } from "vue"
import { useRoute, useRouter } from "vue-router"
import { Eye, EyeOff, ShieldCheck } from "lucide-vue-next"
import { NButton, NCard, NForm, NFormItem, NIcon, NInput, NSpace, NText } from "naive-ui"
import { feedback } from "@/lib/feedback"
import { useAuthStore } from "@/stores/auth"

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const email = ref("")
const password = ref("")
const showPassword = ref(false)
const submitting = ref(false)

async function submit() {
  if (!email.value || !password.value) {
    feedback.message?.error("Vui lòng nhập đầy đủ email và mật khẩu")
    return
  }
  submitting.value = true
  try {
    await auth.login({ email: email.value, password: password.value })
    await router.replace(typeof route.query.redirect === "string" ? route.query.redirect : "/")
  } catch (error) {
    feedback.message?.error(error instanceof Error ? error.message : "Đăng nhập thất bại")
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <main class="login-page">
    <n-card class="login-card" :bordered="true">
      <n-space vertical align="center" size="small" class="login-head">
        <div class="login-icon"><ShieldCheck :size="26" /></div>
        <h1>Quản trị IQX</h1>
        <n-text depth="3">Đăng nhập để truy cập trang quản trị</n-text>
      </n-space>
      <n-form @submit.prevent="submit">
        <n-form-item label="Email">
          <n-input v-model:value="email" placeholder="admin@example.com" autocomplete="email" :input-props="{ type: 'email' }" :disabled="submitting" />
        </n-form-item>
        <n-form-item label="Mật khẩu">
          <n-input v-model:value="password" :type="showPassword ? 'text' : 'password'" placeholder="••••••••" autocomplete="current-password" :disabled="submitting">
            <template #suffix>
              <n-button quaternary circle size="small" @click="showPassword = !showPassword">
                <template #icon><n-icon :component="showPassword ? EyeOff : Eye" /></template>
              </n-button>
            </template>
          </n-input>
        </n-form-item>
        <n-button type="primary" attr-type="submit" block :loading="submitting">Đăng nhập</n-button>
      </n-form>
    </n-card>
  </main>
</template>

<style scoped>
.login-page {
  align-items: center;
  background: #f6f8fc;
  display: flex;
  min-height: 100vh;
  justify-content: center;
  padding: 24px;
}
.login-card {
  max-width: 400px;
  width: 100%;
}
.login-head {
  margin-bottom: 22px;
  text-align: center;
}
.login-head h1 {
  font-size: 24px;
  margin: 0;
}
.login-icon {
  align-items: center;
  background: #eff6ff;
  border-radius: 10px;
  color: #2563eb;
  display: flex;
  height: 52px;
  justify-content: center;
  width: 52px;
}
</style>
