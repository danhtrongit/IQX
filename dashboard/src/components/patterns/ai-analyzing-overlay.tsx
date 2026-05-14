/**
 * "AI đang phân tích" loading overlay used by the AI Pattern panel.
 *
 * Renders a dark gradient panel with animated sparkles, a sweeping scan-line
 * over a stylised candle skeleton, and a typewriter-style status line that
 * cycles through three steps. Designed to feel like the model is actually
 * thinking rather than just a generic spinner.
 *
 * The overlay is dismissed by the parent after a short timeout (default
 * ~750ms) so the user perceives the click as "AI re-analysing the pattern"
 * before the new content fades in.
 */

import { useEffect, useState } from "react"
import { motion } from "framer-motion"
import { Sparkles, BrainCircuit, ScanLine } from "lucide-react"

const STEPS = [
  "Đang đọc dữ liệu giá...",
  "Đang nhận diện mẫu hình...",
  "Đang tạo khuyến nghị hành động...",
]

export function AIAnalyzingOverlay({ label }: { label?: string }) {
  const [step, setStep] = useState(0)

  useEffect(() => {
    const id = window.setInterval(() => {
      setStep((s) => (s + 1) % STEPS.length)
    }, 700)
    return () => window.clearInterval(id)
  }, [])

  return (
    <div className="flex flex-col items-center justify-center py-10 px-4">
      {/* Visual: candle skeleton with a scanning beam */}
      <div className="relative w-full max-w-[260px] aspect-[16/9] rounded-xl border border-primary/20 bg-gradient-to-br from-primary/8 via-background/60 to-background overflow-hidden mb-4">
        {/* Faint candles */}
        <svg viewBox="0 0 240 130" className="absolute inset-0 w-full h-full">
          {[
            { x: 24, t: 80, b: 50, w: 60, h: 95 },
            { x: 56, t: 60, b: 35, w: 45, h: 85 },
            { x: 88, t: 75, b: 30, w: 55, h: 92 },
            { x: 120, t: 45, b: 20, w: 38, h: 78 },
            { x: 152, t: 55, b: 25, w: 42, h: 86 },
            { x: 184, t: 30, b: 10, w: 30, h: 70 },
            { x: 216, t: 38, b: 18, w: 36, h: 76 },
          ].map((c, i) => (
            <g key={i} className="text-emerald-500">
              <line
                x1={c.x}
                x2={c.x}
                y1={c.h}
                y2={c.w}
                stroke="currentColor"
                strokeWidth={1}
                opacity={0.45}
              />
              <rect
                x={c.x - 4}
                y={c.t}
                width={8}
                height={c.b}
                fill="currentColor"
                opacity={0.4}
                rx={1}
              />
            </g>
          ))}
        </svg>

        {/* Sweeping scan beam */}
        <motion.div
          className="absolute inset-y-0 w-12 bg-gradient-to-r from-transparent via-primary/40 to-transparent blur-[2px]"
          initial={{ x: "-30%" }}
          animate={{ x: "130%" }}
          transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
        />
        {/* Scan-line */}
        <motion.div
          className="absolute inset-y-0 w-px bg-primary/70 shadow-[0_0_8px_2px_rgba(99,102,241,0.5)]"
          initial={{ x: "-10%" }}
          animate={{ x: "110%" }}
          transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
        />

        {/* Top-left badge */}
        <div className="absolute top-2 left-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-primary/15 border border-primary/30">
          <ScanLine className="size-3 text-primary" />
          <span className="text-[9px] font-bold text-primary uppercase tracking-wider">
            Scan
          </span>
        </div>

        {/* Floating sparkles */}
        {[
          { top: "18%", left: "14%", delay: 0 },
          { top: "62%", left: "78%", delay: 0.4 },
          { top: "32%", left: "55%", delay: 0.8 },
        ].map((s, i) => (
          <motion.div
            key={i}
            className="absolute text-primary"
            style={{ top: s.top, left: s.left }}
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: [0, 1, 0], scale: [0.5, 1, 0.5] }}
            transition={{ duration: 1.6, repeat: Infinity, delay: s.delay }}
          >
            <Sparkles className="size-3" />
          </motion.div>
        ))}
      </div>

      {/* Title */}
      <div className="flex items-center gap-1.5 mb-1.5">
        <motion.div
          animate={{ rotate: [0, 360] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: "linear" }}
        >
          <BrainCircuit className="size-3.5 text-primary" />
        </motion.div>
        <span className="text-xs font-bold text-foreground">
          {label ?? "AI đang phân tích"}
        </span>
      </div>

      {/* Cycling status with bouncing dots */}
      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
        <span>{STEPS[step]}</span>
        <span className="inline-flex gap-0.5">
          {[0, 1, 2].map((i) => (
            <motion.span
              key={i}
              className="inline-block size-1 rounded-full bg-primary/70"
              animate={{ opacity: [0.2, 1, 0.2], y: [0, -2, 0] }}
              transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.15 }}
            />
          ))}
        </span>
      </div>
    </div>
  )
}
