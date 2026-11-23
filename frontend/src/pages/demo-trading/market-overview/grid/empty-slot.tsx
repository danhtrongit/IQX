import type { EmptyHole } from "../types"

export interface EmptySlotExpandable {
  uid: string
  widgetTitle: string
}

export interface EmptySlotProps {
  slot: EmptyHole
  expandable?: EmptySlotExpandable | null
  onAdd: (slot: EmptyHole) => void
  onExpand?: (uid: string, slot: EmptyHole) => void
}

export function EmptySlot({ slot, expandable, onAdd, onExpand }: EmptySlotProps) {
  if (slot.isEnd) {
    return (
      <div
        className="mo-slot end"
        data-slot-end="true"
        style={{
          gridColumn: "1 / -1",
          gridRow: `${slot.y + 1} / span 2`,
        }}
      >
        <button type="button" data-slotadd="true" onClick={() => onAdd(slot)}>
          ＋ Thêm widget
        </button>
      </div>
    )
  }

  const isCompact = slot.w < 3 || slot.h < 2

  return (
    <div
      className={isCompact ? "mo-slot sm" : "mo-slot"}
      data-slot-hole={`${slot.x},${slot.y},${slot.w},${slot.h}`}
      style={{
        gridColumn: `${slot.x + 1} / span ${slot.w}`,
        gridRow: `${slot.y + 1} / span ${slot.h}`,
      }}
    >
      <button
        type="button"
        data-slotadd="true"
        title="Thêm widget vào ô trống"
        aria-label={isCompact ? `Thêm widget vào ô trống ${slot.w}×${slot.h}` : undefined}
        onClick={() => onAdd(slot)}
      >
        ＋ Thêm widget
      </button>
      {expandable && onExpand && (
        <button
          type="button"
          data-slotgrow={expandable.uid}
          onClick={() => onExpand(expandable.uid, slot)}
        >
          Giãn {expandable.widgetTitle} ra đây
        </button>
      )}
      <small>
        {slot.w}×{slot.h}
      </small>
    </div>
  )
}
