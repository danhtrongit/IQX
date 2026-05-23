import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"

interface TextViewerProps {
  markdown: string
}

export function TextViewer({ markdown }: TextViewerProps) {
  return (
    <article
      className={[
        "max-w-none px-4 py-6 text-foreground",
        "[&_h1]:text-2xl [&_h1]:font-bold [&_h1]:mb-4 [&_h1]:mt-6",
        "[&_h2]:text-xl [&_h2]:font-semibold [&_h2]:mb-3 [&_h2]:mt-5",
        "[&_h3]:text-lg [&_h3]:font-semibold [&_h3]:mb-2 [&_h3]:mt-4",
        "[&_h4]:text-base [&_h4]:font-semibold [&_h4]:mb-2 [&_h4]:mt-3",
        "[&_p]:my-3 [&_p]:leading-relaxed [&_p]:text-sm",
        "[&_ul]:my-3 [&_ul]:pl-5 [&_ul]:list-disc [&_ul]:space-y-1",
        "[&_ol]:my-3 [&_ol]:pl-5 [&_ol]:list-decimal [&_ol]:space-y-1",
        "[&_li]:text-sm [&_li]:leading-relaxed",
        "[&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2 [&_a:hover]:text-primary/80",
        "[&_blockquote]:border-l-4 [&_blockquote]:border-primary/40 [&_blockquote]:pl-4 [&_blockquote]:my-4 [&_blockquote]:text-muted-foreground [&_blockquote]:italic",
        "[&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-xs [&_code]:font-mono [&_code]:text-foreground",
        "[&_pre]:bg-muted [&_pre]:p-4 [&_pre]:rounded-lg [&_pre]:my-4 [&_pre]:overflow-x-auto",
        "[&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-xs",
        "[&_table]:w-full [&_table]:my-4 [&_table]:border-collapse [&_table]:text-sm",
        "[&_th]:border [&_th]:border-border [&_th]:px-3 [&_th]:py-2 [&_th]:bg-muted [&_th]:font-semibold [&_th]:text-left",
        "[&_td]:border [&_td]:border-border [&_td]:px-3 [&_td]:py-2",
        "[&_tr:nth-child(even)_td]:bg-muted/30",
        "[&_img]:max-w-full [&_img]:rounded-lg [&_img]:my-4",
        "[&_hr]:border-border [&_hr]:my-6",
        "[&_input[type=checkbox]]:mr-2",
      ].join(" ")}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown>
    </article>
  )
}
