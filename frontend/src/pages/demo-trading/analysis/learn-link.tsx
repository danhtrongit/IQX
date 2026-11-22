import { Link } from "react-router"

import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

import type { Industry } from "./api"
import { academyMetricHref } from "./model"

/**
 * Nút "Học" của một chỉ tiêu (spec Dashboard v3 §4.3): viên nhỏ nền xanh đậm, có ở mỗi dòng của
 * khung "Biểu đồ" và ở đầu mỗi thẻ biểu đồ. Bấm thì mở bài học của chỉ tiêu theo ngành của mã đang
 * xem (`/academy?metric=<metric_key>&nganh=<nganh>`); học tự do nên bài nào cũng mở ngay. Là liên kết đứng riêng,
 * không nằm trong nhãn của ô tick, nên bấm "Học" không làm tick hay bỏ tick.
 */
export function LearnLink({
  metricKey,
  nganh,
  name,
  className,
}: {
  metricKey: string
  /** Ngành của mã đang xem (9 giá trị): Học viện mở bài của chỉ tiêu ở chương ngành này. */
  nganh: Industry
  /** Tên hiển thị của chỉ tiêu, để đọc được "Học bài ROE" bằng trình đọc màn hình. */
  name: string
  className?: string
}) {
  return (
    <Badge asChild className={cn("rounded-full px-2.5 text-[11px] font-bold", className)}>
      <Link
        to={academyMetricHref(metricKey, nganh)}
        aria-label={`Học bài ${name}`}
        data-learn={metricKey}
        data-nganh={nganh}
      >
        Học
      </Link>
    </Badge>
  )
}
