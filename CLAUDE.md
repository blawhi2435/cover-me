# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

A Claude Code plugin marketplace (`cover-me`) published under `blawhi2435/cover-me`. Users install it via:

```
/plugin marketplace add blawhi2435/cover-me
```

Then install individual plugins:

```
/plugin install coding-god@cover-me
```

## Repository structure

```
.claude-plugin/marketplace.json   # Marketplace registry — lists all plugins and their source paths
plugins/<name>/
  .claude-plugin/plugin.json      # Plugin metadata (name, description, version)
  skills/<skill-name>/
    SKILL.md                      # Skill definition with YAML frontmatter (name, description)
    references/                   # Optional reference docs loaded by the skill
openspec/                         # OpenSpec change management (spec-driven workflow)
  config.yaml
  changes/<change-name>/
    .openspec.yaml
    proposal.md
```

## Adding a new plugin

1. Create `plugins/<name>/` with the structure above.
2. Register it in `.claude-plugin/marketplace.json` under `plugins[]` with `name`, `source` (`./plugins/<name>`), `description`, and `category`.

## Key conventions

- Every plugin must have `.claude-plugin/plugin.json` with `name`, `description`, and `version`.
- Every skill lives at `skills/<skill-name>/SKILL.md` with YAML frontmatter (`name`, `description`).
- Reference files go inside the skill's own directory: `skills/<skill-name>/references/`.
- Changes to this marketplace are managed via OpenSpec (`/opsx new`, `/opsx apply`, etc.).
