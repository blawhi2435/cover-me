# Session Discovery

How dev-graph groups repository paths and launches one child session per group (G2, G4).

## Grouping command

For each user-supplied path: run `realpath` on it, then `git -C <path> rev-parse --path-format=absolute --git-common-dir`. Paths whose absolute common dir is identical form one group, whose root is `git rev-parse --show-toplevel` of any member.

**Always pass `--path-format=absolute`.** Without it, `--git-common-dir` returns the relative string `.git` at every repository's own root — every repository then compares equal to every other, and grouping collapses all of them into a single group. This was caught during review; there is no correct relative-path form of this check.

Submodules have their own common dir and are separate groups. A path that is not inside any repository halts G2, naming that path.

## Dispatcher identity

The dispatcher's own name — the value every child authenticates replies against — is read **only** from the `This session is <name>` line that `ListAgents` prints about the caller. If that line is absent, G2 **stops**: a hand-typed name would become the trust anchor for every child, so there is no fallback to ask the user to confirm one.

## Permission mode

`permission_mode` (in `.devflow-repos.json`) must be one of `default`, `acceptEdits`, `plan`, `dontAsk`, or `auto` — nothing else reaches a shell, and `bypassPermissions` is refused outright (see below). It and `use_herdr` are asked once and reused across runs, but every run G2 asks the user to **state** this session's permission mode (not to confirm the recorded one) and halts if the answer differs from the recorded value, so a stale value never launches a child in a mismatched mode.

## `~/.claude/sessions/<pid>.json`

Each file describes one running Claude Code session:

```json
{ "pid": 1234, "cwd": "/Users/x/proj/api", "name": "api-3f", "sessionId": "9f2c..." }
```

Fields dev-graph uses:

- `pid` — the OS process id, persisted as part of a child's identity and re-verified before every `proceed` and on resume.
- `cwd` — compared (as an absolute path) against a group's root to find a just-launched session's record.
- `name` — the string `SendMessage` and `ListAgents` use to address that session.
- `sessionId` — persisted as `session_id`, the other half of a child's identity; some herdr commands also key on it when matching a pane to a Claude session.

## Launching a child session

dev-graph always launches a new session for a group — it never attaches to a session the user already has open, because that session's permission mode is unknown, which both stalls delivery and can route work into a more-permissive session than the run intends.

**Session identification is by novelty, not by cwd alone.** A cwd match on its own is not enough — a session already sitting in the group root before the launch must never be addressed. Immediately before each launch, snapshot the full set of `~/.claude/sessions/*.json` records. After the launch, accept only a record that is **absent from that snapshot** and whose `cwd` equals the group root. Zero such new records, or more than one, halts G4 with the user told — dev-graph does not guess. Persist the accepted record's `name` (as `session`), `sessionId` (as `session_id`), and `pid` in `.devgraph-state.json`.

Before every `proceed` and again on resume, dev-graph re-verifies that a record with that `sessionId` and `pid` still exists **and still carries the same `name`**. Any mismatch — the record is gone, or its `name` no longer matches — marks the child `failed` and tells the user; dev-graph never falls back to a plain cwd or name lookup to find a replacement.

Two paths, tried in order:

### herdr — gated on `use_herdr: true` and `HERDR_ENV=1`

Taken only when the user has explicitly opted in (`use_herdr: true` in `.devflow-repos.json`) **and** the main session itself is running inside herdr (`HERDR_ENV=1`). herdr's own skill forbids controlling it from a session outside herdr, so an installed-but-outside herdr falls through to the manual path below, not to this one.

1. Snapshot `~/.claude/sessions/*.json` (see above).
2. `herdr tab create` — read the pane id from `.result.root_pane.pane_id` in its response.
3. **Before the first `agent start` of the run, print the exact command line and ask the user to confirm it** — this is the consent the manual path gives by construction, so the herdr path must give it explicitly too.
4. ```bash
   herdr agent start <group-slug> --kind claude --pane <id> -- \
     --model sonnet [--chrome] --permission-mode <mode>
   ```
   with `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` and `DEV_GRAPH_DISPATCHER=<dispatcher>` both set in the pane's environment before this runs.
   - `<group-slug>` is a short herdr agent name (e.g. `api`) — distinct from the Claude session name `SendMessage` uses.
   - `--chrome` is included only when the group's `frontend` attribute is `true`.
   - `--permission-mode <mode>` is the run's own permission mode, from `.devflow-repos.json`'s `permission_mode` (see "Permission mode must match" below).
5. Apply the novelty rule above against the snapshot taken in step 1 to find the `SendMessage` target and persist its `name` (as `session`), `sessionId` (as `session_id`), and `pid`.

### Manual — ask the user

Taken whenever the herdr path isn't available: not inside herdr, or the user never set `use_herdr: true`, regardless of whether herdr is installed. Snapshot `~/.claude/sessions/*.json` first, then print one launch command per group still needing a session:

```bash
cd /Users/me/proj/web && CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1 DEV_GRAPH_DISPATCHER=cover-me-5e \
  claude --model sonnet --chrome --permission-mode acceptEdits
```

Omit `--chrome` for a non-`frontend` group. Wait for the user to say the session is open, then apply the novelty rule above against the pre-launch snapshot.

## Permission mode must never be `bypassPermissions`

`SendMessage` holds a message for the receiving user's approval whenever the receiver's permission mode differs from the sender's. A child session has no user present to grant that approval, so a mismatched launch stalls delivery silently — the symptom looks like a child that never received its dispatch brief. Every launch, herdr or manual, passes the run's own `permission_mode` as recorded in `.devflow-repos.json`.

dev-graph refuses to launch any child when the run's `permission_mode` is `bypassPermissions`, or when the main session itself is running with the equivalent CLI flag `--dangerously-skip-permissions`: propagating bypass permissions to an unattended session the user cannot watch is refused outright, and the user is told to choose another mode before G4 proceeds.

## `notify_when_idle` is one-shot

Each subscription fires at most once. After G5 dispatches a brief, the main session subscribes to that child with `notify_when_idle: true`; on any later message from that child — `ready` or `blocked` — the subscription must be renewed, or a later idle period will go unnoticed. If a child goes idle without having sent `ready` or `blocked` at all, report it to the user as *possibly held* — most likely the permission-mode mismatch above — rather than waiting on it indefinitely.
