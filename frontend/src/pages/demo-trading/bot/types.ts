/**
 * Wire types of the Bot tool. Bot reads come straight from the generated
 * contract; the shared-config types live in `config/types.ts`.
 */
import type {
  ApplyBotUniverseListResponses,
  BotConditions,
  BotExecution,
  BotIssue,
  BotJournal,
  BotJournalItem,
  BotOverview,
  BotPosition,
  BotPositions,
  GetBotUniverseResponses,
  ListStrategySavedListsResponses,
} from "@/lib/generated"

export type {
  BotConditions,
  BotExecution,
  BotIssue,
  BotJournal,
  BotJournalItem,
  BotOverview,
  BotPosition,
  BotPositions,
}

export type BotConfigState = BotConditions["state"]

/** Effective buy source with its symbols, the pending request and the revision token. */
export type UniverseState = GetBotUniverseResponses[200]
export type UniverseEffective = UniverseState["effective"]
export type UniverseRequest = NonNullable<UniverseState["pending"]>
export type UniverseMutationResult = ApplyBotUniverseListResponses[201]

export type SavedList = ListStrategySavedListsResponses[200]["items"][number]

/** One reason the server refused a symbol selection (422 `UNIVERSE_SYMBOLS_INVALID`). */
export type InvalidSymbol = { symbol: string; reason: string }
