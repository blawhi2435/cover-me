# Install coding-god for opencode

> This document is written for AI coding agents. When a user says "install coding-god on opencode for me", follow the steps below in order.

coding-god runs on opencode **2.2.7 or newer** (package `@opencode/cli`) through one opencode plugin that lives in this repository under `opencode/`. The plugin registers the six coding-god skills straight from `plugins/coding-god/skills/`, converts the five agents in `plugins/coding-god/agents/` into opencode subagents, and adds the cross-session tools (`list_agents`, `send_message`, `launch_child`, `dispatch_anchor`) that `dev-graph` and dispatched `dev-flow` use. This is the only supported opencode install path.

## Prerequisites

- `opencode --version` reports 2.2.7 or later. If older, stop and tell the user to upgrade opencode.
- `git` is installed. All commands run on the user's local machine (Linux / macOS). Windows users should use WSL or Git Bash.
- **superpowers** is installed for opencode (on opencode it registers its skills under unprefixed ids, for example `brainstorming` and `test-driven-development`; coding-god's `superpowers:<name>` means the skill registered as `<name>`). Follow superpowers' own opencode install instructions at https://github.com/obra/superpowers; coding-god does not bundle it.
- **OpenSpec** CLI 1.8.0 or later (`openspec --version`; `npm i -g @fission-ai/openspec@latest`), and each repository you will run `dev-flow` in initialized for opencode (`openspec init`, selecting opencode), which generates `.opencode/skills/openspec-*` and the `/opsx-*` commands. After upgrading the CLI, run `openspec update` in each repository.

`desktop-notify` and `session-bridge` use Claude Code hooks and sessions and are not supported on opencode.

## Step 1 — Remove the old symlink install (migration)

Earlier versions of this document symlinked each skill into `~/.config/opencode/skills/`. The plugin now registers those skills itself, so any old symlink would register the same skill twice. Delete only the symlinks that point into `~/.cover-me`:

```bash
if [ -d ~/.config/opencode/skills ]; then
  find ~/.config/opencode/skills/ -maxdepth 1 -type l -lname '*/.cover-me/*' -delete
fi
```

This is safe to run when the directory does not exist or nothing matches, and it leaves every other entry in that directory untouched.

## Step 2 — Clone or update the repository

Install to a fixed location `~/.cover-me` so updates only need `git pull`:

```bash
test -d ~/.cover-me || git clone https://github.com/blawhi2435/cover-me ~/.cover-me
git -C ~/.cover-me fetch --tags
git -C ~/.cover-me symbolic-ref -q HEAD >/dev/null && git -C ~/.cover-me pull --ff-only   # only when on a branch; after a tag checkout HEAD is detached and this is skipped
```

The plugin loads code from this clone and runs it with your permissions, so prefer a pinned version over a moving branch: after cloning, check out a release tag or a commit you have reviewed (`git -C ~/.cover-me checkout <tag-or-commit>`). To update later, fetch and check out the next tag or commit; `pull --ff-only` only moves a branch checkout.

The plugin reads `plugins/coding-god/` from the same clone, so it must be loaded from this clone and not copied anywhere else. It needs no `npm install`.

## Step 3 — Register the plugin

Add the clone's `opencode` directory to the `plugins` array of the user's global opencode config, `~/.config/opencode/opencode.json` (or `opencode.jsonc` if that is the file that exists). Merge into the existing file — keep every other key and every other plugin entry:

```jsonc
{
  "plugins": [
    {
      "package": "~/.cover-me/opencode",
      "options": {}
    }
  ]
}
```

Always use the object form shown (`{ "package": "<dir>", "options": {} }`) — a bare path string is not accepted in a project-level `plugins` array, and the same entry is the safe form in the global file. A directory with an index entrypoint also works; the clone's `opencode` directory has one. Replace `~` with the user's absolute home directory if opencode does not expand it. The plugin itself needs no `npm install`: `@opencode/plugin` (listed in `opencode/package.json`) is used only for type-checking and the test suite. The optional `options` are `fast` and `strong`, each a `provider/model` or `provider/model#variant`: they set the model of the converted agents that say `model: sonnet` (`fast`) and `model: opus` (`strong`) in their Claude Code definitions. Leave them out and every subagent runs on the model of the session that dispatches it.

### Ask before launching child sessions (recommended)

`launch_child` creates a new session in a directory you choose. To have opencode ask you each time, add a permission rule for it to the same config file. opencode evaluates permission rules last-match-wins, and a rule is `{ action, resource, effect }` with effect `allow`, `ask` or `deny`; the action for a plugin tool is its name:

```jsonc
{
  "permissions": [
    { "action": "launch_child", "resource": "*", "effect": "ask" }
  ]
}
```

This rule was verified live on opencode 2.2.7: it produces a permission request for `launch_child`, it takes effect after `opencode service restart`, and a non-interactive `opencode run` auto-rejects the request. If you add it, dev-graph's launch stops at opencode's permission prompt in the main session and you approve it there. Without it — the default — `launch_child` runs without any prompt. Subagents are separately denied the cross-session tools by the plugin.

## Step 4 — Verify

Opencode runs sessions on a shared background service, and newly added plugin entries and `.opencode/skills` are only picked up after it restarts: run `opencode service restart`, then start a new session and check that the subagents are registered:

```bash
opencode debug agents
```

The list must include `coding-god/dev-flow-implement`, `coding-god/logic-reviewer`, `coding-god/security-reviewer`, `coding-god/style-reviewer` and `coding-god/test-reviewer`. In a new session, the skills `coding-god:dev-flow`, `coding-god:dev-graph`, `coding-god:code-review`, `coding-god:git-commit`, `coding-god:git-push` and `coding-god:standard-coding-style` must be available, and the tools `list_agents`, `send_message`, `launch_child` and `dispatch_anchor` must be present. If the plugin fails to load, opencode reports why; the usual cause is that the path in Step 3 is not the clone's `opencode` directory.

## Updating

```bash
git -C ~/.cover-me fetch --tags
git -C ~/.cover-me checkout <new-tag-or-commit>   # or, when following a branch: git -C ~/.cover-me pull --ff-only
```

Run `opencode service restart` afterwards. The plugin reads the skills and agents from the clone each time it loads, so nothing else needs regenerating.

## Uninstall

Remove the entry from `plugins` in `~/.config/opencode/opencode.json`, then optionally:

```bash
rm -rf ~/.cover-me
```
