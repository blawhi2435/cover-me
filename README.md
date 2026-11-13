# cover-me

A Claude Code plugin marketplace with AI coding workflow tools.

## Available Plugins

| Plugin | Description |
|--------|-------------|
| `coding-god` | Full-stack coding workflow — dev-flow, code review, coding style, and git |
| `desktop-notify` | Desktop notifications when Claude Code needs your input or finishes a task |
| `session-bridge` | Let a local Claude Code session start, instruct and collect results from sessions on other machines (herdr or Remote Control) |

## Install

### Claude Code

Add the marketplace, then install the plugins you want:

```
/plugin marketplace add blawhi2435/cover-me
/plugin install coding-god@cover-me
/plugin install desktop-notify@cover-me
/plugin install session-bridge@cover-me
```

Update to the latest versions:

```
/plugin marketplace update cover-me
```

### opencode

opencode has no marketplace command — let your AI agent install it for you. In an opencode session, paste:

```
Fetch and follow instructions from https://raw.githubusercontent.com/blawhi2435/cover-me/main/.opencode/INSTALL.md
```

The agent will clone the repo to `~/.cover-me`, symlink the skills into `~/.config/opencode/skills/`, and verify the result. Full steps live in [.opencode/INSTALL.md](./.opencode/INSTALL.md).

> Note: `desktop-notify` relies on Claude Code hooks and is not supported on opencode — only `coding-god`'s skills will be installed.

## Dependencies

`coding-god` invokes skills from the following third-party plugins. Install them separately before using `coding-god`:

- **superpowers** — provides `superpowers:brainstorming`, `superpowers:test-driven-development`
- **opsx** (OpenSpec workflow) — provides `opsx:ff`, `opsx:apply`, `opsx:archive`. Requires the OpenSpec CLI **≥ 1.8.0** (`npm i -g @fission-ai/openspec@latest`); after upgrading the CLI, run `openspec update` in each repo so the generated skills match. `dev-flow` checks both before it starts.

## `dev-graph`

`coding-god:dev-graph` is a process skill for a **main session** that runs `dev-flow` in child sessions — one per repository, so it works for a single repository as well as for a change spanning several (for example a backend API and the frontend that calls it). It never writes feature code itself, and you talk only to the main session. You decide at exactly two points: approving the spec, and approving the combined summary before any child archives, commits, or opens a PR.

The main session launches every child itself — you never open a session by hand:

- **Inside [herdr](https://herdr.dev)**, each child starts in its own herdr tab, so you can watch it in a pane.
- **Otherwise**, each child starts in the background (`claude --bg`). Run `claude attach <id>` to bring one into your terminal; `claude agents` lists them.

Every repository involved must have been opened with `claude` once and its workspace-trust prompt accepted, since a child launched unattended cannot answer it. See [`plugins/coding-god/skills/dev-graph/SKILL.md`](plugins/coding-god/skills/dev-graph/SKILL.md) for the full flow.

## `session-bridge`

`session-bridge` lets the session you're working in drive Claude Code sessions on other machines. It can start a session on a server, hand it a task, wait for it, read its result, and move files both ways. A typical use: your local machine has a browser for Playwright, and the server has the code and the deployment.

- **Transports:** [herdr](https://herdr.dev) over SSH is preferred. It can start remote sessions, read their output directly and copy files. Without herdr, the skill uses Claude Code's built-in Remote Control messaging, which is text only and can't start sessions.
- **Your remotes** live in `~/.config/session-bridge/remotes.json`. Ask Claude to "add my server as a remote" and it walks you through the setup.
- **Permission prompts** on a remote are yours to approve: through Remote Control (Claude phone app, claude.ai, Claude Desktop) or by attaching in herdr. The local session never approves them for you.
- **Files:** screenshots are sent as-is, without redaction. Text files (logs, HAR) and quoted log text go through `scripts/redact.py`, a pattern-based redactor for common credential shapes, before they leave the machine. Claude still skims the result, because no pattern list catches every secret. Files it can't read as text are not sent; a text summary goes instead.

See [`plugins/session-bridge/skills/session-bridge/SKILL.md`](plugins/session-bridge/skills/session-bridge/SKILL.md).

## Configuration

### Warm worker for `dev-flow` (optional)

`coding-god`'s `dev-flow` drives an apply ↔ review ↔ test loop in which the orchestrator (main agent) hands apply/test rounds to a `dev-flow-implement` worker. There are two ways the orchestrator can return to that worker each round:

- **Baseline (always works):** a fresh worker is dispatched each round and picks up from `.devflow-state.json` + `resume_from_node`. No setup required.
- **Warm worker (optimization):** the orchestrator keeps one long-lived worker and resumes it via the `SendMessage` tool, preserving the worker's full context (prior tool calls and reasoning) across rounds.

The warm path needs the `SendMessage` tool. It is part of Claude Code's cross-session messaging, on by default from **Claude Code 2.1.224** — no setting or flag is needed. `dev-flow` **prefers the warm worker** whenever the tool is available and falls back to the baseline path otherwise. Note that `SendMessage` is a *deferred* tool: it won't show up in the orchestrator's directly-loaded tool list — it must be resolved via `ToolSearch` (`select:SendMessage`). The skill detects it this way, so it does not silently stay cold just because the tool isn't pre-loaded.

> Earlier versions of this README required `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`. That flag enables Claude Code's experimental agent-teams feature, which neither `dev-flow` nor `dev-graph` uses; you can remove it.

### Cross-session messaging for `dev-graph` (required)

`dev-graph` dispatches work, waits on children, and relays replies only through `SendMessage`/`ListAgents` — there is no fallback. Both are on by default from Claude Code 2.1.224; `dev-graph` checks the version before it starts.

## Reviewer models for `code-review`

`coding-god:code-review` dispatches each specialist as its own plugin agent, and each agent's model is fixed in its frontmatter — not inherited from whichever session invokes the skill:

| Agent | Model | Reason |
|-------|-------|--------|
| `coding-god:logic-reviewer` | `opus` | Last line of defense against bugs; must be stronger than the Sonnet author (`dev-flow-implement`) |
| `coding-god:security-reviewer` | `opus` | Same reasoning; only runs when the trigger table fires, so volume is low |
| `coding-god:test-reviewer` | `sonnet` | Judging real test coverage needs reasoning, but not Opus-level |
| `coding-god:style-reviewer` | `sonnet` | Convention matching against surrounding files |

The code author (`dev-flow-implement`) runs on Sonnet, so logic and security review deliberately run on a stronger model — a Sonnet-authored change is reviewed by more than an equally-capable peer. There is no setting to change this: the models live in the four `*-reviewer.md` agent definitions shipped with the plugin, not in a config file.
