/**
 * Mount once next to the workspace. It owns the demo engine heartbeat
 * (`POST /virtual-trading/refresh`) and its only visible surface: silent while
 * it works, explicit when it cannot, because pending orders, settlements and
 * rights only land when this heartbeat runs.
 */
import { Button } from "@/components/ui/button"

import { useEngineRefresh } from "./use-engine-refresh"

export function TradingRuntime() {
  const engine = useEngineRefresh()

  return (
    <>
      {engine.state.status === "error" && (
        <div role="alert" className="fixed bottom-4 left-4 z-40 w-72 max-w-[calc(100vw-2rem)] space-y-1.5 rounded-lg border border-price-down/50 bg-card p-2 text-xs">
          <p>Không cập nhật được trạng thái lệnh: {engine.state.message}</p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            onClick={() => void engine.refresh({ force: true })}
          >
            Thử lại
          </Button>
        </div>
      )}
      {engine.state.status === "ok" && engine.state.warnings.length > 0 && (
        <div role="status" className="fixed bottom-4 left-4 z-40 w-72 max-w-[calc(100vw-2rem)] rounded-lg border border-price-ceiling/50 bg-card p-2 text-xs">
          <p className="text-muted-foreground">{engine.state.warnings[0]}</p>
        </div>
      )}
    </>
  )
}
