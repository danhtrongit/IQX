import { Empty, Typography } from "@arco-design/web-react"

/** Temporary stand-in for routes still being rebuilt in the feature phase. */
export function Placeholder({ title }: { title: string }) {
  return (
    <div className="flex h-full items-center justify-center p-8">
      <Empty
        description={
          <Typography.Text type="secondary">{title} — đang được hoàn thiện</Typography.Text>
        }
      />
    </div>
  )
}

export function NotFoundPage() {
  return (
    <div className="flex h-full items-center justify-center p-8">
      <Empty description="404 — Không tìm thấy trang" />
    </div>
  )
}

export function MaintenancePage() {
  return (
    <div className="flex h-full items-center justify-center p-8">
      <Empty description="Hệ thống đang bảo trì. Vui lòng quay lại sau." />
    </div>
  )
}
