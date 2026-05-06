// ─── Shared dark-terminal table styles for cards 13/14/15 ──
// Used by InterbankRatesPanel, BondYieldsPanel, FXRatesPanel
// to ensure a unified, review-matching table appearance.

import type { ReactNode } from "react";

/** Table wrapper — 100% width, dark terminal */
export function TerminalTable({ children }: { children: ReactNode }) {
  return (
    <table className="w-full border-collapse text-[11px] text-slate-100">
      {children}
    </table>
  );
}

/** <thead> with bottom border */
export function TTHead({ children }: { children: ReactNode }) {
  return (
    <thead className="border-b border-slate-800">
      {children}
    </thead>
  );
}

/** Header cell */
export function TTH({
  children,
  align = "right",
  className = "",
}: {
  children: ReactNode;
  align?: "left" | "right" | "center";
  className?: string;
}) {
  const textAlign =
    align === "left" ? "text-left" : align === "center" ? "text-center" : "text-right";
  return (
    <th
      className={`text-[9px] font-bold text-slate-400 uppercase tracking-wider px-2.5 py-2 ${textAlign} ${className}`}
    >
      {children}
    </th>
  );
}

/** Body row with thin bottom border + hover */
export function TTRow({ children }: { children: ReactNode }) {
  return (
    <tr className="border-b border-slate-800/80 hover:bg-cyan-950/30 transition-colors">
      {children}
    </tr>
  );
}

/** Body cell — consistent padding, tabular nums */
export function TTD({
  children,
  align = "right",
  className = "",
}: {
  children: ReactNode;
  align?: "left" | "right" | "center";
  className?: string;
}) {
  const textAlign =
    align === "left" ? "text-left" : align === "center" ? "text-center" : "text-right";
  return (
    <td
      className={`px-2.5 py-1.5 text-[12px] tabular-nums ${textAlign} ${className}`}
    >
      {children}
    </td>
  );
}
