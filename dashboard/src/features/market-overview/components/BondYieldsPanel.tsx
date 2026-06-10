import { Skeleton, type TableColumnProps } from "@arco-design/web-react"
import { Panel } from "./Panel"
import { TerminalTable } from "./TerminalTable"
import { useBondYields } from "../hooks"
import { changeColor } from "../utils"
import { IconLandmark } from "../icons"
import type { SheetRateRow } from "../types"

const columns: TableColumnProps<SheetRateRow>[] = [
  {
    title: "Kỳ hạn",
    dataIndex: "tenor",
    render: (v: string) => <span className="font-bold text-[var(--color-text-1)]">{v}</span>,
  },
  {
    title: "Hôm nay",
    dataIndex: "today",
    align: "right",
    render: (v: string) => <span className="font-semibold text-[var(--color-text-1)] tabular-nums">{v}</span>,
  },
  {
    title: "Hôm qua",
    dataIndex: "yesterday",
    align: "right",
    render: (v: string) => <span className="font-medium text-[var(--color-text-2)] tabular-nums">{v}</span>,
  },
  {
    title: "Chênh lệch Points",
    dataIndex: "change",
    align: "right",
    render: (v: string, row: SheetRateRow) => {
      const isNoChange = row.change === "-"
      return (
        <span
          className={`font-bold tabular-nums ${
            isNoChange ? "text-reference" : changeColor(row.changeNumeric ?? 0)
          }`}
        >
          {v}
        </span>
      )
    },
  },
]

export function BondYieldsPanel() {
  const { data: rows, loading } = useBondYields()
  const source = loading ? "mock" : "live"

  return (
    <Panel
      title="Lãi suất TPCP"
      source={source}
      icon={<IconLandmark className="text-[rgb(var(--primary-6))]" />}
    >
      {loading && rows.length === 0 ? (
        <div className="space-y-2 p-1">
          <Skeleton animation text={{ rows: 5 }} image={false} />
        </div>
      ) : rows.length === 0 ? (
        <div className="text-center text-[var(--color-text-3)] text-xs py-8">
          Không có dữ liệu lãi suất TPCP.
        </div>
      ) : (
        <TerminalTable columns={columns} data={rows} rowKey="tenor" />
      )}
    </Panel>
  )
}
