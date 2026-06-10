<script setup lang="ts">
import { NLayout, NLayoutContent, NLayoutHeader, NLayoutSider } from "naive-ui"
import SidebarNav from "./SidebarNav.vue"
import TopBar from "./TopBar.vue"
</script>

<template>
  <n-layout class="admin-shell" has-sider>
    <n-layout-sider class="shell-sider" :width="248" bordered>
      <SidebarNav />
    </n-layout-sider>
    <n-layout>
      <n-layout-header bordered class="shell-header"><TopBar /></n-layout-header>
      <n-layout-content class="shell-content">
        <router-view />
      </n-layout-content>
    </n-layout>
  </n-layout>
</template>

<style scoped>
.admin-shell {
  min-height: 100vh;
}
.shell-sider {
  min-height: 100vh;
}
.shell-header {
  position: sticky;
  top: 0;
  z-index: 2;
}
.shell-content {
  min-height: calc(100vh - 57px);
  padding: 24px;
}
@media (max-width: 820px) {
  .shell-sider {
    display: none;
  }
  .shell-content {
    padding: 16px;
  }
}
</style>
