/**
 * Forensic BCTC analysis view (the "Phân tích" side of the Tài chính tab).
 *
 * Structure is the backend's own: ① snapshot · ② AI memo · ③ modules ·
 * ④ forensic table · ⑤ valuation (+ the forensic trio and data blind spots).
 * The public payload renders for everyone; the AI memo, trio and valuation are
 * premium-gated upstream, so they are gated here too instead of being faked.
 */
import { Check, CircleAlert, Sparkles, TriangleAlert } from "lucide-react"

import { Skeleton } from "@/components/ui/skeleton"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import { useAuth } from "@/hooks/use-auth"

import { PremiumNotice } from "../../premium-notice"
import {
  fmtMultiple,
  fmtNumber,
  fmtPercent,
  hasAnyAi,
  moduleNote,
  STATUS_TONE_CLASS,
  statusLabel,
} from "../format"
import { useBctc, useBctcAi } from "../hooks"
import type {
  BctcAi,
  BctcSnapshotCell,
  CfBridge,
  CommonSizeTable,
  DuPontData,
  WccSeries,
} from "../types"
import { CashFlowBridgeView } from "./bctc/cash-flow-bridge-view"
import { DuPontView } from "./bctc/dupont-view"
import { FootballField } from "./bctc/football-field"
import { TrinityCards } from "./bctc/trinity-cards"
import { WccView } from "./bctc/wcc-view"
import { MarkdownNote } from "./markdown-note"

function fmtSnapshotCell(cell: BctcSnapshotCell): string {
  if (cell.unit === "%") return fmtPercent(cell.value)
  if (cell.unit === "x") return fmtMultiple(cell.value)
  return fmtNumber(cell.value, 2)
}

const PCT_KEYS = new Set([
  "cogs_pct",
  "selling_pct",
  "admin_pct",
  "nii_pct",
  "fee_pct",
  "cir",
  "cost_of_risk",
  "provision_ppop",
  "yield_ea",
  "cost_of_funds",
  "spread",
  "fcf_margin",
  "sloan_accrual",
  "roe",
  "roa",
  "nii_to_ta",
  "non_nii_to_ta",
  "opex_to_ta",
  "provision_to_ta",
  "tax_to_ta",
  "trading_pct",
  "other_pct",
])
const DAYS_KEYS = new Set(["dso", "dio", "dpo", "ccc"])

function fmtModuleValue(key: string, value: number | null): string {
  if (key === "cfo_ni") return fmtMultiple(value)
  if (PCT_KEYS.has(key) || key.endsWith("margin")) return fmtPercent(value)
  if (DAYS_KEYS.has(key)) return fmtNumber(value, 0)
  if (value != null && Math.abs(value) >= 1e9) return `${fmtNumber(value / 1e9, 1)} tỷ`
  return fmtNumber(value, 2)
}

/**
 * Multi-period common-size table (module 2): one row per chỉ tiêu with a column
 * per kỳ — labels and ordering come from the backend (self-describing).
 */
function CommonSizeTableView({ table }: { table: CommonSizeTable }) {
  if (!table?.rows?.length) {
    return <div className="text-xs text-muted-foreground">Không đủ dữ liệu.</div>
  }
  return (
    <ScrollArea className="w-full" orientation="horizontal" viewportClassName="pb-2">
      <table className="w-full min-w-max border-collapse text-xs">
        <thead>
          <tr className="border-b border-border text-[10px] tracking-wide text-muted-foreground uppercase">
            <th className="py-2 pr-3 text-left font-medium">Khoản mục (% DT thuần)</th>
            {table.columns.map((column) => (
              <th key={column} className="py-2 pl-3 text-right font-medium tabular-nums">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row) => (
            <tr
              key={row.key}
              className={cn(
                "border-b border-border/60 last:border-0",
                row.emphasis && "font-bold",
              )}
            >
              <td className="py-2 pr-3 text-left">{row.label}</td>
              {row.values.map((value, index) => (
                <td
                  key={index}
                  className={cn(
                    "py-2 pl-3 text-right tabular-nums",
                    !row.emphasis && "text-muted-foreground",
                  )}
                >
                  {fmtPercent(value)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </ScrollArea>
  )
}

function BctcAiMemo({
  ai,
  isLoading,
  isError,
}: {
  ai: BctcAi | null
  isLoading: boolean
  isError: boolean
}) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-11/12" />
        <Skeleton className="h-4 w-9/12" />
      </div>
    )
  }
  if (isError) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <CircleAlert className="size-3.5" aria-hidden="true" />
        Không tải được nhận định AI
      </div>
    )
  }
  if (!hasAnyAi(ai) || !ai?.memo?.trim()) {
    return <div className="text-xs text-muted-foreground">Chưa có nhận định AI.</div>
  }
  return (
    <div className="rounded-lg border-l-2 border-primary bg-card p-4">
      <div className="mb-2 flex items-center gap-1.5 text-[10px] font-bold tracking-wide text-primary uppercase">
        <Sparkles className="size-3.5" aria-hidden="true" />
        AI Memo
      </div>
      <MarkdownNote>{ai.memo}</MarkdownNote>
    </div>
  )
}

function ModuleNote({ note }: { note: string }) {
  if (!note?.trim()) return null
  return (
    <div className="mt-2 rounded-sm border-l-2 border-primary/40 bg-primary/5 p-2">
      <MarkdownNote>{note}</MarkdownNote>
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="mb-3 font-heading text-base font-bold">{children}</h3>
}

export function BctcAnalysis({ symbol }: { symbol: string }) {
  const { isPremium } = useAuth()
  const bctc = useBctc(symbol, 1)
  const ai = useBctcAi(symbol, 1)

  if (bctc.isLoading) {
    return (
      <div className="space-y-3 p-4">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    )
  }

  if (bctc.isError || !bctc.data) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-2 text-muted-foreground">
        <CircleAlert className="size-5" aria-hidden="true" />
        <span className="text-xs">Không tải được dữ liệu phân tích BCTC</span>
      </div>
    )
  }

  const data = bctc.data
  const premiumNotice = (
    <PremiumNotice
      featureName="Phân tích BCTC nâng cao"
      description="Nhận định AI, bộ ba forensic và định giá chi tiết cần tài khoản Premium."
    />
  )

  return (
    <div className="mx-auto max-w-[1080px] space-y-6 p-4">
      <section>
        <SectionTitle>
          ① Thẻ Snapshot ·{" "}
          {data.template === "B" ? "Ngân hàng" : (data.subsector?.label ?? "Standard")}
        </SectionTitle>
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg bg-border md:grid-cols-3">
          {data.snapshot.map((cell) => (
            <div key={cell.key} className="bg-card p-3">
              <div className="flex items-start justify-between gap-2">
                <span className="text-[10px] tracking-wide text-muted-foreground uppercase">
                  {cell.label}
                </span>
                <span
                  className={cn(
                    "rounded-sm border px-1.5 py-0.5 text-[10px] font-bold",
                    STATUS_TONE_CLASS[cell.status],
                  )}
                >
                  {statusLabel(cell.status)}
                </span>
              </div>
              <div className="mt-2 text-2xl font-bold tabular-nums">{fmtSnapshotCell(cell)}</div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <SectionTitle>② AI Memo tổng</SectionTitle>
        {isPremium ? (
          <BctcAiMemo ai={ai.data ?? null} isLoading={ai.isLoading} isError={ai.isError} />
        ) : (
          premiumNotice
        )}
      </section>

      <section className="space-y-4">
        <SectionTitle>③ Modules phân tích</SectionTitle>
        {data.modules.map((module) => (
          <div key={module.id} className="rounded-lg bg-card p-4">
            <div className="mb-2 font-heading text-base font-bold">{module.title}</div>
            {module.type === "common_size_table" ? (
              <CommonSizeTableView table={module.data as CommonSizeTable} />
            ) : module.type === "dupont" ? (
              <DuPontView data={module.data as DuPontData} />
            ) : module.type === "wcc" ? (
              <WccView data={module.data as WccSeries} />
            ) : module.type === "cf_bridge" ? (
              <CashFlowBridgeView data={module.data as CfBridge} />
            ) : (
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                {Object.entries(module.data as Record<string, number | null>).map(([key, value]) => (
                  <div key={key} className="flex flex-col">
                    <span className="text-[10px] tracking-wide text-muted-foreground uppercase">
                      {key}
                    </span>
                    <span className="text-xs tabular-nums">{fmtModuleValue(key, value)}</span>
                  </div>
                ))}
              </div>
            )}
            <ModuleNote note={moduleNote(ai.data, module.id)} />
          </div>
        ))}
      </section>

      <section>
        <SectionTitle>④ Bảng Forensic</SectionTitle>
        <div className="grid gap-px overflow-hidden rounded-lg bg-border md:grid-cols-2">
          <div className="bg-card p-4">
            <div className="mb-2 text-xs font-bold tracking-wide text-price-up uppercase">
              ▲ Tín hiệu Xanh
            </div>
            {data.forensic.green.length === 0 ? (
              <div className="text-xs text-muted-foreground">—</div>
            ) : (
              data.forensic.green.map((signal, index) => (
                <div key={index} className="mb-1.5 flex items-start gap-1.5 text-xs leading-5">
                  <Check aria-hidden className="mt-1 size-3 shrink-0 text-price-up" />
                  <span>{signal}</span>
                </div>
              ))
            )}
          </div>
          <div className="bg-card p-4">
            <div className="mb-2 text-xs font-bold tracking-wide text-price-down uppercase">
              ▼ Cờ Vàng / Đỏ
            </div>
            {data.forensic.red.length === 0 ? (
              <div className="text-xs text-muted-foreground">—</div>
            ) : (
              data.forensic.red.map((signal, index) => (
                <div key={index} className="mb-1.5 flex items-start gap-1.5 text-xs leading-5">
                  <TriangleAlert aria-hidden className="mt-1 size-3 shrink-0 text-price-down" />
                  <span>{signal}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </section>

      {data.trinity && (
        <section>
          <SectionTitle>Bộ ba Forensic</SectionTitle>
          {isPremium ? (
            <>
              <TrinityCards trinity={data.trinity} />
              <ModuleNote note={moduleNote(ai.data, "trinity")} />
            </>
          ) : (
            premiumNotice
          )}
        </section>
      )}

      {data.blind_spots && data.blind_spots.length > 0 && (
        <section>
          <SectionTitle>Điểm mù dữ liệu (cần bản Pro)</SectionTitle>
          {isPremium ? (
            <div className="rounded-lg bg-card p-3">
              {data.blind_spots.map((spot, index) => (
                <div key={index} className="mb-1 text-xs leading-5 text-muted-foreground">
                  • {spot}
                </div>
              ))}
            </div>
          ) : (
            premiumNotice
          )}
        </section>
      )}

      {data.valuation && (
        <section>
          <SectionTitle>⑤ Định giá</SectionTitle>
          {isPremium ? (
            data.template === "B" ? (
              <div className="space-y-3 rounded-lg bg-card p-4">
                <div className="flex gap-6 text-sm">
                  <div>
                    <span className="text-xs tracking-wide text-muted-foreground uppercase">
                      Justified P/B
                    </span>
                    <div className="text-xl font-bold tabular-nums">
                      {data.valuation.justified_pb != null
                        ? `${fmtNumber(data.valuation.justified_pb, 2)}×`
                        : "—"}
                    </div>
                  </div>
                  <div>
                    <span className="text-xs tracking-wide text-muted-foreground uppercase">
                      Fair value/cp
                    </span>
                    <div className="text-xl font-bold tabular-nums">
                      {data.valuation.fair_value != null
                        ? `${fmtNumber(data.valuation.fair_value / 1000, 1)}k`
                        : "—"}
                    </div>
                  </div>
                </div>
                {data.valuation.nim_cor_matrix && (
                  <div>
                    <div className="mb-1 text-[10px] tracking-wide text-muted-foreground uppercase">
                      Ma trận NIM × CoR (Justified P/B)
                    </div>
                    <table className="w-full text-xs tabular-nums">
                      <tbody>
                        {data.valuation.nim_cor_matrix.rows.map((row, rowIndex) => (
                          <tr key={rowIndex}>
                            <td className="pr-2 text-muted-foreground">
                              NIM {row.nim != null ? `${(row.nim * 100).toFixed(1)}%` : "—"}
                            </td>
                            {row.cells.map((cell, cellIndex) => (
                              <td key={cellIndex} className="px-2 py-0.5 text-center">
                                {cell.justified_pb != null
                                  ? `${cell.justified_pb.toFixed(2)}×`
                                  : "—"}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ) : (
              <FootballField valuation={data.valuation} symbol={symbol} />
            )
          ) : (
            premiumNotice
          )}
        </section>
      )}

      {data.flags.length > 0 && (
        <p className="text-[10px] leading-5 text-price-ref">
          {data.flags.map((flag) => flag.message).join(" · ")}
        </p>
      )}
    </div>
  )
}
