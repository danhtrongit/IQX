import {
  ChartCandlestick,
  ConciergeBell,
  Inbox,
  Landmark,
  MessagesSquare,
  type LucideIcon,
} from "lucide-react"
import { useCallback } from "react"

import { ui, type Panel } from "../bridge.ts"
import { ChatPanel } from "./panels/ChatPanel.tsx"
import { MarketPanel } from "./panels/MarketPanel.tsx"
import { ReceptionPanel } from "./panels/ReceptionPanel.tsx"
import { ThanTaiPanel } from "./panels/ThanTaiPanel.tsx"
import { Sheet } from "./Sheet.tsx"

const TITLES: Record<Panel["kind"], [LucideIcon, string]> = {
  thantai: [Landmark, "Thần Tài"],
  market: [ChartCandlestick, "Thị trường"],
  reception: [ConciergeBell, "Lễ tân · Hướng dẫn"],
  chat: [MessagesSquare, "Chat SACO"],
}

export function PanelHost({ panel }: { panel: Panel }) {
  const close = useCallback(() => ui.panel.set(null), [])
  const sacoInbox = panel.kind === "chat" && panel.data?.side === "saco"
  const [Icon, title] = sacoInbox ? [Inbox, "Hộp thư SACO"] : TITLES[panel.kind]
  const isChat = panel.kind === "chat"
  return (
    <Sheet
      title={title}
      icon={<Icon size={20} />}
      onClose={close}
      wide={panel.kind === "market" || panel.kind === "thantai" || isChat}
      bodyClass={
        isChat
          ? "sheet-chat"
          : panel.kind === "thantai"
            ? "tt-sheet"
            : undefined
      }
    >
      {panel.kind === "thantai" && <ThanTaiPanel />}
      {panel.kind === "market" && <MarketPanel />}
      {panel.kind === "reception" && <ReceptionPanel />}
      {isChat && (
        <ChatPanel
          side={sacoInbox ? "saco" : "user"}
          convId={
            typeof panel.data?.convId === "string"
              ? panel.data.convId
              : undefined
          }
        />
      )}
    </Sheet>
  )
}
