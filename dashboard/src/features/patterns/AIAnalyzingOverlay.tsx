/**
 * "AI đang phân tích" loading overlay used by the AI Pattern panel.
 *
 * Renders a dark gradient panel with animated sparkles, a sweeping scan-line
 * over a stylised candle skeleton, and a status line that cycles through three
 * steps. Designed to feel like the model is actually thinking rather than a
 * generic spinner. The overlay is dismissed by the parent after a short timeout
 * (default ~750ms) so the click reads as "AI re-analysing the pattern" before
 * new content fades in.
 *
 * Ported from dashboard-bak (framer-motion preserved). lucide icons replaced
 * with the shared custom SVG set.
 */

import { useEffect, useState } from "react"
import { motion } from "framer-motion"
import { IconSparkles, IconBrainCircuit } from "@/shared/icons"

const STEPS = [
  "Đang đọc dữ liệu giá...",
  "Đang nhận diện mẫu hình...",
  "Đang tạo khuyến nghị hành động...",
]

/** Small scan-beam glyph (lucide ScanLine equivalent). */
function ScanLineIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M7 12h10" />
    </svg>
  )
}

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
      <div className="relative w-full max-w-[260px] aspect-[16/9] rounded-xl border border-[var(--color-primary-light-3)] bg-gradient-to-br from-[var(--color-primary-light-1)] via-[var(--color-bg-2)] to-[var(--color-bg-2)] overflow-hidden mb-4">
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
          className="absolute inset-y-0 w-12 bg-gradient-to-r from-transparent via-[var(--color-primary-light-4)] to-transparent blur-[2px]"
          initial={{ x: "-30%" }}
          animate={{ x: "130%" }}
          transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
        />
        {/* Scan-line */}
        <motion.div
          className="absolute inset-y-0 w-px bg-[rgb(var(--primary-6))] shadow-[0_0_8px_2px_rgba(99,102,241,0.5)]"
          initial={{ x: "-10%" }}
          animate={{ x: "110%" }}
          transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
        />

        {/* Top-left badge */}
        <div className="absolute top-2 left-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-[var(--color-primary-light-1)] border border-[var(--color-primary-light-3)]">
          <ScanLineIcon className="text-[rgb(var(--primary-6))]" />
          <span className="text-[9px] font-bold text-[rgb(var(--primary-6))] uppercase tracking-wider">
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
            <IconSparkles />
          </motion.div>
        ))}
      </div>

      {/* Title */}
      <div className="flex items-center gap-1.5 mb-1.5">
        <motion.div
          animate={{ rotate: [0, 360] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: "linear" }}
          className="text-[rgb(var(--primary-6))]"
        >
          <IconBrainCircuit />
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
              className="inline-block size-1 rounded-full bg-[rgb(var(--primary-6))]"
              animate={{ opacity: [0.2, 1, 0.2], y: [0, -2, 0] }}
              transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.15 }}
            />
          ))}
        </span>
      </div>
    </div>
  )
}
