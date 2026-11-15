import { useState } from "react"
import { LoaderCircle, Plus, X } from "lucide-react"

import { PanelState } from "@/components/layout/panel-state"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { errorMessage } from "@/lib/api"
import type { HanhConfig, HanhMau } from "@/pages/trading-floor/net/types"
import { HANH_COLOR, HANH_LABEL, HANH_ORDER } from "@/pages/trading-floor/than-tai"

import { useHanhList, useSaveHanh } from "./api"
import { isHex, parseNganh } from "./form"

/** Cấu hình 5 hành: ngành (lá quẻ hiện tối đa 4 ngành đầu), màu hợp và hướng. Quy tắc hợp/kiêng cố định theo sinh khắc. */
export function HanhTab() {
  const list = useHanhList()
  if (list.isLoading) {
    return (
      <div className="grid gap-3 lg:grid-cols-2">
        {HANH_ORDER.map((hanh) => (
          <Skeleton key={hanh} className="h-64 rounded-lg" />
        ))}
      </div>
    )
  }
  if (list.error) {
    return <PanelState title="Không tải được cấu hình ngũ hành" description={errorMessage(list.error)} action={{ label: "Thử lại", onClick: () => void list.refetch() }} />
  }
  const byHanh = new Map((list.data?.items ?? []).map((item) => [item.hanh, item]))
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Hợp = cùng hành với ngày và hành được ngày sinh ra; kiêng = hành bị ngày khắc và hành khắc ngày. Trên lá quẻ chỉ hiện 4 ngành
        đầu của mỗi hành, không bao giờ ghi mã.
      </p>
      <div className="grid gap-3 lg:grid-cols-2">
        {HANH_ORDER.map((hanh) => {
          const item = byHanh.get(hanh)
          return item ? <HanhCard key={`${hanh}-${item.updatedAt ?? 0}`} item={item} /> : null
        })}
      </div>
    </div>
  )
}

function HanhCard({ item }: { item: HanhConfig }) {
  const save = useSaveHanh()
  const [nganh, setNganh] = useState(item.nganh.join("\n"))
  const [mau, setMau] = useState<HanhMau[]>(item.mau)
  const [huong, setHuong] = useState(item.huong)

  const parsed = parseNganh(nganh)
  const mauValid = mau.every((m) => m.ten.trim() && isHex(m.hex))
  const dirty =
    parsed.join("\n") !== item.nganh.join("\n") || JSON.stringify(mau) !== JSON.stringify(item.mau) || huong.trim() !== item.huong
  const canSave = dirty && parsed.length > 0 && mauValid && huong.trim().length > 0 && !save.isPending
  const id = `tt-hanh-${item.hanh}`

  const setMauAt = (index: number, patch: Partial<HanhMau>) => setMau(mau.map((m, i) => (i === index ? { ...m, ...patch } : m)))

  return (
    <section className="space-y-3 rounded-lg bg-card p-4 ring-1 ring-border/60 ring-inset dark:ring-0" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className="flex items-center gap-2 font-heading text-base font-semibold">
        <span className="inline-block size-3 rounded-full" style={{ background: HANH_COLOR[item.hanh] }} />
        {HANH_LABEL[item.hanh]}
      </h2>
      <div className="space-y-1.5">
        <div className="flex items-baseline justify-between gap-2">
          <Label htmlFor={`${id}-nganh`}>Ngành (mỗi dòng một ngành)</Label>
          <span className="text-xs text-muted-foreground tabular-nums">{parsed.length} ngành · lá quẻ hiện 4 ngành đầu</span>
        </div>
        <Textarea id={`${id}-nganh`} rows={6} value={nganh} onChange={(e) => setNganh(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label>Màu hợp</Label>
        {mau.map((m, index) => (
          <div key={index} className="flex items-center gap-2">
            <input
              type="color"
              aria-label={`Chọn màu ${m.ten || index + 1}`}
              value={isHex(m.hex) ? m.hex : "#000000"}
              onChange={(e) => setMauAt(index, { hex: e.target.value })}
              className="h-8 w-10 shrink-0 cursor-pointer rounded-sm border border-input bg-transparent"
            />
            <Input aria-label="Tên màu" value={m.ten} onChange={(e) => setMauAt(index, { ten: e.target.value })} placeholder="Tên màu" />
            <Input
              aria-label="Mã màu"
              value={m.hex}
              onChange={(e) => setMauAt(index, { hex: e.target.value })}
              aria-invalid={!isHex(m.hex)}
              className="w-28 font-mono"
            />
            <Button type="button" size="icon-sm" variant="ghost" aria-label={`Bỏ màu ${m.ten}`} onClick={() => setMau(mau.filter((_, i) => i !== index))}>
              <X />
            </Button>
          </div>
        ))}
        <Button type="button" size="sm" variant="outline" disabled={mau.length >= 4} onClick={() => setMau([...mau, { ten: "", hex: "#d4a017" }])}>
          <Plus />
          Thêm màu
        </Button>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${id}-huong`}>Hướng</Label>
        <Input id={`${id}-huong`} value={huong} onChange={(e) => setHuong(e.target.value)} placeholder="Đông Bắc" />
      </div>
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={!dirty || save.isPending}
          onClick={() => {
            setNganh(item.nganh.join("\n"))
            setMau(item.mau)
            setHuong(item.huong)
          }}
        >
          Hoàn tác
        </Button>
        <Button
          type="button"
          disabled={!canSave}
          onClick={() => save.mutate({ hanh: item.hanh, patch: { nganh: parsed, mau: mau.map((m) => ({ ten: m.ten.trim(), hex: m.hex.trim() })), huong: huong.trim() } })}
        >
          {save.isPending && <LoaderCircle className="animate-spin" />}
          Lưu
        </Button>
      </div>
    </section>
  )
}
