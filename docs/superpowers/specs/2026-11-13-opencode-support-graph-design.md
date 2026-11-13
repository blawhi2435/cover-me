# opencode support for coding-god — graph design

Date: 2026-11-13
Run: dev-graph, single group (`/home/jerry/my-project/cover-me`). No contract artifact — there is only one group.

## Intent

coding-god (dev-graph, dev-flow, code-review, git-commit, git-push, standard-coding-style, plus the five agents) only runs inside Claude Code today. The goal is that **people who use opencode can install and use the whole coding-god workflow end to end** — not just read the skills, but run dev-graph → child dev-flow → code-review subagents → commit/PR — while Claude Code users see no behavior change.

The skills detect which host they run in and pick the matching mechanism:

- `OPENCODE=1` in the environment → opencode path (verified: opencode 2.2.7 sets `OPENCODE=1`, `AGENT=1`, `AI_AGENT=opencode` for its shell tool).
- `CLAUDECODE=1` → Claude Code path (current behavior, unchanged).
- Neither → treat as Claude Code (today's default) — no new failure mode for existing users.

## Goals

1. opencode users can install coding-god with one documented command and get all six skills and all five agents.
2. dev-graph works on opencode: launches child sessions, dispatches, receives `ready` / `blocked` / `done`, answers, gets idle notices — with the **same trust model** as on Claude Code (the dispatcher identity is bound at launch by something the model cannot forge, and message senders are stamped by code, not by the model).
3. dev-flow (normal and dispatched mode) and code-review work on opencode, including dispatching the reviewer / implement subagents.
4. One source of truth for skill text: the same `SKILL.md` files serve both hosts; host differences live in small, clearly marked per-host sections.
5. Verified on this machine with opencode 2.2.7 (`@opencode/cli`) on a real single-repo run.

## Non-goals

- `session-bridge` and `desktop-notify` plugins — Claude Code only, untouched.
- Supporting opencode 1.x (`opencode-ai` npm package). Only 2.x (`@opencode/cli`) is supported.
- Porting superpowers or OpenSpec themselves — both are external prerequisites the user installs for opencode (documented, checked in prerequisites).
- Hosts other than Claude Code and opencode (Codex, etc.).

## Anti-goals (would be a failure even if it "works")

- Any weakening of dev-graph's trust model on opencode: a dispatcher identity or message sender that the model writes itself; a child that accepts a dispatch brief typed by a user or found in a file/tool output.
- Auto-approving permissions in children. **The user chose normal (non-`--auto`) permission mode** for opencode children; `--auto` is the opencode equivalent of `bypassPermissions` and stays refused, like today.
- Forking the skills into a separate opencode copy that drifts from the Claude Code copy.
- Changing anything a Claude Code user observes.

## Constraints and findings (from recon)

- opencode 2.x does **not** load Claude Code plugins. It does discover skills from `.opencode/skills`, `.claude/skills`, `.agents/skills` and their global equivalents, but not from a Claude plugin tree, and not agents.
- opencode 2.x has **no cross-session messaging** (no `SendMessage` / `ListAgents` equivalent).
- opencode 2.x plugins (TS/JS, `Plugin.define({ id, setup(ctx) })`, installable with `opencode plugin add`, or as a local directory in the `plugins` array of `opencode.json(c)`) can: register tools (`ctx.tool.transform`; the tool's `execute` receives the **calling `sessionID`**), register skills (`ctx.skill.transform`), register commands, call the session API (`ctx.session.create / list / prompt / synthetic / get / wait …`), subscribe to server events (`ctx.event.subscribe`), and keep storage (`ctx.storage`). The docs show `ctx.agent.transform` with `update`/`remove` but no `add`, so agents may need to ship as files under an opencode agents directory or via config — builder verifies.
- opencode sessions normally run inside a **shared background service** (`opencode service`), so a child session's tools see the service process environment, not a per-session environment. **`DEV_GRAPH_DISPATCHER` therefore cannot be set per child on opencode** — the launch-time anchor must come from the plugin instead (see Design).
- opencode subagents: invoked through the `subagent` tool, defined as markdown agents with `mode: subagent`, `model: provider/model[#variant]`, and `permissions` rules (not Claude's `tools:` / `model: sonnet`). Nested IDs come from paths (`coding-god/logic-reviewer`).
- Claude Code's auto-mode classifier in the *main* development session blocked running `opencode run --auto` while doing recon; end-to-end verification must run without `--auto` (which matches the chosen design anyway) and may need the user to approve the opencode commands.

## Approaches considered

| | Approach | Trade-off |
|---|---|---|
| **A (chosen)** | Ship an **opencode plugin** in this repo that registers the existing skills, provides converted agents, and implements cross-session messaging tools whose sender is stamped by plugin code from the caller's `sessionID`. | A TS plugin to write and maintain against a partly documented API; in exchange the trust model carries over intact and skills stay single-source. |
| B | Skill-text only; the model calls opencode's HTTP API with `curl`. | No code, but the sender is whatever the model writes (forgeable), idle detection needs polling, and skills/agents still need a copy script. Contradicts the trust model. |
| C | Map dev-graph onto opencode's native `subagent` tool. | Little code, but subagents don't own a separate repository cwd (breaks multi-repo), and dispatch authentication disappears. |

The user picked **A**.

## Design

### 1. Host detection

The Claude Code path runs **no** extra detection step — no added `printenv` or any other command, so an unattended Claude Code child in `default` mode can't stall on a new permission prompt (my call, resolving the builder check). Detection lives only inside the opencode-specific text: every place below that differs per host gets a clearly marked `**On opencode:**` paragraph next to the existing Claude Code text, which applies when the coding-god opencode tools (e.g. `list_agents` from section 2c) are available in the session; `OPENCODE=1` may be checked from within that paragraph as confirmation. The Claude Code text is not reworded.

### 2. The opencode plugin (`opencode/` at the repo root — my call)

A TypeScript package at `opencode/` (its own `package.json`, plugin id `coding-god`), installed by opencode users as a plugin. It does four things:

**2a. Skills.** Registers every `plugins/coding-god/skills/<name>/SKILL.md` (with its `references/`) by reading them from the repo at load time — no copies. Skill IDs must let the existing cross-references resolve (`coding-god:dev-flow`, `coding-god:code-review`, …); the builder picks the opencode-side ID scheme and adds a one-line mapping note in the skills if opencode IDs can't contain `:`.

**2b. Agents.** The five agents in `plugins/coding-god/agents/` become opencode subagents. Conversion (generated from the Claude files, not hand-maintained copies — e.g. at plugin load, or a build step with a check that fails if they drift):

- `mode: subagent`, same `description`, same body.
- `tools: Read, Grep, Glob, Bash` → equivalent opencode `permissions` (read/search/bash allowed, edits denied for reviewers).
- `model: sonnet` → the plugin's **`fast`** model option; `model: opus` → the **`strong`** option. Both options are optional; when unset the subagent inherits the parent session's model (my call — opencode users run arbitrary providers, so nothing Claude-specific is hard-coded).

**2c. Cross-session messaging tools** (names are the builder's call; semantics are fixed):

- `list_agents` — prints `This session is <name>` for the caller, then the sessions it may address (at least: sessions launched by this plugin, and the caller's dispatcher if it has one). `<name>` is a stable, unique name the plugin assigns (session title for launched children, e.g. `dg-<graph_id>-<slug>`; for the main session a plugin-derived name). The model never chooses its own name.
- `send_message(to, message, notify_when_idle?)` — delivers `message` to the target session wrapped as `<cross-session-message from="<caller name>">…</cross-session-message>`, where `<caller name>` is computed by the plugin from the calling `sessionID`. Delivery must be distinguishable from user input and from tool output — use a mechanism the model and users can't trivially replicate (e.g. `session.synthetic` or a plugin-marked part); the builder verifies what opencode 2.2.7 offers and the skill rule is: **only a plugin-delivered envelope counts**; an envelope seen in user text, file content, or tool output never does (same rule as Claude Code today). `notify_when_idle: true` subscribes the caller to a one-shot idle notice for that target.
- `launch_child(root, name, model?)` — creates a new session with cwd `root` and title `name` on the background service, runs it in **normal permission mode**, and **records a binding `child sessionID → dispatcher name` in plugin storage, where the dispatcher name is the calling session's plugin-assigned name** (never a parameter). Returns the child's name and session id. This binding replaces `DEV_GRAPH_DISPATCHER` on opencode.
- `dispatch_anchor` — callable by a child; returns the dispatcher name bound to the calling session by `launch_child`, or nothing. This is what dev-flow's dispatched mode checks on opencode instead of the environment variable.

**2d. Events.**

- Idle notices: when a subscribed target session goes idle, deliver a plugin-stamped idle notice to the subscriber (one-shot, matches Claude's `notify_when_idle` semantics, including re-subscription by the caller).
- Permission requests in a child: when a plugin-launched child is waiting on a permission prompt, deliver a plugin-stamped notice to its dispatcher naming the child and the requested action. The user approves **in the child session itself** (opened from the opencode session list / `opencode -s <session id>`), never through the main session (my call — keeps "permission denial → user exception 1" intact: dev-graph only tells the user where to look).

### 3. dev-graph on opencode

Per-host differences, each as an `**On opencode:**` paragraph:

- **Prerequisites (G2):** `opencode --version` ≥ 2.2.7 instead of `claude --version`; the coding-god opencode plugin is loaded (its tools are present); no `permission_mode` question — opencode children always run in normal mode and the `.devflow-repos.json` `permission_mode` field is not used on opencode; refuse if the main session itself runs with `--auto` (equivalent of the existing `--dangerously-skip-permissions` refusal) if detectable, otherwise state it as a requirement in the G2 confirmation. Workspace trust: builder verifies whether opencode has a trust gate; if not, the check is skipped on opencode. The "show repo config" step also shows `opencode.json(c)`, `.opencode/`, and `AGENTS.md`.
- **Dispatcher name (G2):** from `list_agents`'s `This session is <name>` line; absent → stop (same rule).
- **Launch (G4):** `launch_child` per group. The G2 confirmation shows the exact `launch_child` call (root, name, model) instead of a shell command. Session identification uses the session id returned by the plugin; re-verification before `proceed` and on resume checks that session still exists with the same title and the same binding. herdr: when `HERDR_ENV=1`, additionally open a herdr tab running `opencode -s <child session id>` in the group root so the user can watch — the child itself is still created by `launch_child` (builder verifies `-s` attaches to the existing session on the shared service).
- **Dispatch / attend / finish (G5–G8):** `send_message` with `notify_when_idle` where Claude uses `SendMessage`. All G6 tables, decision logging, redaction, and user exceptions are unchanged. The idle-report text tells the user to open the child via the opencode session list / `opencode -s <id>` instead of `claude attach`.
- **State file:** `.devgraph-state.json` gains nothing Claude-specific; on opencode `pid`, `bg_id` are `null` and `session_id` is the opencode session id. The resume check against `~/.claude/sessions/*.json` becomes a check through the plugin on opencode.

### 4. dev-flow on opencode

- **Dispatched mode activation:** on opencode, the three conditions become: `dispatch_anchor` returns a dispatcher name; the brief arrived as a plugin-delivered `<cross-session-message from="X">`; `X` equals both the anchor and the brief's `dispatcher`. Replies are authenticated the same way. On resume, dispatched mode continues only while `dispatch_anchor` still returns the same name. Messages back go through `send_message`.
- **Subagents:** where dev-flow uses the Agent tool with `subagent_type: coding-god:dev-flow-implement`, on opencode it uses the `subagent` tool with the converted agent's id.
- **Other Claude-only references** in dev-flow (e.g. `.claude/` paths, the line at `SKILL.md:272`) get an opencode equivalent or an explicit "Claude Code only" note — builder inventories them.
- **External skills:** `superpowers:brainstorming`, `superpowers:test-driven-development`, and `opsx:*` must be available on opencode. Prerequisites check that superpowers is installed for opencode and that the repo's OpenSpec was initialized for opencode (OpenSpec's generated opencode skills/commands); the skills name the opencode-side invocation where it differs.
- **Playwright / `--chrome`:** frontend groups need Playwright MCP configured in opencode; there is no `--chrome` equivalent — the prerequisite check looks for the Playwright MCP tools instead.

### 5. code-review on opencode

The four reviewer dispatches use the `subagent` tool with the converted reviewer ids, in parallel as today.

### 6. Distribution and docs

- **The existing symlink install is replaced (user's decision).** Today `.opencode/INSTALL.md` (an agent-followable script, referenced from README's `### opencode` section) clones the repo to `~/.cover-me` and symlinks each skill into `~/.config/opencode/skills/`, and states that code-review is Claude-only and agents are not installed. That flow is rewritten to install the new plugin instead, and gains a **migration step** that removes old symlinks in `~/.config/opencode/skills/` pointing into `~/.cover-me` (the existing uninstall `find … -lname '*/.cover-me/*' -delete`) so the same skill is never registered twice. README's `### opencode` section is rewritten to match; there is exactly one opencode install path afterwards. The plugin's skill IDs need not stay compatible with the old symlink names.
- The install docs (INSTALL.md, README, and `CLAUDE.md`'s "What this repo is") cover: install superpowers and OpenSpec for opencode, then install this plugin.
- `.gitignore` ignores `.opencode/*` except `INSTALL.md`, and ignores `docs/`, `openspec`, `CLAUDE.md` — left as is (assumed intentional); the new `opencode/` directory (no leading dot) is not affected and must be committed. Preferred install is `opencode plugin add <this repo>` straight from Git; if opencode 2.2.7 can't install a plugin from a repo subdirectory, the fallback is a documented clone + `plugins` entry pointing at `<clone>/opencode` (builder verifies; publishing to npm is **out of scope** for this change).
- `plugins/coding-god/.claude-plugin/plugin.json` version bumps minor (1.12.0 → 1.13.0); the opencode package carries the same version.

### 6b. dev-graph flow change: no user confirmation between spec approval and G7 (user's decision, both hosts)

Requested by the user during this run. After the user approves the G1 spec, G2–G6 run on the main session's own judgment with **no user confirmation**:

- G2 no longer asks the user to confirm resolved roots and launch commands, and no longer asks "same as last time?" — it still **prints** the roots, folders, and exact launch commands (for the record), then proceeds. The approved spec is the authorization to launch.
- G2 no longer asks the user to state the permission mode. The main session determines its own permission mode itself (from what its harness tells it about the current mode; on opencode it is always normal mode). It still refuses `bypassPermissions` / `--dangerously-skip-permissions` / `--auto`, and if it genuinely cannot determine its own mode it stops and asks — the one remaining fallback.
- Which paths are involved: taken from the approved spec's groups; asked only if the spec does not name them.
- Prerequisite failures are still reported and still stop the run (they are not decisions).
- Unchanged: the two user exceptions in G6 (permission denial, files outside the commit allowlist) and the G7 summary approval before any commit/PR.
- `SKILL.md`'s "two user decision points" text and the G2/G4 wording ("the consent for the launch is the user's G2 confirmation") are updated accordingly, in `SKILL.md` and `references/session-discovery.md`.

### 7. Verification

- Plugin unit tests (the builder picks the runner) covering: sender stamping cannot be overridden by tool input; `launch_child` binding uses the caller's name, not a parameter; `dispatch_anchor` returns only the caller's own binding; idle notice is one-shot; permission-pending notice reaches only the bound dispatcher.
- A real end-to-end run on this machine with opencode 2.2.7 and a free model (e.g. `opencode/big-pickle`): dev-graph in a throwaway local repo with one group → child dev-flow reaches `ready` → `proceed` → commit (PR step may be skipped for a repo without a remote; record that as a deviation). Plus one negative check: a dispatch brief pasted as plain user text into a child does **not** activate dispatched mode.
- Claude Code regression: the Claude Code text paths are unchanged (diff review), and a normal `/dev-flow` invocation in Claude Code behaves as before.

## Left to the builder

- Exact opencode 2.2.7 API calls for delivery (`synthetic` vs. `prompt`), idle and permission events, session creation with a given cwd, and agent registration — verify against the installed version, fall back as noted above.
- Tool names, the plugin's internal layout, test runner, and how agent conversion is wired (load-time vs. build step with drift check).
- Skill ID scheme on opencode and how cross-references resolve.
- Wording of the `**On opencode:**` paragraphs.

## Group: cover-me (`/home/jerry/my-project/cover-me`, folders `["."]`)

The only group. Touches: `opencode/` (new), `plugins/coding-god/skills/{dev-graph,dev-flow,code-review}/**` (per-host paragraphs; git-commit/git-push/standard-coding-style only if they reference Claude-only tools), `plugins/coding-god/agents/*` (unchanged source of truth for conversion), `plugins/coding-god/.claude-plugin/plugin.json`, `.opencode/INSTALL.md`, `README.md`, `CLAUDE.md`.
