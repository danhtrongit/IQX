/**
 * Markdown renderer for backend prose (BCTC AI memo + per-module notes).
 * No raw HTML is ever executed — `react-markdown` renders the markdown AST as
 * React elements, so an upstream-authored payload cannot inject markup.
 */
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"

import { cn } from "@/lib/utils"

export function MarkdownNote({ children, className }: { children: string; className?: string }) {
  return (
    <div
      className={cn(
        "text-xs leading-5 text-muted-foreground",
        "[&_p]:mb-2 [&_p]:last:mb-0 [&_strong]:font-semibold [&_strong]:text-foreground",
        "[&_ul]:mb-2 [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:mb-2 [&_ol]:list-decimal [&_ol]:pl-4 [&_li]:mb-0.5",
        "[&_h1]:mb-1 [&_h1]:font-heading [&_h1]:text-sm [&_h1]:font-bold [&_h1]:text-foreground",
        "[&_h2]:mb-1 [&_h2]:font-heading [&_h2]:text-sm [&_h2]:font-bold [&_h2]:text-foreground",
        "[&_h3]:mb-1 [&_h3]:font-heading [&_h3]:text-xs [&_h3]:font-bold [&_h3]:text-foreground",
        "[&_code]:rounded-sm [&_code]:bg-muted [&_code]:px-1 [&_code]:tabular-nums",
        "[&_table]:w-full [&_table]:border-collapse [&_th]:border-b [&_th]:border-border [&_th]:py-1 [&_th]:text-left [&_th]:font-semibold [&_th]:text-foreground",
        "[&_td]:border-b [&_td]:border-border/60 [&_td]:py-1 [&_a]:text-primary [&_a]:underline",
        className,
      )}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
    </div>
  )
}
