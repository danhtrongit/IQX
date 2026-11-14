import { ui } from "../bridge.ts"
import { useStore } from "../use-store.ts"

export function Toasts() {
  const toasts = useStore(ui.toasts)
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.tone}`}>
          {t.text}
        </div>
      ))}
    </div>
  )
}
