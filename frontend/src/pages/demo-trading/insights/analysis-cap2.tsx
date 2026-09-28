/**
 * Cấp 2 «Kỷ luật» blocks - ④ cơ chế cắt lỗ / chốt lời, ⑤ điểm kỷ luật 30 ngày,
 * ⑥ vi phạm theo tuần, ⑦ phát hiện từ ghi chú nhìn lại, and the kỷ luật mẫu
 * block.
 *
 * Every number here is SERVER-OWNED: `GET /cap2/progress` for the mechanism
 * counters, `GET /cap2/analysis` for ⑤⑥⑦ + the 20-trade window + patterns.
 * A failed read is reported as unavailable - it is never replaced by a locally
 * derived number.
 */
import { Ban, Check, Lightbulb, Target } from "lucide-react"

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { Cap2Analysis, Cap2Progress } from "./api"
import { HINT, formatDayMonth, formatInt } from "./copy"
import { HintLine, LoadingLine, NoteLine, SectionCard } from "./ui"

const WEEK_COLUMNS: readonly { key: "cat_lo_cham" | "chot_loi_hut" | "ban_som_lo_nhe" | "nhoi_lenh_khi_lo"; label: string }[] = [
  { key: "cat_lo_cham", label: "Cắt lỗ chậm" },
  { key: "chot_loi_hut", label: "Chốt lời hụt" },
  { key: "ban_som_lo_nhe", label: "Bán sớm khi lỗ nhẹ" },
  { key: "nhoi_lenh_khi_lo", label: "Nhồi lệnh khi lỗ" },
]

/* ── ④ Cơ chế cắt lỗ / chốt lời ────────────────────────────────────────── */

export function CoCheCatLoChotLoi({ progress, window20 }: { progress: Cap2Progress | null | undefined; window20: Cap2Analysis["window20"] | undefined }) {
  const catLo = progress?.so_lan_cat_lo_dung ?? 0
  const chotLoi = progress?.so_lan_chot_loi_dung ?? 0
  const tong = progress?.so_lan_thuc_hien_dung ?? 0
  const cells = window20 ?? []
  const violated = cells.filter((row) => !row.compliant).length

  const pattern =
    catLo > 0 && chotLoi > 0
      ? { tone: "good" as const, text: `Bạn đã làm quen cả hai cơ chế - ${formatInt(catLo)} lần cắt lỗ chặn thua, ${formatInt(chotLoi)} lần chốt lời khóa lãi. Đây là hai công cụ cơ bản nhất của việc thoát lệnh có kế hoạch.` }
      : catLo > 0
        ? { tone: "good" as const, text: `Bạn mới dùng cơ chế cắt lỗ (${formatInt(catLo)} lần) - chưa lần nào giá chạm chốt lời để bạn thực hiện. Hai cơ chế bổ cho nhau: một cái chặn thua, một cái khóa lãi.` }
        : chotLoi > 0
          ? { tone: "good" as const, text: `Bạn mới dùng cơ chế chốt lời (${formatInt(chotLoi)} lần) - chưa lần nào giá chạm cắt lỗ để bạn thực hiện. Hai cơ chế bổ cho nhau: một cái khóa lãi, một cái chặn thua.` }
          : {
              tone: "empty" as const,
              text: "Chưa có lần nào giá chạm mốc cắt lỗ hoặc chốt lời để bạn thực hiện. Con số này chỉ lên khi thị trường thật sự chạm mốc bạn đã cam kết - không phải việc bạn cố làm cho có.",
            }

  return (
    <SectionCard title="④ Bạn đã dùng cơ chế cắt lỗ / chốt lời thế nào" flag="mới ở Cấp 2">
      <div className="grid min-w-0 grid-cols-3 gap-2">
        {[
          { icon: <Ban className="size-3.5" />, value: formatInt(catLo), lines: ["lần cắt lỗ", "khi giá chạm"] },
          { icon: <Target className="size-3.5" />, value: formatInt(chotLoi), lines: ["lần chốt lời", "khi giá chạm"] },
          { icon: <Check className="size-3.5" />, value: formatInt(tong), lines: ["tổng lần", "thực hiện đúng"] },
        ].map((box) => (
          <div key={box.lines[0]} className="min-w-0 rounded-md border border-border bg-background/40 px-2 py-1.5 text-center">
            <div className="flex justify-center text-primary">{box.icon}</div>
            <div className="font-heading text-xl font-extrabold tabular-nums text-primary">{box.value}</div>
            <div className="text-xs leading-tight text-muted-foreground">
              {box.lines[0]}
              <br />
              {box.lines[1]}
            </div>
          </div>
        ))}
      </div>
      <HintLine>Ba con số này là số ĐẾM của máy chủ (không có mẫu số, không phải mốc phải đạt).</HintLine>

      <div
        className={`flex items-start gap-2 rounded-md border p-2 text-xs ${
          pattern.tone === "good" ? "border-price-up/25 bg-price-up/5" : "border-border bg-muted/40"
        }`}
      >
        <Lightbulb className="mt-px size-3.5 shrink-0 text-primary" />
        <span>{pattern.text}</span>
      </div>

      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Cửa sổ 20 lệnh gần nhất</span>
          <span className="tabular-nums">{`${formatInt(violated)} vi phạm`}</span>
        </div>
        {window20 == null ? (
          <LoadingLine label="Đang tải cửa sổ 20 lệnh…" />
        ) : (
          <div className="grid grid-cols-10 gap-1" role="img" aria-label="Kỷ luật của tối đa 20 lệnh gần nhất">
            {Array.from({ length: 20 }, (_, index) => {
              const row = cells[index]
              const title = row == null ? "Chưa có lệnh" : row.compliant ? "Không vi phạm" : "Có vi phạm"
              return (
                <span
                  key={index}
                  title={title}
                  className={`h-2.5 rounded-sm ${row == null ? "bg-muted" : row.compliant ? "bg-price-up/70" : "bg-price-down/80"}`}
                />
              )
            })}
          </div>
        )}
        <HintLine>Ô xám = chưa có lệnh thứ N; xanh = không vi phạm; đỏ = có vi phạm.</HintLine>
      </div>
    </SectionCard>
  )
}

/* ── ⑤ Điểm kỷ luật 30 ngày ────────────────────────────────────────────── */

export function DiemKyLuat30({ score }: { score: Cap2Analysis["score_30d"] | undefined }) {
  if (!score) {
    return (
      <SectionCard title="⑤ Điểm kỷ luật 30 ngày">
        <LoadingLine label="Đang tải điểm kỷ luật…" />
      </SectionCard>
    )
  }

  const points = score.scores.filter((row) => row.diem != null && row.xep_loai != null)
  if (points.length === 0) {
    return (
      <SectionCard title="⑤ Điểm kỷ luật 30 ngày">
        <NoteLine>Chưa có ngày giao dịch nào để vẽ xu hướng.</NoteLine>
      </SectionCard>
    )
  }

  return (
    <SectionCard title="⑤ Điểm kỷ luật 30 ngày">
      <div className="space-y-0.5 text-xs">
        <p>
          Trung bình 30 ngày: <strong className="tabular-nums">{score.average_30d == null ? "-" : score.average_30d.toFixed(1)}</strong>
        </p>
        <p>
          Trung bình 7 ngày: <strong className="tabular-nums">{score.average_7d == null ? "-" : score.average_7d.toFixed(1)}</strong>
        </p>
      </div>
      <div className="flex h-24 items-end gap-0.5" role="img" aria-label="Biểu đồ điểm kỷ luật 30 ngày">
        {points.map((point) => (
          <span
            key={point.ngay}
            title={`${point.ngay}: ${point.diem}/100`}
            className={`min-w-1 flex-1 rounded-t ${point.xep_loai === "xanh" ? "bg-price-up" : point.xep_loai === "vang" ? "bg-price-ref" : "bg-price-down"}`}
            style={{ height: `${Math.max(4, point.diem ?? 0)}%` }}
          />
        ))}
      </div>
      <HintLine>{`Xanh ${formatInt(score.xanh_days)} ngày · Vàng ${formatInt(score.vang_days)} · Đỏ ${formatInt(score.do_days)}`}</HintLine>
      <HintLine>Điểm do máy chủ chấm theo hành vi lệnh; ngày không có tình huống thử thách vẫn có điểm nhưng không có xếp loại.</HintLine>
    </SectionCard>
  )
}

/* ── ⑥ Vi phạm theo tuần ───────────────────────────────────────────────── */

export function ViPhamTuan({ weeks }: { weeks: Cap2Analysis["weekly_violations"] | undefined }) {
  if (!weeks) {
    return (
      <SectionCard title="⑥ Vi phạm theo tuần">
        <LoadingLine label="Đang tải vi phạm theo tuần…" />
      </SectionCard>
    )
  }

  return (
    <SectionCard title="⑥ Vi phạm theo tuần">
      <Table className="min-w-0 table-fixed">
        <TableHeader>
          <TableRow>
            <TableHead className="whitespace-normal">Tuần</TableHead>
            {WEEK_COLUMNS.map((column) => (
              <TableHead key={column.key} className="whitespace-normal text-right">
                {column.label}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {weeks.map((week) => (
            <TableRow key={week.week_start}>
              <TableCell>{`${formatDayMonth(week.week_start)} - ${formatDayMonth(week.week_end)}`}</TableCell>
              {WEEK_COLUMNS.map((column) => (
                <TableCell key={column.key} className="text-right">
                  {formatInt(week[column.key])}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <HintLine>Bốn tuần gần nhất, tuần bắt đầu từ thứ Hai. Một lệnh có thể tính vào nhiều loại vi phạm.</HintLine>
    </SectionCard>
  )
}

/* ── ⑦ Phát hiện từ ghi chú nhìn lại ───────────────────────────────────── */

export function GhiChuNhinLai({ reflection }: { reflection: Cap2Analysis["reflection"] | undefined }) {
  if (!reflection) {
    return (
      <SectionCard title="⑦ Phát hiện từ ghi chú nhìn lại">
        <LoadingLine label="Đang tải ghi chú nhìn lại…" />
      </SectionCard>
    )
  }
  if (reflection.note_count < 3) {
    return (
      <SectionCard title="⑦ Phát hiện từ ghi chú nhìn lại">
        <NoteLine>{`Cần ít nhất 3 ghi chú nhìn lại có nội dung. Hiện có ${formatInt(reflection.note_count)}.`}</NoteLine>
      </SectionCard>
    )
  }
  if (reflection.insights.length === 0) {
    return (
      <SectionCard title="⑦ Phát hiện từ ghi chú nhìn lại">
        <NoteLine>Chưa thấy cụm hành vi lặp lại đủ rõ.</NoteLine>
      </SectionCard>
    )
  }

  return (
    <SectionCard title="⑦ Phát hiện từ ghi chú nhìn lại">
      {reflection.insights.map((insight) => (
        <div key={insight.pattern} className="space-y-1 rounded-md bg-muted/50 p-2 text-xs">
          <p className="font-semibold tabular-nums">{`${formatInt(insight.matches)}/${formatInt(reflection.note_count)} ghi chú`}</p>
          <p>{insight.interpretation}</p>
          {insight.next_step && <p className={HINT}>{insight.next_step}</p>}
        </div>
      ))}
      <HintLine>Máy chủ đọc các ghi chú gắn với lệnh vi phạm trong 30 ngày gần nhất.</HintLine>
    </SectionCard>
  )
}

/* ── 🔍 Mẫu hệ thống phát hiện (về kỷ luật) ────────────────────────────── */

export function MauKyLuat({ patterns }: { patterns: Cap2Analysis["patterns"] | undefined }) {
  if (!patterns) {
    return (
      <SectionCard title="Mẫu hệ thống phát hiện (về kỷ luật)">
        <LoadingLine label="Đang tải mẫu kỷ luật…" />
      </SectionCard>
    )
  }
  if (patterns.length === 0) {
    return (
      <SectionCard title="Mẫu hệ thống phát hiện (về kỷ luật)">
        <NoteLine>Chưa đủ dữ liệu để phát hiện mẫu kỷ luật.</NoteLine>
      </SectionCard>
    )
  }

  return (
    <SectionCard title="Mẫu hệ thống phát hiện (về kỷ luật)">
      {patterns.map((pattern) => {
        const positive = pattern.pattern_id === 12 && typeof pattern.data.delta === "number" && pattern.data.delta > 0
        return (
          <div
            key={pattern.pattern_id}
            className={`rounded-md border p-2 text-xs ${positive ? "border-price-up/25 bg-price-up/5" : "border-primary/30 bg-primary/5"}`}
          >
            {pattern.message}
          </div>
        )
      })}
      <HintLine>Mẫu do máy chủ tính từ lệnh đã đóng; nội dung giữ nguyên mã vi phạm theo hợp đồng dữ liệu.</HintLine>
    </SectionCard>
  )
}

/** Cấp 2 progress line reused by the level header. */
export function Cap2ProgressLine({ progress }: { progress: Cap2Progress | null | undefined }) {
  if (!progress) return <NoteLine>Chưa vào Cấp 2 - các chỉ số kỷ luật chỉ hiện sau khi cấp này được mở.</NoteLine>
  return (
    <HintLine>
      {`Chuỗi kỷ luật hiện tại ${formatInt(progress.chuoi_current)} · kỷ lục ${formatInt(progress.chuoi_record)} · ${formatInt(progress.so_lenh_7_ngay)} lệnh trong 7 ngày`}
    </HintLine>
  )
}
