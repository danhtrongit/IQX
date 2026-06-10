<script setup lang="ts">
import { computed, h } from "vue"
import { RouterLink, useRoute } from "vue-router"
import { NMenu } from "naive-ui"
import type { MenuOption } from "naive-ui"
import { BookOpen, CreditCard, FileBarChart2, LayoutDashboard, Package, ScrollText, Settings, TrendingUp, Users, Webhook } from "lucide-vue-next"

const route = useRoute()
const selectedKey = computed(() => route.path)

const options: MenuOption[] = [
  link("Tổng quan", "/", LayoutDashboard),
  link("Người dùng", "/users", Users),
  {
    label: "Bài học",
    key: "lessons-group",
    icon: renderIcon(BookOpen),
    children: [link("Khoá học", "/lessons", BookOpen)],
  },
  {
    label: "Premium",
    key: "premium-group",
    icon: renderIcon(CreditCard),
    children: [
      link("Gói", "/plans", Package),
      link("Thuê bao", "/subscriptions", ScrollText),
      link("Thanh toán", "/payments", CreditCard),
      link("Nhật ký IPN", "/ipn", Webhook),
    ],
  },
  {
    label: "Giao dịch ảo",
    key: "vt-group",
    icon: renderIcon(TrendingUp),
    children: [link("Tài khoản", "/vt/accounts", Users), link("Cấu hình", "/vt/config", Settings)],
  },
  link("Nhật ký kiểm toán", "/audit", FileBarChart2),
  link("Hệ thống", "/system", Settings),
]

function link(label: string, path: string, icon: any): MenuOption {
  return {
    label: () => h(RouterLink, { to: path }, { default: () => label }),
    key: path,
    icon: renderIcon(icon),
  }
}

function renderIcon(icon: any) {
  return () => h(icon, { size: 16 })
}
</script>

<template>
  <div class="brand">
    <div class="brand-mark">IQ</div>
    <div>
      <div class="brand-title">Quản trị IQX</div>
      <div class="brand-subtitle">Trung tâm điều hành</div>
    </div>
  </div>
  <n-menu :value="selectedKey" :options="options" :default-expanded-keys="['lessons-group', 'premium-group', 'vt-group']" />
</template>

<style scoped>
.brand {
  align-items: center;
  display: flex;
  gap: 12px;
  padding: 20px 16px 14px;
}
.brand-mark {
  align-items: center;
  background: #2563eb;
  border-radius: 8px;
  color: white;
  display: flex;
  font-weight: 800;
  height: 36px;
  justify-content: center;
  width: 36px;
}
.brand-title {
  color: #0f172a;
  font-size: 15px;
  font-weight: 700;
}
.brand-subtitle {
  color: #64748b;
  font-size: 11px;
}
</style>
