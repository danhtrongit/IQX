export interface OfficeToastProps {
  message: string | null
}

export function OfficeToast({ message }: OfficeToastProps) {
  return (
    <div
      className={message ? "of-toast is-show" : "of-toast"}
      role="status"
      aria-live="polite"
      aria-atomic="true"
      data-testid="office-toast"
    >
      {message ?? ""}
    </div>
  )
}
