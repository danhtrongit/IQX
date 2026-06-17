import { Empty, Tag } from "@arco-design/web-react"
import { useEvents } from "../hooks"

export function EventsList() {
  const { data: events } = useEvents()

  if (!events || events.length === 0) {
    return <Empty description="Chưa có tín hiệu nào được bắn." />
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[12px]">
        <thead>
          <tr className="text-[10.5px] uppercase tracking-wide text-[var(--color-text-3)]">
            <th className="border-b border-[var(--color-border-2)] px-2.5 py-2 text-left">Thời gian</th>
            <th className="border-b border-[var(--color-border-2)] px-2.5 py-2 text-left">Mã</th>
            <th className="border-b border-[var(--color-border-2)] px-2.5 py-2 text-left">Tín hiệu</th>
            <th className="border-b border-[var(--color-border-2)] px-2.5 py-2 text-right">Giá</th>
            <th className="border-b border-[var(--color-border-2)] px-2.5 py-2 text-left">Gửi</th>
          </tr>
        </thead>
        <tbody className="font-mono">
          {events.map((e) => (
            <tr key={e.id} className="hover:bg-[var(--color-fill-1)]">
              <td className="border-b border-[var(--color-border-1)] px-2.5 py-2">
                {new Date(e.fired_at).toLocaleString("vi-VN")}
              </td>
              <td className="border-b border-[var(--color-border-1)] px-2.5 py-2 font-semibold">{e.symbol}</td>
              <td className="border-b border-[var(--color-border-1)] px-2.5 py-2 text-[var(--color-text-2)]">
                {e.signal_key ?? "—"}
              </td>
              <td className="border-b border-[var(--color-border-1)] px-2.5 py-2 text-right">
                {e.price == null ? "—" : Math.round(e.price).toLocaleString("vi-VN")}
              </td>
              <td className="border-b border-[var(--color-border-1)] px-2.5 py-2">
                <Tag size="small" color={e.delivered ? "green" : "gray"}>
                  {e.delivered ? "Đã gửi" : "Chưa"}
                </Tag>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
