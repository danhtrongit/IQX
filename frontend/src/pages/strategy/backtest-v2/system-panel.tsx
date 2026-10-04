/**
 * System panel — "Hệ thống nâng cao" (Chương 16–18), CONTRACTS §4.1.
 *
 * Sends only the keys the user filled in; every present key is gated
 * server-side (flag + lesson grant) and a 403 CAPABILITY_LOCKED shows the lock
 * reason. The run uses the SAVED revision with one shared-capital ledger;
 * results are never averaged per symbol.
 */
import { useState } from "react"
import { useMutation } from "@tanstack/react-query"
import { LoaderCircle, Play } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { errorMessage } from "@/lib/api"

import { CAPABILITY_LESSONS, capabilityLock, isCapabilityLocked, runBacktestV2, type CapabilityLock } from "./api"
import { fmtCount, fmtMoney, fmtNumberVN, fmtPercent, fmtPlainPercent } from "./format"
import { LockNotice } from "./research-panel"
import { parseSymbols, systemSummary } from "./research"
import type { AdvancedCapability, BacktestRunRequest, BacktestRunResponse, RankingKey, SystemRequest, UniverseMarket } from "./types"

const SELECT_CLASS = "h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
const LABEL_CLASS = "text-[11px] text-muted-foreground"

const RANKING_LABEL: Record<RankingKey, string> = {
  roc_20: "ROC 20 phiên",
  rs_market: "Sức mạnh so với VN-Index",
  relative_volume: "Khối lượng tương đối",
  distance_52w_high: "Khoảng cách tới đỉnh 52 tuần",
}

type SizingMode = "all_cash" | "pct_nav" | "fixed_amount"

type SystemForm = {
  symbols: string
  market: UniverseMarket | ""
  ranking: RankingKey | ""
  direction: "desc" | "asc"
  logic: "and" | "or"
  sizing: SizingMode
  sizingValue: string
  maxPositions: string
}

const EMPTY_FORM: SystemForm = {
  symbols: "",
  market: "",
  ranking: "",
  direction: "desc",
  logic: "and",
  sizing: "all_cash",
  sizingValue: "",
  maxPositions: "",
}

/** Builds the frozen §4.1 payload; returns an error message when invalid. */
function toSystemRequest(form: SystemForm, buyIndicatorIds: string[]): { system: SystemRequest; primary: AdvancedCapability } | string {
  const system: SystemRequest = {}
  const symbols = parseSymbols(form.symbols)
  if (symbols.length > 0) {
    if (symbols.length < 2 || symbols.length > 30) return "Danh mục cần 2–30 mã."
    system.symbols = symbols
  }
  if (form.market) system.universe = { market: form.market }
  if (!system.symbols && !system.universe) return "Nhập 2–30 mã hoặc chọn sàn cho universe."
  if (form.ranking) system.ranking = { key: form.ranking, direction: form.direction }
  if (form.logic === "or") {
    if (buyIndicatorIds.length < 2) return "Nhóm OR cần ít nhất 2 chỉ báo Mua đang bật trong cấu hình đã lưu."
    if (buyIndicatorIds.length > 16) return "Nhóm logic tối đa 16 chỉ báo."
    system.logic = { type: "or", children: buyIndicatorIds.map((id) => ({ type: "indicator", indicator_id: id })) }
  }
  if (form.sizing !== "all_cash") {
    const value = Number(form.sizingValue)
    if (form.sizing === "pct_nav") {
      if (!Number.isFinite(value) || value < 1 || value > 100) return "Tỷ trọng mỗi lệnh: 1–100% NAV."
      system.sizing = { mode: "pct_nav", pct: value }
    } else {
      if (!Number.isFinite(value) || value < 1_000_000) return "Số tiền mỗi lệnh tối thiểu 1.000.000 đ."
      system.sizing = { mode: "fixed_amount", amount_vnd: value }
    }
  }
  if (form.maxPositions.trim() !== "") {
    const value = Number(form.maxPositions)
    if (!Number.isInteger(value) || value < 1 || value > 30) return "Số vị thế tối đa: số nguyên 1–30."
    system.max_positions = value
  }
  return { system, primary: system.symbols ? "portfolio" : "universe" }
}

export function SystemPanel({
  buyIndicatorIds,
  buildRequest,
  blockedReason,
}: {
  /** Buy-side indicators active in the SAVED revision (logic group members). */
  buyIndicatorIds: string[]
  buildRequest: (extra: Pick<BacktestRunRequest, "system">) => BacktestRunRequest
  blockedReason: string | null
}) {
  const [form, setForm] = useState<SystemForm>(EMPTY_FORM)
  const [formError, setFormError] = useState<string | null>(null)
  const [lock, setLock] = useState<CapabilityLock | null>(null)
  const [last, setLast] = useState<BacktestRunResponse | null>(null)
  const mutation = useMutation({ mutationFn: (body: BacktestRunRequest) => runBacktestV2(body) })

  const update = <K extends keyof SystemForm>(key: K, value: SystemForm[K]) => setForm((previous) => ({ ...previous, [key]: value }))

  const submit = () => {
    setFormError(null)
    const built = toSystemRequest(form, buyIndicatorIds)
    if (typeof built === "string") {
      setFormError(built)
      return
    }
    mutation.mutate(buildRequest({ system: built.system }), {
      onSuccess: (response) => {
        setLock(null)
        setLast(response)
      },
      onError: (error) => {
        if (isCapabilityLocked(error)) setLock(capabilityLock(error, built.primary))
      },
    })
  }

  const summary = last ? systemSummary(last) : null

  return (
    <details className="rounded-lg bg-card" data-testid="system-panel">
      <summary className="cursor-pointer px-4 py-3 text-[12px] font-bold tracking-wide uppercase">
        Hệ thống nâng cao · Universe / Xếp hạng / Nhóm logic / Vị thế / Danh mục
      </summary>
      <div className="flex flex-col gap-3 border-t border-border p-4">
        <p className="text-xs text-muted-foreground">
          Chỉ khả dụng khi máy chủ bật tính năng và bạn đã học bài tương ứng (Universe {CAPABILITY_LESSONS.universe}, Xếp hạng{" "}
          {CAPABILITY_LESSONS.ranking}, Nhóm logic {CAPABILITY_LESSONS.logic_groups}, Vị thế {CAPABILITY_LESSONS.max_positions}, Danh mục{" "}
          {CAPABILITY_LESSONS.portfolio}). Danh mục dùng một sổ vốn chung, không lấy trung bình kết quả từng mã.
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="space-y-1">
            <span className={LABEL_CLASS}>Các mã trong danh mục (2–30)</span>
            <Input value={form.symbols} onChange={(event) => update("symbols", event.target.value)} placeholder="FPT, VNM, HPG" aria-label="Các mã trong danh mục" />
          </label>
          <label className="space-y-1">
            <span className={LABEL_CLASS}>Universe theo sàn</span>
            <select className={SELECT_CLASS} value={form.market} onChange={(event) => update("market", event.target.value as SystemForm["market"])} aria-label="Universe theo sàn">
              <option value="">Không dùng</option>
              <option value="HOSE">HOSE</option>
              <option value="HNX">HNX</option>
              <option value="UPCOM">UPCOM</option>
              <option value="ALL">Tất cả sàn</option>
            </select>
          </label>
          <label className="space-y-1">
            <span className={LABEL_CLASS}>Xếp hạng ứng viên</span>
            <select className={SELECT_CLASS} value={form.ranking} onChange={(event) => update("ranking", event.target.value as SystemForm["ranking"])} aria-label="Xếp hạng ứng viên">
              <option value="">Không xếp hạng</option>
              {(Object.keys(RANKING_LABEL) as RankingKey[]).map((key) => (
                <option key={key} value={key}>
                  {RANKING_LABEL[key]}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <span className={LABEL_CLASS}>Thứ tự xếp hạng</span>
            <select
              className={SELECT_CLASS}
              value={form.direction}
              onChange={(event) => update("direction", event.target.value as SystemForm["direction"])}
              aria-label="Thứ tự xếp hạng"
              disabled={!form.ranking}
            >
              <option value="desc">Cao → thấp</option>
              <option value="asc">Thấp → cao</option>
            </select>
          </label>
          <label className="space-y-1">
            <span className={LABEL_CLASS}>Nhóm logic Mua</span>
            <select className={SELECT_CLASS} value={form.logic} onChange={(event) => update("logic", event.target.value as SystemForm["logic"])} aria-label="Nhóm logic Mua">
              <option value="and">Tất cả chỉ báo (AND) · mặc định</option>
              <option value="or">Bất kỳ chỉ báo nào (OR)</option>
            </select>
          </label>
          <label className="space-y-1">
            <span className={LABEL_CLASS}>Số vị thế tối đa</span>
            <Input
              type="number"
              inputMode="numeric"
              value={form.maxPositions}
              onChange={(event) => update("maxPositions", event.target.value)}
              placeholder="Không giới hạn"
              aria-label="Số vị thế tối đa"
            />
          </label>
          <label className="space-y-1">
            <span className={LABEL_CLASS}>Quy mô lệnh</span>
            <select className={SELECT_CLASS} value={form.sizing} onChange={(event) => update("sizing", event.target.value as SizingMode)} aria-label="Quy mô lệnh">
              <option value="all_cash">100% tiền mặt khả dụng · mặc định</option>
              <option value="pct_nav">% NAV mỗi lệnh</option>
              <option value="fixed_amount">Số tiền cố định mỗi lệnh</option>
            </select>
          </label>
          {form.sizing !== "all_cash" && (
            <label className="space-y-1">
              <span className={LABEL_CLASS}>{form.sizing === "pct_nav" ? "% NAV (1–100)" : "Số tiền (đ, ≥ 1.000.000)"}</span>
              <Input
                type="number"
                inputMode="decimal"
                value={form.sizingValue}
                onChange={(event) => update("sizingValue", event.target.value)}
                aria-label={form.sizing === "pct_nav" ? "% NAV mỗi lệnh" : "Số tiền mỗi lệnh"}
              />
            </label>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button size="sm" className="gap-1.5" onClick={submit} disabled={!!blockedReason || mutation.isPending}>
            {mutation.isPending ? <LoaderCircle className="size-3.5 animate-spin" /> : <Play className="size-3.5" />}
            Chạy hệ thống
          </Button>
          {blockedReason && <span className="text-[11px] text-muted-foreground">{blockedReason}</span>}
        </div>
        {formError && (
          <p className="text-xs text-price-down" role="alert">
            {formError}
          </p>
        )}
        {lock && <LockNotice lock={lock} />}
        {mutation.isError && !isCapabilityLocked(mutation.error) && (
          <p className="text-xs text-price-down" role="alert">
            {errorMessage(mutation.error)}
          </p>
        )}
        {last && !summary && <p className="text-xs text-muted-foreground">Máy chủ không trả về kết quả hệ thống.</p>}
        {summary && (
          <div className="flex flex-col gap-3" data-testid="system-result">
            <dl className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
              <SummaryItem label="Tổng lợi nhuận" value={fmtPercent(summary.kpis.net_return)} />
              <SummaryItem label="Sụt giảm lớn nhất" value={fmtPercent(summary.kpis.max_drawdown)} />
              <SummaryItem label="Giao dịch đã đóng" value={fmtCount(summary.kpis.n_trades ?? summary.trades)} />
              <SummaryItem label="Tỷ lệ thắng" value={fmtPlainPercent(summary.kpis.win_rate)} />
              <SummaryItem label="Profit factor" value={fmtNumberVN(summary.kpis.profit_factor)} />
              <SummaryItem label="Số dòng sổ lệnh" value={fmtCount(summary.ledger_size)} />
              <SummaryItem label="Vị thế còn mở" value={fmtCount(summary.positions_open.length)} />
              <SummaryItem label="Mã lần chạy" value={last?.run_id || "—"} />
            </dl>
            {summary.applied.length > 0 && (
              <p className="text-[11px] text-muted-foreground">Đã áp dụng: {summary.applied.join(", ")}</p>
            )}
            {summary.positions_open.length > 0 && (
              <ul className="text-xs">
                {summary.positions_open.map((position) => (
                  <li key={position.symbol} className="flex justify-between border-t border-border py-1 font-mono tabular-nums">
                    <span className="font-sans font-semibold">{position.symbol}</span>
                    <span>
                      {fmtCount(position.qty)} cp · {fmtMoney(position.market_value)} · lãi/lỗ tạm tính {fmtMoney(position.unrealized_pnl)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </details>
  )
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-mono break-all">{value}</dd>
    </div>
  )
}
