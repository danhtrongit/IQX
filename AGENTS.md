# [AGENTS.md](http://AGENTS.md)

## Subagent Policy

Delegate work whenever a task can be split or offloaded. The main agent orchestrates: it plans, delegates, reviews results, and integrates. It does not do bulk implementation itself.

### Worker Mix (token saving)

Use **agent-hub workers and Claude subagents together**. Pick by task fit, not by fallback order. Both the main agent and any Claude subagent may spawn hub jobs freely; a subagent can offload its own sub-tasks to the hub.

1. **agent-hub workers** (`hub_spawn`) run on other CLIs (codex, opencode, agy) and cost no Claude tokens. Prefer them for bulk, self-contained work: research, code review, implementing features, multi-file edits, tests, refactors. When either option fits, use the hub to save tokens.
2. **Claude subagents** (Agent tool) are for work that needs Claude Code itself: Claude Code–specific tools (Artifact, Claude Docs, MCP connectors, Skills), this conversation's context (`fork`), Explore/Plan agents, orchestrating a group of hub jobs for one feature, verifying and integrating hub output. Also use them when hub backends are down or rate-limited.
3. **Combine them.** Typical shapes: a Sonnet subagent coordinates several hub jobs and merges their results; the main agent runs hub research jobs in parallel with a Claude subagent doing integration; a Haiku subagent reviews what a hub worker produced.
4. **Opus is restricted to genuinely hard tasks.** Try codex `gpt-6-astra` via agent-hub first for hard reasoning/planning. Use Opus (`model: "opus"`) only when the task is truly difficult (architecture, complex planning, hard bugs) and astra is not enough or unavailable. Never use Opus for routine implementation, lookups, or review.

### Limits

- Max 6 Claude subagents running concurrently. agent-hub jobs are not counted against this limit: use them freely within the hub's own concurrency (agy 12, codex 8, opencode 8).
- Launch independent workers in parallel (single message, multiple calls).
- Don't spawn a worker for a single-fact lookup in a known file — do it directly.

### Model Selection

Always use the latest models.

**agent-hub backends (bulk, self-contained work):**


| Backend      | Model                                                             | Use for                                                                                                                                              |
| ------------ | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| **agy**      | `flash` (= `gemini-3.8-flash-high`); `flash-low` for trivial jobs | Cheap, fast: lookups, scanning/reviewing source, summarizing docs, CSS tweaks, small fixes at known locations. **Default worker.**                   |
| **opencode** | `opencode-go/deepseek-v4.1-flash`                                 | **Default for writing and implementing code**: features, multi-file edits, tests, refactors.                                                         |
| **codex**    | `gpt-6-astra` (effort `high` or above). Do not use `gpt-6-sol`.   | **Hard tasks only**: architecture/design, planning complex problems before splitting them, tricky bugs, game-logic design. First choice before Opus. |


**Claude subagents (work that needs Claude Code):**


| Model          | ID                          | Use for                                                                                                                                                 |
| -------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Haiku 4.5**  | `claude-haiku-4-5-20251001` | Lookup/review/small fixes, Explore agents, verifying hub worker output.                                                                                 |
| **Sonnet 5.5** | `claude-sonnet-5-5`         | Implementation needing Claude Code tools or conversation context; orchestrating hub jobs and integrating results.                                       |
| **Opus 5.5**   | `claude-opus-5-5`           | **Genuinely hard tasks only**: architecture/design, complex planning, hard bugs, when codex astra is not enough or unavailable. Never for routine work. |


Rules:

- Pick the cheapest worker that can do the job reliably. Default: agy `flash` for lookup/review, opencode `deepseek-v4.1-flash` for code.
- Escalate to codex `gpt-6-astra` only when the task needs deep reasoning, design, or planning. Opus is the last step of escalation, for genuinely hard tasks only.
- Pattern for complex work: codex (astra) plans → opencode (deepseek) implements → agy (flash) or Haiku subagent verifies/reviews → Sonnet subagent or main agent integrates.

### agent-hub Workflow

- `hub_spawn` returns a `job_id` immediately → keep working → `hub_wait` / `hub_status` → `hub_result`. Check `hub_notifications` at the start of each turn.
- `mode`: `read` for research/review (no edits); `write` (default) for edits in cwd. Avoid `full` unless isolated.
- Workers do not see this conversation. Prompts must be self-contained: goal, file paths, constraints, how to verify, what to report back.
- Parallel write jobs in the same directory can clash. Use `isolation="worktree"` for parallel writers, then review and apply their diff (`hub_result` shows how). Otherwise assign non-overlapping files or run write jobs sequentially.
- Never put secrets (passwords, API keys, tokens) in prompts.
- Review worker output before relying on it; workers can be wrong.

### Delegation Guidelines

- Give each worker a self-contained prompt: goal, relevant file paths, constraints, expected output format.
- Assign non-overlapping files to parallel workers to avoid edit conflicts.
- Ask workers to return concise conclusions, not raw file dumps.
- The main agent verifies worker output before reporting completion.

## Language

- Write agent instructions, prompts, and internal notes in English to save tokens.
- Reply to the user in the language they use.

