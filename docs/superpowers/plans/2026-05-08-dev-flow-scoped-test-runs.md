# dev-flow Scoped Test Runs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop dev-flow Nodes 5–7 from running the full Vitest suite on every TDD inner-loop iteration. Inner loop runs scoped to the current Task's test file; Node 7 keeps the full-suite gate; TDD red gate is preserved.

**Architecture:** Two-command cache in `references/test-detection.md` (full-suite + scoped template). Node 5 in `agents/dev-flow-implement.md` rewritten to an explicit per-Task cycle that runs the scoped command at N.1 (red), N.2 (green), and N.3 (refactor stays green).

**Tech Stack:** Markdown (skill content). No code, no runtime tests. Verification is via re-reading the edited files and confirming the orchestrator + subagent contracts still match.

**Spec:** `docs/superpowers/specs/2026-05-08-dev-flow-scoped-test-runs-design.md`

---

## File Structure

Two existing files modified, no new files:

- **Modify:** `plugins/dev-flow/skills/dev-flow/references/test-detection.md`
  Two-command cache format; per-runner scoped templates; optional Vitest perf notes.
- **Modify:** `plugins/dev-flow/agents/dev-flow-implement.md`
  Node 5 rewritten to explicit per-Task cycle with scoped runs at N.1/N.2/N.3. Node 7 wording adjusted to point at the "Full suite" cached command.

No files in `plugins/dev-flow/skills/dev-flow/SKILL.md` need to change — the orchestrator delegates to the subagent and the references doc; both edits live below it.

---

## Task 1: Update test-detection.md cache format and add scoped templates

**Files:**
- Modify: `plugins/dev-flow/skills/dev-flow/references/test-detection.md`

The current `## Caching the result` section (lines ~19–24) writes a single `## Test Commands` block to project CLAUDE.md. Replace with a two-entry format and add per-runner scoped derivation rules.

- [ ] **Step 1: Replace the "Caching the result" section**

Open `plugins/dev-flow/skills/dev-flow/references/test-detection.md`. Find the section starting with `## Caching the result` and ending before `## Environment readiness (pre-flight)`. Replace its body with:

```markdown
## Caching the result

After detection, append BOTH a full-suite command and a scoped template to the
project's CLAUDE.md under a `## Test Commands` heading (create the section if
missing). The format is:

```
## Test Commands
- Full suite (Node 7 gate): <full-suite command>
- Scoped (Node 5 inner loop): <scoped template> — substitute the test file path per Task
```

The full-suite command is what the search order in the previous section
produces. The scoped template is mechanically derived from the runner:

| Runner | Scoped template |
|---|---|
| Vitest | `<pkg-mgr> vitest run <file>` |
| Jest | `<pkg-mgr> jest <file>` |
| Mocha | `<pkg-mgr> mocha <file>` |
| Go | `go test <package>` (use the package path of the file under test) |
| Pytest | `pytest <file>` |
| Cargo | `cargo test --test <name>` |
| Bun test | `bun test <file>` |

If the project's runner has no obvious scoped form, fall back to the full-suite
command for inner loop too and add `"scoped form unknown for runner X"` to
`evidence.deviations` so the orchestrator surfaces it.

On future dev-flow runs, Node 7 reads the "Full suite" line; Node 5 reads the
"Scoped" line and substitutes the current Task's test file path.

If the user has explicitly excluded auto-edits to CLAUDE.md, store both
commands in conversation memory instead and surface them to the user.
```

- [ ] **Step 2: Verify the section reads correctly**

Run: `grep -A 30 "^## Caching the result" plugins/dev-flow/skills/dev-flow/references/test-detection.md`

Expected: the new two-entry format appears, the runner table is present, and the next heading after the section is `## Environment readiness (pre-flight)`.

- [ ] **Step 3: Commit**

```bash
git add plugins/dev-flow/skills/dev-flow/references/test-detection.md
git commit -m "feat(dev-flow): cache scoped test template alongside full-suite command"
```

---

## Task 2: Add Frontend test perf notes subsection

**Files:**
- Modify: `plugins/dev-flow/skills/dev-flow/references/test-detection.md`

Add a short opt-in subsection. The skill never auto-applies these flags — it only surfaces them.

- [ ] **Step 1: Insert the new subsection**

Insert at the end of the file (after the existing `## Running` section), preserving the trailing newline:

```markdown

## Frontend test perf notes

If the project uses Vitest with jsdom/happy-dom and the full-suite run is slow
or memory-heavy, consider these flags. **Do not auto-apply** — surface to the
user and let them decide whether to add them to the cached command:

- `--pool=forks --poolOptions.forks.singleFork=true` — single worker, lower memory
- `--no-isolate` — skip module isolation between tests; faster but tests must be hygienic (no cross-test global state)

These are advisory. The skill does not modify the user's cached command without their explicit approval.
```

- [ ] **Step 2: Verify it was added**

Run: `grep -c "^## Frontend test perf notes" plugins/dev-flow/skills/dev-flow/references/test-detection.md`

Expected: `1`

- [ ] **Step 3: Commit**

```bash
git add plugins/dev-flow/skills/dev-flow/references/test-detection.md
git commit -m "docs(dev-flow): add advisory Vitest perf notes to test-detection"
```

---

## Task 3: Rewrite Node 5 in dev-flow-implement.md to explicit per-Task cycle

**Files:**
- Modify: `plugins/dev-flow/agents/dev-flow-implement.md` (line ~61–73)

The current Node 5 says "Run tests after each sub-task" with a four-step list. Replace with the explicit per-Task cycle that names the scoped command and the red/green observations.

- [ ] **Step 1: Replace the Node 5 body**

Open `plugins/dev-flow/agents/dev-flow-implement.md`. Find the `## Node 5 — opsx:apply` heading. Replace the body (everything between that heading and the next `## Node 6 — Code review` heading) with:

```markdown
## Node 5 — opsx:apply

Invoke `opsx:apply`. The inner loop is **per Task**, not per sub-task. Each Task in `tasks.md` is structured `N.1 write failing test / N.2 implement / N.3 refactor` (per dev-flow's Rule B). Use the **scoped** test command from CLAUDE.md's `## Test Commands` section — never the full-suite command — substituting the Task's test file path.

Per Task N (one cycle):

1. **N.1 — Write failing test.** Run the scoped command for that test file. **MUST observe red.** If the run goes green, the test does not actually exercise the behavior (common cause: assertion against a mock that always returns the expected shape, or a missing `await`). Fix the test before continuing — do not move to N.2.
2. **N.2 — Implement minimum code.** Re-run the same scoped command. **MUST observe green.** Apply coding-style rules as you write.
3. **N.3 — Refactor (if needed).** Re-run the scoped command after each refactor step. **MUST stay green.** Keep coding-style rules applied.

The scoped command is whatever the project's CLAUDE.md `## Test Commands` "Scoped" line specifies, with `<file>` substituted. If CLAUDE.md is missing the Scoped line, run `references/test-detection.md` end-to-end to populate it before continuing — do not fall back to the full suite for the inner loop.

Tasks annotated `<!-- TDD skipped: <reason> -->` (typically schema/migration/config/docs) follow the task as written without the red/green cycle.

**Do not run the full suite during Node 5.** That is Node 7's job.
```

- [ ] **Step 2: Verify the replacement**

Run: `sed -n '/^## Node 5 /,/^## Node 6 /p' plugins/dev-flow/agents/dev-flow-implement.md`

Expected: the new per-Task cycle text is present, including "MUST observe red" and "Do not run the full suite during Node 5", and the section ends right before `## Node 6 — Code review`.

- [ ] **Step 3: Commit**

```bash
git add plugins/dev-flow/agents/dev-flow-implement.md
git commit -m "feat(dev-flow): scope Node 5 inner loop to per-Task scoped test runs"
```

---

## Task 4: Adjust Node 7 wording to reference the "Full suite" cached command

**Files:**
- Modify: `plugins/dev-flow/agents/dev-flow-implement.md` (Node 7 section, around line 113–130)

Node 7's contract doesn't change, but step 2 ("Locate test commands") needs to point at the "Full suite" line specifically so there's no ambiguity with the new scoped line.

- [ ] **Step 1: Update Node 7 step 2**

In `plugins/dev-flow/agents/dev-flow-implement.md`, find the Node 7 numbered list. The current step 2 reads:

```
2. Locate test commands.
```

Replace that single line with:

```
2. Locate test commands. Use the **"Full suite"** entry from CLAUDE.md's `## Test Commands` section (not the "Scoped" entry — that is Node 5's). If the section is missing or has only one entry, run `references/test-detection.md` to populate both before continuing.
```

- [ ] **Step 2: Verify**

Run: `grep -n "Full suite" plugins/dev-flow/agents/dev-flow-implement.md`

Expected: at least one match in the Node 7 region (line ~113+) referencing the "Full suite" entry.

- [ ] **Step 3: Commit**

```bash
git add plugins/dev-flow/agents/dev-flow-implement.md
git commit -m "feat(dev-flow): point Node 7 at Full suite cached command explicitly"
```

---

## Task 5: End-to-end consistency check

**Files:**
- Read-only: all edited files; cross-check against the spec

This is a verification task — no edits unless inconsistencies are found.

- [ ] **Step 1: Re-read both edited files top to bottom**

```bash
cat plugins/dev-flow/skills/dev-flow/references/test-detection.md
cat plugins/dev-flow/agents/dev-flow-implement.md
```

Check against `docs/superpowers/specs/2026-05-08-dev-flow-scoped-test-runs-design.md`:

- [ ] Two cached commands, runner table present, fallback rule for unknown runners.
- [ ] Frontend perf notes subsection exists, marked advisory.
- [ ] Node 5 names "scoped command", requires red at N.1, green at N.2, stays-green at N.3.
- [ ] Node 5 explicitly forbids full-suite runs.
- [ ] Node 7 step 2 names "Full suite" entry.
- [ ] Nothing in `SKILL.md` was changed (spec calls out it shouldn't be).

- [ ] **Step 2: Confirm SKILL.md untouched**

```bash
git diff --stat main -- plugins/dev-flow/skills/dev-flow/SKILL.md
```

Expected: empty output (no changes to SKILL.md).

- [ ] **Step 3: If any inconsistency found, fix and amend**

If a check fails, edit the relevant file and amend its commit:

```bash
git add <file>
git commit --amend --no-edit
```

If everything passes, no action — the previous commits stand.

---

## Self-review notes

- **Spec coverage:** Goal 1 (scoped inner loop) → Tasks 1, 3. Goal 2 (TDD red preserved) → Task 3. Goal 3 (Node 7 unchanged contract, points at Full suite) → Task 4. Goal 4 (no opinionated flag injection) → Task 2 (advisory only).
- **Placeholder scan:** No TBDs; all replacement text is shown verbatim.
- **Type consistency:** "Full suite" / "Scoped" labels match across test-detection.md, Node 5, and Node 7. The runner table covers Vitest/Jest/Mocha/Go/Pytest/Cargo/Bun explicitly; unknown runners fall back to full suite + deviation log.
- **No `## Test Commands` schema clash:** the new format is a strict superset (was 1 line, now 2) — projects whose CLAUDE.md already has the old single line will be re-detected and rewritten by the next dev-flow run; the spec accepts this minor churn.
