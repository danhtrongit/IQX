import { useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router"
import {
  Alert,
  Grid,
  Input,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from "@arco-design/web-react"
import type { ColumnProps } from "@arco-design/web-react/es/Table"
import { StockLogo } from "@/features/navigation/StockLogo"
import { usePrices } from "@/features/market-data"
import { fmtNumber, fmtPercent, fmtPrice } from "@/shared/lib/format"
import { cn } from "@/shared/lib/cn"
import { IconBuilding } from "./icons"
import { useGroups, useSymbols } from "./hooks"
import type { DirectorySymbol, StockGroup } from "./types"

const { Row, Col } = Grid

const PAGE_SIZE = 20
const UNCLASSIFIED = "Chưa phân ngành"

/** Index groups offered in the group filter (mirrors backend VALID_GROUPS). */
const GROUP_OPTIONS: { label: string; value: StockGroup }[] = [
  { label: "VN30", value: "VN30" },
  { label: "VN100", value: "VN100" },
  { label: "HOSE", value: "HOSE" },
  { label: "HNX", value: "HNX" },
  { label: "HNX30", value: "HNX30" },
  { label: "UPCOM", value: "UPCOM" },
  { label: "VNMidCap", value: "VNMidCap" },
  { label: "VNSmallCap", value: "VNSmallCap" },
  { label: "VNAllShare", value: "VNAllShare" },
  { label: "ETF", value: "ETF" },
]

/** Resolve the industry bucket name for a symbol (icb_lv2 → icb_lv1 → fallback). */
function industryOf(item: DirectorySymbol): string {
  return item.icbLv2 || item.icbLv1 || UNCLASSIFIED
}

export default function StockDirectoryPage() {
  useEffect(() => {
    document.title = "Cổ phiếu theo ngành | IQX"
  }, [])

  const navigate = useNavigate()
  const { symbols, isLoading, isError, error } = useSymbols()

  const [query, setQuery] = useState("")
  const [group, setGroup] = useState<StockGroup | undefined>(undefined)
  const [industry, setIndustry] = useState<string | undefined>(undefined)
  const [page, setPage] = useState(1)

  const { tickerSet, isLoading: isGroupLoading } = useGroups(group ?? null)

  // Industry options derived from the loaded directory (self-consistent with
  // the rows' own icb fields, as in dashboard-bak).
  const industryOptions = useMemo(() => {
    const set = new Set<string>()
    for (const item of symbols) set.add(industryOf(item))
    return Array.from(set)
      .sort((a, b) => a.localeCompare(b, "vi"))
      .map((name) => ({ label: name, value: name }))
  }, [symbols])

  // Apply text / group / industry filters.
  const filtered = useMemo(() => {
    const text = query.trim().toLowerCase()
    return symbols.filter((item) => {
      if (group && !tickerSet.has(item.symbol)) return false
      if (industry && industryOf(item) !== industry) return false
      if (text) {
        const haystack = [
          item.symbol,
          item.name,
          item.shortName,
          item.exchange,
          item.icbLv1,
          item.icbLv2,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
        if (!haystack.includes(text)) return false
      }
      return true
    })
  }, [symbols, query, group, industry, tickerSet])

  // Reset to page 1 whenever the result set changes (render-time, no effect).
  const filterSignature = `${query}|${group ?? ""}|${industry ?? ""}`
  const [lastSignature, setLastSignature] = useState(filterSignature)
  if (filterSignature !== lastSignature) {
    setLastSignature(filterSignature)
    if (page !== 1) setPage(1)
  }

  // Current page slice → only subscribe to live prices for visible rows.
  const pageRows = useMemo(
    () => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filtered, page],
  )
  const pageSymbols = useMemo(() => pageRows.map((r) => r.symbol), [pageRows])
  const { priceMap } = usePrices(pageSymbols)

  const columns: ColumnProps<DirectorySymbol>[] = [
    {
      title: "Mã",
      dataIndex: "symbol",
      width: 188,
      sorter: (a, b) => a.symbol.localeCompare(b.symbol),
      render: (_, item) => (
        <div className="flex min-w-0 items-center gap-2">
          <span className="shrink-0">
            <StockLogo symbol={item.symbol} size={26} />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 whitespace-nowrap">
              <span className="font-bold text-[var(--color-text-1)]">{item.symbol}</span>
              {item.exchange && (
                <Tag size="small" color="arcoblue" bordered>
                  {item.exchange}
                </Tag>
              )}
            </div>
            <Typography.Text type="secondary" className="block truncate text-xs">
              {item.shortName || item.name || "—"}
            </Typography.Text>
          </div>
        </div>
      ),
    },
    {
      title: "Tên công ty",
      dataIndex: "name",
      ellipsis: true,
      sorter: (a, b) => (a.name ?? "").localeCompare(b.name ?? "", "vi"),
      render: (_, item) => (
        <Typography.Text className="text-[var(--color-text-2)]">
          {item.name || item.shortName || "—"}
        </Typography.Text>
      ),
    },
    {
      title: "Ngành",
      dataIndex: "industry",
      width: 180,
      ellipsis: true,
      sorter: (a, b) => industryOf(a).localeCompare(industryOf(b), "vi"),
      render: (_, item) => (
        <Typography.Text type="secondary" className="text-xs">
          {industryOf(item)}
        </Typography.Text>
      ),
    },
    {
      title: "Giá",
      dataIndex: "price",
      align: "right",
      width: 100,
      render: (_, item) => {
        const p = priceMap[item.symbol]
        if (!p) return <span className="text-[var(--color-text-3)]">—</span>
        const tone =
          p.priceChange > 0 ? "text-up" : p.priceChange < 0 ? "text-down" : "text-reference"
        return <span className={cn("font-medium tabular-nums", tone)}>{fmtPrice(p.closePrice)}</span>
      },
    },
    {
      title: "+/- (%)",
      dataIndex: "change",
      align: "right",
      width: 130,
      render: (_, item) => {
        const p = priceMap[item.symbol]
        if (!p) return <span className="text-[var(--color-text-3)]">—</span>
        const tone =
          p.priceChange > 0 ? "text-up" : p.priceChange < 0 ? "text-down" : "text-reference"
        const sign = p.priceChange > 0 ? "+" : ""
        return (
          <span className={cn("tabular-nums", tone)}>
            {sign}
            {fmtPrice(p.priceChange)} ({fmtPercent(p.percentChange)})
          </span>
        )
      },
    },
  ]

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-4">
      {/* Header + search */}
      <Row gutter={[16, 12]} align="center" justify="space-between">
        <Col flex="auto">
          <Space size={8} align="center">
            <IconBuilding className="text-[rgb(var(--primary-6))]" />
            <Typography.Title heading={5} style={{ margin: 0 }}>
              Danh mục cổ phiếu theo ngành
            </Typography.Title>
          </Space>
          <Typography.Text type="secondary" className="mt-1 block text-xs">
            {fmtNumber(symbols.length)} mã cổ phiếu · {fmtNumber(industryOptions.length)} ngành
          </Typography.Text>
        </Col>
        <Col flex="320px">
          <Input.Search
            allowClear
            value={query}
            onChange={setQuery}
            placeholder="Tìm mã, tên công ty hoặc ngành"
          />
        </Col>
      </Row>

      {/* Filters */}
      <Space size={8} wrap>
        <Select
          allowClear
          placeholder="Nhóm chỉ số"
          style={{ width: 180 }}
          value={group}
          onChange={(v) => setGroup(v)}
          options={GROUP_OPTIONS}
          loading={isGroupLoading}
        />
        <Select
          allowClear
          showSearch
          placeholder="Ngành"
          style={{ width: 240 }}
          value={industry}
          onChange={(v) => setIndustry(v)}
          options={industryOptions}
          filterOption={(input, option) =>
            String((option?.props as { value?: unknown })?.value ?? "")
              .toLowerCase()
              .includes(input.toLowerCase())
          }
        />
      </Space>

      {isError ? (
        <Alert
          type="error"
          content={error?.message || "Không thể tải danh mục cổ phiếu"}
        />
      ) : (
        <Table<DirectorySymbol>
          size="mini"
          rowKey="symbol"
          loading={isLoading}
          columns={columns}
          data={pageRows}
          border={{ wrapper: true, cell: false }}
          pagination={{
            current: page,
            pageSize: PAGE_SIZE,
            total: filtered.length,
            onChange: setPage,
            showTotal: true,
            sizeCanChange: false,
            hideOnSinglePage: false,
          }}
          noDataElement={
            <span className="text-[var(--color-text-3)]">Không có cổ phiếu phù hợp.</span>
          }
          onRow={(record) => ({
            onClick: () => navigate(`/co-phieu/${record.symbol}`),
            style: { cursor: "pointer" },
          })}
        />
      )}
    </div>
  )
}
