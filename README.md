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
