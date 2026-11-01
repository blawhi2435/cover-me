# herdr transport

Preconditions:

- `HERDR_ENV=1` in this session.
- The remote's `herdr_label` is listed and enabled in `herdr machine list --json` (see `registry.md`).

Rules for every command below:

- **Every command carries `--machine <label>`.** Never drop it. Without it the command runs on the local machine.
- Never combine `--machine` with `--session` or `--remote`.
- IDs (`w1:p1`) and agent names belong to one server. Discover them on that remote; local IDs and `--current` mean nothing there.
- Read IDs and states from the JSON responses. Never predict them.
- A connection failure doesn't prove that a mutation wasn't applied. Re-inspect before retrying.

`herdr --help` and the bare command groups (`herdr agent`, `herdr tab`) are the authority on syntax if anything below disagrees with the installed version.

## Find

```
herdr --machine <label> agent list
herdr --machine <label> workspace list
herdr --machine <label> pane list
```

`agent list` shows each Claude session's agent name, pane id, `cwd` and `agent_status` (`idle`, `working`, `blocked`, `done`, `unknown`). `idle` and `done` both mean ready for input.

## Get a session

**Existing:** the user names it, or you match it by `cwd` from `agent list`. Use its agent name. If it has none, use its pane id.

**New:** you need a directory on the remote, either absolute, `~`, or starting with `~/`.

1. Pick a location:
   - If `workspace list` returns at least one workspace, create **one tab** there:
     ```
     herdr --machine <label> tab create --workspace <workspace_id> --cwd <dir> --label <name> --no-focus
     ```
   - Only when the remote has no workspace at all:
     ```
     herdr --machine <label> workspace create --cwd <dir> --label <name> --no-focus
     ```

   Either response gives the pane id in `.result.root_pane.pane_id`. Remember the tab id: this job created it.
2. **Before the first launch in a job, show the user the exact command and get a yes.** Then run:
   ```
   herdr --machine <label> agent start <name> --kind claude --pane <pane_id> -- \
     --remote-control "<name>" --permission-mode acceptEdits \
     --allowedTools <default allowlist…> <registry allowlist…> <task-specific…>
   ```
   - `<name>` must match `[a-z][a-z0-9_-]{0,31}` and be unique among that remote's live agents. Use the same string for the Remote Control name, so the user finds the session on the phone or on claude.ai.
   - Use `--permission-mode acceptEdits` by default. **Never `bypassPermissions`, never `--dangerously-skip-permissions`.**
   - Default allowlist, read-only:
     ```
     "Read" "Grep" "Glob" "Bash(git status:*)" "Bash(git diff:*)" "Bash(git log:*)" "Bash(git show:*)" "Bash(ls:*)"
     ```
     Then add the registry's `allowlist` for that remote. Add the project's own test/build commands for the task (e.g. `"Bash(make test:*)"`), and show them in the command the user confirms.
   - `agent start` returns once Claude is ready. `agent_not_ready` means it's blocked at startup. Inspect it with `agent read`, and tell the user if it's a dialog they must answer (e.g. the first-run "Enable Remote Control?", or workspace trust).

## Send

```
herdr --machine <label> agent prompt <name> "<brief>" --wait --timeout 600000
```

- `agent_blocked` (rejected before sending): the agent is already at a prompt. Treat it as **blocked**, below.
- `timeout` or `agent_prompt_stalled`: **don't resend.** Run `agent get <name>` and `agent read <name>` first. The prompt may have been delivered.
- It settles at `blocked`: **pause.** Read the prompt with `agent read`. Tell the user what the remote is asking for, and where to approve it: through Remote Control on the phone, claude.ai or Claude Desktop, or by selecting that machine in the herdr window. Then wait with `agent wait <name> --timeout <ms>` and check again. **Never answer it with `agent send-keys`.**

## Collect

```
herdr --machine <label> agent wait <name> --timeout <ms>
herdr --machine <label> agent read <name> --source recent-unwrapped --lines 200
```

If a larger read still doesn't show the whole answer, ask the remote to write it to `~/.cache/session-bridge/<task-id>/result.md` and reply only with the path. Then pull the file (see `files.md`). Use this as a fallback, not in the first brief.

## End

- Leave the session running, so follow-ups keep its context.
- Close a tab only if **this job created it** and the user asks:
  ```
  herdr --machine <label> tab close <tab_id>
  ```
- Never close tabs, panes or workspaces you didn't create.
- Never run `herdr server stop`.

## Attaching (for the user)

Interactive attachment isn't forwarded through `--machine`. To look at or approve something in a remote pane, the user can:

- select the machine in the herdr window (remote agents also appear in its agent list, tagged with the machine); or
- SSH to the remote and run `herdr agent attach <name>` there.
