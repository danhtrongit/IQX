<script setup lang="ts">
import { dateViVN, NConfigProvider, NDialogProvider, NGlobalStyle, NLoadingBarProvider, NMessageProvider, NNotificationProvider, viVN } from "naive-ui"
import FeedbackBridge from "@/components/common/FeedbackBridge.vue"
import { themeOverrides } from "@/theme"
</script>

<template>
  <n-config-provider :locale="viVN" :date-locale="dateViVN" :theme-overrides="themeOverrides">
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
