/** Rổ mã helpers (spec v2.0 §2.2, §4.1): the symbols of a universe, a saved list or a Bộ lọc result as a universe. */
import { FILTER_RESULT_LIST_ID, type Universe, type UniverseOptions } from "./api"

/** The symbols a universe stands for: VN30/VN100 current members, a saved list's copied symbols ∩ VN100. */
export function symbolsOf(universe: Universe, options: UniverseOptions | undefined): string[] {
  if (universe.type !== "saved_list") return (universe.type === "vn100" ? options?.vn100.symbols : options?.vn30.symbols) ?? []
  const store = options ? new Set(options.vn100.symbols) : null
  return store ? universe.symbols.filter((symbol) => store.has(symbol)) : universe.symbols
}

/** A saved list of the Bộ lọc as a universe: only its VN100 symbols are copied (§2.2). */
export function listUniverse(option: UniverseOptions["saved_lists"][number]): { universe: Universe; excluded: string[] } {
  return { universe: { type: "saved_list", list_id: option.id, list_name: option.name, symbols: [...option.symbols_kept] }, excluded: [...option.excluded] }
}

/** Any symbols (a Bộ lọc result) as a universe: VN100 ones kept, the others reported. */
export function symbolsUniverse(name: string, symbols: readonly string[], vn100: readonly string[]): { universe: Universe; excluded: string[] } {
  const store = new Set(vn100)
  const unique = [...new Set(symbols.map((symbol) => symbol.trim().toUpperCase()))]
  return {
    universe: { type: "saved_list", list_id: FILTER_RESULT_LIST_ID, list_name: name, symbols: unique.filter((symbol) => store.has(symbol)) },
    excluded: unique.filter((symbol) => !store.has(symbol)),
  }
}
