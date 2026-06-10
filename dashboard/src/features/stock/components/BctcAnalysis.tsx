import { Spin } from "@arco-design/web-react"
import { IconExclamationCircle } from "@arco-design/web-react/icon"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { PremiumGate } from "@/features/premium"
import { useBctc, useBctcAi } from "../hooks"
import type { BctcAi, BctcSnapshotCell } from "../types"
import {
  fmtMultiple,
  fmtNumber,
  fmtPercent,
  hasAnyAi,
  moduleNote,
  statusColors,
  statusLabel,
} from "../format"
import { IconSparkles } from "../icons"

const MD_CLS =
  "text-[var(--color-text-2)] [&_p]:text-sm [&_p]:leading-relaxed [&_p]:mb-2 [&_strong]:text-[var(--color-text-1)] [&_strong]:font-semibold [&_ul]:list-disc [&_ul]:pl-5 [&_li]:text-sm [&_table]:w-full [&_th]:text-left [&_th]:text-xs [&_td]:text-sm"

function fmtKvnd(v: number | null | undefined): string {
  return v == null ? "—" : fmtNumber(v / 1000, 1) + "k"
}

function fmtCell(c: BctcSnapshotCell): string {
  if (c.unit === "%") return fmtPercent(c.value)
  if (c.unit === "x") return fmtMultiple(c.value)
  return fmtNumber(c.value, 2)
}

const PCT_KEYS = new Set([
  "cogs_pct", "selling_pct", "admin_pct", "nii_pct", "fee_pct", "cir", "cost_of_risk",
  "provision_ppop", "yield_ea", "cost_of_funds", "spread", "fcf_margin", "sloan_accrual",
  "roe", "roa", "nii_to_ta", "non_nii_to_ta", "opex_to_ta", "provision_to_ta", "tax_to_ta",
  "trading_pct", "other_pct",
])
const DAYS_KEYS = new Set(["dso", "dio", "dpo", "ccc"])

function fmtModuleValue(key: string, v: number | null): string {
  if (key === "cfo_ni") return fmtMultiple(v)
  if (PCT_KEYS.has(key) || key.endsWith("margin")) return fmtPercent(v)
  if (DAYS_KEYS.has(key)) return fmtNumber(v, 0)
  if (v != null && Math.abs(v) >= 1e9) return `${fmtNumber(v / 1e9, 1)} tỷ`
  return fmtNumber(v, 2)
}

/* ── AI memo + module note (premium overlays) ──────────────────────────────── */

function BctcAiMemo({
  ai,
  isLoading,
  isError,
}: {
  ai: BctcAi | null
  isLoading: boolean
  isError: boolean
}) {
  if (isLoading)
    return (
      <div className="flex items-center gap-2 text-xs text-[var(--color-text-3)]">
        <Spin size={14} /> Đang tạo nhận định AI…
      </div>
    )
  if (isError)
    return (
      <div className="flex items-center gap-2 text-xs text-[var(--color-text-3)]">
        <IconExclamationCircle /> Không tải được nhận định AI
      </div>
    )
  if (!hasAnyAi(ai) || !ai?.memo?.trim())
    return <div className="text-xs text-[var(--color-text-3)]">Chưa có nhận định AI.</div>
  return (
    <div className="rounded-lg border border-l-2 border-[var(--color-border-2)] border-l-[rgb(var(--primary-6))] bg-[var(--color-bg-2)] p-4">
      <div className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase text-[rgb(var(--primary-6))]">
        <IconSparkles /> AI Memo
      </div>
      <article className={MD_CLS}>
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{ai.memo}</ReactMarkdown>
      </article>
    </div>
  )
}

function BctcModuleNote({ note }: { note: string }) {
  if (!note?.trim()) return null
  return (
    <div className="mt-2 rounded border-l-2 border-[rgb(var(--primary-6))]/40 bg-[rgb(var(--primary-6))]/5 p-2 text-xs text-[var(--color-text-2)] [&_p]:mb-1">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{note}</ReactMarkdown>
    </div>
  )
}

/* ── Main ──────────────────────────────────────────────────────────────────── */

export function BctcAnalysis({ symbol }: { symbol: string }) {
  const { data, isLoading, isError } = useBctc(symbol, 1)
  const { data: ai, isLoading: aiLoading, isError: aiError } = useBctcAi(symbol, 1)

  if (isLoading)
    return (
      <div className="flex h-full items-center justify-center">
        <Spin />
      </div>
    )
  if (isError || !data)
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-[var(--color-text-3)]">
        <IconExclamationCircle className="text-2xl" />
        <span className="text-xs">Không tải được dữ liệu phân tích BCTC</span>
      </div>
    )

  return (
    <div className="mx-auto max-w-[1080px] space-y-6 px-4 py-4">
      {/* ① Snapshot */}
      <section>
        <h3 className="mb-3 text-base font-bold">
          ① Thẻ Snapshot · {data.template === "B" ? "Ngân hàng" : data.subsector?.label ?? "Standard"}
        </h3>
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg bg-[var(--color-border-2)] md:grid-cols-3">
          {data.snapshot.map((c) => {
            const sc = statusColors(c.status)
            return (
              <div key={c.key} className="bg-[var(--color-bg-2)] p-3">
                <div className="flex items-start justify-between">
                  <span className="text-[10px] uppercase tracking-wide text-[var(--color-text-3)]">
                    {c.label}
                  </span>
                  <span
                    className="rounded border px-1.5 py-0.5 text-[10px] font-bold"
                    style={{ background: sc.bg, color: sc.color, borderColor: sc.border }}
                  >
                    {statusLabel(c.status)}
                  </span>
                </div>
                <div className="mt-2 text-2xl font-bold tabular-nums">{fmtCell(c)}</div>
              </div>
            )
          })}
        </div>
      </section>

      {/* ② AI Memo */}
      <section>
        <h3 className="mb-3 text-base font-bold">② AI Memo tổng</h3>
        <div className="relative min-h-[160px]">
          <PremiumGate
            featureName="Nhận định AI BCTC"
            description="AI Memo và ghi chú từng module phân tích báo cáo tài chính."
          >
            <BctcAiMemo ai={ai ?? null} isLoading={aiLoading} isError={aiError} />
          </PremiumGate>
        </div>
      </section>

      {/* ③ Modules */}
      <section className="space-y-4">
        <h3 className="text-base font-bold">③ Modules phân tích</h3>
        {data.modules.map((mod) => (
          <div key={mod.id} className="rounded-lg border border-[var(--color-border-2)] bg-[var(--color-bg-2)] p-4">
            <div className="mb-2 text-lg font-bold">{mod.title}</div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
              {Object.entries(mod.data).map(([k, v]) => (
                <div key={k} className="flex flex-col">
                  <span className="text-[10px] uppercase text-[var(--color-text-3)]">{k}</span>
                  <span className="tabular-nums">{fmtModuleValue(k, v)}</span>
                </div>
              ))}
            </div>
            <BctcModuleNote note={moduleNote(ai, mod.id)} />
          </div>
        ))}
      </section>

      {/* ④ Forensic */}
      <section>
        <h3 className="mb-3 text-base font-bold">④ Bảng Forensic</h3>
        <div className="grid gap-px overflow-hidden rounded-lg bg-[var(--color-border-2)] md:grid-cols-2">
          <div className="bg-up/5 p-4">
            <div className="mb-2 text-xs font-bold uppercase text-up">▲ Tín hiệu Xanh</div>
            {data.forensic.green.length ? (
              data.forensic.green.map((s, i) => (
                <div key={i} className="mb-1.5 text-sm text-[var(--color-text-2)]">
                  ✓ {s}
                </div>
              ))
            ) : (
              <div className="text-xs text-[var(--color-text-3)]">—</div>
            )}
          </div>
          <div className="bg-down/5 p-4">
            <div className="mb-2 text-xs font-bold uppercase text-down">▼ Cờ Vàng / Đỏ</div>
            {data.forensic.red.map((s, i) => (
              <div key={i} className="mb-1.5 text-sm text-[var(--color-text-2)]">
                ! {s}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Trinity */}
      {data.trinity && (
        <section className="mt-4">
          <h3 className="mb-3 text-base font-bold">Bộ ba Forensic</h3>
          <div className="relative min-h-[90px]">
            <PremiumGate featureName="Bộ ba Forensic" description="Altman Z, Piotroski F, Beneish M.">
              <div className="grid grid-cols-3 gap-px overflow-hidden rounded-lg bg-[var(--color-border-2)]">
                <div className="bg-[var(--color-bg-2)] p-3 text-center">
                  <div className="text-[10px] uppercase text-[var(--color-text-3)]">Altman Z&apos;</div>
                  <div className="text-xl font-bold tabular-nums">{fmtNumber(data.trinity.altman_z, 2)}</div>
                </div>
                <div className="bg-[var(--color-bg-2)] p-3 text-center">
                  <div className="text-[10px] uppercase text-[var(--color-text-3)]">Piotroski F</div>
                  <div className="text-xl font-bold tabular-nums">
                    {data.trinity.piotroski_f?.score ?? "—"}
                    <span className="text-xs text-[var(--color-text-3)]">/9</span>
                  </div>
                </div>
                <div className="bg-[var(--color-bg-2)] p-3 text-center">
                  <div className="text-[10px] uppercase text-[var(--color-text-3)]">Beneish M</div>
                  <div className="text-xl font-bold tabular-nums">{fmtNumber(data.trinity.beneish_m, 2)}</div>
                </div>
              </div>
            </PremiumGate>
          </div>
        </section>
      )}

      {/* Blind spots */}
      {data.blind_spots && data.blind_spots.length > 0 && (
        <section className="mt-4">
          <h3 className="mb-2 text-base font-bold">Điểm mù dữ liệu (cần bản Pro)</h3>
          <div className="relative min-h-[80px]">
            <PremiumGate
              featureName="Điểm mù ngân hàng"
              description="Chỉ tiêu cần thuyết minh chi tiết (NPL nhóm, CASA, CAR)."
            >
              <div className="rounded-lg border border-reference/20 bg-reference/5 p-3">
                {data.blind_spots.map((s, i) => (
                  <div key={i} className="mb-1 text-xs text-[var(--color-text-2)]">
                    • {s}
                  </div>
                ))}
              </div>
            </PremiumGate>
          </div>
        </section>
      )}

      {/* ⑤ Valuation */}
      {data.valuation && (
        <section className="mt-4">
          <h3 className="mb-3 text-base font-bold">⑤ Định giá</h3>
          <div className="relative min-h-[120px]">
            <PremiumGate
              featureName="Định giá BCTC"
              description="Football field (P/E band, RIM, Book floor) hoặc Justified P/B + ma trận NIM×CoR."
            >
              {data.template === "B" ? (
                <div className="space-y-3 rounded-lg border border-[var(--color-border-2)] bg-[var(--color-bg-2)] p-4">
                  <div className="flex gap-6 text-sm">
                    <div>
                      <span className="text-xs uppercase text-[var(--color-text-3)]">Justified P/B</span>
                      <div className="text-xl font-bold tabular-nums">
                        {data.valuation.justified_pb != null
                          ? fmtNumber(data.valuation.justified_pb, 2) + "×"
                          : "—"}
                      </div>
                    </div>
                    <div>
                      <span className="text-xs uppercase text-[var(--color-text-3)]">Fair value/cp</span>
                      <div className="text-xl font-bold tabular-nums">{fmtKvnd(data.valuation.fair_value)}</div>
                    </div>
                  </div>
                  {data.valuation.nim_cor_matrix && (
                    <div>
                      <div className="mb-1 text-[10px] uppercase text-[var(--color-text-3)]">
                        Ma trận NIM × CoR (Justified P/B)
                      </div>
                      <table className="w-full text-xs tabular-nums">
                        <tbody>
                          {data.valuation.nim_cor_matrix.rows.map((r, i) => (
                            <tr key={i}>
                              <td className="pr-2 text-[var(--color-text-3)]">
                                NIM {r.nim != null ? (r.nim * 100).toFixed(1) + "%" : "—"}
                              </td>
                              {r.cells.map((c, j) => (
                                <td key={j} className="px-2 py-0.5 text-center">
                                  {c.justified_pb != null ? c.justified_pb.toFixed(2) + "×" : "—"}
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
                <div className="rounded-lg border border-[var(--color-border-2)] bg-[var(--color-bg-2)] p-4">
                  <table className="w-full text-sm tabular-nums">
                    <thead>
                      <tr className="text-[10px] uppercase text-[var(--color-text-3)]">
                        <th className="text-left">Phương pháp</th>
                        <th className="text-right">Thấp</th>
                        <th className="text-right">Cơ sở</th>
                        <th className="text-right">Cao</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.valuation.pe_band && (
                        <tr>
                          <td>P/E band</td>
                          <td className="text-right">{fmtKvnd(data.valuation.pe_band.bear)}</td>
                          <td className="text-right">{fmtKvnd(data.valuation.pe_band.base)}</td>
                          <td className="text-right">{fmtKvnd(data.valuation.pe_band.bull)}</td>
                        </tr>
                      )}
                      <tr>
                        <td>RIM</td>
                        <td className="text-right" colSpan={2}>
                          {fmtKvnd(data.valuation.rim)}
                        </td>
                        <td />
                      </tr>
                      <tr>
                        <td>Book floor</td>
                        <td className="text-right" colSpan={2}>
                          {fmtKvnd(data.valuation.book_floor)}
                        </td>
                        <td />
                      </tr>
                      {data.valuation.summary && (
                        <tr className="border-t border-[var(--color-border-2)] font-bold">
                          <td>Tổng hợp</td>
                          <td className="text-right">{fmtKvnd(data.valuation.summary.bear)}</td>
                          <td className="text-right">{fmtKvnd(data.valuation.summary.base)}</td>
                          <td className="text-right">{fmtKvnd(data.valuation.summary.bull)}</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                  <p className="mt-2 text-[10px] text-[var(--color-text-3)]">
                    Đơn vị: nghìn đ/cp · Ke mặc định (CAPM β chuẩn), g dài hạn — tham chiếu, không
                    phải khuyến nghị.
                  </p>
                </div>
              )}
            </PremiumGate>
          </div>
        </section>
      )}

      {data.flags.length > 0 && (
        <div className="text-[10px] text-reference">{data.flags.map((f) => f.message).join(" · ")}</div>
      )}
    </div>
  )
}
