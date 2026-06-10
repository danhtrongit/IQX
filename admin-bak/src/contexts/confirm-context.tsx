import {
  createContext,
  useCallback,
  useRef,
  useState,
  type ReactNode,
} from "react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { cn } from "@/lib/utils"

export interface ConfirmOptions {
  title?: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
}

interface ConfirmContextValue {
  confirm: (options: ConfirmOptions) => Promise<boolean>
}

export const ConfirmContext = createContext<ConfirmContextValue | null>(null)

interface ConfirmState extends ConfirmOptions {
  open: boolean
  resolve: ((value: boolean) => void) | null
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ConfirmState>({
    open: false,
    resolve: null,
  })

  const resolveRef = useRef<((value: boolean) => void) | null>(null)

  const confirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve
      setState({
        open: true,
        resolve,
        ...options,
      })
    })
  }, [])

  const handleClose = (confirmed: boolean) => {
    setState((prev) => ({ ...prev, open: false }))
    if (resolveRef.current) {
      resolveRef.current(confirmed)
      resolveRef.current = null
    }
  }

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      <AlertDialog open={state.open} onOpenChange={(open) => !open && handleClose(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{state.title ?? "Xác nhận"}</AlertDialogTitle>
            {state.description && (
              <AlertDialogDescription>{state.description}</AlertDialogDescription>
            )}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => handleClose(false)}>
              {state.cancelLabel ?? "Hủy"}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => handleClose(true)}
              className={cn(state.destructive && "bg-destructive text-destructive-foreground hover:bg-destructive/90")}
            >
              {state.confirmLabel ?? "Xác nhận"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ConfirmContext.Provider>
  )
}
