import { describe, expect, it } from "vitest"

import { DEFAULT_TEAM_USER_PARAMS, parseTeamUserParams, toTeamUserSearch } from "./users-url"

describe("team users URL params", () => {
  it("falls back to the defaults for an empty or unknown query", () => {
    expect(parseTeamUserParams(new URLSearchParams())).toEqual({ ...DEFAULT_TEAM_USER_PARAMS, search: undefined, role: undefined, segment: undefined })
    const junk = parseTeamUserParams(
      new URLSearchParams("page=0&page_size=33&role=admin&segment=all&sort_by=email&sort_order=up&search=%20%20"),
    )
    expect(junk).toEqual({ ...DEFAULT_TEAM_USER_PARAMS, search: undefined, role: undefined, segment: undefined })
  })

  it("parses every supported filter, and team_lead or admin roles are not listable", () => {
    expect(
      parseTeamUserParams(
        new URLSearchParams("page=3&page_size=100&role=premium&segment=trialing&sort_by=academy_progress&sort_order=asc&search=lan"),
      ),
    ).toEqual({ page: 3, pageSize: 100, role: "premium", segment: "trialing", sortBy: "academy_progress", sortOrder: "asc", search: "lan" })
    expect(parseTeamUserParams(new URLSearchParams("role=team_lead")).role).toBeUndefined()
  })

  it("writes only non-default values and round-trips", () => {
    expect(toTeamUserSearch(DEFAULT_TEAM_USER_PARAMS).toString()).toBe("")
    const params = { page: 2, pageSize: 50, search: "minh", role: "user" as const, segment: "new_7d" as const, sortBy: "bot_pnl_pct" as const, sortOrder: "desc" as const }
    const search = toTeamUserSearch(params)
    expect(search.toString()).toBe("search=minh&role=user&segment=new_7d&sort_by=bot_pnl_pct&sort_order=desc&page_size=50&page=2")
    expect(parseTeamUserParams(search)).toEqual(params)
  })
})
