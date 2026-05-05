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

### Nodes 5–11 — Dispatch to `dev-flow-implement` subagent (Sonnet)

After Node 4 completes, hand off the entire implementation phase to the `dev-flow-implement` subagent via the Task tool (`subagent_type: dev-flow-implement`). That subagent runs on Sonnet and owns:

- Node 5: opsx:apply (with TDD + coding style)
- Node 6: code review
- Node 7: unit + integration tests
- Node 8: opsx:archive
- Node 9: commit pending changes
- Node 10: `gh pr create`
- Node 11: return summary

The apply↔review↔test loop stays inside the subagent so loop iterations don't cold-restart and lose context.

**Dispatch brief must include** (subagent starts cold):
- Change name from Node 3
- Path to brainstorm spec from Node 1
- Path to `openspec/changes/<change-name>/tasks.md`
- Branch name from Node 2
- Loop limits reference (`references/loop-limits.md`)
- Test detection reference (`references/test-detection.md`)

**On return:** the subagent gives back branch name, PR URL, archived change name, and iteration counts. Update todos 5–11 to `completed`, then run Node 11 in the orchestrator: print that summary verbatim to the user.

**On halt/blocker:** if the subagent returns a blocker (loop limit hit, unresolvable test failure, etc.), surface it to the user verbatim and stop.

## Loops & limits

See `references/loop-limits.md`. When a limit is exceeded, halt and ask the user to intervene — do not loop indefinitely.

## Notes

- This is a process skill, not an implementation skill. Never write feature code from inside dev-flow — always delegate to the appropriate node skill.
- If any node fails in a way not covered by loop-back rules, halt and surface the error to the user verbatim.
