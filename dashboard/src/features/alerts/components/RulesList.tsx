import { Button, Empty, Message, Switch, Tag } from "@arco-design/web-react"
import { IconDelete } from "@arco-design/web-react/icon"
import { useDeleteRule, useRules, useUpdateRule } from "../hooks"

export function RulesList() {
  const { data: rules } = useRules()
  const updateRule = useUpdateRule()
  const deleteRule = useDeleteRule()

  if (!rules || rules.length === 0) {
    return (
      <div data-tour-id="tour-canhbao-rules">
        <Empty description="Chưa có cảnh báo nào. Theo dõi một tín hiệu ở trên để bắt đầu." />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2" data-tour-id="tour-canhbao-rules">
      {rules.map((r) => (
        <div
          key={r.id}
          className="flex items-center justify-between gap-3 rounded-lg border border-[var(--color-border-2)] bg-[var(--color-bg-2)] px-4 py-3"
        >
          <div className="flex min-w-0 items-center gap-3">
            <Switch
              size="small"
              checked={r.is_enabled}
              loading={updateRule.isPending}
              onChange={(checked) => updateRule.mutate({ id: r.id, body: { is_enabled: checked } })}
            />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Tag size="small" color={r.side === "buy" ? "green" : "red"}>
                  {r.side === "buy" ? "MUA" : "BÁN"}
                </Tag>
                <span className="truncate text-sm text-[var(--color-text-1)]">{r.name}</span>
              </div>
              <div className="mt-0.5 text-[11px] text-[var(--color-text-3)]">
                {r.base_signal_key ? `Mẫu: ${r.base_signal_key}` : "Tùy chỉnh"} ·{" "}
                {r.combination.conditions.length} điều kiện ({r.combination.logic})
              </div>
            </div>
          </div>
          <Button
            size="mini"
            type="text"
            status="danger"
            icon={<IconDelete />}
            onClick={() =>
              deleteRule.mutate(r.id, { onSuccess: () => Message.success("Đã xóa cảnh báo") })
            }
          />
        </div>
      ))}
    </div>
  )
}
