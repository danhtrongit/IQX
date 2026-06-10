import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"

interface TextViewerProps {
  markdown: string
}

/**
 * Renders markdown lesson bodies via react-markdown + remark-gfm, styled with
 * the `@tailwindcss/typography` `prose` plugin (dark-aware via `dark:prose-invert`,
 * which is wired to the same `arco-theme` attribute).
 */
export function TextViewer({ markdown }: TextViewerProps) {
  return (
    <article className="prose prose-sm dark:prose-invert max-w-none px-4 py-6">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown>
    </article>
  )
}
