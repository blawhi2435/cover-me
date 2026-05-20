# Install cover-me for opencode

> This document is written for AI coding agents. When a user says "install cover-me on opencode for me", follow the steps below.

## Prerequisites

- opencode auto-loads `~/.config/opencode/skills/<name>/SKILL.md`. No config file changes required.
- Plugin commands/hooks in this repo are Claude Code only; opencode can only use `skills/`.
- All commands run on the user's local machine (Linux / macOS). Windows users should use WSL or Git Bash.

## Step 1 — Clone or update the repo

Install to a fixed location `~/.cover-me` so future updates only need `git pull`:

```bash
test -d ~/.cover-me || git clone https://github.com/blawhi2435/cover-me ~/.cover-me
git -C ~/.cover-me pull --ff-only
```

## Step 2 — Confirm which plugins to install

List available plugins:

```bash
ls ~/.cover-me/plugins/
```

Ask the user which to install (default: all). Currently available:

| Plugin | Description |
|--------|-------------|
| `coding-god` | dev-flow, code review, coding style, git skills |

> `claude-notify` is a Claude Code hook-only plugin and is not supported on opencode — skip it.

## Step 3 — Symlink skills into opencode's skills directory

For each selected plugin, symlink its `skills/*` into `~/.config/opencode/skills/`:

```bash
mkdir -p ~/.config/opencode/skills
PLUGIN=coding-god   # replace with the user's choice
for skill in ~/.cover-me/plugins/$PLUGIN/skills/*/; do
  name=$(basename "$skill")
  ln -sfn "$skill" ~/.config/opencode/skills/"$name"
done
```

Notes:

- `ln -sfn` overwrites existing symlinks safely, so the loop is idempotent.
- If the user selects multiple plugins, run the loop once per plugin.
- If two plugins expose a skill with the same name, the later one wins — warn the user.

## Step 4 — Verify the install

```bash
ls -l ~/.config/opencode/skills/
```

Each entry should be a symlink pointing into `~/.cover-me/plugins/<plugin>/skills/<name>`, and that directory must contain a `SKILL.md`:

```bash
for d in ~/.config/opencode/skills/*/; do
  test -f "$d/SKILL.md" && echo "OK   $d" || echo "MISS $d"
done
```

All `OK` means the install is complete. Restart opencode to pick up the new skills.

## Step 5 — Warn about third-party dependencies

`coding-god` invokes the following third-party skills internally:

- `superpowers:brainstorming`, `superpowers:test-driven-development`
- `opsx:new`, `opsx:ff`, `opsx:apply`, `opsx:archive`

These are **not bundled in this repo**. If the user wants to use `dev-flow`, they must obtain those skills separately and drop them into `~/.config/opencode/skills/`, or stick to skills that don't need them (e.g. `code-review`, `git-commit`, `git-push`, `standard-coding-style`).

## Updating

```bash
git -C ~/.cover-me pull --ff-only
```

Symlinks automatically follow the new version — no need to re-run Step 3.

## Uninstall

```bash
find ~/.config/opencode/skills/ -maxdepth 1 -type l -lname '*/.cover-me/*' -delete
rm -rf ~/.cover-me   # optional
```
