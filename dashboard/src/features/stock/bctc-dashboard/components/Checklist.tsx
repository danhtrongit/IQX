export interface ChecklistItem {
  /** the yes/no question */
  label: string
  /** true → ✓ (khỏe) ; false → ! (cần theo dõi) */
  ok: boolean
  /** optional supporting detail line */
  detail?: string
}

export interface ChecklistProps {
  items: ChecklistItem[]
}

/**
 * Danh sách ✓ / ! (khối 6C): mỗi mục là 1 câu hỏi + trạng thái. Xanh = ổn,
 * vàng = cần theo dõi.
 */
export function Checklist({ items }: ChecklistProps) {
  return (
    <div className="bctc-checks">
      {items.map((item, i) => (
        <div className="bctc-chk" key={i}>
          <div
            className={`bctc-chk-ico ${item.ok ? "bctc-chk-ico--ok" : "bctc-chk-ico--warn"}`}
            aria-hidden="true"
          >
            {item.ok ? "✓" : "!"}
          </div>
          <div className="bctc-chk-body">
            <div className="bctc-chk-q">{item.label}</div>
            {item.detail ? <div className="bctc-chk-d">{item.detail}</div> : null}
          </div>
        </div>
      ))}
    </div>
  )
}
