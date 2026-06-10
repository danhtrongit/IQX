import { useState } from "react"
import { useNavigate } from "react-router"
import { Select, Spin, Tag } from "@arco-design/web-react"
import { IconSearch } from "@arco-design/web-react/icon"
import { useSymbolSearch } from "@/features/market-data"
import { StockLogo } from "./StockLogo"
import { IconTrendingUp } from "./icons"

const { Option } = Select

/**
 * Global symbol typeahead. Arco `Select` in `showSearch` mode with server-side
 * filtering (`filterOption={false}`) backed by `useSymbolSearch`. Selecting a
 * row (or pressing Enter on free text) navigates to `/co-phieu/:symbol`.
 */
export function SymbolSearch() {
  const navigate = useNavigate()
  const [query, setQuery] = useState("")
  const { results, isFetching } = useSymbolSearch(query)

  const go = (symbol: string) => {
    const s = symbol.trim().toUpperCase()
    if (!s) return
    setQuery("")
    navigate(`/co-phieu/${s}`)
  }

  return (
    <Select
      showSearch
      filterOption={false}
      allowClear
      value={undefined}
      inputValue={query}
      placeholder="Tìm mã CK, tin tức..."
      notFoundContent={
        isFetching ? (
          <div className="flex justify-center py-2">
            <Spin size={14} />
          </div>
        ) : query ? (
          <div className="py-2 text-center text-xs text-[var(--color-text-3)]">
            Không tìm thấy mã phù hợp
          </div>
        ) : null
      }
      loading={isFetching}
      prefix={<IconSearch />}
      style={{ width: 240 }}
      arrowIcon={null}
      onSearch={setQuery}
      onChange={(value) => value && go(value)}
      onInputValueChange={(v, reason) => {
        if (reason === "manual") setQuery(v)
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" && results.length === 0 && query.trim()) {
          e.preventDefault()
          go(query)
        }
      }}
      triggerProps={{ autoAlignPopupWidth: false }}
      dropdownMenuStyle={{ maxHeight: 320, minWidth: 320 }}
    >
      {results.map((stock) => (
        <Option key={stock.symbol} value={stock.symbol}>
          <div className="flex items-center gap-2.5 py-0.5">
            <StockLogo symbol={stock.symbol} size={26} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-semibold">{stock.symbol}</span>
                {stock.exchange && (
                  <Tag size="small" bordered className="!h-4 !px-1 !text-[9px] !leading-4">
                    {stock.exchange}
                  </Tag>
                )}
              </div>
              <p className="truncate text-[10px] text-[var(--color-text-3)]">
                {stock.name || stock.nameEn || ""}
              </p>
            </div>
            <IconTrendingUp className="shrink-0 text-[var(--color-text-4)]" />
          </div>
        </Option>
      ))}
    </Select>
  )
}
