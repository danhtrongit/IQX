import { useMemo, useState } from "react"
import { Button, Dropdown, Input, Menu, Message, Modal, Spin } from "@arco-design/web-react"
import { IconDown, IconLoading, IconPlayArrow, IconSave } from "@arco-design/web-react/icon"
import { alertsApi } from "@/features/alerts/api"
import { ConfigBar } from "./components/ConfigBar"
import { FactorLibrary } from "./components/FactorLibrary"
import { ResultsView } from "./components/ResultsView"
import { RiskConfig } from "./components/RiskConfig"
import { SignalPanels } from "./components/SignalPanels"
import { SymbolInfoBox } from "./components/SymbolInfoBox"
import { useCatalog, useDeleteStrategy, useRunBacktest, useSaveStrategy, useStrategies } from "./hooks"
import {
  DEFAULT_RISK,
  type Factor,
  type Logic,
  type RiskInput,
  type Selection,
  type Side,
  type StrategyConfig,
  type Template,
} from "./types"

async function extractError(err: unknown): Promise<string> {
  try {
    const anyErr = err as { response?: { json: () => Promise<{ detail?: string }> } }
    if (anyErr?.response?.json) {
      const body = await anyErr.response.json()
      if (body?.detail) return body.detail
    }
  } catch {
    /* ignore */
  }
  return "Chạy backtest thất bại. Kiểm tra mã cổ phiếu và khoảng thời gian."
}

export function BacktestLab({ initialSymbol }: { initialSymbol?: string }) {
  const { data: catalog, isLoading, isError } = useCatalog()
  const run = useRunBacktest()
  const { data: saved } = useStrategies()
  const saveStrategy = useSaveStrategy()
  const deleteStrategy = useDeleteStrategy()

  const [symbol, setSymbol] = useState(initialSymbol ?? "FPT")
  const [start, setStart] = useState("2020-01-01")
  const [end, setEnd] = useState(new Date().toISOString().slice(0, 10))
  const [capital, setCapital] = useState(100_000_000)
  const [buy, setBuy] = useState<Selection[]>([])
  const [sell, setSell] = useState<Selection[]>([])
  const [buyLogic, setBuyLogic] = useState<Logic>("AND")
  const [sellLogic, setSellLogic] = useState<Logic>("OR")
  const [risk, setRisk] = useState<RiskInput>(DEFAULT_RISK)
  const [saveOpen, setSaveOpen] = useState(false)
  const [saveName, setSaveName] = useState("")
  const [alertOpen, setAlertOpen] = useState(false)
  const [alertName, setAlertName] = useState("")
  const [alertSaving, setAlertSaving] = useState(false)
  const [libOpen, setLibOpen] = useState(false) // factor-library drawer (mobile)

  const factorsById = useMemo<Record<string, Factor>>(() => {
    const map: Record<string, Factor> = {}
    if (catalog) {
      for (const g of [...catalog.factors.buy, ...catalog.factors.sell]) {
        for (const f of g.factors) map[f.id] = f
      }
    }
    return map
  }, [catalog])

  const selectedIds = useMemo(() => new Set([...buy, ...sell].map((s) => s.id)), [buy, sell])

  if (isLoading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Spin />
      </div>
    )
  }
  if (isError || !catalog) {
    return (
      <div className="p-8 text-center text-sm text-[var(--color-text-3)]">
        Không tải được thư viện chỉ tiêu. Vui lòng thử lại.
      </div>
    )
  }

  const addFactor = (factor: Factor) => {
    const setter = factor.side === "buy" ? setBuy : setSell
    setter((prev) => (prev.some((s) => s.id === factor.id) ? prev : [...prev, { id: factor.id }]))
  }
  const removeFactor = (side: Side, id: string) => {
    ;(side === "buy" ? setBuy : setSell)((prev) => prev.filter((s) => s.id !== id))
  }
  const changeValue = (side: Side, id: string, stored: number) => {
    ;(side === "buy" ? setBuy : setSell)((prev) =>
      prev.map((s) => (s.id === id ? { ...s, value: stored } : s)),
    )
  }
  const changeLogic = (side: Side, logic: Logic) =>
    side === "buy" ? setBuyLogic(logic) : setSellLogic(logic)

  const currentConfig = (): StrategyConfig => ({
    buy: { logic: buyLogic, factors: buy.map((s) => ({ id: s.id, value: s.value })) },
    sell: { logic: sellLogic, factors: sell.map((s) => ({ id: s.id, value: s.value })) },
    risk,
  })

  const applyConfig = (cfg: StrategyConfig) => {
    setBuy(cfg.buy.factors.map((f) => ({ id: f.id, value: f.value })))
    setSell(cfg.sell.factors.map((f) => ({ id: f.id, value: f.value })))
    setBuyLogic(cfg.buy.logic)
    setSellLogic(cfg.sell.logic)
    setRisk({ ...DEFAULT_RISK, ...cfg.risk })
  }

  const onRun = () => {
    if (!symbol) {
      Message.warning("Nhập mã cổ phiếu")
      return
    }
    if (buy.length === 0) {
      Message.warning("Cần ít nhất 1 tín hiệu MUA")
      return
    }
    run.mutate(
      { symbol, start, end, capital, ...currentConfig() },
      {
        onError: async (err: unknown) => Message.error(await extractError(err)),
      },
    )
  }

  const onSave = () => {
    if (!saveName.trim()) {
      Message.warning("Nhập tên chiến lược")
      return
    }
    saveStrategy.mutate(
      { name: saveName.trim(), symbol, config: currentConfig() },
      {
        onSuccess: () => {
          Message.success("Đã lưu chiến lược")
          setSaveOpen(false)
          setSaveName("")
        },
        onError: () => Message.error("Lưu thất bại (tên có thể đã tồn tại)"),
      },
    )
  }

  const onCreateAlert = async () => {
    if (!alertName.trim()) {
      Message.warning("Nhập tên cảnh báo")
      return
    }
    if (buy.length === 0) {
      Message.warning("Cần ít nhất 1 tín hiệu MUA để tạo cảnh báo")
      return
    }
    setAlertSaving(true)
    try {
      await alertsApi.createRule({
        name: alertName.trim(),
        side: "buy",
        combination: {
          logic: buyLogic,
          conditions: buy.map((s) => {
            const f = factorsById[s.id]
            return {
              indicator: f.indicator,
              op: f.op,
              value: f.op === "is_true" ? null : (s.value ?? f.default),
            }
          }),
        },
      })
      Message.success("Đã tạo cảnh báo từ tín hiệu MUA")
      setAlertOpen(false)
      setAlertName("")
    } catch {
      Message.error("Tạo cảnh báo thất bại (kiểm tra gói Premium)")
    } finally {
      setAlertSaving(false)
    }
  }

  const templateMenu = (
    <Menu
      onClickMenuItem={(key) => {
        const tpl = catalog.templates.find((t: Template) => t.key === key)
        if (tpl) {
          applyConfig(tpl.config)
          Message.success(`Đã tải mẫu "${tpl.name}"`)
        }
      }}
    >
      {catalog.templates.map((t) => (
        <Menu.Item key={t.key}>{t.name}</Menu.Item>
      ))}
    </Menu>
  )

  const savedMenu = (
    <Menu
      onClickMenuItem={(key) => {
        const s = saved?.find((x) => x.id === key)
        if (s) {
          applyConfig(s.config)
          if (s.symbol) setSymbol(s.symbol)
          Message.success(`Đã tải "${s.name}"`)
        }
      }}
    >
      {(saved ?? []).map((s) => (
        <Menu.Item key={s.id}>
          <span className="flex items-center justify-between gap-4">
            {s.name}
            <span
              role="button"
              tabIndex={0}
              className="text-[var(--color-text-3)] hover:text-down"
              onClick={(e) => {
                e.stopPropagation()
                deleteStrategy.mutate(s.id)
              }}
            >
              ✕
            </span>
          </span>
        </Menu.Item>
      ))}
      {(saved ?? []).length === 0 && (
        <Menu.Item key="__empty" disabled>
          Chưa có chiến lược đã lưu
        </Menu.Item>
      )}
    </Menu>
  )

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--color-bg-1)]">
      {/* Toolbar */}
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--color-border-2)] bg-[var(--color-bg-2)] px-3 py-2.5 sm:px-5 sm:py-3">
        <div className="flex items-center gap-3">
          <Button size="small" className="lg:!hidden" onClick={() => setLibOpen(true)}>
            ☰ Chỉ tiêu
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Dropdown droplist={savedMenu} position="br">
            <Button size="small" icon={<IconDown />}>
              Đã lưu
            </Button>
          </Dropdown>
          <Dropdown droplist={templateMenu} position="br">
            <Button size="small" icon={<IconDown />}>
              Tải mẫu
            </Button>
          </Dropdown>
          <Button size="small" type="outline" icon={<IconSave />} onClick={() => setSaveOpen(true)}>
            Lưu strategy
          </Button>
          <Button size="small" onClick={() => setAlertOpen(true)}>
            Tạo cảnh báo
          </Button>
        </div>
      </header>

      {/* Body */}
      <div className="relative flex flex-1 overflow-hidden">
        <div
          className={`${
            libOpen ? "absolute inset-y-0 left-0 z-40 flex shadow-2xl" : "hidden"
          } lg:static lg:z-auto lg:flex`}
        >
          <FactorLibrary
            library={catalog.factors}
            selectedIds={selectedIds}
            onAdd={(f) => {
              addFactor(f)
              setLibOpen(false)
            }}
          />
        </div>
        {libOpen && (
          <div
            aria-hidden
            className="absolute inset-0 z-30 bg-black/50 lg:hidden"
            onClick={() => setLibOpen(false)}
          />
        )}

        <div className="flex-1 overflow-y-auto p-3 sm:p-5">
          <div className="mx-auto flex max-w-[1100px] flex-col gap-4">
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
              onLogicChange={changeLogic}
              onValueChange={changeValue}
              onRemove={removeFactor}
            />

            <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_240px]">
              <RiskConfig risk={risk} onChange={(patch) => setRisk((r) => ({ ...r, ...patch }))} />
              <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-[var(--color-border-3)] bg-[var(--color-fill-1)] p-4">
                <Button
                  long
                  type="primary"
                  size="large"
                  loading={run.isPending}
                  icon={run.isPending ? <IconLoading /> : <IconPlayArrow />}
                  onClick={onRun}
                  disabled={buy.length === 0}
                >
                  Chạy backtest
                </Button>
                <span className="text-center text-[11px] text-[var(--color-text-3)]">
                  {buy.length === 0 ? "Thêm tín hiệu MUA để chạy" : "Mô phỏng trên dữ liệu lịch sử"}
                </span>
              </div>
            </div>

            {run.data && <ResultsView result={run.data} />}
          </div>
        </div>
      </div>

      <Modal
        title="Lưu chiến lược"
        visible={saveOpen}
        onCancel={() => setSaveOpen(false)}
        onOk={onSave}
        confirmLoading={saveStrategy.isPending}
        okText="Lưu"
        cancelText="Hủy"
      >
        <Input placeholder="Tên chiến lược" value={saveName} onChange={setSaveName} onPressEnter={onSave} />
      </Modal>

      <Modal
        title="Tạo cảnh báo từ tín hiệu MUA"
        visible={alertOpen}
        onCancel={() => setAlertOpen(false)}
        onOk={onCreateAlert}
        confirmLoading={alertSaving}
        okText="Tạo"
        cancelText="Hủy"
      >
        <p className="mb-2 text-xs text-[var(--color-text-3)]">
          Cảnh báo sẽ kích hoạt khi tổ hợp tín hiệu MUA hiện tại xuất hiện trên các mã trong watchlist của bạn.
        </p>
        <Input placeholder="Tên cảnh báo" value={alertName} onChange={setAlertName} onPressEnter={onCreateAlert} />
      </Modal>
    </div>
  )
}
