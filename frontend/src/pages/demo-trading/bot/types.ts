/**
 * Wire types of the Bot tool. Bot reads come straight from the generated
 * contract; the shared-config types live in `config/types.ts`.
 */
import type {
  BotConditions,
  BotIssue,
  BotOverview,
  BotPosition,
  BotPositions,
  GetBotJournalSessionResponses,
  GetBotTradesResponses,
  ListBotJournalSessionsResponses,
  ListStrategySavedListsResponses,
} from "@/lib/generated"

export type { BotConditions, BotIssue, BotOverview, BotPosition, BotPositions }

/** One page of closed round trips (`GET /bot/trades`) and one trade of it. */
export type BotTradesPage = GetBotTradesResponses[200]
export type BotTrade = BotTradesPage["items"][number]

/** One page of trading sessions (`GET /bot/journal/sessions`) and one session of it. */
export type BotSessionsPage = ListBotJournalSessionsResponses[200]
export type BotSession = BotSessionsPage["items"][number]

/** The decisions of one session (`GET /bot/journal/sessions/:session`) and one decision of it. */
export type BotSessionDecisionsPage = GetBotJournalSessionResponses[200]
export type BotSessionDecision = BotSessionDecisionsPage["items"][number]

export type BotConfigState = BotConditions["state"]

/**
 * Legacy buy-source shapes. The `/bot/universe` endpoints were removed by Bot v2.0 (spec §5.1);
 * these loose types only keep the old test fake compiling.
 */
export type UniverseRequest = {
  kind: string
  name: string
  revision: number
  status?: string
  symbol_count?: number
  saved_list_id?: string | null
  [key: string]: unknown
}
export type UniverseEffective = UniverseRequest
export type UniverseState = { revision: number; effective: UniverseEffective; pending: UniverseRequest | null; [key: string]: unknown }
export type UniverseMutationResult = { request: UniverseRequest; state: UniverseState }

export type SavedList = ListStrategySavedListsResponses[200]["items"][number]

/** One reason the server refused a symbol selection (422 `UNIVERSE_SYMBOLS_INVALID`). */
export type InvalidSymbol = { symbol: string; reason: string }
