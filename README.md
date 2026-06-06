# cover-me

A Claude Code plugin marketplace with AI coding workflow tools.

## Available Plugins

| Plugin | Description |
|--------|-------------|
| `coding-god` | Full-stack coding workflow — dev-flow, code review, coding style, and git |
| `claude-notify` | Desktop notifications when Claude Code needs your input or finishes a task |

## Install

### Claude Code

Add the marketplace, then install the plugins you want:

```
/plugin marketplace add blawhi2435/cover-me
/plugin install coding-god@cover-me
/plugin install claude-notify@cover-me
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

> Note: `claude-notify` relies on Claude Code hooks and is not supported on opencode — only `coding-god`'s skills will be installed.

## Dependencies

`coding-god` invokes skills from the following third-party plugins. Install them separately before using `coding-god`:

- **superpowers** — provides `superpowers:brainstorming`, `superpowers:test-driven-development`
- **opsx** (OpenSpec workflow) — provides `opsx:new`, `opsx:ff`, `opsx:apply`, `opsx:archive`

## Configuration

### Warm worker for `dev-flow` (optional)

`coding-god`'s `dev-flow` drives an apply ↔ review ↔ test loop in which the orchestrator (main agent) hands apply/test rounds to a `dev-flow-implement` worker. There are two ways the orchestrator can return to that worker each round:

- **Baseline (always works):** a fresh worker is dispatched each round and picks up from `.devflow-state.json` + `resume_from_node`. No setup required.
- **Warm worker (optimization):** the orchestrator keeps one long-lived worker and resumes it via the `SendMessage` tool, preserving the worker's full context (prior tool calls and reasoning) across rounds.

The warm path needs the `SendMessage` tool, which Claude Code only loads when the experimental **agent teams** feature is enabled. To turn it on, set:

```json
{
  "env": {
    "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1"
  }
}
```

in your `settings.json` (user-level `~/.claude/settings.json`, or project-level `.claude/settings.json`), then **restart Claude Code** — tools are loaded at session start, so enabling it mid-session has no effect. Without the flag, `dev-flow` automatically falls back to the baseline path.

When the flag is on, `dev-flow` **prefers the warm worker**. Note that `SendMessage` is a *deferred* tool: it won't show up in the orchestrator's directly-loaded tool list even when enabled — it must be resolved via `ToolSearch` (`select:SendMessage`). The skill detects it this way, so a session with the flag set genuinely uses warm; it does not silently stay cold just because the tool isn't pre-loaded.

> This flag enables an experimental feature whose behavior may change.
