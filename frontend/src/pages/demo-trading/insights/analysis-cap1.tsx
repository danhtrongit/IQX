/**
 * Cấp 1 «Học việc» blocks of the analysis panel - ① ② ③ ④ and the
 * «Mẫu hệ thống phát hiện (về lý do)» block, all computed from the closed-trade
 * log plus `GET /cap1/progress`.
 *
 * The same ①②③ markup is reused at every higher level (Cấp 2 re-skins ② and
 * reduces ③, exactly as the legacy screens did).
 */
import { Check, Square, Target, TriangleAlert, X } from "lucide-react"

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { Cap2Progress, TradeRow } from "./api"
import { LY_DO_OPTIONS, formatDateOnly, formatInt, formatRate, formatVndSigned, levelName } from "./copy"
import {
  KHOI2_MIN_TRADES,
  TASK4_THRESHOLD,
  TASK5_THRESHOLD,
  computeMauLyDo,
  reasonBadge,
  type Cap1Blocks,
  type ReasonTone,
} from "./compute"
import { HintLine, NoteLine, SectionCard, StatTile } from "./ui"

function ReasonBadge({ tone }: { tone: ReasonTone }) {
  if (tone === "good") return <Check className="size-3 text-price-up" aria-label="Nhóm thắng rõ" />
  if (tone === "bad") return <X className="size-3 text-price-down" aria-label="Nhóm thua rõ" />
  if (tone === "warn") return <TriangleAlert className="size-3 text-price-ref" aria-label="Chưa rõ xu hướng" />
  return null
}

/* ── ① Hồ sơ tổng quan ─────────────────────────────────────────────────── */

export function HoSoTongQuan({ blocks, level, sinceIso, cap2Progress }: { blocks: Cap1Blocks; level: number; sinceIso: string | null; cap2Progress: Cap2Progress | null }) {
  const preferred = blocks.preferredLyDo ? LY_DO_OPTIONS.find((option) => option.lop === blocks.preferredLyDo) : null
  const soLenhClTp = Math.min(cap2Progress?.so_lenh_co_cl_tp ?? 0, 10)

  if (level <= 1) {
    return (
      <SectionCard title="① Hồ sơ tổng quan">
        <HintLine>{`HỒ SƠ NHÀ ĐẦU TƯ CỦA BẠN · Cấp 1 «${levelName(1)}»`}</HintLine>
        <p className="text-xs">
          {`${formatInt(blocks.totalTrades)} lệnh Thực chiến`}
          {sinceIso ? ` · từ ${formatDateOnly(sinceIso)}` : ""}
        </p>
        {blocks.totalTrades > 0 ? (
          <>
            <p className="text-xs">
              {`Tỷ lệ thắng: ${formatRate(blocks.winRate)} · ${formatInt(blocks.wins)} lãi / ${formatInt(blocks.losses)} lỗ`}
            </p>
            {preferred && <p className="text-xs">{`Cách chọn ưa thích: ${preferred.label} (${formatInt(blocks.preferredLyDoCount)} lần dùng)`}</p>}
          </>
        ) : (
          <NoteLine>Chưa có lệnh Thực chiến nào đã đóng.</NoteLine>
        )}
        <HintLine>(Cấp 1 chưa có chỉ số Kỷ luật - đó là chỉ số đầu bảng Cấp 2.)</HintLine>
      </SectionCard>
    )
  }

  return (
    <SectionCard title="① Hồ sơ tổng quan">
      <HintLine>
        {`Cấp ${level} «${levelName(level)}» · ${formatInt(blocks.totalTrades)} lệnh`}
        {sinceIso ? ` · từ ${formatDateOnly(sinceIso)}` : ""}
      </HintLine>
      <div className="grid min-w-0 grid-cols-3 gap-2">
        <StatTile
          label="Tỷ lệ thắng"
          value={formatRate(blocks.winRate)}
          sub={blocks.totalTrades === 0 ? "chưa có lệnh đã đóng" : `${formatInt(blocks.wins)} lãi / ${formatInt(blocks.losses)} lỗ`}
          tone={blocks.winRate != null && blocks.winRate >= 50 ? "up" : undefined}
        />
        {/* `cap2Progress === null` = Cấp 2 not entered: 0 would claim a real count. */}
        <StatTile label="Đã đặt CL/CL" value={cap2Progress == null ? "-" : `${formatInt(soLenhClTp)}/10`} sub="mọi lệnh" tone="accent" />
        <StatTile
          label="Thực hiện đúng"
          value={cap2Progress == null ? "-" : formatInt(cap2Progress.so_lan_thuc_hien_dung)}
          sub="khi giá chạm mốc"
          tone="accent"
        />
      </div>
      {preferred && <p className="text-xs">{`Cách chọn ưa thích: ${preferred.label} (${formatInt(blocks.preferredLyDoCount)} lần dùng)`}</p>}
      <HintLine>Hai ô Cấp 2 đếm trên toàn bộ lệnh đã đóng (dấu "-" nghĩa là chưa vào Cấp 2); khối ⑤⑥⑦ bên dưới đọc số kỷ luật do máy chủ tính.</HintLine>
    </SectionCard>
  )
}

/* ── ② Thắng / thua theo 5 lý do ───────────────────────────────────────── */

export function ThangThuaTheoLyDo({ blocks, level }: { blocks: Cap1Blocks; level: number }) {
  if (blocks.totalTrades < KHOI2_MIN_TRADES) {
    return (
      <SectionCard title="② Thắng / thua theo 5 lý do">
        <NoteLine>{`Cần ≥${KHOI2_MIN_TRADES} lệnh để có phân tích thắng/thua đáng tin. Hiện có ${formatInt(blocks.totalTrades)}.`}</NoteLine>
      </SectionCard>
    )
  }

  const kept = level >= 2
  return (
    <SectionCard title="② Thắng / thua theo 5 lý do" flag={kept ? "(giữ từ Cấp 1)" : undefined}>
      <Table className="min-w-0 table-fixed">
        <TableHeader>
          <TableRow>
            <TableHead className="whitespace-normal w-[38%]">Lý do</TableHead>
            <TableHead className="whitespace-normal text-right">{kept ? "Lệnh" : "Số lệnh"}</TableHead>
            <TableHead className="whitespace-normal text-right">{kept ? "Thắng" : "Tỷ lệ thắng"}</TableHead>
            <TableHead className="whitespace-normal text-right">{kept ? "Lãi/lỗ" : "Tổng lãi/lỗ"}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {blocks.rows.map((row) => {
            const def = LY_DO_OPTIONS.find((option) => option.lop === row.value)
            const Icon = def?.Icon ?? Target
            return (
              <TableRow key={row.value}>
                <TableCell>
                  <span className="flex items-center gap-1.5">
                    <Icon className="size-3.5 text-muted-foreground" />
                    {def?.label ?? row.value}
                    <ReasonBadge tone={reasonBadge(row.count, row.winRate)} />
                  </span>
                </TableCell>
                <TableCell className="text-right">{formatInt(row.count)}</TableCell>
                <TableCell className="text-right">{kept ? formatInt(row.wins) : row.count > 0 ? formatRate(row.winRate) : "-"}</TableCell>
                <TableCell className={`text-right ${row.totalPnlVnd > 0 ? "text-price-up" : row.totalPnlVnd < 0 ? "text-price-down" : ""}`}>
                  {formatVndSigned(row.totalPnlVnd)}
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
      <HintLine>Sắp theo tổng lãi/lỗ giảm dần. Lý do chưa dùng vẫn hiện với 0 lệnh - đó là số thật, không phải "chưa biết".</HintLine>
    </SectionCard>
  )
}

/* ── ③ Độ phủ 5 lý do ──────────────────────────────────────────────────── */

export function DoPhuLyDo({ blocks, level }: { blocks: Cap1Blocks; level: number }) {
  const full = level <= 1
  return (
    <SectionCard title={full ? "③ Độ phủ 5 lý do + Chọn lý do có cơ sở" : "③ Độ phủ 5 lý do"} flag={full ? undefined : "(giữ từ Cấp 1)"}>
      <div className="flex items-center gap-2.5">
        {LY_DO_OPTIONS.map((option) => {
          const used = blocks.coverage[option.lop] === true
          const Icon = option.Icon
          return (
            <span key={option.lop} className={`flex items-center gap-1 text-xs ${used ? "" : full ? "text-muted-foreground" : "opacity-25"}`}>
              <Icon className="size-4" />
              {full && (used ? <Check className="size-3 text-price-up" /> : <X className="size-3 text-muted-foreground" />)}
            </span>
          )
        })}
      </div>
      {full ? (
        <>
          <p className="text-xs font-semibold">{`→ Đã dùng ${blocks.usedReasons}/5`}</p>
          <p className="text-xs">
            {`Lệnh có lý do Ủng hộ lúc đặt: ${formatInt(blocks.soLenhUngHo)}/${formatInt(blocks.totalTrades)} · Nhiệm vụ ④: ${Math.min(blocks.soLenhUngHo, TASK4_THRESHOLD)}/${TASK4_THRESHOLD}`}
            {blocks.task4Done && <Check className="ml-1 inline size-3 text-price-up" />}
          </p>
        </>
      ) : (
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Đã dùng</span>
          <span className={`font-semibold tabular-nums ${blocks.usedReasons >= 4 ? "text-price-up" : ""}`}>{`${blocks.usedReasons}/5`}</span>
        </div>
      )}
      <HintLine>Độ phủ đọc từ sổ lệnh đã đóng - bộ đếm của máy chủ chỉ biết số lý do, không biết là lý do nào.</HintLine>
    </SectionCard>
  )
}

/* ── ④ Tiến trình 5 nhiệm vụ (Cấp 1) ───────────────────────────────────── */

export function TienTrinhCap1({ blocks }: { blocks: Cap1Blocks }) {
  return (
    <SectionCard title="④ Tiến trình 5 nhiệm vụ">
      <HintLine>{`${blocks.tasksDone}/5`}</HintLine>
      <ul className="space-y-1">
        {blocks.tasks.map((task) => (
          <li key={task.no} className="flex items-center gap-1.5 text-xs">
            {task.done ? <Check className="size-3.5 text-price-up" /> : <Square className="size-3.5 text-muted-foreground" />}
            <span>
              {`${task.no}. ${task.label}`}
              {task.progressText ? ` (${task.progressText})` : ""}
            </span>
          </li>
        ))}
      </ul>
      {blocks.readyToGraduate ? (
        <p className="text-xs font-semibold text-price-up">Bạn ĐỦ điều kiện lên Cấp 2 - mở màn tốt nghiệp ở panel Hành trình.</p>
      ) : (
        blocks.summaryLine && <NoteLine>{blocks.summaryLine}</NoteLine>
      )}
      <HintLine>{`Ngưỡng: 5 lý do · ${TASK4_THRESHOLD} lệnh Ủng hộ · ${TASK5_THRESHOLD} lệnh Thực chiến.`}</HintLine>
    </SectionCard>
  )
}

/* ── 🔍 Mẫu hệ thống phát hiện (về lý do) ─────────────────────────────── */

export function MauLyDoBlock({ trades }: { trades: TradeRow[] }) {
  const { patterns, note } = computeMauLyDo(trades)
  return (
    <SectionCard title="Mẫu hệ thống phát hiện (về lý do)">
      {patterns.map((pattern) => (
        <div
          key={pattern.id}
          className={`flex items-start gap-2 rounded-md border p-2 text-xs ${
            pattern.tone === "good" ? "border-price-up/25 bg-price-up/5" : "border-primary/30 bg-primary/5"
          }`}
        >
          {pattern.tone === "good" ? <Target className="mt-px size-4 shrink-0 text-price-up" /> : <TriangleAlert className="mt-px size-4 shrink-0 text-primary" />}
          <span>
            <strong>{pattern.title}</strong>
            <span> - </span>
            {pattern.text}
          </span>
        </div>
      ))}
      {patterns.length === 0 && note && <NoteLine>{note}</NoteLine>}
      {patterns.length > 0 && <HintLine>Mẫu tính trên chính sổ lệnh của bạn; cần tối thiểu 3 lệnh mỗi nhóm mới kết luận.</HintLine>}
    </SectionCard>
  )
}
