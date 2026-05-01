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

### Node 5 — opsx:apply (TDD + coding style)
**Before** invoking `opsx:apply`, load both:
- `superpowers:test-driven-development`
- `standard-coding-style:standard-coding-style`

Then invoke `opsx:apply`. Per sub-task cycle: write test → write code (style applied) → run test → refactor (style applied). Tests run after each sub-task, not after the whole task.

### Node 6 — Code review
Invoke `code-review:code-review` automatically (it self-selects lightweight vs security mode). User may skip with explicit instruction (`skip review`).

- If issues → convert each issue into a new sub-task in `tasks.md`, then return to Node 5.
- If pass → proceed to Node 7.

Apply loop limit per `references/loop-limits.md`.

### Node 7 — Tests
Locate the project's integration script per `references/test-detection.md`. Run unit tests (`go test ./...` or project equivalent) AND the integration script.

- If fail → return to Node 5 with failure summary.
- If pass → proceed to Node 8.

Apply loop limit per `references/loop-limits.md`.

### Node 8 — opsx:archive
Invoke `opsx:archive`.

### Node 9 — Commit pending changes
Check `git status`. If anything is uncommitted (typically the archive's file moves, plus any spec/plan files the user wants tracked), invoke `git-workflow:git-commit` to stage and commit them. If `git status` is clean, skip and proceed.

### Node 10 — Open PR
Run `gh pr create` with title derived from the opsx change name (`feat: <change-name>` or matching project commit style — check `git log` first). Body: link to spec, summary of changes, test plan.

### Node 11 — Summary
Print to user: branch name, PR URL, archived change name, total apply iterations, total review iterations, total test iterations.

## Loops & limits

See `references/loop-limits.md`. When a limit is exceeded, halt and ask the user to intervene — do not loop indefinitely.

## Notes

- This is a process skill, not an implementation skill. Never write feature code from inside dev-flow — always delegate to the appropriate node skill.
- If any node fails in a way not covered by loop-back rules, halt and surface the error to the user verbatim.
