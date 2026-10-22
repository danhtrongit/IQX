/**
 * Provider của màn chơi Flashback: chia sẻ một lượt chơi giữa vùng chính và panel phải, đúng
 * như cách lớp học và Shop chia sẻ trạng thái trong cùng một khung.
 */
import type { ReactNode } from "react"

import { FlashbackContext } from "./flashback-context"
import { useFlashbackController } from "./use-flashback-controller"

export function FlashbackProvider({ children }: { children: ReactNode }) {
  const value = useFlashbackController()
  return <FlashbackContext.Provider value={value}>{children}</FlashbackContext.Provider>
}
