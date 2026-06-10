import { AnimatePresence, motion, useDragControls } from "framer-motion"
import { Button } from "@arco-design/web-react"
import { IconClose, IconDragDotVertical } from "@arco-design/web-react/icon"
import { useSidebar } from "@/shared/contexts/sidebar-context"
import { ForecastView } from "./ForecastView"

/**
 * Cửa sổ nổi kéo–thả cho "Mô hình dự báo" — nhân khuôn của AI Insight.
 * Open/close state lives in `useSidebar()` (`forecastWindowOpen` /
 * `closeForecastWindow`). Nội dung là `ForecastView`. KEEP framer-motion for the
 * draggable + spring-in animation.
 */
export function ForecastWindow() {
  const { forecastWindowOpen, closeForecastWindow } = useSidebar()
  const dragControls = useDragControls()

  return (
    <AnimatePresence>
      {forecastWindowOpen && (
        <div className="pointer-events-none fixed inset-0 z-[100] overflow-hidden">
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
            className="pointer-events-auto absolute flex flex-col overflow-hidden rounded-xl border border-[var(--color-border-2)] bg-[var(--color-bg-1)] shadow-2xl"
            style={{
              width: "min(1100px, calc(100vw - 16px))",
              height: "min(700px, calc(100vh - 24px))",
              top: "max(8px, calc(50vh - min(350px, 50vh - 12px)))",
              left: "max(8px, calc(50vw - min(550px, 50vw - 8px)))",
            }}
          >
            <div
              className="flex shrink-0 cursor-move items-center justify-between border-b border-[var(--color-border-2)] bg-[var(--color-bg-2)] px-4 py-2"
              onPointerDown={(e) => dragControls.start(e)}
            >
              <div className="flex items-center gap-2 text-[var(--color-text-3)]">
                <IconDragDotVertical style={{ fontSize: 16 }} />
                <span className="select-none text-xs font-bold uppercase tracking-wider text-[var(--color-text-1)]">
                  Mô hình dự báo
                </span>
              </div>
              <Button
                type="text"
                size="mini"
                icon={<IconClose />}
                aria-label="Đóng"
                onClick={(e) => {
                  e.stopPropagation()
                  closeForecastWindow()
                }}
                onPointerDown={(e) => e.stopPropagation()}
              />
            </div>

            <div className="relative min-h-0 flex-1 bg-[var(--color-bg-1)]">
              <ForecastView />
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
