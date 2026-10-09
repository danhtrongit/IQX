/**
 * Wire types of the Bot tool. Bot reads come straight from the generated
 * contract; the shared-config types live in `config/types.ts`.
 */
import type {
  ApplyBotUniverseListResponses,
  BotConditions,
  BotIssue,
  BotOverview,
  BotPosition,
  BotPositions,
  GetBotJournalSessionResponses,
  GetBotTradesResponses,
  GetBotUniverseResponses,
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

/** Effective buy source with its symbols, the pending request and the revision token. */
export type UniverseState = GetBotUniverseResponses[200]
export type UniverseEffective = UniverseState["effective"]
export type UniverseRequest = NonNullable<UniverseState["pending"]>
export type UniverseMutationResult = ApplyBotUniverseListResponses[201]

export type SavedList = ListStrategySavedListsResponses[200]["items"][number]

/** One reason the server refused a symbol selection (422 `UNIVERSE_SYMBOLS_INVALID`). */
export type InvalidSymbol = { symbol: string; reason: string }
