# dev-graph acceptance fixes

## Problem

The 2026-11-15 live acceptance of coding-god 2.0.0 (Claude Code and opencode, scratch repositories) found two defects in dev-graph that predate 2.0.0. Both make a single-repository run outside herdr end somewhere the user did not ask for. Fix both. A third observation from the same run turned out not to be a defect and is recorded here so it is not reopened.

1. **Background children are forced into a worktree (Claude Code, outside herdr).** A child started with `claude --bg` cannot edit the shared checkout: Claude Code 2.1.325 rejects the write with "This subagent's parent bg session hasn't isolated yet, so writes to the shared checkout are blocked." The child then called `EnterWorktree` and did all its work in `<root>/.claude/worktrees/<name>` on branch `worktree-<name>`. The briefed branch stayed empty in the shared checkout, the commits landed on the wrong branch name, and dev-graph's G7 had to improvise reading a path it did not derive from its own state. The herdr path is not affected (a foreground session has no such guard).
   - Verified fix: launching with `--settings '{"worktree":{"bgIsolation":"none"}}'` lets a `--bg` session write in the shared checkout and creates no worktree (probe on 2.1.325, 2026-11-15).
2. **The graph spec is outside the commit allowlist in a single-repository run.** The allowlist is `folders`, the brief's `spec_path` and `contract_path`, and `.gitignore`. When the main session's cwd is the group root, the graph spec (`…-graph-design.md`) sits in the same repository, is untracked, and is on nobody's list. In the Claude Code acceptance run the main session stopped and asked the user; in the cover-me run the child left it out and the main session committed it by hand. Either way the run cannot finish on its own with a clean tree.
3. **Not a defect: "the child's `done` was never delivered" on opencode.** The opencode database shows the `done` envelope was delivered and handled. The earlier idle notice arrived first; the main session read `last_sent: done` from the child's state file (the documented recovery) and the envelope followed 27 seconds later. No change.

## Goal

- A `--bg` child works in the group root on the briefed branch, exactly like a herdr child.
- A single-repository run commits its graph spec without asking the user and ends with a clean tree.

Non-goals: supporting worktree-isolated children; changing the herdr or opencode launch paths; changing how envelopes or idle notices are delivered; changing the gate script.

Anti-goals: writing to any `settings.json` on disk; widening the allowlist to anything a child names.

## Design

### Approaches considered

**Finding 1**

- **A — pass the setting on the launch command (chosen).** Add `--settings '{"worktree":{"bgIsolation":"none"}}'` to the `--bg` launch only. It is per-launch, touches no file, appears in the launch command G2 prints for the record, and restores the behavior every other path already has. dev-graph runs one child per repository on a tree G2 has checked is clean, so the isolation the guard provides is not needed.
- B — embrace the worktree: the child enters a worktree before Node 2, renames its branch to the briefed name, and dev-graph derives the worktree path from `git worktree list`. More moving parts in three skills, uncommitted spec files must be copied into the worktree, and the user is left with a worktree to clean up.
- C — stop using `--bg` outside herdr. There is no other unattended way to start an interactive session.

**Finding 2**

- **A — the brief names the graph spec when it lives in the child's repository (chosen).** G5 adds an optional `graph_spec_path` to the dispatch brief, set only when the graph spec's real path is inside the group root (relative to the root), otherwise `null`. The allowlist gains "the brief's `graph_spec_path`". The path comes from the authenticated brief, never from a later message.
- B — the main session commits the graph spec itself after `done`. It would be the one place dev-graph writes a commit, against "never writes feature code itself", and it would run after the PR is already open.
- C — keep asking the user. That is the defect.

### Changes

1. `dev-graph/SKILL.md` G4 path 2 and `references/session-discovery.md` (launch command and the background path): the `--bg` command becomes `DEV_GRAPH_DISPATCHER=<dispatcher> claude --bg --settings '{"worktree":{"bgIsolation":"none"}}' -n <name> --model sonnet [--chrome] --permission-mode <mode>`. The herdr command is unchanged. One sentence states why: without it Claude Code blocks a background session's writes to the shared checkout and the child would move to a worktree on another branch. G2's printed launch command shows the flag.
2. `references/session-discovery.md`: record the 2026-11-15 observation and the probe result next to the existing "verified" notes.
3. `dev-flow/references/dispatched-mode.md`: a dispatched child never calls `EnterWorktree` and never works outside the group root; if its writes are rejected for isolation it sends `blocked` of kind `env` quoting the message. (Belt and braces: an older Claude Code or a user setting could still force it.)
4. `dev-graph/references/dispatch-protocol.md` and `dev-graph/SKILL.md` G5: the brief's JSON body gains `graph_spec_path` (string relative to the group root, or `null`). G5 sets it only when `realpath` of the graph spec is under the group root.
5. `dev-flow/references/dispatched-mode.md` allowlist sentence: "paths under `folders`, the brief's `spec_path`, `contract_path` and `graph_spec_path`, and `.gitignore`". It stays the only definition. A brief without the field behaves as `null`.
6. `dev-graph/SKILL.md` G6 table row for files outside the allowlist is unchanged; the graph spec simply no longer reaches it.
7. Version: coding-god `2.0.1`. README / CLAUDE.md need no change.
8. Tests: the existing vitest suite in `opencode/test/` asserts skill text; add assertions for each scenario below.

Left to the builder: exact sentence wording; which test file holds the new assertions.

## Affected files

- `plugins/coding-god/skills/dev-graph/SKILL.md`
- `plugins/coding-god/skills/dev-graph/references/session-discovery.md`
- `plugins/coding-god/skills/dev-graph/references/dispatch-protocol.md`
- `plugins/coding-god/skills/dev-flow/references/dispatched-mode.md`
- `plugins/coding-god/.claude-plugin/plugin.json`
- `opencode/test/` (skill-text assertions)

## Requirements

### Requirement: Background launch keeps the child in the shared checkout
The Claude Code background launch command SHALL carry the per-launch setting that disables background worktree isolation, and the herdr launch command SHALL NOT.

#### Scenario S1: background launch command carries the setting
- **WHEN** dev-graph's G4 text and `session-discovery.md` describe the `claude --bg` launch
- **THEN** the command includes `--settings '{"worktree":{"bgIsolation":"none"}}'`

#### Scenario S2: herdr launch command is unchanged
- **WHEN** dev-graph's G4 text describes the herdr launch
- **THEN** the `herdr pane run` command contains no `--settings` flag

#### Scenario S3: a dispatched child does not enter a worktree
- **WHEN** `dispatched-mode.md` describes what a dispatched child does when its writes are rejected for isolation
- **THEN** it says the child never calls `EnterWorktree` and sends `blocked` of kind `env`

### Requirement: The graph spec is committable in a single-repository run
The dispatch brief SHALL name the graph spec when it lies inside the group root, and the commit allowlist SHALL include that path.

#### Scenario S4: the brief carries graph_spec_path
- **WHEN** `dispatch-protocol.md` lists the fields of the dispatch brief
- **THEN** it lists `graph_spec_path`, set only when the graph spec is inside the group root and otherwise `null`

#### Scenario S5: the allowlist includes graph_spec_path
- **WHEN** `dispatched-mode.md` defines the commit allowlist
- **THEN** the definition names the brief's `graph_spec_path` alongside `spec_path` and `contract_path`

#### Scenario S6: plugin version is bumped
- **WHEN** `plugins/coding-god/.claude-plugin/plugin.json` is read
- **THEN** its version is `2.0.1`

## References

- [ ] (none — purely backend/internal)
