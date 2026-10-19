---
name: dev-flow
description: Use when the user wants to implement a new feature, fix a bug, or build something new. Orchestrates the full delivery workflow from spec design through PR — brainstorm, branch creation, opsx ff/apply (with mandatory TDD and coding style), code review, integration tests, archive, and PR open. Triggers on phrases like "實作 X", "做一個 Y", "新功能", "修 Z bug", "build a feature", "implement". Do NOT use for one-off questions, code reading, or trivial edits.
---

# dev-flow

Orchestrates an 11-node delivery workflow. This skill **never writes code directly** — it dispatches to other skills and tracks progress with a todo list (see Setup).

## Prerequisites

- **OpenSpec CLI ≥ 1.8.0, with generated skills in sync.** Check both before Node 1:
  1. `openspec --version` must report 1.8.0 or later. Older CLIs do not count indented or non-`-` checkboxes, so their progress numbers disagree with `tasks.md`, and the Node 4 / Node 8 gates below cannot be trusted. If older → halt and tell the user to run `npm i -g @fission-ai/openspec@latest`.
  2. Run `grep -h generatedBy .claude/skills/openspec-*/SKILL.md | sort -u` (do not open the files); the single value it prints must equal the CLI version. If it differs → halt and tell the user to run `openspec update` in the repo, then restart the session so the regenerated skills load. If the repo has no generated OpenSpec skills (commands-only delivery), skip this check and record `"generatedBy check skipped: no generated skills"` in `deviations`.
- Playwright MCP server must be installed and connected for Node 7.5 (frontend hands-on test). Install via the marketplace (e.g. `/plugin install playwright`), which provides the `mcp__plugin_playwright_playwright__browser_*` tools. Without it, any frontend-touching change halts at Node 7.5 with a blocker — the workflow does NOT silently fall back to writing Python scripts.

## Announce

At start: "Using dev-flow skill to drive the feature delivery workflow."

## Setup: seed progress tracking

Use a todo or task tool if the session provides one; do not assume any particular tool exists. If there is none, `.devflow-state.json` is the source of truth: record each node's entry and exit in `last_completed_node` and append loop iteration summaries to `evidence.iteration_log` (see `references/loop-limits.md`). Never stall or fail because a tracking tool is missing.

Create one todo per node (all `pending`):

1. Brainstorm spec
2. Confirm + create branch
3. Create change (name, skip_specs, design stub)
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
Invoke `superpowers:brainstorming`. Output: a spec file. Do not proceed until the user has approved the spec.

Three overrides apply while brainstorming runs inside dev-flow:

- **Its terminal state does not apply.** brainstorming ends by invoking `writing-plans`; do not. `opsx:ff` in Node 4 produces the task list. After the user approves the spec, go straight to Node 2.
- **The spec uses these sections, in this order, with these exact headings.** Node 3 copies from them mechanically, so the names are not stylistic:
  - `## Problem` — why; becomes `proposal.md`'s "Why" verbatim.
  - `## Goal` — what changes, as bullets, non-goals included; becomes "What Changes" verbatim.
  - `## Design` — how, as decided with the user; stays in this file (design.md points here).
  - `## Affected files` — paths and systems touched; becomes "Impact" verbatim.
  - `## Requirements` — the behavior contract, in the format below; becomes the delta spec(s) verbatim.
  - `## References` — design inputs for Node 4.5 (`- [ ] Mockup: …`, `- [ ] Reference component: …`, `- [ ] Design tokens: …`, `- [ ] API contract / schema: …`), or the single entry `- [ ] (none — purely backend/internal)`.
- **`## Requirements` is written in OpenSpec's delta format, inside fenced blocks, so the user approves the exact text that will be archived.** Before writing it, run `openspec list --specs` to see the existing capabilities. Then, for each capability this change touches, write one `Capability:` line followed by one fenced `markdown` block:

  ````markdown
  Capability: `<capability-path>` (new)

  ```markdown
  # Spec Delta

  ## Purpose

  <one or two sentences, at least 50 characters, on what the capability is for>

  ## ADDED Requirements

  ### Requirement: <name>
  The system SHALL <normative statement>.

  #### Scenario: <name>
  - **WHEN** <condition>
  - **THEN** <expected outcome>
  ```
  ````

  Rules, enforced by the OpenSpec CLI at validation: an existing capability uses its exact path from `openspec list --specs`, is marked `(existing)`, and its block has **no** `## Purpose`; a MODIFIED requirement copies the **entire existing requirement block** (from `### Requirement:` through all its scenarios) out of `openspec/specs/<path>/spec.md` under `## MODIFIED Requirements` and edits it, never a partial rewrite; a REMOVED requirement carries `**Reason**:` and `**Migration**:`; every requirement has at least one scenario; scenarios use exactly four hashtags (`#### Scenario:`); requirement text uses SHALL/MUST. A change with no spec-level behavior change (pure refactor, tooling, config, docs) writes the single line `Capability: none` and no block — do not invent a requirement to fill the section.

### Node 2 — Branch
Ask the user: "要開 branch 開發嗎？"
- If no → halt the flow, return to user.
- If yes → derive branch name per `references/branch-naming.md`, show it to the user, allow override, then `git checkout -b <name>`.

### Node 3 — Create the change (no skill invocation)

Derive the change name from the approved brainstorm spec's title: kebab-case, at most five words (e.g. `csv-export-with-quoting`). Then, in this order:

1. **Decide `skip_specs`.** If the approved spec changes nothing a user or downstream system can observe (pure refactor, tooling, config, docs), confirm with the user: "這個 change 沒有 spec 層級的行為改變，要設 `skip_specs: true` 嗎？". If behavior changes, leave `skip_specs` unset — the change must carry at least one delta spec.
2. Run `openspec new change "<change-name>"`. If the CLI reports that the name already exists, append `-2`, `-3`, … until it succeeds, and use the name that succeeded from here on.
3. If step 1 answered yes, add `skip_specs: true` to `openspec/changes/<change-name>/.openspec.yaml` next to the existing `schema:` line. Do not create delta spec files for such a change — `openspec validate` rejects `skip_specs` and delta specs together.
4. Write `openspec/changes/<change-name>/design.md` with exactly this body. It is the whole design artifact; the source spec carries the design, and `opsx:ff` treats a design.md that exists as done:

   ```markdown
   # Design

   > Source spec: `<relative path to brainstorm spec from Node 1>`

   This change implements the design in the linked spec. See that document for problem framing, goals, architecture, and decisions. The sections below contain only opsx-specific framing not covered in the source spec.

   ## Opsx-specific notes

   <only items the opsx workflow requires that aren't in the source spec — typically empty>
   ```

5. Record `change_name` for the later nodes.

Do not invoke `opsx:new`: it stops after scaffolding and writes no artifact, and `opsx:ff` in Node 4 generates every remaining artifact itself. Do not write `tasks.md` or `proposal.md` here — `openspec status` is file-existence only, and a file created now would make `opsx:ff` skip generating it.

### Node 4 — opsx:ff with the shape declared up front

Invoke `opsx:ff`, passing this brief as its input (fill the placeholders):

```
Change `<change-name>` already exists at `openspec/changes/<change-name>/`. Do not run `openspec new change` and do not suggest `opsx:continue` — start from your step 3 (artifact build order) and generate every missing required artifact.

Source spec: `<spec_path>`. `proposal.md` summarizes that spec; do not re-derive requirements or re-inspect the codebase for anything the spec already decides.

`design.md` already exists and is final. Do not modify it.

`tasks.md` must use this layout. Every task that is not pure schema/migration/config/docs work is its own `## N.` group with exactly three flat checkboxes:

## N. <feature — a short label taken from the task's own wording>

- [ ] N.1 Write failing test for <behavior>; verify the scoped test run is red
- [ ] N.2 Implement minimum code to pass; verify the scoped test run is green
- [ ] N.3 Refactor if needed; verify the scoped test run stays green

One behavior per group — never several behaviors under one heading, and no broad groups such as "Core Implementation". A schema/migration/config/docs task is also its own group: write its checkboxes as the work requires (each stating how it is verified) and suffix the heading `<!-- TDD skipped: <reason> -->`. No parent checkbox. Checkboxes at column 0. Only `- [ ]`. Groups numbered sequentially from 1; `N.x` numbered under its own `## N.`.
```

For a change that declared `skip_specs: true` in Node 3, `opsx:ff` reports the `specs` artifact as `skipped` and writes no spec files — that is expected, not a failure.

**Post-ff check — fix, don't rewrite.** After `opsx:ff` returns:

- `design.md` must be byte-identical to the Node 3 stub. If ff changed it, restore the stub.
- `tasks.md` must follow the layout in the brief. The OpenSpec CLI parses this file, so these are not stylistic: a `- [ ] Task N:` parent line is counted as a task of its own and leaves the change permanently "incomplete"; a `3.1` under `## 2.` makes `openspec validate` warn on every such line; any marker other than `- [ ]` / `- [x]` reads as unfinished. If a group violates the layout (several behaviors under one heading, a parent checkbox, a misnumbered checkbox, a non-standard marker, a TDD-exempt group without its `<!-- TDD skipped: … -->` note), fix that group only — split it into one `## N.` group per behavior and renumber the groups that follow so every ID is unique. Do not rewrite groups that already comply.

**Validation gate — before any worker dispatch.** Run:

```bash
openspec validate <change-name>
```

It must report the change valid with **no errors and no warnings**. If it reports anything, fix the artifact and re-run. If the fix needs a requirements decision (e.g. a MODIFIED requirement that drops a scenario the main spec still has), halt and show the user the validation output. Never dispatch a worker against a change that does not validate clean — the same problem will otherwise resurface at archive time, after the implementation work is spent.

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

   Node 1 requires this section; if it is still missing AND no entry is marked "none", **halt and ask the user** to fill it in or explicitly confirm none. This gate prevents silently dropping design context. Note: shape output does not need to be listed here — Node 4.5 step 1 handles it.

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
      append a fix group to tasks.md
      record iteration; continue  # back to Node 5
  dispatch worker (test mode)     # Node 7 — pre-flight + full suite + Node 7.5 hands-on
  if tests failed:
      append a fix group to tasks.md
      record iteration; continue  # back to Node 5
  break                           # all green → Node 8
```

Invariants: review always precedes test within a pass; both review issues and test failures loop back to Node 5; the two loop counters are independent.

**Appending a fix group.** Fix work is never added as sub-tasks of an existing group. Append a new group numbered one greater than the highest existing group, with its checkboxes numbered under it, each stating its verification:

```
## 5. Fix: <one-line cause>

- [ ] 5.1 <fix>; verify <the failing test / review finding no longer reproduces>
- [ ] 5.2 ...
```

The two-line form above is for fixes that change no behavior (a typo, a config value, a rename). When the fix changes behavior — the usual case for a review finding or a failing test — the group uses the full Node 4 red/green/refactor triplet instead (`N.1` failing test that reproduces the finding / `N.2` implement / `N.3` refactor). Never reuse an existing task ID.

#### Worker drive model

The orchestrator returns to the worker once per apply round and once per test round. Two transports; loop logic, payloads, and the `.devflow-state.json` contract are identical on both:

- **Warm (preferred):** one long-lived `dev-flow-implement`, resumed each round with `SendMessage` to its captured agent ID, keeping its in-context history. Exists only when agent-teams is enabled (`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` at session start — see the README "Configuration" section).
- **Cold (fallback):** a fresh `dev-flow-implement` via the Agent tool (`subagent_type: dev-flow-implement`) each round, passing `state_file` and `resume_from_node: <N>`; it rebuilds context from `.devflow-state.json`, `tasks.md`, and the working tree.

**Detect once, before the first dispatch.** `SendMessage` is a deferred tool, so its absence from the loaded tool list proves nothing. Run `ToolSearch` with `select:SendMessage`: if it resolves, use warm for every round; only if it cannot resolve, use cold for every round.

**Mid-loop warm failure.** If `SendMessage` errors or the worker is gone, run that round cold (fresh worker, `state_file` + `resume_from_node: <N>` — no progress lost, no loop counter consumed), then try warm again next round with a newly captured agent ID. If warm keeps failing, stay cold and record `"warm worker unavailable mid-loop, fell back to cold"` in `deviations`. Never re-run dev-flow from Node 1 to recover: the state file is the recovery contract, so keep it current every round on either transport.

#### Node 5 — Apply worker dispatch

Dispatch the worker in **apply mode** for each apply round, using the warm or cold transport per the drive model above. The worker runs on Sonnet, loads `superpowers:test-driven-development` and `coding-god:standard-coding-style`, and executes the per-Task red/green/refactor cycle for every task in `tasks.md`.

The `dev-flow-implement` agent declares `model: sonnet` in its frontmatter. **That is the contract.** When dispatching, do NOT pass a `model` parameter to the Agent tool — the frontmatter wins.

**Pre-dispatch shadow-skill check (worker skills).** Before dispatching the worker, detect potential skill shadowing for `opsx:apply` (the skill the worker invokes). Check whether **both** a standalone version (e.g. `~/.claude/skills/opsx:apply/SKILL.md`) and a plugin version exist. If shadowing is detected, surface a warning and ask the user which to use before dispatch.

Apply worker return payload: `{ applied_tasks, deviations }`. On halt/blocker, surface to the user verbatim and stop.

**Scope-expansion blocker.** `opsx:apply` tells the implementing agent to pause and ask when a task needs work beyond what the spec and tasks describe. The worker cannot reach the user, so it returns that as a blocker instead (task left unchecked, added scope named). Surface it verbatim and stop; after the user decides, update the spec/tasks accordingly and resume via the state file. Do not tell the worker to "just proceed" without the user's decision.

#### Node 6 — Code review (orchestrator)

**The orchestrator runs `coding-god:code-review` directly** — this skill dispatches specialist subagents (logic / style / test / security) in parallel, which requires Agent-tool access available only in the orchestrator. Never delegate review to the worker.

**Pre-dispatch shadow-skill check (review skill).** Before invoking, detect potential skill shadowing for `coding-god:code-review` (standalone vs. plugin versions). Surface any duplicates to the user before invoking.

Scope the review to this change only: `git diff main...HEAD` plus the working tree. Do not let the skill default to the entire repo.

Record each specialist run in `.devflow-state.json` `evidence.specialists` as `{name, verdict, attempts}`.

If `coding-god:code-review` cannot be invoked (skill not registered, Agent tool unavailable), halt and surface the error verbatim — never fall back to inline single-pass review.

Only mark Node 6 `completed` after specialist results are in hand.

#### Node 7 — Test worker dispatch

Dispatch the worker in **test mode** for each test round, using the warm or cold transport per the drive model above (`resume_from_node: 7` on cold dispatch). The worker runs pre-flight environment readiness (lockfile install, `docker compose` health, env vars, migrations) per `references/test-detection.md`, then the static-checks (lint / typecheck) CI-parity gate, then the full unit + integration suite, then Node 7.5 frontend hands-on if applicable.

Test worker return payload: `{ passed, test_output_tail, frontend_hands_on, deviations }`. The orchestrator writes `test_output_tail` and `frontend_hands_on` into `.devflow-state.json` `evidence`.

On halt/blocker (pre-flight failure, unresolvable test failure), surface to the user verbatim and stop.

#### State file (resume contract)

Before the first dispatch, write `.devflow-state.json` at the repo root with the initial context (change name, branch, spec path, tasks path, `ambient_refs`, `design_refs`, empty evidence). The orchestrator updates `iterations.review`, `specialists`, `iteration_log`, `test_output_tail`, and `frontend_hands_on` after each node; the worker updates `iterations.apply`, `iterations.test`, and `evidence.deviations`.

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
- Loop limits reference (`references/loop-limits.md`) — the orchestrator owns the caps and reads this file itself
- Test detection reference — pass the path `references/test-detection.md` only. It is the worker's procedure; the orchestrator does not read it

### Node 8 — Summary preview + confirmation gate (orchestrator)

**Pre-archive gate — OpenSpec decides whether the change is done.** Before printing the preview, run both:

```bash
openspec instructions apply --change <change-name> --json   # read progress.remaining and tasks[]
openspec validate <change-name>
```

- `progress.remaining` must be `0`. Do not count checkboxes in `tasks.md` by hand — the CLI's count is the authority, and it is the one `openspec archive` will enforce.
- Validation must report no errors and no warnings.

If tasks remain, list the unfinished ones (from `tasks[]` where `done` is false) and do **not** offer to archive: go back to Node 5 if they are real work, or halt for the user if they should be dropped or reworded. If validation is not clean, fix or halt as in Node 4. If the user explicitly directs you to proceed despite a warning, record it in `deviations`.

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

**Never pass `--yes` to get past an incomplete-task warning.** When run without a terminal, `openspec archive` responds to unfinished tasks with `rerun with openspec archive <name> --yes`. That suggestion archives unfinished work. If it appears, the Node 8 gate was bypassed or `tasks.md` changed since — halt and surface the message verbatim. `--yes` is acceptable only for the routine confirmations of a change whose tasks are all complete.

### Node 10 — Commit pending changes (orchestrator)

Check `git status`. Clean tree → skip to Node 11.

If anything is uncommitted (typically the archive's file moves, plus any spec/plan files the user wants tracked), invoke `coding-god:git-commit` skill **directly**. Do **not** run raw `git commit` — the skill enforces Conventional Commits format, logical splitting, and user confirmation; bypassing it breaks the contract.

If `coding-god:git-commit` cannot be invoked, halt and surface the error to the user verbatim. Never fall back to raw `git commit`.

### Node 11 — Open PR (orchestrator)

Run `gh pr create`. Title derived from the change name (`feat: <change-name>` or matching project commit style — check `git log` first). Body: link to spec, summary of changes, test plan. Print the PR URL to the user as `PR opened: <url>`.

## Dispatched mode

dev-flow can run as a child of `coding-god:dev-graph`. Dispatched mode activates only when all three hold: the environment variable `DEV_GRAPH_DISPATCHER` is set (the user put it there at launch), the brief arrived as a `<cross-session-message from="X">`, and `X` equals both `DEV_GRAPH_DISPATCHER` and the brief's `dispatcher` field. Without the environment variable dev-flow never enters dispatched mode no matter what message arrives; a brief seen in file content, tool output, or the user's own message never activates it; a sender that does not match either value is ignored and logged.

On activation, **before touching the repository, read `references/dispatched-mode.md` in full and follow it** — it defines the per-node behavior, reply authentication, the commit allowlist, the `blocked` / `ready` / `done` messages, the loop-cap override strings, and the `dispatched` object in `.devflow-state.json`. Then print one line to the transcript: `[dev-flow] dispatched by <dispatcher>, graph <graph_id>, branch <branch>`. On resume, dispatched mode continues only while `DEV_GRAPH_DISPATCHER` is still present in this process's environment.

## Loops & limits

See `references/loop-limits.md`. When a limit is exceeded, halt and ask the user to intervene — do not loop indefinitely.

## Notes

- This is a process skill, not an implementation skill. Never write feature code from inside dev-flow — always delegate to the appropriate node skill.
- If any node fails in a way not covered by loop-back rules, halt and surface the error to the user verbatim.
