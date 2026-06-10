<script setup lang="ts">
import { onMounted } from "vue"
import { useDialog, useLoadingBar, useMessage, useNotification } from "naive-ui"
import { setFeedbackApis } from "@/lib/feedback"

const loadingBar = useLoadingBar()
const message = useMessage()
const dialog = useDialog()
const notification = useNotification()

onMounted(() => {
  setFeedbackApis({ loadingBar, message, dialog, notification })
})
</script>

<template>
  <span aria-hidden="true" />
</template>
