import { CircleAlert, LoaderCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"

/** `descriptionClassName` overrides the muted description colour (Học viện reader and quiz use text-academy-subtle). */
export function PanelState({
  title,
  description,
  descriptionClassName,
  loading = false,
  action,
}: {
  title: string
  description?: string
  descriptionClassName?: string
  loading?: boolean
  action?: { label: string; onClick: () => void }
}) {
  return (
    <Alert className="border-border bg-card">
      {loading ? <LoaderCircle className="animate-spin" /> : <CircleAlert />}
      <AlertTitle>{title}</AlertTitle>
      {description && <AlertDescription className={descriptionClassName}>{description}</AlertDescription>}
      {action && <div className="col-start-2 mt-3"><Button variant="outline" onClick={action.onClick}>{action.label}</Button></div>}
    </Alert>
  )
}
