<script setup lang="ts">
import { NConfigProvider, NDialogProvider, NGlobalStyle, NLoadingBarProvider, NMessageProvider, NNotificationProvider } from "naive-ui"
import FeedbackBridge from "@/components/common/FeedbackBridge.vue"
import { themeOverrides } from "@/theme"
</script>

<template>
  <n-config-provider :theme-overrides="themeOverrides">
    <n-global-style />
    <n-loading-bar-provider>
      <n-message-provider placement="top-right">
        <n-dialog-provider>
          <n-notification-provider placement="top-right">
            <FeedbackBridge />
            <router-view />
          </n-notification-provider>
        </n-dialog-provider>
      </n-message-provider>
    </n-loading-bar-provider>
  </n-config-provider>
</template>
