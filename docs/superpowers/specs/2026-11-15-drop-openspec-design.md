# Drop OpenSpec from dev-flow, add test gates, make dev-graph the only entry

Date: 2026-11-15
Graph design (the approved source, same repository): `docs/superpowers/specs/2026-11-15-drop-openspec-graph-design.md`

## Problem

The user wants three things from the coding-god workflow: speed, stable software, and accuracy (the thing built is the thing approved, proven by unit tests). Today dev-flow depends on OpenSpec for its task list and its "is it done" check. In practice OpenSpec adds cost without adding to those three things:

- Its artifacts duplicate the design document (`proposal.md` is copied from it, `design.md` is a stub pointing at it).
- A large share of `dev-flow/SKILL.md` exists only to satisfy the OpenSpec CLI (version checks, delta format rules, layout rules, the `--yes` trap).
- The accumulated `openspec/specs/` restate what the code already says, go stale whenever a change bypasses dev-flow, and nobody — the user or the AI — reads them to make decisions.
- Every repository dev-graph touches must be initialized for OpenSpec, per host.

Meanwhile two real gaps in accuracy are untouched by OpenSpec:

- **Red is self-reported.** The worker ticks "verified red" and nothing proves it. In a live run on 2026-10-19 the "red" was a compile failure and one e2e test was never red at all.
- **Nobody checks that every approved scenario has a test.** A backend scenario can go untested while everything is green.

## Goal

1. dev-flow and dev-graph run with no OpenSpec CLI, no OpenSpec skills or commands, and no `openspec/` directory, on both Claude Code and opencode.
2. Red evidence is produced by a tool, not typed by a model, and a reviewer other than the worker judges whether it was a real assertion failure.
3. Every scenario the user approved is mapped to a task group, and a reviewer other than the worker judges whether the mapped test really asserts it.
4. One deterministic script decides "done": tasks complete, scenarios mapped, red evidence present. It ships with the skill and has unit tests.
5. `/dev-graph` is the only user entry. dev-flow stays as the engine each child session runs, reachable only through an authenticated dispatch from dev-graph.

Non-goals:

- No optional "OpenSpec mode". This is a clean cut.
- No migration or deletion of existing `openspec/` directories, generated `.claude/skills/openspec-*` skills, or `/opsx` commands in this or any other repository. They are simply no longer used.
- No change to standalone `coding-god:code-review` behavior (the two new audits run only when dev-flow passes its context).
- No change to the cross-session transport, authentication, or the opencode plugin's tools.
- No renumbering of dev-flow nodes (see Design §2).

## Design

**About this run.** This change is built with the installed coding-god 1.13.0 flow, so this run itself still uses OpenSpec; that is expected. Everything below describes the product after the change.

**Anti-goals — a result that does any of these is a failure even if it "works":**

- A gate the worker can satisfy by typing text: evidence the model writes by hand, or a "scenario covered" claim nobody independent checks.
- Two code paths to keep in sync (OpenSpec and non-OpenSpec, or user-facing dev-flow and dispatched dev-flow).
- A script that needs something the hosts do not guarantee (`jq`, Node, Python, bash 4).
- Leftover references that send a session looking for `openspec` or `opsx:*`.

**Findings from recon:**

- Almost all behavior lives in prose (`SKILL.md`, agent files, references). Only two places can carry unit tests: `opencode/` (TypeScript, vitest, 30+ specs) and the new script.
- A script cannot tell an assertion failure from a compile failure across languages. It can prove a command was run and exited non-zero, and keep the output. The judgement needs a model — and it must not be the worker's own.
- OpenSpec references outside `openspec/`: `dev-flow/SKILL.md` (44), `agents/dev-flow-implement.md` (7), `dev-graph/SKILL.md` (5), `dev-flow/references/branch-naming.md` (4), `dev-flow/references/dispatched-mode.md` (1, the commit allowlist), `README.md` (2), `.opencode/INSTALL.md` (1). `opencode/src` has none.
- `.devflow-state.json` sits at the repository root, is git-ignored, and is read by dev-graph as `<root>/.devflow-state.json`. It stays where it is.
- `coding-god:test-reviewer` is currently dispatched by code-review only when the diff contains test files or more than 50 lines of logic.
- Local tools: Claude Code 2.1.325, opencode 2.2.7. Both hosts can be exercised on this machine.
- The children that build this change run the installed coding-god 1.13.0, so this one run still goes through OpenSpec. That is expected.

### 1. Working files (per run, never committed)

```
<repo root>/
  .devflow-state.json        # unchanged location and role
  .devflow/
    tasks.md                 # the task list for the current run
    red/<N>.txt              # red evidence for task group N, written by the gate script
```

- `.devflow/` is git-ignored. dev-graph's G2 adds the entry when it is missing, exactly as it does for `.devflow-state.json` today.
- One run per working tree at a time (already true of `.devflow-state.json`). Node 4 deletes `.devflow/` and recreates it when it starts a new change; a resumed run keeps it.
- Nothing here is committed. What reviewers need from it is copied into the PR body (§6).

### 2. Nodes

Node numbers are kept, because they appear in the dispatch protocol (`node: 6` / `node: 7`), in `resume_from_node`, in loop-limit strings, and across dev-graph. **Nodes 3 and 9 are retired and their numbers are not reused.**

| Node | Before | After |
|---|---|---|
| 1 | brainstorm with the user | removed from dev-flow (always dispatched; the spec arrives in the brief) |
| 2 | ask about a branch; create it | create the brief's branch; derive `change_name` from the spec title here |
| 3 | create OpenSpec change, copy proposal/specs/design | **retired** — its one remaining duty, checking the spec has the required sections, moves into the gate script's `plan` command |
| 4 | `opsx:ff` writes `tasks.md`; `openspec validate` | dev-flow writes `.devflow/tasks.md` itself, then runs `plan` |
| 4.5 | aggregate design refs | unchanged (shape file moves to `.devflow/shape.md`) |
| 5 | worker runs `opsx:apply` | worker works `tasks.md` directly; red goes through the script |
| 6 | code review | unchanged, plus two audits by test-reviewer (§5) |
| 7 | tests | unchanged |
| 8 | `openspec` progress + validate; preview; ask user | script `check`; preview; send `ready` |
| 9 | `opsx:archive` | **retired** |
| 10 | commit | unchanged; allowlist loses the OpenSpec entry |
| 11 | PR | unchanged, plus the scenario table in the body |

All OpenSpec prerequisites go: the CLI version check, the `generatedBy` check, the shadow-skill check for `opsx:apply`, and their opencode counterparts.

### 3. Spec format (`dev-flow/references/spec-format.md`, new)

One reference file defines what a spec handed to dev-flow must contain. dev-graph G1 and G3 cite it; dev-flow's `plan` check enforces it. Headings, in order: `## Problem`, `## Goal`, `## Design`, `## Affected files`, `## Requirements`, `## References`.

`## Requirements` is plain markdown — no OpenSpec delta format, no fences, no `ADDED`/`MODIFIED`:

```
### Requirement: <name>
<statement using SHALL / MUST>

#### Scenario S1: <name>
- **WHEN** <condition>
- **THEN** <outcome>
```

- Scenario ids are `S` followed by a number, unique within the spec. They are the keys the gate uses.
- A change with no behavior change (pure refactor, tooling, config, docs) writes the single line `No behavior change.` under `## Requirements` and has no scenarios.

### 4. Task file and gate script

**Layout of `.devflow/tasks.md`** — the existing red/green/refactor layout, plus one line per group:

```
## 2. Empty order list returns an empty array
Scenarios: S3, S4

- [ ] 2.1 Write failing test for <behavior>; verify the scoped test run is red
- [ ] 2.2 Implement minimum code to pass; verify the scoped test run is green
- [ ] 2.3 Refactor if needed; verify the scoped test run stays green
```

- The existing rules stay: one behavior per group, no wiring-only groups, no parent checkbox, checkboxes at column 0, only `- [ ]` / `- [x]`, groups numbered from 1.
- A group whose heading ends with `<!-- TDD skipped: <reason> -->` (schema, migration, config, docs, prose such as a `SKILL.md`, and fix groups that change no behavior) needs no red evidence. It **may** carry a `Scenarios:` line: that is how a scenario that cannot be unit-tested gets mapped (see "Scenarios without a unit test" below).
- Every other group is a TDD group and must have a `Scenarios:` line: one or more ids, or `Scenarios: none — <reason>` (for example a fix group for a review finding the spec has no scenario for).
- Several groups may name the same scenario. A scenario is mapped when at least one group names it, and **unit-tested** when at least one TDD group names it.
- Fix groups appended in the Nodes 5–7 loop follow the same rules.

**Scenarios without a unit test.** Some approved scenarios cannot be unit-tested — the behavior of a prose skill, a visual result. Forcing a token test onto them would be a gate satisfied by typing text. Instead they are mapped by a TDD-skipped group, whose reason says how the scenario is verified instead (hands-on at Node 7.5, a live run, a manual check). They are never silent: the script lists every scenario that no TDD group names, with the skip reason, under its own heading; `test-reviewer` audits each reason (§5); dev-graph shows the list in the G7 summary before the user approves; the PR table shows `not unit-tested — <reason>` in the test column.

**Red after the implementation already exists.** A test added or repaired late — a fix group for a compile-failure red, for a scenario whose test did not assert it, or for missing evidence — would pass at once, and `red` would refuse it. The worker obtains red by taking the implementation away: replace the body under test with the smallest stub (as in the compiled-language rule), run `red <N> -- <command>` and see the test's own assertion fail, restore the implementation, and see green. This is `test-reviewer`'s "would the test still pass with the implementation deleted?" check, executed instead of imagined.

- To repair the evidence of an existing group `N`, the appended fix group is TDD-skipped (it changes no behavior), its checkboxes spell out those steps, and it re-runs `red N`, overwriting `.devflow/red/N.txt`. No "supersedes" notation is needed: evidence stays keyed to the group that owns the test.
- A fix group that adds a new test is an ordinary TDD group with its own number, its own `Scenarios:` line and its own evidence, obtained the same way.

**Script: `plugins/coding-god/skills/dev-flow/scripts/devflow-gate.sh`.** POSIX `sh` using only `awk`, `sed`, `grep` and coreutils in the forms macOS and Linux share. It never parses JSON. Three commands, each taking `--root <repo root>` (default: current directory):

- `plan <spec>` — run at Node 4, before any worker is dispatched. Fails unless: the spec has the six headings; scenario ids are unique; `tasks.md` follows the layout; every TDD group has a `Scenarios:` line; every id it names exists in the spec; every scenario in the spec is named by at least one group.
- `red <N> -- <command…>` — run by the worker for step `N.1`. Runs the command. Exit code 0 means the test is not red: the script prints that, writes nothing, and exits non-zero. Otherwise it writes `.devflow/red/<N>.txt` containing the command line, the exit code, and the last 40 lines of combined output, and exits 0. Running it again for the same `N` overwrites.
- `check <spec>` — run at Node 8 and again by dev-graph at G7. Everything `plan` checks, plus: no unticked checkbox; every TDD group has a red evidence file. Prints a report and exits 0 only when all hold. Scenarios without a unit test do not fail `check`; they are reported.

In every command, lines inside fenced code blocks are ignored when looking for headings, scenarios, and checkboxes.

`check` prints, in a stable line-oriented form the orchestrator copies into its preview: tasks total / remaining (with the unticked ids), the scenario → groups table, scenarios with no group, **scenarios without a unit test** (named only by TDD-skipped groups) with the reason, groups without red evidence, and every TDD-skipped group and every `Scenarios: none` group with its reason.

**Permissions.** The worker calls the script as `sh <absolute path>/devflow-gate.sh red <N> -- <scoped test command>`. That call is judged by the host's permission mode like any other shell command — the same exposure the worker's test runs have today. Two consequences, both accepted: in a prompting mode a user's existing allow rule for the bare test command does not match the wrapped call, so each `red` call may prompt once; and **no document may suggest an allow rule for the script**, because `red` runs whatever follows `--` and such a rule would allow any command. dev-graph's launch command, permission mode handling and G2 checklist are not changed for this. A prompt in a child is still user exception 1.

**How sessions find the script.** The orchestrator resolves the absolute path from the skill's own directory — the same way it already resolves `references/…` — and passes it to the worker in the dispatch brief as `gate_script`. This must work on opencode, where the skill is registered from the clone's `SKILL.md` path.

**Unit tests.** vitest specs under `opencode/test/` run the script with `sh` against fixture directories. This is the repository's only test runner; a second one is not worth adding for a single script. At least one spec runs the script with a `PATH` that contains no `jq`, `node`, or `python`.

### 5. Who judges what

| Question | Decided by |
|---|---|
| Are all tasks ticked? Is every scenario mapped? Does every TDD group have a failing run on record? | the script |
| Was that failing run the test's own assertion failing — not a compile, import, or syntax error, and not some unrelated test? Is the recorded command the scoped test command for a test in this change? | `test-reviewer`, at Node 6 |
| For each scenario, does the test of at least one TDD group that names it exercise the scenario's WHEN and assert its THEN? | `test-reviewer`, at Node 6 |
| For each scenario without a unit test, is the reason true — could a unit test have been written in this repository? | `test-reviewer`, at Node 6 |

- When dev-flow invokes `coding-god:code-review`, it passes three extra inputs: the spec path, the tasks path, and the red evidence directory. With them, code-review **always** dispatches `test-reviewer` (regardless of the diff-size trigger) and hands it the three paths.
- `test-reviewer` gains two audits, run only when those inputs are present: **Red Evidence Audit** and **Scenario Coverage Audit**. Each failure is a finding of at least "Important", so it loops back to Node 5 as a fix group through the existing mechanism.
- Standalone code-review passes none of the three and behaves as today.

The worker keeps the existing rule (in a compiled language, add the smallest stub so the test fails on its assertion); the difference is that the run is now recorded and somebody else reads it.

### 6. Node 8, the summary, and the PR

- Node 8 runs `check`. If it fails: unfinished tasks go back to Node 5; an unmapped scenario or missing red evidence becomes an appended fix group and goes back to Node 5, counted against the review loop cap (the review reruns afterwards anyway). `ready` is sent only after `check` exits 0, and the preview includes the script's report.
- dev-graph G7 does not take the child's word for it: for each `ready` child it runs `check` itself, using its own copy of the script, against `<root>` and the child's spec. If it fails, the child is told `gate check failed — <report>; append a fix group, re-run Nodes 5–7, then send ready again` and set back to `dispatched`. A second failure for the same child marks it `failed`. The script's report becomes part of the per-group evidence in the summary.
- The Node 11 PR body gains a "Scenarios" table: id, name, task group(s), and test file — or `not unit-tested — <reason>`. This is the only trace of `tasks.md` that reaches git hosting.
- The commit allowlist in `dispatched-mode.md` loses "this change's OpenSpec files". `.devflow/` is ignored, so it cannot be committed by accident.

### 7. dev-graph is the entry; dev-flow is the engine

- `dev-flow`'s frontmatter description says it is the engine run by a dev-graph child and carries no user trigger phrases. The trigger phrases ("實作 X", "做一個 Y", "新功能", "修 Z bug", "build a feature", "implement") move to `dev-graph`'s description, with the existing "not for one-off questions or trivial edits" exclusion.
- dev-flow invoked without an authenticated dispatch brief does nothing to the repository: it prints one line telling the user to run `/dev-graph` and stops.
- Everything in dev-flow that exists only for a user sitting in the same session is removed: Node 1's brainstorm and its overrides, Node 2's question, Node 8's yes/no, the loop-limit three-option menu, and every "surface to the user" branch — each becomes the `blocked` / `ready` behavior that dispatched mode already defines. `references/dispatched-mode.md` remains the single authority for authentication, message forms, the commit allowlist and reply strings; its "Normal" column goes away.
- dev-graph's own text is updated where it leans on the removed parts: Prerequisites and the G2 checklist lose the OpenSpec items and gain the `.devflow/` ignore entry; G3 cites `spec-format.md` instead of "every section dev-flow's Node 1 requires" and the delta format; the contract-conformance paragraph says Node 4 instead of `opsx:ff`.

### 8. opencode

- Every "On opencode:" paragraph that mentions OpenSpec, `/opsx-*`, or `.opencode/skills/openspec-*` is removed or rewritten.
- `.opencode/INSTALL.md` drops the OpenSpec prerequisite.
- No change to `opencode/src` is expected. If the builder finds one is needed (for example to expose the skill directory so the script path resolves), it is in scope and gets a vitest spec.

### 9. Docs and version

- `README.md`: OpenSpec/opsx prerequisite removed; `/dev-graph` described as the way to start work; dev-flow described as internal.
- `CLAUDE.md`: the `openspec/` block leaves the structure listing, and "Changes to this marketplace are managed via OpenSpec" becomes "…are delivered with `/dev-graph`".
- `dev-flow/references/branch-naming.md`: "opsx change name" becomes the change name derived from the spec title.
- `.gitignore`: add `.devflow/`.
- `plugins/coding-god/.claude-plugin/plugin.json` and `opencode/package.json` both go to **2.0.0** (the entry point and prerequisites change).
- A vitest spec fails if any tracked file under `plugins/`, `opencode/src`, `.opencode/INSTALL.md`, `README.md` or `CLAUDE.md` contains `openspec` or `opsx` (case-insensitive), so the dependency cannot creep back.

### 10. How each scenario is verified

- S1–S13, S16, S27, S30 and S31 are verified by vitest specs under `opencode/test/`. These are the TDD groups of this change: write each spec first and see it fail on its own assertion.
- S14, S15, S17–S26, S28, S29, S32 and S33 are behavior of prose skills and cannot be unit-tested. Their task groups are `<!-- TDD skipped: prose skill, verified by the main session's live runs -->`. The dev-graph main session runs dev-graph end to end on Claude Code and on opencode against this branch before the PR is approved, and checks each of these ids there. Write the prose so each of these scenarios can be observed in a transcript.
- `npm test` and `npm run typecheck` in `opencode/` must pass.

### 11. Repository notes

- `docs/` is git-ignored in this repository; spec files are force-added, as the 2026-11-13 specs were. Commit this file and the graph design.
- A repository hook rejects any commit touching `plugins/` unless `plugins/<name>/.claude-plugin/plugin.json` changes its version in that commit. Bump coding-god to 2.0.0 in the first commit that touches `plugins/coding-god`, and keep every later commit to that plugin carrying a version change (2.0.0 → 2.0.1 … if the work is split into several commits).
- Do not add `Co-Authored-By` trailers or generated footers to commit messages.
- Leave the local, untracked `openspec/` directory, `.claude/skills/openspec-*` and `.claude/commands/opsx` alone, apart from what this run's own OpenSpec steps write.

### Left to the builder

- Exact wording of the rewritten `SKILL.md` and agent sections, and whether the dispatched-mode behavior is stated inline per node or kept in the reference file with the nodes pointing at it.
- The script's internal structure, its option parsing, and the exact text of its report (it must stay line-oriented and stable enough for the specs to assert on).
- Fixture layout for the vitest specs.
- Whether `plan` and `check` share code through a function or a mode flag.

## Affected files

- `plugins/coding-god/skills/dev-flow/SKILL.md` — rewritten around the gate script; OpenSpec and user-facing mode removed
- `plugins/coding-god/skills/dev-flow/scripts/devflow-gate.sh` — new
- `plugins/coding-god/skills/dev-flow/references/spec-format.md` — new
- `plugins/coding-god/skills/dev-flow/references/dispatched-mode.md`, `loop-limits.md`, `branch-naming.md`, `test-detection.md` (only where it names removed parts)
- `plugins/coding-god/agents/dev-flow-implement.md`, `plugins/coding-god/agents/test-reviewer.md`
- `plugins/coding-god/skills/code-review/SKILL.md`
- `plugins/coding-god/skills/dev-graph/SKILL.md` and `references/dispatch-protocol.md`, `references/session-discovery.md` (where they name removed parts)
- `plugins/coding-god/skills/git-commit/SKILL.md` (only if its dispatched-mode section names removed parts)
- `plugins/coding-god/.claude-plugin/plugin.json`, `opencode/package.json`, `opencode/package-lock.json` — version 2.0.0
- `opencode/test/` — new vitest specs and fixtures for the script and the text checks
- `.opencode/INSTALL.md`, `README.md`, `CLAUDE.md`, `.gitignore`

## Requirements

Capability: `dev-flow-task-gate` (new)

```markdown
# Spec Delta

## Purpose

Defines how dev-flow plans, proves and gates work without OpenSpec: its own task file, a gate script that validates the plan, records red evidence and decides completion, independent review of that evidence, and dev-graph as the only user entry on both Claude Code and opencode.

## ADDED Requirements

### Requirement: The gate script validates the plan
The script's `plan` command SHALL exit 0 only when the spec and `tasks.md` are well-formed and every scenario is mapped.

#### Scenario: S1 Well-formed spec and tasks
- **WHEN** `plan` runs on a spec with the six headings and a `tasks.md` in which every TDD group names existing scenario ids and every scenario is named
- **THEN** it exits 0

#### Scenario: S2 A scenario no group maps
- **WHEN** the spec has scenario `S3` and no group's `Scenarios:` line names it
- **THEN** `plan` exits non-zero and its output names `S3`

#### Scenario: S3 A group names an unknown scenario
- **WHEN** a group's `Scenarios:` line names an id the spec does not have
- **THEN** `plan` exits non-zero and its output names the group and the id

#### Scenario: S31 A scenario mapped only by a TDD-skipped group
- **WHEN** scenario `S5` is named only by a group marked `<!-- TDD skipped: <reason> -->`
- **THEN** `plan` and `check` do not fail on it, and their output lists `S5` as without a unit test, with that reason

#### Scenario: S4 A TDD group with no Scenarios line
- **WHEN** a group has no `<!-- TDD skipped: … -->` marker and no `Scenarios:` line
- **THEN** `plan` exits non-zero and its output names the group

#### Scenario: S5 Content inside code fences is ignored
- **WHEN** the spec or `tasks.md` contains headings, scenario lines, or checkboxes inside a fenced code block
- **THEN** they are not counted as sections, scenarios, groups, or tasks

#### Scenario: S6 A spec missing a required heading
- **WHEN** the spec lacks one of the six headings
- **THEN** `plan` exits non-zero and its output names the missing heading

#### Scenario: S7 A change with no behavior change
- **WHEN** `## Requirements` is the single line `No behavior change.` and every group is TDD-skipped
- **THEN** `plan` exits 0

### Requirement: The gate script records red evidence itself
The script's `red` command SHALL run the given command and record evidence only when it fails.

#### Scenario: S8 The command fails
- **WHEN** `red 2 -- <command>` runs and the command exits non-zero
- **THEN** `.devflow/red/2.txt` contains the command line, the exit code, and the tail of the output, and `red` exits 0

#### Scenario: S9 The command passes
- **WHEN** `red 2 -- <command>` runs and the command exits 0
- **THEN** no evidence file is written (an existing one for that group is left untouched), the output says the run was not red, and `red` exits non-zero

### Requirement: The gate script decides completion
The script's `check` command SHALL exit 0 only when the plan is valid, every checkbox is ticked, and every TDD group has red evidence.

#### Scenario: S10 Unticked checkboxes
- **WHEN** `tasks.md` has an unticked checkbox
- **THEN** `check` exits non-zero and its output gives the remaining count and the unticked ids

#### Scenario: S11 A TDD group without red evidence
- **WHEN** every checkbox is ticked and a TDD group has no `.devflow/red/<N>.txt`
- **THEN** `check` exits non-zero and its output names the group

#### Scenario: S12 Everything complete
- **WHEN** every checkbox is ticked, every scenario is mapped, and every TDD group has red evidence
- **THEN** `check` exits 0 and its report lists the scenario → group mapping, every TDD-skipped group with its reason, and every `Scenarios: none` group with its reason

#### Scenario: S13 No extra tooling needed
- **WHEN** the script runs under `sh` with a `PATH` that has no `jq`, `node`, or `python`
- **THEN** all three commands work

### Requirement: dev-flow runs without OpenSpec
dev-flow SHALL NOT invoke the OpenSpec CLI or any `opsx` skill or command, and SHALL NOT read or write an `openspec/` directory.

#### Scenario: S14 A repository with no OpenSpec
- **WHEN** a dispatched dev-flow run starts in a repository with no `openspec/` directory and no OpenSpec CLI installed
- **THEN** it runs through Node 8 and sends `ready` without any OpenSpec prerequisite failure

#### Scenario: S15 Node 4 writes and checks the task file
- **WHEN** Node 4 runs for a new change
- **THEN** any previous `.devflow/` is removed, `.devflow/tasks.md` is written in the layout above, and no worker is dispatched until `plan` exits 0

#### Scenario: S16 No OpenSpec text remains
- **WHEN** the tracked files under `plugins/`, `opencode/src`, `.opencode/INSTALL.md`, `README.md` and `CLAUDE.md` are searched for `openspec` or `opsx`, case-insensitively
- **THEN** there is no match

### Requirement: Red and scenario coverage are judged by someone other than the worker
The worker SHALL record red through the script, and `test-reviewer` SHALL audit the evidence and the scenario mapping.

#### Scenario: S17 The worker's test is green before implementation
- **WHEN** the worker runs `red` for step `N.1` and the script refuses because the command passed
- **THEN** the worker fixes the test and does not tick `N.1`

#### Scenario: S18 Red was a compile failure
- **WHEN** a group's evidence shows a compile, import, or syntax error rather than the test's own assertion failing
- **THEN** `test-reviewer` reports a finding and dev-flow appends a fix group and returns to Node 5

#### Scenario: S19 The mapped test does not assert the scenario
- **WHEN** a group names scenario `S2` and its test does not exercise `S2`'s WHEN or does not assert its THEN
- **THEN** `test-reviewer` reports a finding and dev-flow appends a fix group and returns to Node 5

#### Scenario: S32 Re-proving red after the implementation exists
- **WHEN** a fix group must supply red evidence for a test whose implementation is already in place
- **THEN** the worker stubs the implementation, records red through the script, restores the implementation, and verifies green; evidence for an existing group `N` is written to `.devflow/red/N.txt`

#### Scenario: S33 A scenario marked not unit-testable that could be tested
- **WHEN** a scenario is mapped only by a TDD-skipped group and a unit test for it could have been written in this repository
- **THEN** `test-reviewer` reports a finding and dev-flow appends a TDD fix group for it

#### Scenario: S20 test-reviewer always runs inside dev-flow
- **WHEN** dev-flow invokes code-review with the spec path, tasks path, and red evidence directory
- **THEN** `test-reviewer` is dispatched whatever the size of the diff, and receives those three paths

#### Scenario: S21 Standalone code-review is unchanged
- **WHEN** code-review is invoked without those three inputs
- **THEN** `test-reviewer` is selected by the existing trigger and runs neither new audit

### Requirement: Completion is gated by the script at Node 8 and again by dev-graph
dev-flow SHALL send `ready` only after `check` passes, and dev-graph SHALL run `check` itself before offering a child for `proceed`.

#### Scenario: S22 Node 8 with a failing check
- **WHEN** `check` exits non-zero at Node 8
- **THEN** dev-flow does not send `ready` and returns to Node 5

#### Scenario: S23 dev-graph's own check fails for a ready child
- **WHEN** a child has sent `ready` and dev-graph's own `check` against that child's root exits non-zero
- **THEN** dev-graph sends the child the gate-failed reply, sets it back to `dispatched`, and does not include it in the `proceed` question; a second failure for the same child marks it `failed`

#### Scenario: S24 Nothing from the working files is committed
- **WHEN** Node 10 commits
- **THEN** no path under `.devflow/` and no path under `openspec/` is in any commit

#### Scenario: S25 The PR shows the mapping
- **WHEN** Node 11 opens the PR
- **THEN** the body contains a table of scenario id, name, task group(s), and test file or `not unit-tested — <reason>`

### Requirement: dev-graph is the only user entry
dev-flow SHALL act only on an authenticated dispatch brief, and the user-facing triggers SHALL belong to dev-graph.

#### Scenario: S26 dev-flow invoked directly by a user
- **WHEN** dev-flow is invoked in a session with no authenticated dispatch brief
- **THEN** it prints one line directing the user to `/dev-graph`, changes nothing in the repository, and stops

#### Scenario: S27 Trigger phrases
- **WHEN** the skill descriptions are read
- **THEN** the feature/bug trigger phrases appear in `dev-graph`'s description and not in `dev-flow`'s

#### Scenario: S28 dev-graph in a repository without OpenSpec
- **WHEN** G2's prerequisite checklist runs for a group whose repository has no OpenSpec
- **THEN** the checklist passes, and `.devflow/` is added to that repository's `.gitignore` if it was missing

### Requirement: The same flow works on opencode
Everything above SHALL hold when the session runs on opencode with the coding-god plugin loaded.

#### Scenario: S29 The script path resolves on opencode
- **WHEN** dev-flow runs on opencode
- **THEN** the orchestrator resolves the script's absolute path from the registered skill path, the worker subagent receives it as `gate_script`, and `plan`, `red` and `check` run

#### Scenario: S30 opencode install needs no OpenSpec
- **WHEN** `.opencode/INSTALL.md` is followed on a machine without OpenSpec
- **THEN** no step asks for the OpenSpec CLI or `openspec init`
```

## References

- [ ] (none — purely backend/internal)
