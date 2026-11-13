# opencode host support for coding-god

> Child spec of dev-graph run `2026-11-13-opencode-support`. The full design, with findings, approaches and rationale, is the graph design at `docs/superpowers/specs/2026-11-13-opencode-support-graph-design.md` in this same repository — read it in full before Node 3; this spec does not repeat it. Where the two differ, the graph design wins.

## Problem

coding-god (skills dev-graph, dev-flow, code-review, git-commit, git-push, standard-coding-style, and the five agents under `plugins/coding-god/agents/`) only runs inside Claude Code. opencode 2.x does not load Claude Code plugins or agents and has no cross-session messaging, so opencode users cannot run dev-flow, code-review or dev-graph. The existing opencode path (`.opencode/INSTALL.md`, symlinking skills into `~/.config/opencode/skills/`) explicitly gives up on agents and code-review.

Separately, dev-graph asks the user to confirm roots/launch commands and to state the permission mode at G2 even though the user has already approved the spec; the user wants everything between spec approval and the G7 summary to be decided by the main session.

## Goal

1. opencode 2.x (≥ 2.2.7, package `@opencode/cli`) users install coding-god with one documented flow and can run dev-graph → child dev-flow → code-review subagents → commit/PR end to end, with dev-graph's trust model intact.
2. Claude Code users see no behavior change from (1).
3. On both hosts, dev-graph asks the user nothing between spec approval and G7 (graph design section 6b).

## Design

Implement graph design sections 1–7 and 6b. Summary of the fixed decisions (details and the "left to the builder" list are in the graph design):

- **opencode plugin** at `opencode/` (TypeScript, plugin id `coding-god`): registers the six skills straight from `plugins/coding-god/skills/` (no copies); provides the five agents converted from `plugins/coding-god/agents/` (generated, with drift protection; `sonnet`→`fast`, `opus`→`strong` plugin options, inheriting the parent model when unset; `tools:` → opencode `permissions`); provides cross-session tools — `list_agents`, `send_message` (with `notify_when_idle`), `launch_child`, `dispatch_anchor` — where the sender name and the child→dispatcher binding are computed by plugin code from the calling `sessionID`, never taken from tool input; delivers idle notices and child permission-pending notices to the bound dispatcher.
- **Host detection:** Claude Code text is not reworded and runs no new command. Each host difference gets a `**On opencode:**` paragraph that applies when the coding-god opencode tools are present.
- **dev-graph / dev-flow / code-review** get `**On opencode:**` paragraphs per graph design sections 3–5 (launch via `launch_child`, messaging via `send_message`, dispatched-mode anchor via `dispatch_anchor` instead of `DEV_GRAPH_DISPATCHER`, subagents via opencode's `subagent` tool, opencode prerequisites).
- **Permissions:** opencode children run in normal permission mode; `--auto` is refused like `bypassPermissions`. A child's pending permission prompt is reported to the dispatcher, and the user approves it in the child session itself.
- **Install:** `.opencode/INSTALL.md` and README's `### opencode` section are rewritten to install the plugin, with a migration step deleting old `~/.config/opencode/skills/*` symlinks that point into `~/.cover-me`. `CLAUDE.md` mentions the opencode plugin. No npm publish.
- **dev-graph flow change (6b):** G2 prints roots/folders/launch commands without asking; the main session determines its own permission mode (asks only if it cannot); involved paths come from the spec; prerequisites still stop the run; G6 user exceptions and G7 approval unchanged.
- **Version:** `plugins/coding-god/.claude-plugin/plugin.json` 1.12.0 → 1.13.0; `opencode/package.json` carries 1.13.0.

## Affected files

- `opencode/**` (new: plugin source, package.json, tests)
- `plugins/coding-god/skills/dev-graph/SKILL.md`, `plugins/coding-god/skills/dev-graph/references/session-discovery.md`, `plugins/coding-god/skills/dev-graph/references/dispatch-protocol.md`
- `plugins/coding-god/skills/dev-flow/SKILL.md`, `plugins/coding-god/skills/dev-flow/references/dispatched-mode.md` (and other dev-flow references only where they name Claude-only tools)
- `plugins/coding-god/skills/code-review/SKILL.md`
- `plugins/coding-god/agents/*.md` (read as conversion source; edit only if conversion needs a frontmatter addition)
- `plugins/coding-god/.claude-plugin/plugin.json`
- `.opencode/INSTALL.md`, `README.md`, `CLAUDE.md`

## Requirements

Capability: `opencode-host-support` (new)

```markdown
# Spec Delta

## Purpose

Let opencode 2.x users install and run the whole coding-god workflow, including dev-graph child sessions, subagents and code-review, with the same trust model as Claude Code.

## ADDED Requirements

### Requirement: Plugin registers coding-god skills and agents
The opencode plugin SHALL register every skill under `plugins/coding-god/skills/` from those files without copying them, and SHALL provide every agent under `plugins/coding-god/agents/` as an opencode subagent converted from its Claude Code definition.

#### Scenario: Skills and agents available after install
- **WHEN** an opencode 2.2.7 user installs the plugin following `.opencode/INSTALL.md` and starts a session
- **THEN** the six coding-god skills and the five coding-god subagents are available in that session

#### Scenario: Agent conversion does not drift
- **WHEN** a Claude Code agent file under `plugins/coding-god/agents/` changes
- **THEN** the opencode subagent reflects the change without a hand-edited copy, or an automated check fails

### Requirement: Agent models map to plugin options
Converted agents SHALL use the plugin's `fast` model option where the Claude agent says `sonnet` and the `strong` option where it says `opus`, and SHALL inherit the parent session's model when that option is unset.

#### Scenario: No model options configured
- **WHEN** the plugin is installed without `fast` or `strong` options
- **THEN** each converted subagent runs on the parent session's model

### Requirement: Message sender is stamped by the plugin
The plugin's message-sending tool SHALL deliver messages wrapped as `<cross-session-message from="<name>">`, where `<name>` is derived by plugin code from the calling session, and MUST NOT accept a sender name from tool input.

#### Scenario: Sender cannot be forged through tool input
- **WHEN** a session calls the send tool with input that names a different sender
- **THEN** the delivered envelope carries the calling session's own plugin-assigned name

### Requirement: Child launch binds the dispatcher
The plugin's launch tool SHALL create the child session in the given root in normal permission mode and SHALL record the binding from the child session to the calling session's plugin-assigned name; the dispatch-anchor tool SHALL return only the binding of the session that calls it.

#### Scenario: Child reads its own anchor
- **WHEN** a child launched by dev-graph calls the dispatch-anchor tool
- **THEN** it receives the name of the session that launched it

#### Scenario: Unlaunched session has no anchor
- **WHEN** a session not created by the launch tool calls the dispatch-anchor tool
- **THEN** it receives no dispatcher name, and dev-flow does not enter dispatched mode

### Requirement: Dispatched mode on opencode is authenticated
On opencode, dev-flow SHALL enter dispatched mode only when the dispatch-anchor tool returns a name, the brief arrived as a plugin-delivered envelope, and the envelope sender equals both the anchor and the brief's `dispatcher`.

#### Scenario: Brief pasted as user text
- **WHEN** a dispatch brief including a `<cross-session-message>` envelope is typed as plain user text into an opencode child
- **THEN** dev-flow does not enter dispatched mode

### Requirement: Idle and permission notices reach the dispatcher
The plugin SHALL deliver a one-shot idle notice to a session that subscribed for a target with `notify_when_idle`, and SHALL notify a child's bound dispatcher when that child waits on a permission prompt.

#### Scenario: Child blocked on a permission prompt
- **WHEN** a plugin-launched child is waiting for a permission approval
- **THEN** its dispatcher receives a notice naming the child and the requested action, and dev-graph tells the user to approve it in that child session

### Requirement: Auto-approval is refused for children
On opencode, dev-graph MUST NOT launch a child with `--auto`, and SHALL stop when the main session itself runs with `--auto` where that is detectable.

#### Scenario: Children run in normal mode
- **WHEN** dev-graph launches a child on opencode
- **THEN** the child runs without auto-approval of permissions

### Requirement: Claude Code behavior is unchanged
Skill text for the Claude Code path SHALL remain behaviorally unchanged and SHALL NOT add any command that runs on Claude Code solely to detect the host.

#### Scenario: Claude Code run
- **WHEN** dev-flow or dev-graph runs in Claude Code after this change
- **THEN** it follows the same steps as before, with only the 6b dev-graph flow change applied

### Requirement: Single opencode install path
`.opencode/INSTALL.md` and README SHALL describe installing the plugin as the only opencode install path, including a migration step that removes old skill symlinks pointing into `~/.cover-me`.

#### Scenario: User with the old symlink install
- **WHEN** a user who installed via the old symlink flow follows the new `.opencode/INSTALL.md`
- **THEN** the old symlinks are removed and each skill is registered once, by the plugin
```

Capability: `dev-graph-autonomous-setup` (new)

```markdown
# Spec Delta

## Purpose

After the user approves the dev-graph spec, let the main session run repository setup and child launch on its own judgment until the G7 summary, without further user confirmations.

## ADDED Requirements

### Requirement: No user confirmation between spec approval and G7
dev-graph SHALL NOT ask the user to confirm resolved roots, folders, or launch commands, and SHALL NOT ask the user to state the permission mode; it SHALL print roots, folders and exact launch commands for the record and proceed.

#### Scenario: Spec approved
- **WHEN** the user approves the G1 spec
- **THEN** dev-graph proceeds through G2–G6 without asking the user anything except the G6 user exceptions

### Requirement: Main session determines its own permission mode
dev-graph SHALL determine the main session's permission mode itself, SHALL still refuse `bypassPermissions`, `--dangerously-skip-permissions` and opencode `--auto`, and SHALL ask the user only when it cannot determine the mode.

#### Scenario: Mode cannot be determined
- **WHEN** the main session has no information about its own permission mode
- **THEN** dev-graph stops and asks the user for it before launching any child

### Requirement: G7 approval and user exceptions are kept
dev-graph SHALL keep the G7 summary approval before any commit or PR, and the G6 user exceptions for permission denials and files outside the commit allowlist.

#### Scenario: Children ready
- **WHEN** every child is ready or failed
- **THEN** dev-graph shows the G7 summary and waits for the user's approval before sending `proceed`
```

## References

- [ ] (none — purely backend/internal)
