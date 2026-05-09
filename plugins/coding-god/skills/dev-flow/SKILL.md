---
name: dev-flow
description: Use when the user wants to implement a new feature, fix a bug, or build something new. Orchestrates the full delivery workflow from spec design through PR — brainstorm, branch creation, opsx new/ff/apply (with mandatory TDD and coding style), code review, integration tests, archive, and PR open. Triggers on phrases like "實作 X", "做一個 Y", "新功能", "修 Z bug", "build a feature", "implement". Do NOT use for one-off questions, code reading, or trivial edits.
---

# dev-flow

Orchestrates an 11-node delivery workflow. This skill **never writes code directly** — it dispatches to other skills and tracks progress with TodoWrite.

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
8. opsx:archive
9. Commit pending changes
10. Open PR
11. Summary report

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

Before dispatching to the subagent, build the reference bundle. The subagent starts cold and **cannot see this session's conversation**, so anything produced in-session (e.g. `impeccable:shape` output) must be persisted to a file or it will be lost.

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

### Nodes 5–7 — Dispatch to `dev-flow-implement` subagent (Sonnet)

After Node 4.5 completes, hand off the apply ↔ review ↔ test loop to the `dev-flow-implement` subagent via the Agent tool (`subagent_type: dev-flow-implement`). The subagent runs on Sonnet and owns:

- Node 5: opsx:apply (with TDD + coding style)
- Node 6: code review
- Node 7: unit + integration tests

The loop stays inside the subagent so iterations don't cold-restart and lose context. **Nodes 8–11 stay in the orchestrator** — they are linear, single-pass steps that benefit from being visible to the user as they run, and they invoke skills (`opsx:archive`, `coding-god:git-commit`, `gh pr create`) that are more reliably dispatched from the orchestrator than from a subagent.

#### Model contract — do not override

The `dev-flow-implement` agent declares `model: sonnet` in its frontmatter. **That is the contract.** When dispatching, do NOT pass a `model` parameter to the Agent tool — the frontmatter wins. Passing `model: opus` (or anything else) silently breaks the cost/latency profile this skill is calibrated for.

#### Pre-dispatch shadow-skill check

Before dispatching, detect potential skill shadowing for the two skills the subagent invokes (`coding-god:code-review`, `opsx:apply`). For each, check whether **both** a standalone version (e.g. `~/.claude/skills/<name>/SKILL.md`) and a plugin version exist. If shadowing is detected, surface a warning to the user listing the duplicates and ask which to use before dispatch — silent ambiguity here causes the wrong skill to run inside the subagent, which is hard to diagnose later.

#### State file (resume contract)

Before dispatch, write `.devflow-state.json` at the repo root with the initial dispatch context (change name, branch, spec path, tasks path, `ambient_refs`, `design_refs`, empty evidence). The subagent updates it at every node boundary. This is the **resume contract**: if `SendMessage` to the subagent later fails (agent expired, transport error, blocker-recovery resume), the orchestrator dispatches a fresh `dev-flow-implement` subagent with the state file path and `resume_from_node: <N>` in the brief. Never re-run dev-flow from Node 1 to recover — always resume via state file.

Add `.devflow-state.json` to `.gitignore` if not already present.

#### Dispatch brief must include (subagent starts cold)

- `change_name` from Node 3
- `spec_path` — brainstorm spec from Node 1
- `tasks_path` — `openspec/changes/<change-name>/tasks.md`
- `branch` from Node 2
- `state_file` — path to `.devflow-state.json`
- **`ambient_refs`** — auto-detected project docs (DESIGN.md, PRODUCT.md). Subagent must Read each before Node 5 and treat as binding constraints on the implementation.
- **`design_refs`** — this change's specific design inputs (shape.md, mockups, reference components, design tokens, API contracts, schemas). Subagent must Read each local file before Node 5. URL entries that aren't fetchable surface as a verification-only note (not a blocker).
- **Environment-readiness expectation**: explicit instruction to run pre-flight (lockfile install, `docker compose` health, env vars, migrations) per `references/test-detection.md` before the first test run in Node 7
- **`frontend_hands_on` flag** — default omit (subagent auto-detects). Pass `frontend_hands_on: skip` only if the user has explicitly opted out for this change; the subagent will then record it as a deviation rather than running the UI driver.
- Loop limits reference (`references/loop-limits.md`)
- Test detection reference (`references/test-detection.md`)

#### Subagent return payload

On success the subagent returns:

```json
{
  "iterations": {"apply": N, "review": N, "test": N},
  "specialists": [{"name": "...", "verdict": "...", "attempts": N}, ...],
  "test_output_tail": "<last ~50 lines of final passing test run>",
  "frontend_hands_on": {"scenarios": [...], "results": [...], "screenshots": [...]} | "n/a — no UI surface touched" | "skipped per user",
  "deviations": ["..."]
}
```

Validate: `specialists` must be non-empty, `test_output_tail` must be non-empty, `frontend_hands_on` must be present (evidence object with all-pass results, or one of the two sentinels). Missing fields → `SendMessage` (or fresh-subagent resume via state file) asking the subagent to refill from `.devflow-state.json`. A bare "all green" return is forbidden.

After validation, mark Nodes 5–7 todos `completed` and proceed to Node 8 in the orchestrator.

**On halt/blocker:** if the subagent returns a blocker (loop limit hit, unresolvable test failure, etc.), surface it to the user verbatim and stop — **except** for `node6_blocker` below, which the orchestrator handles by running the skill itself and resuming the same subagent.

#### `node6_blocker` — code-review skill couldn't run inside subagent

When the subagent returns `{"node6_blocker": true, "agentId": "<id>", "error": "..."}`:

1. Invoke `coding-god:code-review` skill **directly in the orchestrator** (the orchestrator has Agent-tool access and can dispatch the specialist subagents the skill requires). Do **not** inline-review yourself.
2. After the skill returns results, resume the original subagent via `SendMessage` to the returned `agentId`, passing the review results and an instruction to continue from Node 7. Do **not** spawn a new subagent — the original still holds the implementation context.
3. **`SendMessage` fallback**: if `SendMessage` to that `agentId` fails (agent expired/unreachable), dispatch a fresh `dev-flow-implement` subagent with `resume_from_node: 7`, the state file path, and the review results inlined into the brief. Do not restart from Node 5.
4. Only mark Node 6 todo `completed` after the skill has actually run and specialist results are in hand.

#### Orchestrator-fallback guardrail (rare path)

If for any reason the orchestrator ends up handling Node 6 directly (e.g. subagent crashed, partial recovery), it **must** invoke `coding-god:code-review`. Inline single-pass review is forbidden. If the orchestrator itself cannot invoke the skill, halt and surface the error verbatim — never silently degrade.

### Node 8 — opsx:archive (orchestrator)

Invoke `opsx:archive`. Single call, no loop. Print result to the user.

### Node 9 — Commit pending changes (orchestrator)

Check `git status`. Clean tree → skip to Node 10.

If anything is uncommitted (typically the archive's file moves, plus any spec/plan files the user wants tracked), invoke `coding-god:git-commit` skill **directly**. Do **not** run raw `git commit` — the skill enforces Conventional Commits format, logical splitting, and user confirmation; bypassing it breaks the contract.

If `coding-god:git-commit` cannot be invoked, halt and surface the error to the user verbatim. Never fall back to raw `git commit`.

### Node 10 — Open PR (orchestrator)

Run `gh pr create`. Title derived from the change name (`feat: <change-name>` or matching project commit style — check `git log` first). Body: link to spec, summary of changes, test plan. Print the PR URL to the user.

### Node 11 — Summary (orchestrator)

Print a final summary to the user containing:

- `branch` — branch name from Node 2
- `pr_url` — from Node 10
- `change_name` — from Node 3
- `iterations` — from subagent payload
- `commit_shas` — `git log <base>..HEAD --format=%H`
- `specialists` — from subagent payload
- `test_output_tail` — from subagent payload
- `frontend_hands_on` — from subagent payload (scenarios + per-scenario verdict + screenshot paths, or the `n/a` / `skipped` sentinel)
- `deviations` — subagent's, plus any added by orchestrator at Nodes 8–10

## Loops & limits

See `references/loop-limits.md`. When a limit is exceeded, halt and ask the user to intervene — do not loop indefinitely.

## Notes

- This is a process skill, not an implementation skill. Never write feature code from inside dev-flow — always delegate to the appropriate node skill.
- If any node fails in a way not covered by loop-back rules, halt and surface the error to the user verbatim.
