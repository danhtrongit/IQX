# AGENTS.md

`CLAUDE.md` is a symlink to this file. Edit `AGENTS.md` only.

## Subagents

- For non-trivial tasks, split the work into independent, bounded slices and run them in parallel. Use **5–8 subagents at most**, and only as many as there are real slices. Do atomic or tightly coupled work directly.
- Give every slice exactly one owner. Two subagents never edit the same file, and no slice repeats another's research, review, or tests. Shared files get one integration owner; other agents return findings or patches.
- Each prompt states the goal, owned paths, context, non-goals, checks to run, and acceptance criteria. Agents report in ≤10 lines: files changed, tests run, blockers, assumptions.
- Subagents do not spawn subagents, and they do not `reset`, `checkout`, `stash`, delete, or deploy outside their scope.
- Save tokens. Read only the files and line ranges you need, keep briefs short, pick the cheapest capable model, and return diffs or conclusions rather than whole files or long logs.
- The coordinator integrates the results, reviews `git diff`, runs the final checks, and owns acceptance.

## Models

Always pass `model` explicitly. If you omit it, the subagent inherits Opus.

| Model | `model` | Use for |
| --- | --- | --- |
| Haiku 4.5 | `haiku` | Clear, small-scope work: doc summaries, code search/review (`Explore`), lookups, CSS tweaks, small fixes at known locations, running lint/tests |
| Sonnet 5.5 | `sonnet` | Default for writing and implementing code, tests, refactors, routine review |
| Opus 5.5 | `opus` | Coordinator; architecture, auth/security, concurrency, migrations, quant/money logic, hard debugging, final review of risky diffs |

- If an agent fails after one targeted retry, escalate Haiku → Sonnet → Opus. Never skip verification.
- `fork` inherits the coordinator's model and context. Use a fresh agent with a self-contained brief instead.
