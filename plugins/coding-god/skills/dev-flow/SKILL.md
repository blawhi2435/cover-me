---
name: dev-flow
description: Use when the user wants to implement a new feature, fix a bug, or build something new. Orchestrates the full delivery workflow from spec design through PR — brainstorm, branch creation, opsx new/ff/apply (with mandatory TDD and coding style), code review, integration tests, archive, and PR open. Triggers on phrases like "實作 X", "做一個 Y", "新功能", "修 Z bug", "build a feature", "implement". Do NOT use for one-off questions, code reading, or trivial edits.
---

# dev-flow

Orchestrates an 11-node delivery workflow. This skill **never writes code directly** — it dispatches to other skills and tracks progress with TodoWrite.

## Prerequisites

- Playwright MCP server must be installed and connected for Node 7.5 (frontend hands-on test). Install via the marketplace (e.g. `/plugin install playwright`), which provides the `mcp__plugin_playwright_playwright__browser_*` tools. Without it, any frontend-touching change halts at Node 7.5 with a blocker — the workflow does NOT silently fall back to writing Python scripts.

## Announce

At start: "Using dev-flow skill to drive the feature delivery workflow."

## Setup: seed TodoWrite

Create one todo per node (all `pending`):

1. Brainstorm spec
2. Confirm + create branch
3. opsx:new
4. opsx:ff (test-first tasks.md)
5. opsx:apply (TDD + coding style)
6. Code review
7. Unit + integration tests
8. Summary preview + confirmation gate
9. opsx:archive
10. Commit pending changes
11. Open PR

Mark each `in_progress` on entry, `completed` on exit. Loop iterations update existing todos rather than create duplicates.

## Flow

### Node 1 — Brainstorm
Invoke `superpowers:brainstorming`. Output: a spec file. Do not proceed until user has approved the spec.

### Node 2 — Branch
Ask the user: "要開 branch 開發嗎？"
- If no → halt the flow, return to user.
- If yes → derive branch name per `references/branch-naming.md`, show it to the user, allow override, then `git checkout -b <name>`.

### Node 3 — opsx:new
Invoke `opsx:new`, passing the brainstorm spec path (from Node 1) as context input. Capture the change name produced. The opsx `proposal.md` should summarize the brainstorm spec, not re-derive requirements.

### Node 4 — opsx:ff (test-first, no design duplication)
Invoke `opsx:ff`. **Two post-processing rules:**

**Rule A — design.md must reference, not duplicate.** When `opsx:ff` produces `openspec/changes/<change-name>/design.md`, edit it so the body is:

```markdown
# Design

> Source spec: `<relative path to brainstorm spec from Node 1>`

This change implements the design in the linked spec. See that document for problem framing, goals, architecture, and decisions. The sections below contain only opsx-specific framing not covered in the source spec.

## Opsx-specific notes

<only items the opsx workflow requires that aren't in the source spec — typically empty>
```

If the engineer finds opsx-specific framing that genuinely isn't in the source spec, they may add it under "Opsx-specific notes". Otherwise leave that section empty. **Do not copy goals, architecture, or rationale from the source spec into design.md.**

**Rule B — tasks.md must be test-first.** Every task that is not pure schema/migration/config/docs must be restructured to:

```
- [ ] Task N: <feature>
  - [ ] N.1 Write failing test for <behavior>
  - [ ] N.2 Implement minimum code to pass
  - [ ] N.3 Refactor if needed
```

Detect skip cases by keywords in task title/description: `schema`, `migration`, `config`, `docs`, `documentation`. For skipped tasks, leave structure as-is and add an inline note: `<!-- TDD skipped: <reason> -->`.

### Node 4.5 — Aggregate design references

Before dispatching to the worker, build the reference bundle. The worker starts cold and **cannot see this session's conversation**, so anything produced in-session (e.g. `impeccable:shape` output) must be persisted to a file or it will be lost.

**Ambient refs — auto-detected, no user action.** Check repo root and add each existing file to `ambient_refs`:

- `./DESIGN.md` → `{kind: "project_design_doc", path: "DESIGN.md"}`
- `./PRODUCT.md` → `{kind: "project_product_doc", path: "PRODUCT.md"}`

Skip silently if absent.

**Design refs — this change's specific design inputs.** Build `design_refs` from three sources:

1. **In-session design output gate.** If this session ran `impeccable:shape` (or any skill whose design output exists only in the conversation, not as a file), prompt the user:

   > 偵測到這個 session 跑過 `impeccable:shape`。要把 shape 結果寫到 `openspec/changes/<change>/shape.md` 再 dispatch 嗎？(y / edit-first / skip)

   - `y` → write the final shape output to `openspec/changes/<change-name>/shape.md` and add `{kind: "shape", path: "..."}` to `design_refs`.
   - `edit-first` → open the file for the user to refine, then proceed.
   - `skip` → do not persist; record `"shape output not persisted"` in `deviations`.

2. **Brainstorm spec `## References` section.** Each listed item becomes a `design_refs` entry. The spec must contain a References section in this format:

   ```markdown
   ## References

   - [ ] Mockup: <path or url>
   - [ ] Reference component: <path>
   - [ ] Design tokens: <path>
   - [ ] API contract / schema: <path>
   - [ ] (none — purely backend/internal)
   ```

   If the section is missing AND no entry is marked "none", **halt and ask the user** to fill it in or explicitly confirm none. This gate prevents silently dropping design context. Note: shape output does not need to be listed here — Node 4.5 step 1 handles it.

3. Stash `ambient_refs` and `design_refs` in `.devflow-state.json` so they survive resume.

### Nodes 5–7 — Orchestrator-driven apply ↔ review ↔ test loop

After Node 4.5 completes, the orchestrator drives the full Nodes 5–7 loop directly. **Nodes 8–11 stay in the orchestrator** — they are linear, single-pass steps that benefit from being visible to the user as they run.

The loop runs as follows (caps per `references/loop-limits.md`):

```
reset loop counters
loop:
  dispatch worker (apply mode)    # Node 5 — opsx:apply per-Task TDD + coding style
  run coding-god:code-review      # Node 6 — orchestrator invokes review directly
  if review has issues:
      append fix sub-tasks to tasks.md
      record iteration; continue  # back to Node 5
  dispatch worker (test mode)     # Node 7 — pre-flight + full suite + Node 7.5 hands-on
  if tests failed:
      append fix sub-tasks to tasks.md
      record iteration; continue  # back to Node 5
  break                           # all green → Node 8
```

Invariants: review always precedes test within a pass; both review issues and test failures loop back to Node 5; the two loop counters are independent.

#### Worker drive model — cold-dispatch baseline, optional warm

The orchestrator returns to the worker once per apply round and once per test round. There are two ways to do that:

- **Baseline (always works, default):** every round dispatches a **fresh** `dev-flow-implement` via the Agent tool (`subagent_type: dev-flow-implement`), passing `state_file` and `resume_from_node: <N>`. The worker rebuilds context by reading `.devflow-state.json`, `tasks.md`, and the working tree. This is the path you MUST assume unless warm-drive is confirmed available.
- **Warm (optimization, only when available):** keep one long-lived worker and resume it via the `SendMessage` tool to its captured agent ID, preserving its full in-context history across rounds (no cold-start, no re-reading refs). **`SendMessage` only exists when Claude Code's experimental agent-teams feature is enabled** (`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`, set at session start). See the README "Configuration" section.

**Detect once, before the first dispatch:** check whether the `SendMessage` tool is available in this session (e.g. via ToolSearch for `SendMessage`). If yes, use the warm path and capture/reuse the worker's agent ID across rounds; if no, use the cold baseline for every round. Do not assume warm — a session without the flag has no `SendMessage`, and silently expecting it would strand the loop.

Either way the loop logic, payloads, and `.devflow-state.json` contract are identical — only the round-to-round transport differs. The state file (below) is what makes the cold baseline correct, so it must stay current regardless of which path is used.

#### Node 5 — Apply worker dispatch

Dispatch the worker in **apply mode** for each apply round, using the warm or cold transport per the drive model above. The worker runs on Sonnet, loads `superpowers:test-driven-development` and `coding-god:standard-coding-style`, and executes the per-Task red/green/refactor cycle for every task in `tasks.md`.

The `dev-flow-implement` agent declares `model: sonnet` in its frontmatter. **That is the contract.** When dispatching, do NOT pass a `model` parameter to the Agent tool — the frontmatter wins.

**Pre-dispatch shadow-skill check (worker skills).** Before dispatching the worker, detect potential skill shadowing for `opsx:apply` (the skill the worker invokes). Check whether **both** a standalone version (e.g. `~/.claude/skills/opsx:apply/SKILL.md`) and a plugin version exist. If shadowing is detected, surface a warning and ask the user which to use before dispatch.

Apply worker return payload: `{ applied_tasks, deviations }`. On halt/blocker, surface to the user verbatim and stop.

#### Node 6 — Code review (orchestrator)

**The orchestrator runs `coding-god:code-review` directly** — this skill dispatches specialist subagents (logic / style / test / security) in parallel, which requires Agent-tool access available only in the orchestrator. Never delegate review to the worker.

**Pre-dispatch shadow-skill check (review skill).** Before invoking, detect potential skill shadowing for `coding-god:code-review` (standalone vs. plugin versions). Surface any duplicates to the user before invoking.

Scope the review to this change only: `git diff main...HEAD` plus the working tree. Do not let the skill default to the entire repo.

Record each specialist run in `.devflow-state.json` `evidence.specialists` as `{name, verdict, attempts}`.

If `coding-god:code-review` cannot be invoked (skill not registered, Agent tool unavailable), halt and surface the error verbatim — never fall back to inline single-pass review.

Only mark Node 6 todo `completed` after specialist results are in hand.

#### Node 7 — Test worker dispatch

Dispatch the worker in **test mode** for each test round, using the warm or cold transport per the drive model above (`resume_from_node: 7` on cold dispatch). The worker runs pre-flight environment readiness (lockfile install, `docker compose` health, env vars, migrations) per `references/test-detection.md`, then the full unit + integration suite, then Node 7.5 frontend hands-on if applicable.

Test worker return payload: `{ passed, test_output_tail, frontend_hands_on, deviations }`. The orchestrator writes `test_output_tail` and `frontend_hands_on` into `.devflow-state.json` `evidence`.

On halt/blocker (pre-flight failure, unresolvable test failure), surface to the user verbatim and stop.

#### State file (resume contract)

Before the first dispatch, write `.devflow-state.json` at the repo root with the initial context (change name, branch, spec path, tasks path, `ambient_refs`, `design_refs`, empty evidence). The orchestrator updates `iterations.review`, `specialists`, `test_output_tail`, and `frontend_hands_on` after each node; the worker updates `iterations.apply`, `iterations.test`, and `evidence.deviations`.

The state file is the **resume contract** that makes cold dispatch correct: a fresh `dev-flow-implement` started with the state file path and `resume_from_node: <N>` recovers full durable context. This is the baseline path (used every round when `SendMessage` is unavailable) and also the recovery path when a warm worker expires or `SendMessage` errors. Never re-run dev-flow from Node 1 to recover.

Add `.devflow-state.json` to `.gitignore` if not already present.

#### Worker dispatch brief must include (worker starts cold)

- `change_name` from Node 3
- `spec_path` — brainstorm spec from Node 1
- `tasks_path` — `openspec/changes/<change-name>/tasks.md`
- `branch` from Node 2
- `state_file` — path to `.devflow-state.json`
- **`ambient_refs`** — auto-detected project docs (DESIGN.md, PRODUCT.md). Worker must Read each before Node 5 and treat as binding constraints.
- **`design_refs`** — this change's specific design inputs. Worker must Read each local file before Node 5. URL entries that aren't fetchable surface as a verification-only note (not a blocker).
- **Mode**: `apply` or `test`
- **Environment-readiness expectation** (test mode): explicit instruction to run pre-flight per `references/test-detection.md` before the first test run.
- **`frontend_hands_on` flag** — default omit (worker auto-detects). Pass `frontend_hands_on: skip` only if the user has explicitly opted out; the worker records it as a deviation.
- Loop limits reference (`references/loop-limits.md`)
- Test detection reference (`references/test-detection.md`)

### Node 8 — Summary preview + confirmation gate (orchestrator)

Print a preview summary to the user containing:

- `branch` — branch name from Node 2
- `change_name` — from Node 3
- `iterations` — `apply` and `test` counts written by the worker; `review` count written by the orchestrator; all sourced from `.devflow-state.json`
- `specialists` — from `.devflow-state.json` `evidence.specialists` (recorded by the orchestrator after each Node 6 run)
- `test_output_tail` — from `.devflow-state.json` `evidence.test_output_tail` (last ~50 lines of the final passing test run)
- `frontend_hands_on` — from `.devflow-state.json` `evidence.frontend_hands_on` (scenarios + per-scenario verdict + screenshot paths, or the `n/a` / `skipped` sentinel)
- `deviations` — from `.devflow-state.json` `evidence.deviations` (accumulated from both worker and orchestrator)

Validate before printing: `specialists` must be non-empty, `test_output_tail` must be non-empty, `frontend_hands_on` must be present (evidence object with all-pass results, or one of the two sentinels). A bare "all green" summary with no evidence is forbidden — re-read `.devflow-state.json` and surface the actual captured tail.

Then ask the user **a single yes/no**: "要 archive + commit + PR 嗎？"

- No / 任何修正請求 → halt. Do not run Nodes 9–11. Return control to the user so they can request changes (which may loop back into a fresh worker via state-file resume) or stop entirely.
- Yes → proceed through Nodes 9 → 10 → 11 in sequence without further confirmation. After Node 11 completes, print one trailing line: `PR opened: <url>`.

`pr_url` and `commit_shas` are intentionally **not** in the preview — they don't exist yet at this gate.

### Node 9 — opsx:archive (orchestrator)

Invoke `opsx:archive`. Single call, no loop. Print result to the user.

### Node 10 — Commit pending changes (orchestrator)

Check `git status`. Clean tree → skip to Node 11.

If anything is uncommitted (typically the archive's file moves, plus any spec/plan files the user wants tracked), invoke `coding-god:git-commit` skill **directly**. Do **not** run raw `git commit` — the skill enforces Conventional Commits format, logical splitting, and user confirmation; bypassing it breaks the contract.

If `coding-god:git-commit` cannot be invoked, halt and surface the error to the user verbatim. Never fall back to raw `git commit`.

### Node 11 — Open PR (orchestrator)

Run `gh pr create`. Title derived from the change name (`feat: <change-name>` or matching project commit style — check `git log` first). Body: link to spec, summary of changes, test plan. Print the PR URL to the user as `PR opened: <url>`.

## Loops & limits

See `references/loop-limits.md`. When a limit is exceeded, halt and ask the user to intervene — do not loop indefinitely.

## Notes

- This is a process skill, not an implementation skill. Never write feature code from inside dev-flow — always delegate to the appropriate node skill.
- If any node fails in a way not covered by loop-back rules, halt and surface the error to the user verbatim.
