import { useEffect, useRef, useState, type RefObject } from "react"

/** Width of an element, tracked with ResizeObserver (a fixed fallback where it is unavailable). */
export function useElementWidth<T extends HTMLElement>(fallback = 640): [RefObject<T | null>, number] {
  const ref = useRef<T | null>(null)
  const [width, setWidth] = useState(fallback)
  useEffect(() => {
    const element = ref.current
    if (!element) return
    const read = () => {
      const next = Math.round(element.getBoundingClientRect().width)
      if (next > 0) setWidth((current) => (current === next ? current : next))
    }
    read()
    if (typeof ResizeObserver === "undefined") return
    const observer = new ResizeObserver(read)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  return [ref, width]
}
