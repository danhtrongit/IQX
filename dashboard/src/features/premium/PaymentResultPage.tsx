import { useEffect } from "react"
import { useNavigate } from "react-router"
import { Button, Result, Space } from "@arco-design/web-react"
import {
  IconCheckCircleFill,
  IconCloseCircleFill,
  IconExclamationCircleFill,
  IconArrowLeft,
  IconTrophy,
  IconHome,
} from "@arco-design/web-react/icon"
import { useAuth } from "@/features/auth"

type ResultType = "success" | "error" | "cancel"

const CONFIG: Record<
  ResultType,
  { status: "success" | "error" | "warning"; icon: React.ReactNode; title: string; subTitle: string }
> = {
  success: {
    status: "success",
    icon: <IconCheckCircleFill />,
    title: "Thanh toán thành công!",
    subTitle:
      "Tài khoản của bạn đã được nâng cấp lên Premium. Tận hưởng đầy đủ tính năng ngay bây giờ!",
  },
  error: {
    status: "error",
    icon: <IconCloseCircleFill />,
    title: "Thanh toán thất bại",
    subTitle:
      "Đã xảy ra lỗi trong quá trình thanh toán. Vui lòng thử lại hoặc liên hệ hỗ trợ nếu vấn đề vẫn tiếp diễn.",
  },
  cancel: {
    status: "warning",
    icon: <IconExclamationCircleFill />,
    title: "Đã hủy thanh toán",
    subTitle:
      "Bạn đã hủy giao dịch. Không có khoản phí nào bị trừ. Bạn có thể quay lại và chọn gói khác bất cứ lúc nào.",
  },
}

export default function PaymentResultPage({ type }: { type: ResultType }) {
  const navigate = useNavigate()
  const { refreshUser } = useAuth()
  const config = CONFIG[type]

  // Auto-refresh user data on payment success to update role in header.
  useEffect(() => {
    if (type === "success") refreshUser()
  }, [type, refreshUser])

  return (
    <div
      className="min-h-screen flex items-center justify-center px-6"
      style={{ background: "var(--color-bg-1)" }}
    >
      <Result
        status={config.status}
        icon={config.icon}
        title={config.title}
        subTitle={config.subTitle}
        extra={
          <Space>
            {type === "success" ? (
              <>
                <Button type="primary" icon={<IconTrophy />} onClick={() => navigate("/cai-dat")}>
                  Xem tài khoản Premium
                </Button>
                <Button icon={<IconHome />} onClick={() => navigate("/")}>
                  Về trang chủ
                </Button>
              </>
            ) : (
              <>
                <Button type="primary" icon={<IconArrowLeft />} onClick={() => navigate("/nang-cap")}>
                  Thử lại
                </Button>
                <Button icon={<IconHome />} onClick={() => navigate("/")}>
                  Về trang chủ
                </Button>
              </>
            )}
          </Space>
        }
      />
    </div>
  )
}
