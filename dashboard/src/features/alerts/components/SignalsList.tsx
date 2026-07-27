import { Button, Message, Spin, Tag } from "@arco-design/web-react"
import { useCreateRule, useDeleteRule, useRules, useSignals } from "../hooks"
import type { AlertSignal, UserAlertRule } from "../types"

export function SignalsList() {
  const { data: signals, isLoading } = useSignals()
  const { data: rules } = useRules()
  const createRule = useCreateRule()
  const deleteRule = useDeleteRule()

  if (isLoading) {
    return (
      <div className="flex h-32 items-center justify-center">
        <Spin />
      </div>
    )
  }

  const ruleFor = (key: string): UserAlertRule | undefined =>
    rules?.find((r) => r.base_signal_key === key)

  const onToggle = (signal: AlertSignal) => {
    const existing = ruleFor(signal.key)
    if (existing) {
      deleteRule.mutate(existing.id, { onSuccess: () => Message.success(`Đã bỏ theo dõi ${signal.ta_name}`) })
    } else {
      createRule.mutate(
        { signal_key: signal.key },
        { onSuccess: () => Message.success(`Đang theo dõi ${signal.ta_name}`) },
      )
    }
  }

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2" data-tour-id="tour-canhbao-signals">
      {(signals ?? []).map((s, i) => {
        const subscribed = !!ruleFor(s.key)
        const toggleButton = (
          <Button
            size="small"
            type={subscribed ? "outline" : "primary"}
            status={subscribed ? "danger" : "default"}
            loading={createRule.isPending || deleteRule.isPending}
            onClick={() => onToggle(s)}
          >
            {subscribed ? "Bỏ theo dõi" : "Theo dõi"}
          </Button>
        )
        return (
          <div
            key={s.key}
            className="flex items-center justify-between gap-3 rounded-lg border border-[var(--color-border-2)] bg-[var(--color-bg-2)] px-4 py-3"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Tag size="small" color={s.side === "buy" ? "green" : "red"}>
                  {s.side === "buy" ? "MUA" : "BÁN"}
                </Tag>
                <span className="truncate text-sm font-semibold text-[var(--color-text-1)]">{s.ta_name}</span>
              </div>
              <div className="mt-1 truncate text-xs text-[var(--color-text-3)]">{s.message_title}</div>
            </div>
            {i === 0 ? <div data-tour-id="tour-canhbao-signal-toggle">{toggleButton}</div> : toggleButton}
          </div>
        )
      })}
    </div>
  )
}
