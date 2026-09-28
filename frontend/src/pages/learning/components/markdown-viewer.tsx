import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"

/**
 * Kiểu chữ cho nội dung bài đọc. Dự án không dùng plugin typography nên các
 * thẻ do markdown sinh ra được tạo kiểu qua lớp con (`[&_h2]:…`).
 */
const PROSE = [
  "max-w-none text-sm leading-6 text-foreground",
  "[&_h1]:mt-6 [&_h1]:mb-3 [&_h1]:font-heading [&_h1]:text-lg [&_h1]:font-semibold",
  "[&_h2]:mt-6 [&_h2]:mb-2 [&_h2]:font-heading [&_h2]:text-base [&_h2]:font-semibold",
  "[&_h3]:mt-5 [&_h3]:mb-2 [&_h3]:text-sm [&_h3]:font-semibold",
  "[&_h4]:mt-4 [&_h4]:mb-2 [&_h4]:text-sm [&_h4]:font-semibold",
  "[&_h1]:first:mt-0 [&_h2]:first:mt-0 [&_p]:first:mt-0",
  "[&_p]:my-3 [&_strong]:font-semibold",
  "[&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-1",
  "[&_a]:text-primary [&_a]:underline [&_a]:underline-offset-4",
  "[&_blockquote]:my-4 [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground",
  "[&_code]:rounded-sm [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-xs",
  "[&_pre]:my-4 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-muted [&_pre]:p-3 [&_pre]:text-xs",
  "[&_pre_code]:bg-transparent [&_pre_code]:p-0",
  "[&_img]:my-4 [&_img]:rounded-lg",
  "[&_hr]:my-5 [&_hr]:border-border",
  "[&_table]:my-4 [&_table]:w-full [&_table]:text-xs",
  "[&_th]:border-b [&_th]:border-border [&_th]:px-2 [&_th]:py-1.5 [&_th]:text-left [&_th]:font-semibold",
  "[&_td]:border-b [&_td]:border-border [&_td]:px-2 [&_td]:py-1.5",
].join(" ")

/**
 * Nội dung bài đọc (markdown) của bài học.
 *
 * react-markdown chỉ dựng cây React từ cú pháp markdown — HTML thô trong
 * `markdown_body` không được thực thi, và URL được lọc qua `defaultUrlTransform`
 * nên `javascript:` không lọt được vào `href`. Nội dung do quản trị viên soạn
 * vì vậy vẫn an toàn khi hiển thị cho người học.
 */
export function MarkdownViewer({ markdown, className }: { markdown: string; className?: string }) {
  return (
    <article className={`${PROSE} ${className ?? ""}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown>
    </article>
  )
}
