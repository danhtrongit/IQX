import { AnimatePresence, motion, useDragControls } from "framer-motion"
import { GripHorizontal, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ForecastPage } from "./forecast-page"

/**
 * Cửa sổ nổi kéo–thả cho "Mô hình dự báo" — nhân khuôn của AI Insight
 * (xem dashboard/src/pages/stock.tsx). Nội dung là `ForecastPage`.
 */
export function ForecastWindow({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const dragControls = useDragControls()
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[100] pointer-events-none overflow-hidden">
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 24 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 24 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            drag
            dragControls={dragControls}
            dragListener={false}
            dragConstraints={{ top: 0, left: 0, right: 0, bottom: 0 }}
            dragMomentum={false}
            dragElastic={0.05}
            className="absolute flex flex-col bg-card/95 backdrop-blur-xl border border-border shadow-2xl rounded-xl overflow-hidden pointer-events-auto"
            style={{
              width: "min(1100px, calc(100vw - 16px))",
              height: "min(700px, calc(100vh - 24px))",
              top: "max(8px, calc(50vh - min(350px, 50vh - 12px)))",
              left: "max(8px, calc(50vw - min(550px, 50vw - 8px)))",
            }}
          >
            <div
              className="flex items-center justify-between px-4 py-2 bg-muted/30 border-b border-border cursor-move shrink-0"
              onPointerDown={(e) => dragControls.start(e)}
            >
              <div className="flex items-center gap-2 text-muted-foreground">
                <GripHorizontal className="size-4" />
                <span className="text-xs font-bold uppercase tracking-wider text-foreground select-none">
                  Mô hình dự báo
                </span>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="size-7 rounded-sm hover:bg-destructive/20 hover:text-destructive"
                onClick={(e) => {
                  e.stopPropagation()
                  onClose()
                }}
                onPointerDown={(e) => e.stopPropagation()}
              >
                <X className="size-4" />
              </Button>
            </div>

            <div className="flex-1 min-h-0 relative bg-background/50">
              <ForecastPage />
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
