/**
 * Research panel — sensitivity / out-of-sample / walk-forward (Chương 2).
 *
 * Every request runs on the SAVED revision with immutable candidate configs
 * computed server-side; nothing is written to the shared config. Sensitivity
 * shows the whole candidate region (no "best" highlight); "Áp dụng giá trị
 * này" only opens the editor draft — the user still has to press Lưu.
 * A 403 CAPABILITY_LOCKED shows the lock reason and the lesson to learn.
 */
import { useMemo, useState } from "react"
import { Link } from "react-router"
import { useMutation } from "@tanstack/react-query"
import { LoaderCircle, Lock, Play } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { errorMessage } from "@/lib/api"
import type { Side, TechnicalIndicator } from "@/lib/shared-config"

import { capabilityLock, isCapabilityLocked, runBacktestV2, type CapabilityLock } from "./api"
import { isSideActive, type IndicatorMap } from "./draft"
import { fmtCount, fmtDate, fmtNumberVN, fmtPercent, SIDE_LABEL } from "./format"
import {
  outOfSampleReports,
  parseValueList,
  researchPayload,
  sensitivityRows,
  walkForwardWindows,
} from "./research"
import type { BacktestRunRequest, BacktestRunResponse, ParamPath, ResearchKind, ResearchRequest } from "./types"

const KIND_LABEL: Record<ResearchKind, string> = {
  sensitivity: "Độ nhạy tham số",
  out_of_sample: "Kiểm tra ngoài mẫu",
  walk_forward: "Walk-Forward theo cửa sổ",
}

const SELECT_CLASS = "h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
const LABEL_CLASS = "text-[11px] text-muted-foreground"

export function LockNotice({ lock }: { lock: CapabilityLock }) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-border bg-muted/40 p-3 text-xs" role="status" data-testid="capability-lock">
      <Lock className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
      <div>
        <p className="font-medium">{lock.message}</p>
        {lock.reason === "not_learned" && lock.lessonId && (
          <p className="mt-1">
            <Link to={`/hoc-vien/${lock.lessonId}`} className="text-primary underline-offset-2 hover:underline">
              Mở bài {lock.lessonId} trong Học viện
            </Link>
          </p>
        )}
        {lock.reason === null && (
          <p className="mt-1 text-muted-foreground">
            Tính năng chưa bật trên máy chủ, hoặc chưa học bài {lock.lessonId ?? lock.capability}
            {lock.lessonId && (
              <>
                {" "}
                (
                <Link to={`/hoc-vien/${lock.lessonId}`} className="text-primary underline-offset-2 hover:underline">
                  Mở bài học
                </Link>
                )
              </>
            )}
            .
          </p>
        )}
      </div>
    </div>
  )
}

type PathOption = { value: string; path: ParamPath; label: string }

export function ResearchPanel({
  saved,
  registry,
  buildRequest,
  blockedReason,
  onApply,
}: {
  saved: IndicatorMap
  registry: Record<string, TechnicalIndicator>
  buildRequest: (extra: Pick<BacktestRunRequest, "research">) => BacktestRunRequest
  blockedReason: string | null
  onApply: (path: ParamPath, value: number) => void
}) {
  const [kind, setKind] = useState<ResearchKind>("sensitivity")
  const [pathValue, setPathValue] = useState("")
  const [valuesText, setValuesText] = useState("")
  const [splitDate, setSplitDate] = useState("")
  const [trainBars, setTrainBars] = useState("250")
  const [testBars, setTestBars] = useState("100")
  const [stepBars, setStepBars] = useState("100")
  const [minTrades, setMinTrades] = useState("1")
  const [formError, setFormError] = useState<string | null>(null)
  const [locks, setLocks] = useState<Partial<Record<ResearchKind, CapabilityLock>>>({})
  const [last, setLast] = useState<{ kind: ResearchKind; path: ParamPath | null; response: BacktestRunResponse } | null>(null)

  /** Parameters of indicators active in the SAVED revision (what the run uses). */
  const pathOptions = useMemo<PathOption[]>(() => {
    const options: PathOption[] = []
    for (const [id, indicator] of Object.entries(saved)) {
      const entry = registry[id]
      if (!entry) continue
      for (const side of ["buy", "sell"] as Side[]) {
        if (!isSideActive(indicator, side)) continue
        for (const key of Object.keys(indicator[side].params)) {
          const field = entry.fields.find((item) => item.key === key)
          options.push({
            value: `${id}|${side}|${key}`,
            path: { indicator: id, side, key },
            label: `${entry.name} · ${SIDE_LABEL[side]} · ${field?.label ?? key}`,
          })
        }
      }
    }
    return options
  }, [saved, registry])

  const selectedPath = pathOptions.find((option) => option.value === pathValue)?.path ?? pathOptions[0]?.path ?? null

  const mutation = useMutation({
    mutationFn: (body: BacktestRunRequest) => runBacktestV2(body),
  })

  const submit = () => {
    setFormError(null)
    let research: ResearchRequest
    if (kind === "out_of_sample") {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(splitDate)) return setFormError("Chọn mốc chia hợp lệ.")
      research = { kind, split_date: splitDate }
    } else {
      if (!selectedPath) return setFormError("Cấu hình đã lưu chưa có tham số để kiểm tra.")
      const values = parseValueList(valuesText)
      if (!values || values.length > 100) return setFormError("Nhập 1–100 giá trị số, ngăn cách bằng dấu phẩy.")
      if (kind === "sensitivity") {
        research = { kind, path: selectedPath, values }
      } else {
        const bars = [trainBars, testBars, stepBars, minTrades].map(Number)
        if (bars.some((value) => !Number.isInteger(value) || value < 0) || bars.slice(0, 3).some((value) => value < 1)) {
          return setFormError("Số phiên học/kiểm tra/bước phải là số nguyên dương.")
        }
        research = {
          kind,
          path: selectedPath,
          values,
          train_bars: bars[0]!,
          test_bars: bars[1]!,
          step_bars: bars[2]!,
          criterion: "net_return",
          min_trades: bars[3]!,
        }
      }
    }
    const path = research.kind === "out_of_sample" ? null : research.path
    const runKind = kind
    mutation.mutate(buildRequest({ research }), {
      onSuccess: (response) => {
        setLocks((previous) => ({ ...previous, [runKind]: undefined }))
        setLast({ kind: runKind, path, response })
      },
      onError: (error) => {
        if (isCapabilityLocked(error)) setLocks((previous) => ({ ...previous, [runKind]: capabilityLock(error, runKind) }))
      },
    })
  }

  const lock = locks[kind]
  const payload = last && last.kind === kind ? researchPayload(last.response) : null

  return (
    <details className="rounded-lg bg-card" data-testid="research-panel">
      <summary className="cursor-pointer px-4 py-3 text-[12px] font-bold tracking-wide uppercase">
        Nghiên cứu nâng cao · Độ nhạy / Ngoài mẫu / Walk-Forward
      </summary>
      <div className="flex flex-col gap-3 border-t border-border p-4">
        <p className="text-xs text-muted-foreground">
          Chạy trên cấu hình đã lưu; các ứng viên được tính riêng trong lần chạy và không ghi vào cấu hình chung.
          Chỉ khả dụng khi máy chủ bật tính năng và bạn đã học bài tương ứng.
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="space-y-1">
            <span className={LABEL_CLASS}>Phép kiểm tra</span>
            <select className={SELECT_CLASS} value={kind} onChange={(event) => setKind(event.target.value as ResearchKind)} aria-label="Phép kiểm tra">
              {(Object.keys(KIND_LABEL) as ResearchKind[]).map((item) => (
                <option key={item} value={item}>
                  {KIND_LABEL[item]}
                </option>
              ))}
            </select>
          </label>
          {kind === "out_of_sample" ? (
            <label className="space-y-1">
              <span className={LABEL_CLASS}>Mốc chia</span>
              <Input type="date" value={splitDate} onChange={(event) => setSplitDate(event.target.value)} aria-label="Mốc chia" />
            </label>
          ) : (
            <>
              <label className="space-y-1">
                <span className={LABEL_CLASS}>Tham số</span>
                <select
                  className={SELECT_CLASS}
                  value={pathValue || pathOptions[0]?.value || ""}
                  onChange={(event) => setPathValue(event.target.value)}
                  aria-label="Tham số kiểm tra"
                  disabled={pathOptions.length === 0}
                >
                  {pathOptions.length === 0 && <option value="">Chưa có chỉ báo trong cấu hình đã lưu</option>}
                  {pathOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1">
                <span className={LABEL_CLASS}>Các giá trị (dấu phẩy)</span>
                <Input value={valuesText} onChange={(event) => setValuesText(event.target.value)} placeholder="10, 20, 30" aria-label="Các giá trị" />
              </label>
            </>
          )}
        </div>
        {kind === "walk_forward" && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {(
              [
                ["Phiên học", trainBars, setTrainBars],
                ["Phiên kiểm tra", testBars, setTestBars],
                ["Bước tiến", stepBars, setStepBars],
                ["Số lệnh tối thiểu", minTrades, setMinTrades],
              ] as const
            ).map(([label, value, setter]) => (
              <label key={label} className="space-y-1">
                <span className={LABEL_CLASS}>{label}</span>
                <Input type="number" inputMode="numeric" value={value} onChange={(event) => setter(event.target.value)} aria-label={label} />
              </label>
            ))}
            <p className="col-span-full text-[11px] text-muted-foreground">
              Tiêu chí chọn: tổng lợi nhuận đoạn học; hòa điểm chọn ứng viên đứng trước. Mỗi cửa sổ kiểm tra có vốn riêng — không ghép thành
              lợi nhuận danh mục liên tục.
            </p>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <Button size="sm" className="gap-1.5" onClick={submit} disabled={!!blockedReason || mutation.isPending}>
            {mutation.isPending ? <LoaderCircle className="size-3.5 animate-spin" /> : <Play className="size-3.5" />}
            Chạy kiểm định
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

        {payload && kind === "sensitivity" && (
          <SensitivityTable payload={payload} path={last?.path ?? null} registry={registry} onApply={onApply} />
        )}
        {payload && kind === "out_of_sample" && <OutOfSampleTable payload={payload} />}
        {payload && kind === "walk_forward" && <WalkForwardTable payload={payload} />}
      </div>
    </details>
  )
}

function SensitivityTable({
  payload,
  path,
  registry,
  onApply,
}: {
  payload: Record<string, unknown>
  path: ParamPath | null
  registry: Record<string, TechnicalIndicator>
  onApply: (path: ParamPath, value: number) => void
}) {
  const rows = sensitivityRows(payload)
  const field = path ? registry[path.indicator]?.fields.find((item) => item.key === path.key) : undefined
  return (
    <div className="overflow-auto" data-testid="sensitivity-table">
      <p className="mb-2 text-[11px] text-muted-foreground">
        Toàn bộ vùng kết quả lịch sử, không phải tham số tối ưu. Áp dụng một giá trị chỉ mở bản nháp — cần bấm Lưu để ghi.
      </p>
      <table className="w-full text-xs">
        <thead className="text-left text-[10.5px] text-muted-foreground uppercase">
          <tr>
            <th className="py-1 pr-3">{field?.label ?? "Giá trị"}</th>
            <th className="py-1 pr-3">Lợi nhuận</th>
            <th className="py-1 pr-3">Sụt giảm</th>
            <th className="py-1 pr-3">Lệnh đóng</th>
            <th className="py-1 pr-3">Mã băm cấu hình</th>
            <th className="py-1" />
          </tr>
        </thead>
        <tbody className="font-mono tabular-nums">
          {rows.map((row, index) => (
            <tr key={`${row.value}-${index}`} className="border-t border-border">
              <td className="py-1.5 pr-3">{fmtNumberVN(row.value, 4)}</td>
              <td className="py-1.5 pr-3">{row.ok ? fmtPercent(row.net_return) : "—"}</td>
              <td className="py-1.5 pr-3">{row.ok ? fmtPercent(row.max_drawdown) : "—"}</td>
              <td className="py-1.5 pr-3">{row.ok ? fmtCount(row.n_trades) : "—"}</td>
              <td className="max-w-[160px] truncate py-1.5 pr-3 text-muted-foreground" title={row.config_hash ?? undefined}>
                {row.ok ? (row.config_hash ?? "—") : <span className="font-sans text-price-down">{row.error ?? "Không hợp lệ"}</span>}
              </td>
              <td className="py-1.5 text-right">
                {row.ok && path && row.value != null && (
                  <Button size="sm" variant="outline" onClick={() => onApply(path, row.value!)}>
                    Áp dụng giá trị này
                  </Button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && <p className="text-xs text-muted-foreground">Máy chủ không trả về ứng viên nào.</p>}
    </div>
  )
}

function OutOfSampleTable({ payload }: { payload: Record<string, unknown> }) {
  const reports = outOfSampleReports(payload)
  return (
    <div className="overflow-auto">
      <p className="mb-2 text-[11px] text-muted-foreground">
        Cấu hình cố định trên hai đoạn không chồng nhau; đây không phải thủ tục tự chọn tham số.
      </p>
      <table className="w-full text-xs">
        <thead className="text-left text-[10.5px] text-muted-foreground uppercase">
          <tr>
            <th className="py-1 pr-3">Đoạn</th>
            <th className="py-1 pr-3">Từ ngày</th>
            <th className="py-1 pr-3">Đến ngày</th>
            <th className="py-1 pr-3">Lợi nhuận</th>
            <th className="py-1 pr-3">Sụt giảm</th>
            <th className="py-1">Lệnh đóng</th>
          </tr>
        </thead>
        <tbody className="font-mono tabular-nums">
          {reports.map((report) => (
            <tr key={report.label} className="border-t border-border">
              <td className="py-1.5 pr-3 font-sans">{report.label}</td>
              <td className="py-1.5 pr-3">{fmtDate(report.start)}</td>
              <td className="py-1.5 pr-3">{fmtDate(report.end)}</td>
              <td className="py-1.5 pr-3">{fmtPercent(report.net_return)}</td>
              <td className="py-1.5 pr-3">{fmtPercent(report.max_drawdown)}</td>
              <td className="py-1.5">{fmtCount(report.n_trades)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function WalkForwardTable({ payload }: { payload: Record<string, unknown> }) {
  const windows = walkForwardWindows(payload)
  return (
    <div className="overflow-auto">
      <p className="mb-2 text-[11px] text-muted-foreground">
        Mỗi cửa sổ kiểm tra dùng vốn khởi đầu riêng. Không cộng hoặc ghép các tỷ lệ này thành lợi nhuận một danh mục liên tục.
      </p>
      <table className="w-full text-xs">
        <thead className="text-left text-[10.5px] text-muted-foreground uppercase">
          <tr>
            <th className="py-1 pr-3">Học</th>
            <th className="py-1 pr-3">Kiểm tra</th>
            <th className="py-1 pr-3">Giá trị chọn</th>
            <th className="py-1 pr-3">Lợi nhuận học</th>
            <th className="py-1 pr-3">Lợi nhuận kiểm tra</th>
            <th className="py-1">Lệnh đóng</th>
          </tr>
        </thead>
        <tbody className="font-mono tabular-nums">
          {windows.map((window, index) => (
            <tr key={`${window.test_start}-${index}`} className="border-t border-border">
              <td className="py-1.5 pr-3">{fmtDate(window.train_start)} → {fmtDate(window.train_end)}</td>
              <td className="py-1.5 pr-3">{fmtDate(window.test_start)} → {fmtDate(window.test_end)}</td>
              <td className="py-1.5 pr-3">
                {window.status === "no_eligible_candidate" ? <span className="font-sans">Không có ứng viên đủ lệnh</span> : fmtNumberVN(window.selected, 4)}
              </td>
              <td className="py-1.5 pr-3">{fmtPercent(window.train_return)}</td>
              <td className="py-1.5 pr-3">{fmtPercent(window.test_return)}</td>
              <td className="py-1.5">{fmtCount(window.n_trades)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {windows.length === 0 && <p className="text-xs text-muted-foreground">Chưa đủ dữ liệu cho một cửa sổ.</p>}
    </div>
  )
}

