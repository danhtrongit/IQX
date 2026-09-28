/**
 * Backtest Lab — port từ `dashboard/src/features/backtest/BacktestLab.tsx`.
 *
 * Bố cục: thư viện chỉ tiêu bên trái (drawer trên màn hình nhỏ) + vùng cấu hình
 * và kết quả bên phải, mỗi vùng tự cuộn. Nút "Chạy backtest" gọi
 * `POST /backtest/run` (đồng bộ, trần 60s) và chỉ render kết quả thật trả về.
 *
 * Hành vi giữ nguyên từ bản cũ: cần mã + ít nhất 1 tín hiệu MUA mới chạy; lưu
 * chiến lược cần tên; tạo cảnh báo cần tên + tín hiệu MUA; tải mẫu/chiến lược đã
 * lưu ghi đè cấu hình hiện tại. Xoá chiến lược đã lưu nay có bước xác nhận.
 */
import { useMemo, useState } from "react"
import { ChevronDown, FolderOpen, LoaderCircle, Play, Save, Sparkles, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import { PanelState } from "@/components/layout/panel-state"
import { ApiError, errorMessage } from "@/lib/api"
import { toast } from "sonner"

import { useAuth } from "@/hooks/use-auth"

import { ConfirmDialog } from "../confirm-dialog"
import {
  useBacktestCatalog,
  useCreateAlertRule,
  useDeleteStrategy,
  useRunBacktest,
  useSaveStrategy,
  useSavedStrategies,
} from "../hooks"
import {
  DEFAULT_RISK,
  type Combination,
  type Factor,
  type Logic,
  type Selection,
  type Side,
  type StrategyConfig,
} from "../types"
import { ConfigBar } from "./config-bar"
import { FactorLibrary } from "./factor-library"
import { ResultsView } from "./results-view"
import { RiskConfig } from "./risk-config"
import { SignalPanels } from "./signal-panels"
import { SymbolInfoBox } from "./symbol-info-box"

const RUN_FALLBACK_ERROR =
  "Chạy backtest thất bại. Kiểm tra mã cổ phiếu và khoảng thời gian."

/** Ưu tiên thông điệp tiếng Việt của server (400/404/502 đều kèm `detail`). */
function runErrorMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : RUN_FALLBACK_ERROR
}

export function BacktestLab({ initialSymbol }: { initialSymbol?: string }) {
  const { isPremium, premiumLoading } = useAuth()
  const catalogQuery = useBacktestCatalog()
  const savedQuery = useSavedStrategies()
  const run = useRunBacktest()
  const saveStrategy = useSaveStrategy()
  const deleteStrategy = useDeleteStrategy()
  const createAlertRule = useCreateAlertRule()

  const catalog = catalogQuery.data
  const saved = savedQuery.data ?? []

  // `?symbol=` của `/chien-luoc` là mã KHỞI TẠO (deep-link từ `/backtest/:symbol`);
  // sau đó ô nhập là state cục bộ, giống bản dashboard cũ.
  const [symbol, setSymbol] = useState(initialSymbol?.trim().toUpperCase() || "FPT")
  const [start, setStart] = useState("2020-01-01")
  const [end, setEnd] = useState(() => new Date().toISOString().slice(0, 10))
  const [capital, setCapital] = useState(100_000_000)
  const [buy, setBuy] = useState<Selection[]>([])
  const [sell, setSell] = useState<Selection[]>([])
  const [buyLogic, setBuyLogic] = useState<Logic>("AND")
  const [sellLogic, setSellLogic] = useState<Logic>("OR")
  const [risk, setRisk] = useState<StrategyConfig["risk"]>(DEFAULT_RISK)
  const [saveOpen, setSaveOpen] = useState(false)
  const [saveName, setSaveName] = useState("")
  const [alertOpen, setAlertOpen] = useState(false)
  const [alertName, setAlertName] = useState("")
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null)
  const [libraryOpen, setLibraryOpen] = useState(false)

  const factorsById = useMemo<Record<string, Factor>>(() => {
    const map: Record<string, Factor> = {}
    for (const group of [...(catalog?.factors.buy ?? []), ...(catalog?.factors.sell ?? [])]) {
      for (const factor of group.factors) map[factor.id] = factor
    }
    return map
  }, [catalog])

  const selectedIds = useMemo(
    () => new Set([...buy, ...sell].map((selection) => selection.id)),
    [buy, sell],
  )

  if (premiumLoading || catalogQuery.isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <LoaderCircle className="size-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (catalogQuery.isError || !catalog) {
    const forbidden =
      catalogQuery.error instanceof ApiError &&
      (catalogQuery.error.status === 403 || catalogQuery.error.status === 401)
    return (
      <div className="mx-auto w-full max-w-[1100px] p-4 sm:p-6">
        {forbidden || !isPremium ? (
          <PanelState
            title="Cần gói Premium"
            description="Bộ backtest chỉ dành cho tài khoản Premium. Máy chủ từ chối yêu cầu khi gói chưa hoạt động."
          />
        ) : (
          <PanelState
            title="Không tải được thư viện chỉ tiêu"
            description={errorMessage(catalogQuery.error)}
            action={{ label: "Thử lại", onClick: () => void catalogQuery.refetch() }}
          />
        )}
      </div>
    )
  }

  const currentConfig = (): StrategyConfig => ({
    buy: { logic: buyLogic, factors: buy.map((s) => ({ id: s.id, value: s.value })) },
    sell: { logic: sellLogic, factors: sell.map((s) => ({ id: s.id, value: s.value })) },
    risk,
  })

  const applyConfig = (config: StrategyConfig) => {
    setBuy(config.buy.factors.map((factor) => ({ id: factor.id, value: factor.value })))
    setSell(config.sell.factors.map((factor) => ({ id: factor.id, value: factor.value })))
    setBuyLogic(config.buy.logic)
    setSellLogic(config.sell.logic)
    setRisk(config.risk)
  }

  const addFactor = (factor: Factor) => {
    const setter = factor.side === "buy" ? setBuy : setSell
    setter((previous) =>
      previous.some((selection) => selection.id === factor.id)
        ? previous
        : [...previous, { id: factor.id }],
    )
  }

  const removeFactor = (side: Side, id: string) => {
    ;(side === "buy" ? setBuy : setSell)((previous) =>
      previous.filter((selection) => selection.id !== id),
    )
  }

  const changeValue = (side: Side, id: string, stored: number) => {
    ;(side === "buy" ? setBuy : setSell)((previous) =>
      previous.map((selection) => (selection.id === id ? { ...selection, value: stored } : selection)),
    )
  }

  const onRun = () => {
    if (!symbol) {
      toast.warning("Nhập mã cổ phiếu")
      return
    }
    if (buy.length === 0) {
      toast.warning("Cần ít nhất 1 tín hiệu MUA")
      return
    }
    if (!(capital > 0)) {
      toast.warning("Vốn ban đầu phải lớn hơn 0")
      return
    }
    run.mutate(
      { symbol, start, end, capital, ...currentConfig() },
      { onError: (error) => toast.error(runErrorMessage(error)) },
    )
  }

  const onSave = () => {
    if (!saveName.trim()) {
      toast.warning("Nhập tên chiến lược")
      return
    }
    saveStrategy.mutate(
      { name: saveName.trim(), symbol, config: currentConfig() },
      {
        onSuccess: () => {
          toast.success("Đã lưu chiến lược")
          setSaveOpen(false)
          setSaveName("")
        },
        onError: (error) => toast.error(errorMessage(error)),
      },
    )
  }

  const onCreateAlert = () => {
    if (!alertName.trim()) {
      toast.warning("Nhập tên cảnh báo")
      return
    }
    if (buy.length === 0) {
      toast.warning("Cần ít nhất 1 tín hiệu MUA để tạo cảnh báo")
      return
    }
    const combination: Combination = {
      logic: buyLogic,
      conditions: buy.flatMap((selection) => {
        const factor = factorsById[selection.id]
        if (!factor) return []
        const fallback = typeof factor.default === "number" ? factor.default : null
        return [
          {
            indicator: factor.indicator,
            op: factor.op,
            value: factor.op === "is_true" ? null : (selection.value ?? fallback),
          },
        ]
      }),
    }
    createAlertRule.mutate(
      { name: alertName.trim(), side: "buy", combination },
      {
        onSuccess: () => {
          toast.success("Đã tạo cảnh báo từ tín hiệu MUA")
          setAlertOpen(false)
          setAlertName("")
        },
        onError: (error) => toast.error(errorMessage(error)),
      },
    )
  }

  const confirmDelete = () => {
    if (!deleteTarget) return
    deleteStrategy.mutate(deleteTarget.id, {
      onSuccess: () => {
        toast.success(`Đã xoá "${deleteTarget.name}"`)
        setDeleteTarget(null)
      },
      onError: (error) => {
        toast.error(errorMessage(error))
        setDeleteTarget(null)
      },
    })
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border bg-card px-4 py-2.5">
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 lg:hidden"
          onClick={() => setLibraryOpen(true)}
        >
          <FolderOpen className="size-3.5" />
          Chỉ tiêu
        </Button>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5">
                Đã lưu
                <ChevronDown className="size-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-[260px]">
              {savedQuery.isError ? (
                <DropdownMenuItem disabled>Không tải được chiến lược đã lưu</DropdownMenuItem>
              ) : saved.length === 0 ? (
                <DropdownMenuItem disabled>Chưa có chiến lược đã lưu</DropdownMenuItem>
              ) : (
                saved.map((strategy) => (
                  <DropdownMenuItem
                    key={strategy.id}
                    onSelect={() => {
                      applyConfig(strategy.config)
                      if (strategy.symbol) setSymbol(strategy.symbol)
                      toast.success(`Đã tải "${strategy.name}"`)
                    }}
                    className="justify-between gap-3"
                  >
                    <span className="min-w-0 truncate">{strategy.name}</span>
                    <button
                      type="button"
                      aria-label={`Xoá chiến lược ${strategy.name}`}
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={(event) => {
                        event.stopPropagation()
                        setDeleteTarget({ id: strategy.id, name: strategy.name })
                      }}
                      className="shrink-0 text-muted-foreground transition-colors duration-150 hover:text-price-down"
                    >
                      <X className="size-3.5" />
                    </button>
                  </DropdownMenuItem>
                ))
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5">
                Tải mẫu
                <ChevronDown className="size-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-[320px]">
              <DropdownMenuLabel>Mẫu chiến lược</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {catalog.templates.map((template) => (
                <DropdownMenuItem
                  key={template.key}
                  onSelect={() => {
                    applyConfig(template.config)
                    toast.success(`Đã tải mẫu "${template.name}"`)
                  }}
                  className="h-auto flex-col items-start gap-0.5 py-1.5"
                >
                  <span className="text-xs font-medium">{template.name}</span>
                  {template.description && (
                    <span className="w-full truncate text-[10.5px] text-muted-foreground">
                      {template.description}
                    </span>
                  )}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => setSaveOpen(true)}
          >
            <Save className="size-3.5" />
            Lưu chiến lược
          </Button>
          <Button size="sm" className="gap-1.5" onClick={() => setAlertOpen(true)}>
            <Sparkles className="size-3.5" />
            Tạo cảnh báo
          </Button>
        </div>
      </header>

      <div className="relative flex min-h-0 flex-1">
        <div
          className={
            libraryOpen
              ? "absolute inset-y-0 left-0 z-40 flex shadow-2xl lg:static lg:z-auto lg:flex lg:shadow-none"
              : "hidden lg:flex"
          }
        >
          <FactorLibrary
            library={catalog.factors}
            selectedIds={selectedIds}
            onAdd={(factor) => {
              addFactor(factor)
              setLibraryOpen(false)
            }}
          />
        </div>
        {libraryOpen && (
          <div
            aria-hidden
            className="absolute inset-0 z-30 bg-black/50 lg:hidden"
            onClick={() => setLibraryOpen(false)}
          />
        )}

        <ScrollArea className="min-h-0 flex-1">
          <div className="mx-auto flex max-w-[1100px] flex-col gap-4 p-4 sm:p-6">
            <ConfigBar
              symbol={symbol}
              start={start}
              end={end}
              capital={capital}
              onSymbol={setSymbol}
              onStart={setStart}
              onEnd={setEnd}
              onCapital={setCapital}
            />

            <SymbolInfoBox symbol={symbol} meta={run.data?.meta ?? null} />

            <SignalPanels
              factorsById={factorsById}
              buy={buy}
              sell={sell}
              buyLogic={buyLogic}
              sellLogic={sellLogic}
              onLogicChange={(side, logic) => (side === "buy" ? setBuyLogic(logic) : setSellLogic(logic))}
              onValueChange={changeValue}
              onRemove={removeFactor}
            />

            <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_240px]">
              <RiskConfig
                risk={risk}
                presets={catalog.riskPresets}
                onChange={(patch) => setRisk((previous) => ({ ...previous, ...patch }))}
              />

              <div className="flex flex-col items-center justify-center gap-2 rounded-lg bg-card p-4">
                <Button
                  size="lg"
                  className="w-full gap-1.5"
                  onClick={onRun}
                  disabled={buy.length === 0 || run.isPending}
                >
                  {run.isPending ? (
                    <LoaderCircle className="size-4 animate-spin" />
                  ) : (
                    <Play className="size-4" />
                  )}
                  Chạy backtest
                </Button>
                <span className="text-center text-[11px] text-muted-foreground">
                  {buy.length === 0 ? "Thêm tín hiệu MUA để chạy" : "Mô phỏng trên dữ liệu lịch sử"}
                </span>
              </div>
            </div>

            {run.data && <ResultsView result={run.data} />}
          </div>
        </ScrollArea>
      </div>

      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Lưu chiến lược</DialogTitle>
            <DialogDescription>
              Cấu hình hiện tại của mã {symbol || "—"} được lưu vào tài khoản của bạn.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="strategy-name">Tên chiến lược</Label>
            <Input
              id="strategy-name"
              value={saveName}
              onChange={(event) => setSaveName(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && onSave()}
              placeholder="Ví dụ: RSI quá bán + MACD cắt lên"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveOpen(false)}>
              Hủy
            </Button>
            <Button onClick={onSave} disabled={saveStrategy.isPending}>
              {saveStrategy.isPending && <LoaderCircle className="size-3.5 animate-spin" />}
              Lưu
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={alertOpen} onOpenChange={setAlertOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Tạo cảnh báo từ tín hiệu MUA</DialogTitle>
            <DialogDescription>
              Cảnh báo sẽ kích hoạt khi tổ hợp tín hiệu MUA hiện tại xuất hiện trên các mã trong
              watchlist của bạn.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="alert-name">Tên cảnh báo</Label>
            <Input
              id="alert-name"
              value={alertName}
              onChange={(event) => setAlertName(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && onCreateAlert()}
              placeholder="Ví dụ: MUA khi RSI quá bán"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAlertOpen(false)}>
              Hủy
            </Button>
            <Button onClick={onCreateAlert} disabled={createAlertRule.isPending}>
              {createAlertRule.isPending && <LoaderCircle className="size-3.5 animate-spin" />}
              Tạo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Xoá chiến lược đã lưu"
        description={`Chiến lược "${deleteTarget?.name ?? ""}" sẽ bị xoá khỏi tài khoản của bạn. Thao tác này không thể hoàn tác.`}
        confirmLabel="Xoá"
        pending={deleteStrategy.isPending}
        onConfirm={confirmDelete}
      />
    </div>
  )
}
