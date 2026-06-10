import type { useDialog, useLoadingBar, useMessage, useNotification } from "naive-ui"

export interface FeedbackApis {
  loadingBar?: ReturnType<typeof useLoadingBar>
  message?: ReturnType<typeof useMessage>
  dialog?: ReturnType<typeof useDialog>
  notification?: ReturnType<typeof useNotification>
}

export const feedback: FeedbackApis = {}

export function setFeedbackApis(apis: FeedbackApis) {
  feedback.loadingBar = apis.loadingBar
  feedback.message = apis.message
  feedback.dialog = apis.dialog
  feedback.notification = apis.notification
}
