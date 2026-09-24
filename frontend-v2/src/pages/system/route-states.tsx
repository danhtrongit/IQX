import { CircleAlert, House, RefreshCw } from "lucide-react"
import { Link } from "react-router"
import { WorkspacePage } from "@/components/layout/workspace-page"
import { Button } from "@/components/ui/button"

export function NotFoundPage() {
  return <WorkspacePage title="Không tìm thấy trang" description="Đường dẫn này không tồn tại hoặc đã được thay đổi.">
    <div className="mx-auto flex max-w-xl flex-col items-center gap-4 border-y border-border py-16 text-center">
      <CircleAlert className="size-10 text-muted-foreground" aria-hidden="true" />
      <p className="text-sm leading-6 text-muted-foreground">Kiểm tra lại địa chỉ hoặc trở về khu vực thị trường để tiếp tục theo dõi và phân tích cổ phiếu.</p>
      <Button asChild><Link to="/demo-trading"><House />Về Demo Trading</Link></Button>
    </div>
  </WorkspacePage>
}

export function MaintenancePage() {
  return <WorkspacePage title="Hệ thống đang bảo trì" description="Một số dịch vụ IQX đang tạm ngừng để cập nhật.">
    <div className="mx-auto flex max-w-xl flex-col items-center gap-4 border-y border-border py-16 text-center">
      <RefreshCw className="size-10 text-primary" aria-hidden="true" />
      <p className="text-sm leading-6 text-muted-foreground">Dữ liệu chưa được thay thế bằng bản lưu cũ. Hãy thử tải lại sau ít phút.</p>
      <Button onClick={() => window.location.reload()}><RefreshCw />Thử lại</Button>
    </div>
  </WorkspacePage>
}
