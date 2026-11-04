import { Link } from "react-router"

import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

import { academyMetricHref } from "./model"

/**
 * Nút "Học" của một chỉ tiêu (spec Dashboard v2 §4.3): viên nhỏ nền xanh đậm, có ở mỗi dòng của
 * khung "Biểu đồ" và ở đầu mỗi thẻ biểu đồ. Bấm thì mở đúng bài học của chỉ tiêu trong Học viện
 * (`/academy?metric=<metric_key>`); học tự do nên bài nào cũng mở ngay. Là liên kết đứng riêng,
 * không nằm trong nhãn của ô tick, nên bấm "Học" không làm tick hay bỏ tick.
 */
export function LearnLink({
  metricKey,
  name,
  className,
}: {
  metricKey: string
  /** Tên hiển thị của chỉ tiêu, để đọc được "Học bài ROE" bằng trình đọc màn hình. */
  name: string
  className?: string
}) {
  return (
    <Badge asChild className={cn("rounded-full px-2.5 text-[11px] font-bold", className)}>
      <Link to={academyMetricHref(metricKey)} aria-label={`Học bài ${name}`} data-learn={metricKey}>
        Học
      </Link>
    </Badge>
  )
}
