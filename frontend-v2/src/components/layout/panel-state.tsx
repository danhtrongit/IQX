import { CircleAlert, LoaderCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"

export function PanelState({ title, description, loading = false, action }: { title: string; description?: string; loading?: boolean; action?: { label: string; onClick: () => void } }) {
  return (
    <Alert className="border-border bg-card">
      {loading ? <LoaderCircle className="animate-spin" /> : <CircleAlert />}
      <AlertTitle>{title}</AlertTitle>
      {description && <AlertDescription>{description}</AlertDescription>}
      {action && <div className="col-start-2 mt-3"><Button variant="outline" onClick={action.onClick}>{action.label}</Button></div>}
    </Alert>
  )
}
