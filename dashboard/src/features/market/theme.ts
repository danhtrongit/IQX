// IQX Terminal theme variables — applied via inline style on the page wrapper.
// This keeps the dark terminal theme scoped to /thi-truong without touching index.css.

import type { CSSProperties } from "react";

export const terminalThemeVars: CSSProperties = {
  // Backgrounds
  "--iqx-bg-deep": "oklch(0.11 0.015 250)",
  "--iqx-bg-panel": "oklch(0.18 0.04 240)",
  "--iqx-bg-surface": "oklch(0.21 0.035 240)",
  "--iqx-bg-hover": "oklch(0.24 0.03 240)",

  // Borders
  "--iqx-border": "oklch(0.22 0.015 250)",
  "--iqx-border-subtle": "oklch(0.18 0.012 250)",

  // Text
  "--iqx-text-primary": "oklch(0.92 0.01 250)",
  "--iqx-text-secondary": "oklch(0.70 0.02 250)",
  "--iqx-text-muted": "oklch(0.55 0.02 250)",

  // Semantic colors
  "--iqx-green": "oklch(0.72 0.19 155)",
  "--iqx-red": "oklch(0.62 0.22 25)",
  "--iqx-gold": "oklch(0.78 0.14 85)",
  "--iqx-blue": "oklch(0.70 0.17 245)",
  "--iqx-purple": "oklch(0.68 0.16 300)",
  "--iqx-cyan": "oklch(0.78 0.14 210)",
} as CSSProperties;
