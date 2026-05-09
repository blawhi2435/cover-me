# cover-me

A Claude Code plugin marketplace with AI coding workflow tools.

## Install

```
/plugin marketplace add blawhi2435/cover-me
```

## Available Plugins

| Plugin | Description |
|--------|-------------|
| `coding-god` | Full-stack coding workflow — dev-flow, code review, coding style, and git |
| `claude-notify` | Desktop notifications when Claude Code needs your input or finishes a task |

## Dependencies

`coding-god` invokes skills from the following third-party plugins. Install them separately before using `coding-god`:

- **superpowers** — provides `superpowers:brainstorming`, `superpowers:test-driven-development`
- **opsx** (OpenSpec workflow) — provides `opsx:new`, `opsx:ff`, `opsx:apply`, `opsx:archive`

## Usage

After adding the marketplace, install the plugins you want:

```
/plugin install coding-god@cover-me
/plugin install claude-notify@cover-me
```

Update to latest versions:

```
/plugin marketplace update cover-me
```
