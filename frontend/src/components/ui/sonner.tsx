import type { CSSProperties } from "react"
import { CircleCheck, CircleX, Info, LoaderCircle, TriangleAlert, X } from "lucide-react"
import { Toaster as Sonner, type ToastClassnames, type ToasterProps } from "sonner"

import { useResolvedTheme } from "@/hooks/use-resolved-theme"
import { cn } from "@/lib/utils"
import "./sonner.css"

const icons: ToasterProps["icons"] = {
  success: <><CircleCheck aria-hidden="true" /><span className="sr-only">Thành công</span></>,
  error: <><CircleX aria-hidden="true" /><span className="sr-only">Lỗi</span></>,
  info: <><Info aria-hidden="true" /><span className="sr-only">Thông tin</span></>,
  warning: <><TriangleAlert aria-hidden="true" /><span className="sr-only">Cảnh báo</span></>,
  loading: <><LoaderCircle aria-hidden="true" className="animate-spin motion-reduce:animate-none" /><span className="sr-only">Đang xử lý</span></>,
  close: <X aria-hidden="true" />,
}

const classNames: ToastClassnames = {
  toast: "iqx-toast",
  title: "iqx-toast-title",
  description: "iqx-toast-description",
  content: "iqx-toast-content",
  icon: "iqx-toast-icon",
  loader: "iqx-toast-loader",
  closeButton: "iqx-toast-close",
  actionButton: "iqx-toast-action",
  cancelButton: "iqx-toast-cancel",
}

const style: CSSProperties = {
  "--normal-bg": "var(--popover)",
  "--normal-text": "var(--popover-foreground)",
  "--normal-border": "var(--border)",
  "--border-radius": "var(--radius)",
} as CSSProperties

export function Toaster({ className, icons: customIcons, style: customStyle, toastOptions, ...props }: ToasterProps) {
  const theme = useResolvedTheme()
  const mergedClassNames = { ...classNames, ...toastOptions?.classNames }
  for (const key of Object.keys(classNames) as (keyof ToastClassnames)[]) {
    mergedClassNames[key] = cn(classNames[key], toastOptions?.classNames?.[key])
  }
  return (
    <Sonner
      theme={theme}
      position="top-right"
      closeButton
      richColors={false}
      duration={5_000}
      visibleToasts={3}
      gap={12}
      offset={{ top: "calc(var(--header-top, 48px) + 12px)", right: 16, bottom: 16, left: 16 }}
      mobileOffset={{ top: "calc(env(safe-area-inset-top, 0px) + var(--header-top, 48px) + 8px)", right: 12, bottom: 12, left: 12 }}
      containerAriaLabel="Thông báo"
      {...props}
      className={cn("iqx-toaster", className)}
      icons={{ ...icons, ...customIcons }}
      style={{ ...style, ...customStyle }}
      toastOptions={{ closeButtonAriaLabel: "Đóng thông báo", ...toastOptions, classNames: mergedClassNames }}
    />
  )
}
