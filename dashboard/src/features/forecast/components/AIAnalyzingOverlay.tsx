import { useEffect, useState } from "react"
import { motion } from "framer-motion"
import { IconBrainCircuit, IconScanLine, IconSparkles } from "../icons"

/**
 * "AI đang phân tích" loading overlay — a dark gradient panel with animated
 * sparkles, a sweeping scan-line over a stylised candle skeleton and a
 * typewriter-style status line cycling through three steps. Ported from
 * `dashboard-bak/src/components/patterns/ai-analyzing-overlay.tsx`.
 */

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
      <div className="relative mb-4 aspect-[16/9] w-full max-w-[260px] overflow-hidden rounded-xl border border-[rgb(var(--primary-6))]/20 bg-gradient-to-br from-[rgb(var(--primary-6))]/10 via-[var(--color-bg-2)]/60 to-[var(--color-bg-1)]">
        {/* Faint candles */}
        <svg viewBox="0 0 240 130" className="absolute inset-0 h-full w-full">
          {[
            { x: 24, t: 80, b: 50, w: 60, h: 95 },
            { x: 56, t: 60, b: 35, w: 45, h: 85 },
            { x: 88, t: 75, b: 30, w: 55, h: 92 },
            { x: 120, t: 45, b: 20, w: 38, h: 78 },
            { x: 152, t: 55, b: 25, w: 42, h: 86 },
            { x: 184, t: 30, b: 10, w: 30, h: 70 },
            { x: 216, t: 38, b: 18, w: 36, h: 76 },
          ].map((c, i) => (
            <g key={i} className="text-up">
              <line
                x1={c.x}
                x2={c.x}
                y1={c.h}
                y2={c.w}
                stroke="currentColor"
                strokeWidth={1}
                opacity={0.45}
              />
              <rect x={c.x - 4} y={c.t} width={8} height={c.b} fill="currentColor" opacity={0.4} rx={1} />
            </g>
          ))}
        </svg>

        {/* Sweeping scan beam */}
        <motion.div
          className="absolute inset-y-0 w-12 bg-gradient-to-r from-transparent via-[rgb(var(--primary-6))]/40 to-transparent blur-[2px]"
          initial={{ x: "-30%" }}
          animate={{ x: "130%" }}
          transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
        />
        {/* Scan-line */}
        <motion.div
          className="absolute inset-y-0 w-px bg-[rgb(var(--primary-6))]/70 shadow-[0_0_8px_2px_rgba(99,102,241,0.5)]"
          initial={{ x: "-10%" }}
          animate={{ x: "110%" }}
          transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
        />

        {/* Top-left badge */}
        <div className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full border border-[rgb(var(--primary-6))]/30 bg-[rgb(var(--primary-6))]/15 px-1.5 py-0.5">
          <IconScanLine className="text-[rgb(var(--primary-6))]" style={{ fontSize: 12 }} />
          <span className="text-[9px] font-bold uppercase tracking-wider text-[rgb(var(--primary-6))]">
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
            className="absolute text-[rgb(var(--primary-6))]"
            style={{ top: s.top, left: s.left }}
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: [0, 1, 0], scale: [0.5, 1, 0.5] }}
            transition={{ duration: 1.6, repeat: Infinity, delay: s.delay }}
          >
            <IconSparkles style={{ fontSize: 12 }} />
          </motion.div>
        ))}
      </div>

      {/* Title */}
      <div className="mb-1.5 flex items-center gap-1.5">
        <motion.div
          animate={{ rotate: [0, 360] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: "linear" }}
        >
          <IconBrainCircuit className="text-[rgb(var(--primary-6))]" style={{ fontSize: 14 }} />
        </motion.div>
        <span className="text-xs font-bold text-[var(--color-text-1)]">
          {label ?? "AI đang phân tích"}
        </span>
      </div>

      {/* Cycling status with bouncing dots */}
      <div className="flex items-center gap-1.5 text-[10px] text-[var(--color-text-3)]">
        <span>{STEPS[step]}</span>
        <span className="inline-flex gap-0.5">
          {[0, 1, 2].map((i) => (
            <motion.span
              key={i}
              className="inline-block size-1 rounded-full bg-[rgb(var(--primary-6))]/70"
              animate={{ opacity: [0.2, 1, 0.2], y: [0, -2, 0] }}
              transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.15 }}
            />
          ))}
        </span>
      </div>
    </div>
  )
}
