<script setup lang="ts">
import { computed } from "vue"
import { useRoute, useRouter } from "vue-router"
import { LogOut } from "lucide-vue-next"
import { NButton, NSpace, NText } from "naive-ui"
import { useAuthStore } from "@/stores/auth"

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const title = computed(() => route.meta.title ?? "Quản trị")

async function logout() {
  await auth.logout()
  await router.replace("/login")
}
</script>

<template>
  <div class="topbar">
    <div>
      <n-text depth="3">{{ title }}</n-text>
    </div>
    <n-space align="center" size="small">
      <n-text depth="3">{{ auth.user?.email }}</n-text>
      <n-button size="small" quaternary @click="logout"><template #icon><LogOut :size="16" /></template>Đăng xuất</n-button>
    </n-space>
  </div>
</template>

<style scoped>
.topbar {
  align-items: center;
  display: flex;
  height: 56px;
  justify-content: space-between;
  padding: 0 24px;
}
</style>
