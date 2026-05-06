// ─── Utility: Format VND ─────────────────────────────────

export function formatVND(value: number): string {
  if (Math.abs(value) >= 1e12) return `${(value / 1e12).toFixed(1)}T`;
  if (Math.abs(value) >= 1e9) return `${(value / 1e9).toFixed(1)}B`;
  if (Math.abs(value) >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
  return value.toLocaleString("vi-VN");
}

// ─── Utility: Format number with locale ──────────────────

export function formatNumber(value: number): string {
  return value.toLocaleString("vi-VN");
}

// ─── Utility: Color class for positive/negative ──────────

export function changeColor(value: number): string {
  if (value > 0) return "text-emerald-300";
  if (value < 0) return "text-red-400";
  return "text-yellow-300";
}

// ─── Utility: Change arrow ───────────────────────────────

export function changeArrow(value: number): string {
  if (value > 0) return "▲";
  if (value < 0) return "▼";
  return "■";
}

// ─── Utility: Format VND in tỷ ───────────────────────────
// Always displays value in tỷ (1e9) with Vietnamese suffix.
// e.g. 1_245_000_000_000 → "1,245.0 tỷ"

export function formatVndBillion(value: number): string {
  const billions = value / 1e9;
  return `${billions.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} tỷ`;
}

// ─── Utility: Format share volume ────────────────────────
// e.g. 850_000_000 → "850.0 triệu cp", 1_200_000_000 → "1.2 tỷ cp"

export function formatVolume(value: number): string {
  if (Math.abs(value) >= 1e9) {
    return `${(value / 1e9).toFixed(1)} tỷ cp`;
  }
  return `${(value / 1e6).toFixed(1)} triệu cp`;
}

// ─── Utility: Truncate ticker for bar-chart rows ─────────
// Keeps max 3 characters so the bar column starts at a consistent x-offset.
// Full symbol is preserved in the data and shown via title tooltip.

export function displayTicker(symbol: string): string {
  return symbol.trim().toUpperCase().slice(0, 3);
}

// ─── Utility: Format index impact point ──────────────────
// Contribution is index-impact points, not VND.
// e.g. 1.25 → "+1.25đ", -0.84 → "-0.84đ"

export function formatImpactPoint(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}đ`;
}

// ─── Utility: Format percent with Vietnamese comma ───────
// 5.5 → "5,50%", -3.1 → "-3,10%", 0 → "0,00%"

export function formatPercent(value: number): string {
  return (
    value.toLocaleString("vi-VN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }) + "%"
  );
}

// ─── Layout constants ────────────────────────────────────

export const MASCOT_HEIGHT = 190;
export const CHART_HEIGHT = 300;
