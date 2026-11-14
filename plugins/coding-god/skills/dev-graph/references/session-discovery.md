# Session Discovery

How dev-graph groups repository paths and launches one child session per group (G2, G4).

## Grouping command

For each user-supplied path: run `realpath` on it, then `git -C <path> rev-parse --path-format=absolute --git-common-dir`. Paths whose absolute common dir is identical form one group, whose root is `git rev-parse --show-toplevel` of any member.

**Always pass `--path-format=absolute`.** Without it, `--git-common-dir` returns the relative string `.git` at every repository's own root — every repository then compares equal to every other, and grouping collapses all of them into a single group. This was caught during review; there is no correct relative-path form of this check.

Submodules have their own common dir and are separate groups. A path that is not inside any repository halts G2, naming that path.

## Dispatcher identity

The dispatcher's own name — the value every child authenticates replies against — is read **only** from the `This session is <name>` line that `ListAgents` prints about the caller. If that line is absent, G2 **stops**: a hand-typed name would become the trust anchor for every child, so there is no fallback to ask the user to confirm one.

**On opencode:** the name is read only from the `This session is <name>` line of the plugin's `list_agents` tool. The plugin computes it from the calling session, so the model cannot choose it; if the line is absent, G2 stops.

## Permission mode

`permission_mode` (in `.devflow-repos.json`) must be one of `default`, `acceptEdits`, `plan`, `dontAsk`, or `auto` — nothing else reaches a shell, and `bypassPermissions` is refused outright (see below). It is the main session's own mode, determined by the main session itself from what its harness tells it — never asked of the user, except in the one case where it genuinely cannot determine its own mode: then G2 stops and asks the user to state it before any child is launched; inferring or assuming the mode (from the recorded value, a previous run, or a guess) is not determining it and counts as "cannot determine" (a `use_herdr` key from an older version is ignored). Every run G2 writes the determined mode over the recorded value and notes a change in `deviations`, so a stale value never launches a child in a mismatched mode.

**On opencode:** there is no `permission_mode`. Every child runs in normal permission mode, `permission_mode` in `.devflow-repos.json` is not read or written, and nothing is asked of the user. The main session is refused if it runs with `--auto` (see "Permission mode must never be `bypassPermissions`").

## `~/.claude/sessions/<pid>.json`

Each file describes one running Claude Code session:

```json
{ "pid": 1234, "cwd": "/Users/x/proj/api", "name": "api-3f", "sessionId": "9f2c..." }
```

Fields dev-graph uses:

- `pid` — the OS process id, persisted as part of a child's identity and re-verified before every `proceed` and on resume.
- `cwd` — compared (as an absolute path) against a group's root to find a just-launched session's record.
- `name` — the string `SendMessage` and `ListAgents` use to address that session. dev-graph sets it at launch with `-n`.
- `sessionId` — persisted as `session_id`, the other half of a child's identity.
- `kind` — `bg` for a `claude --bg` child, `interactive` for one running in a herdr pane. Informational only.

**On opencode:** there is no `~/.claude/sessions` directory and no pid. The plugin's `launch_child` returns the child's name and session id, which are what is persisted (`pid` and `bg_id` stay `null`). Identification needs no novelty snapshot, because the session id comes straight from the call that created the child. To re-verify before every `proceed` and on resume, `list_agents` must still list the child with the same name and session id.

## Launching a child session

dev-graph always launches a new session for a group — it never attaches to a session the user already has open, because that session's permission mode is unknown, which both stalls delivery and can route work into a more-permissive session than the run intends. There is a second reason: under `auto` permission mode the classifier judges whether work was requested by that session's own user. A session that already holds the user's conversation treats a `/dev-flow` run requested only by a peer's `SendMessage` as unrequested work and denies it (observed 2026-10-19: even the read-only Prerequisites commands were denied with "Unrequested Commit in a Connected App" until the user typed one line in that terminal). A fresh session whose only instruction is the dispatch brief is accepted, with or without any extra launch prompt (verified 2026-10-24/25 on both a local-only and a GitHub-connected repository). So the fix is this rule, not a launch-time prompt: never drive dev-flow through a session the user is already using, and do not add authorization text to the `claude` command line.

**Session identification is by name and novelty, not by cwd alone.** Every child is launched with a unique name, `-n dg-<graph_id>-<group-slug>`. Immediately before each launch, snapshot the full set of `~/.claude/sessions/*.json` records. After the launch, accept only a record that is **absent from that snapshot**, whose `name` equals the launch name, and whose `cwd` equals the group root. Zero such records, or more than one, halts G4 with the user told — dev-graph does not guess. The name makes the match direct; novelty still guards against a stale record that happens to carry it. Persist the accepted record's `name` (as `session`), `sessionId` (as `session_id`), and `pid` in `.devgraph-state.json`. A record can take a few seconds to appear after the launch command returns; re-read the directory until it does, for up to 30 seconds, before treating it as zero.

Before every `proceed` and again on resume, dev-graph re-verifies that a record with that `sessionId` and `pid` still exists **and still carries the same `name`**. Any mismatch — the record is gone, or its `name` no longer matches — marks the child `failed` and tells the user; dev-graph never falls back to a plain cwd or name lookup to find a replacement.

## Launch command

One command per group, printed verbatim in G2 for the record and run unchanged in G4:

```bash
DEV_GRAPH_DISPATCHER=<dispatcher> claude [--bg] -n dg-<graph_id>-<group-slug> --model sonnet [--chrome] --permission-mode <mode>
```

- `DEV_GRAPH_DISPATCHER` is the only environment variable set. The agent-teams flag is not: `SendMessage`/`ListAgents` are on by default from Claude Code 2.1.224 (G2 checks the version).
- `--bg` only on the background path below.
- `--chrome` only when the group's `frontend` attribute is `true`.
- `--permission-mode <mode>` is the run's own `permission_mode` (see "Permission mode must never be `bypassPermissions`" below).
- No prompt argument. The dispatch brief goes by `SendMessage` in G5; dispatched mode never accepts a brief that arrives as the session's own user message.

**On opencode:** the command is a `launch_child` call instead of a shell command, printed in G2 for the record and made unchanged in G4: `launch_child(root=<root>, name=dg-<graph_id>-<group-slug>, model=<model or omitted>)`. There is no `DEV_GRAPH_DISPATCHER`, no `--bg`, no `--chrome`, and no `--permission-mode`: the shared opencode service has no per-child environment, so the plugin binds the child to the caller's plugin-assigned name itself at launch, and the child reads that binding with `dispatch_anchor`. When `HERDR_ENV=1` a herdr tab may additionally run `opencode -s <child session id>` in `<root>` so the user can watch; that command attaches to the session `launch_child` created and is never a second launch. Never pass `--auto`.

`<group-slug>` is a short lowercase slug of the group root's basename (e.g. `api`), de-duplicated within the run by appending `-2`, `-3`.

dev-graph launches every child itself. The path is chosen by the environment, never by a setting, and the user is never asked to open a session. The authorization for the launch is the user's approval of the spec in G1; G2 prints the exact command lines for the record, and G4 does not ask.

### herdr pane — when the main session runs inside herdr (`HERDR_ENV=1`)

The child runs in the foreground in a new herdr tab, where the user can watch and operate it.

1. Snapshot `~/.claude/sessions/*.json` (see above).
2. `herdr tab create --cwd <root> --label <group-slug>` — read the pane id from `.result.root_pane.pane_id` in its response and record it as the child's `herdr_pane`.
3. `herdr pane run <pane_id> "<launch command without --bg>"` — sends the command and Enter to the pane's shell, which already sits in `<root>`.
4. Apply the identification rule above against the snapshot from step 1.

herdr detects a `claude` process in its own pane by itself (verified 2026-11-13: it appeared in `herdr agent list` and in `ListAgents` without `herdr agent start`), so `herdr agent start` is not used and there is no separate herdr agent name to track. herdr's own skill forbids driving it from outside herdr; this path is never taken when `HERDR_ENV` is not `1`, even if herdr is installed.

**On opencode:** the herdr and background paths below do not apply. `launch_child` is the only launch, and the herdr tab described above is an optional viewer.

### Background — otherwise

The child runs as a Claude Code background session with no terminal.

1. Snapshot `~/.claude/sessions/*.json`.
2. From the group root (`cd <root> && …` in the same shell command), run the launch command with `--bg`. It returns at once and prints `backgrounded · <id> · <name>`; record `<id>` as the child's `bg_id`. The session inherits the invoking shell's cwd and environment, so `DEV_GRAPH_DISPATCHER` reaches it (verified 2026-11-13).
3. Apply the identification rule above against the snapshot from step 1. The record's `kind` is `bg`.
4. Tell the user, once per child: `claude attach <bg_id>` opens that child in any terminal; `←` returns to the agent list and `Ctrl+Z` to the shell, and the child keeps running either way. `claude agents` lists all of them.

herdr cannot show a background session — it has no terminal — so this path is for runs outside herdr only.

A `--bg` launch in a directory that was never trusted fails at once with `Workspace not trusted`; G2's trust check exists to catch this before anything is launched.

## Permission mode must never be `bypassPermissions`

`SendMessage` holds a message for the receiving user's approval whenever the receiver's permission mode differs from the sender's. A child session has no user present to grant that approval, so a mismatched launch stalls delivery silently — the symptom looks like a child that never received its dispatch brief. Every launch, herdr pane or background, passes the run's own `permission_mode` as recorded in `.devflow-repos.json`.

dev-graph refuses to launch any child when the run's `permission_mode` is `bypassPermissions`, or when the main session itself is running with the equivalent CLI flag `--dangerously-skip-permissions`: propagating bypass permissions to an unattended session the user cannot watch is refused outright, and dev-graph stops, telling the user to restart the main session in another mode before anything is launched.

**On opencode:** the equivalent is `--auto` ("auto-approve permissions that are not explicitly denied"). dev-graph never launches a child with it — `launch_child` has no such option — and stops when the main session itself runs with `--auto` where that is detectable. A child that waits on a permission prompt is not a stall to engineer around: the plugin notifies the dispatcher, and the user approves it in the child's own session.

## `notify_when_idle` is one-shot

Each subscription fires at most once. After G5 dispatches a brief, the main session subscribes to that child with `notify_when_idle: true`; on any later message from that child — `ready` or `blocked` — the subscription must be renewed, or a later idle period will go unnoticed. If a child goes idle without having sent `ready` or `blocked` at all, report it to the user as *possibly held* — most likely the permission-mode mismatch above — rather than waiting on it indefinitely.
