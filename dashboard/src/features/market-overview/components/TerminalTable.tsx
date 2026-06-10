import { Table, type TableColumnProps } from "@arco-design/web-react"

// ─── TerminalTable ──────────────────────────────────────
// Arco Table (size="mini") in the dark "terminal" palette, replacing
// dashboard-bak's hand-rolled <table>. Used by the interbank / bond / FX panels.
// Column defs are passed in; the wrapper supplies dense styling + no pagination.

interface TerminalTableProps<T> {
  columns: TableColumnProps[]
  data: T[]
  rowKey: string
}

export function TerminalTable<T>({ columns, data, rowKey }: TerminalTableProps<T>) {
  return (
    <div className="mo-terminal-table">
      <Table
        size="mini"
        border={false}
        borderCell={false}
        pagination={false}
        columns={columns}
        data={data as Record<string, unknown>[]}
        rowKey={rowKey}
        scroll={{ x: false, y: false }}
      />
    </div>
  )
}
