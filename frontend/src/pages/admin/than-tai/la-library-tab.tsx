import { useMemo, useState } from "react"
import { Pencil, Search } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { errorMessage } from "@/lib/api"
import { AdminDataTable, type AdminColumn } from "@/pages/admin/core/components/admin-data-table"
import type { AdminLa, Hang } from "@/pages/trading-floor/net/types"
import { HANG_META, HANG_ORDER } from "@/pages/trading-floor/than-tai"

import { useLaList, useSaveLa } from "./api"
import { filterLa, type LaFilter } from "./form"
import { LaEditorDialog } from "./la-editor-dialog"

function HangSelect({ row, disabled, onChange }: { row: AdminLa; disabled: boolean; onChange: (hang: Hang) => void }) {
  return (
    <Select value={row.hang} disabled={disabled} onValueChange={(value) => onChange(value as Hang)}>
      <SelectTrigger size="sm" className="w-36" aria-label={`Hạng của lá ${row.queTen} · ${row.tenHao}`}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {HANG_ORDER.map((hang) => (
          <SelectItem key={hang} value={hang}>
            <span className="inline-block size-2.5 rounded-full" style={{ background: HANG_META[hang].color }} />
            {HANG_META[hang].label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

/** Bảng 64 quẻ với các lá (hào động) của chúng: sửa hạng và bật/tắt ngay trên dòng, nội dung trong hộp sửa. */
export function LaLibraryTab() {
  const list = useLaList()
  const save = useSaveLa()
  const [filter, setFilter] = useState<LaFilter>({ query: "", hang: "all", active: "all" })
  const [editingId, setEditingId] = useState<number | null>(null)

  const items = useMemo(() => list.data?.items ?? [], [list.data])
  const rows = useMemo(() => filterLa(items, filter), [items, filter])
  const editing = editingId === null ? undefined : items.find((item) => item.id === editingId)
  const activeCount = items.filter((item) => item.active).length
  const queCount = new Set(items.map((item) => item.queId)).size
  const savingId = save.isPending ? save.variables?.id : undefined

  const columns: AdminColumn<AdminLa>[] = [
    {
      id: "que",
      header: "Quẻ",
      cell: (row) => (
        <span className="block min-w-0">
          <span className="flex items-baseline gap-2">
            <span className="text-xs text-muted-foreground tabular-nums">#{row.queId}</span>
            <span className="font-medium">{row.queTen}</span>
            <span className="text-muted-foreground" lang="zh">
              {row.chuHan}
            </span>
          </span>
        </span>
      ),
    },
    {
      id: "hao",
      header: "Hào động",
      cell: (row) => (
        <span className="whitespace-nowrap">
          {row.tenHao} <span className="text-xs text-muted-foreground">({row.haoDong})</span>
        </span>
      ),
    },
    {
      id: "hang",
      header: "Hạng",
      cell: (row) => (
        <HangSelect row={row} disabled={savingId === row.id} onChange={(hang) => save.mutate({ id: row.id, patch: { hang } })} />
      ),
    },
    {
      id: "chot",
      header: "Lời chốt",
      className: "max-w-80",
      cell: (row) => <span className="line-clamp-2 text-sm">{row.chot || <span className="text-muted-foreground">Chưa có</span>}</span>,
    },
    {
      id: "active",
      header: "Bật",
      cell: (row) => (
        <Switch
          checked={row.active}
          disabled={savingId === row.id}
          aria-label={`${row.active ? "Tắt" : "Bật"} lá ${row.queTen} · ${row.tenHao}`}
          onCheckedChange={(active) => save.mutate({ id: row.id, patch: { active } })}
        />
      ),
    },
    {
      id: "actions",
      header: <span className="sr-only">Thao tác</span>,
      align: "right",
      cell: (row) => (
        <Button type="button" size="sm" variant="outline" onClick={() => setEditingId(row.id)}>
          <Pencil />
          Sửa
        </Button>
      ),
    },
  ]

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-72">
          <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={filter.query}
            onChange={(event) => setFilter({ ...filter, query: event.target.value })}
            placeholder="Tìm tên quẻ, chữ Hán, số quẻ, hào…"
            aria-label="Tìm lá quẻ"
            className="pl-8"
          />
        </div>
        <Select value={filter.hang} onValueChange={(value) => setFilter({ ...filter, hang: value as LaFilter["hang"] })}>
          <SelectTrigger className="w-40" aria-label="Lọc theo hạng">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Mọi hạng</SelectItem>
            {HANG_ORDER.map((hang) => (
              <SelectItem key={hang} value={hang}>
                {HANG_META[hang].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filter.active} onValueChange={(value) => setFilter({ ...filter, active: value as LaFilter["active"] })}>
          <SelectTrigger className="w-36" aria-label="Lọc theo trạng thái">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Bật và tắt</SelectItem>
            <SelectItem value="on">Đang bật</SelectItem>
            <SelectItem value="off">Đang tắt</SelectItem>
          </SelectContent>
        </Select>
        <span className="ml-auto flex flex-wrap gap-2 text-xs text-muted-foreground">
          <Badge variant="outline" className="tabular-nums">{queCount}/64 quẻ</Badge>
          <Badge variant="outline" className="tabular-nums">{activeCount}/{items.length} lá đang bật</Badge>
        </span>
      </div>

      <AdminDataTable
        columns={columns}
        rows={rows}
        rowKey={(row) => String(row.id)}
        loading={list.isLoading}
        error={list.error ? errorMessage(list.error) : null}
        onRetry={() => void list.refetch()}
        emptyLabel={items.length ? "Không có lá nào khớp bộ lọc." : "Thư viện chưa có lá nào."}
      />

      {editing && (
        <LaEditorDialog
          key={editing.id}
          la={editing}
          sameQue={items.filter((item) => item.queId === editing.queId).length}
          onClose={() => setEditingId(null)}
        />
      )}
    </div>
  )
}
