import { useState } from "react"
import { Check, Copy } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface CopyButtonProps {
  text: string
  label?: string
  successMessage?: string
  className?: string
  size?: "sm" | "default" | "lg" | "icon"
  variant?: "ghost" | "outline" | "default" | "secondary"
}

export function CopyButton({
  text,
  label,
  successMessage = "Đã sao chép",
  className,
  size = "icon",
  variant = "ghost",
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      toast.success(successMessage)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error("Không thể sao chép")
    }
  }

  if (label) {
    return (
      <Button
        variant={variant}
        size={size === "icon" ? "sm" : size}
        onClick={() => { void handleCopy() }}
        className={cn("gap-1.5", className)}
      >
        {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
        {label}
      </Button>
    )
  }

  return (
    <Button
      variant={variant}
      size="icon"
      onClick={() => { void handleCopy() }}
      className={cn("size-7", className)}
      title="Sao chép"
    >
      {copied ? (
        <Check className="size-3.5 text-green-500" />
      ) : (
        <Copy className="size-3.5" />
      )}
    </Button>
  )
}
