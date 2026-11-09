import {
  formatBulletinDate,
  formatBulletinNumber,
  formatBulletinTime,
  formatSignedNumber,
  formatSignedPercent,
} from "@/pages/market-workspace/market/bulletin-format"

import type { AdminBulletinDetail, AdminBulletinMetrics } from "./bulletin-admin-api"
import { StepCard } from "./bulletin-step-card"

function optional(value: number | null, digits = 2): string {
  return value === null ? "Chưa đủ dữ liệu" : formatBulletinNumber(value, digits)
}

function metricRows(metrics: AdminBulletinMetrics): { label: string; value: string }[] {
  return [
    { label: "VN-Index", value: formatBulletinNumber(metrics.close) },
    { label: "Thay đổi", value: `${formatSignedNumber(metrics.change)} (${formatSignedPercent(metrics.change_pct)})` },
    { label: "Khối lượng khớp", value: `${formatBulletinNumber(metrics.volume_millions, 0)} triệu cp` },
    {
      label: "KL TB 20 phiên",
      value: metrics.volume_ma20_millions === null ? "Chưa đủ dữ liệu" : `${formatBulletinNumber(metrics.volume_ma20_millions, 0)} triệu cp`,
    },
    { label: "Giá trị giao dịch", value: metrics.value_bn === null ? "Chưa có" : `${formatBulletinNumber(metrics.value_bn, 0)} tỷ đồng` },
    {
      label: "Tăng / Đứng / Giảm",
      value:
        metrics.advances === null || metrics.unchanged === null || metrics.declines === null
          ? "Chưa có"
          : `${metrics.advances} / ${metrics.unchanged} / ${metrics.declines}`,
    },
    { label: "SMA20", value: optional(metrics.sma20) },
    { label: "SMA50", value: optional(metrics.sma50) },
    { label: "SMA200", value: optional(metrics.sma200) },
    {
      label: "RSI(14)",
      value:
        metrics.rsi === null
          ? "Chưa đủ dữ liệu"
          : `${formatBulletinNumber(metrics.rsi, 1)}${metrics.rsi_previous === null ? "" : ` (phiên trước ${formatBulletinNumber(metrics.rsi_previous, 1)})`}`,
    },
    { label: "MACD", value: optional(metrics.macd) },
    { label: "Signal", value: optional(metrics.signal) },
  ]
}

/** Bước 1: số liệu VN-Index do hệ thống tính, chỉ đọc. */
export function BulletinStepData({ detail }: { detail: AdminBulletinDetail }) {
  const date = formatBulletinDate(detail.trade_date)
  return (
    <StepCard step={1} title="Số liệu VN-Index" tag="Tự động" tourId="tour-bantin-admin-data">
      {detail.metrics ? (
        <>
          <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
            {metricRows(detail.metrics).map((row) => (
              <div key={row.label} className="flex items-baseline justify-between gap-3 border-b border-border/60 pb-1.5 text-sm">
                <dt className="text-muted-foreground">{row.label}</dt>
                <dd className="font-medium tabular-nums">{row.value}</dd>
              </div>
            ))}
          </dl>
          <p className="text-xs text-muted-foreground">
            Dữ liệu phiên {date}
            {detail.data_ready_at ? ` chốt lúc ${formatBulletinTime(detail.data_ready_at)}` : ""} · Dữ liệu giá IQX
          </p>
        </>
      ) : (
        <p className="text-sm leading-6 text-muted-foreground">
          Chưa có dữ liệu phiên {date}. Dữ liệu thường chốt sau 15:30; hệ thống tự điền khi có. Vẫn viết nhận định trước được.
        </p>
      )}
    </StepCard>
  )
}
