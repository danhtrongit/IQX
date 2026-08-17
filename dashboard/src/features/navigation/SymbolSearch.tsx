import { useState } from "react"
import { useNavigate } from "react-router"
import { Select, Spin, Tag } from "@arco-design/web-react"
import { IconSearch } from "@arco-design/web-react/icon"
import { useSymbolSearch } from "@/features/market-data"
import { StockLogo } from "./StockLogo"
import { IconTrendingUp } from "./icons"

const { Option } = Select

export interface SymbolSearchProps {
  /**
   * ★★ Host chọn cái gì xảy ra khi người dùng chốt một mã.
   *
   * `undefined` (mặc định) = hành vi cũ: điều hướng sang `/co-phieu/:symbol`.
   * Đó là hành vi đúng trên /bieu-do và /co-phieu và KHÔNG được đổi.
   *
   * Có handler = đổi mã TẠI CHỖ. Chín trang cấp (`Cap0TradingPage`…
   * `Cap8TradingPage`) đều truyền `setSymbol` của `SymbolProvider` riêng của
   * chúng: `Header` nằm TRONG provider đó, nên đổi mã là một cú `setSymbol`
   * chứ không phải một cú rời trang. Trước bản vá này, gõ "ACB" vào ô tìm
   * kiếm của terminal là ném thẳng user khỏi `/dau-truong` — mất hành trình,
   * mất form kế hoạch đang gõ dở, panel đặt lệnh "về như cũ".
   *
   * Cùng khuôn với `CenterPanel.symbolChange` và `WatchlistPanel.onRowSelect`:
   * prop là kênh DUY NHẤT, nên một route không truyền gì thì không thể bị ảnh
   * hưởng.
   */
  onSymbolSelect?: (symbol: string) => void
}

/**
 * Global symbol typeahead. Arco `Select` in `showSearch` mode with server-side
 * filtering (`filterOption={false}`) backed by `useSymbolSearch`. Selecting a
 * row (or pressing Enter on free text) navigates to `/co-phieu/:symbol` —
 * unless the host supplied `onSymbolSelect` (see above).
 */
export function SymbolSearch({ onSymbolSelect }: SymbolSearchProps = {}) {
  const navigate = useNavigate()
  const [query, setQuery] = useState("")
  const { results, isFetching } = useSymbolSearch(query)

  const go = (symbol: string) => {
    const s = symbol.trim().toUpperCase()
    if (!s) return
    setQuery("")
    if (onSymbolSelect) {
      onSymbolSelect(s)
      return
    }
    navigate(`/co-phieu/${s}`)
  }

  return (
    <div
      data-tour-id="cap0-tour-symbol-search"
      className="w-28 min-w-0 shrink sm:w-44 md:w-60"
    >
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
      style={{ width: "100%" }}
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
      dropdownMenuStyle={{ maxHeight: 320, minWidth: 280, maxWidth: "calc(100vw - 24px)" }}
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
    </div>
  )
}
