# Remote registry

The registry lists the user's remotes. It lives at:

```
~/.config/session-bridge/remotes.json
```

It is per user: not in the plugin (updates would overwrite it) and not in any repository (it must never be committed).

## Format

```json
{
  "version": 1,
  "remotes": [
    {
      "name": "build-server",
      "transport": "herdr",
      "herdr_label": "build",
      "projects": { "app": "/srv/app", "infra": "~/infra" },
      "allowlist": ["Bash(make test:*)"]
    },
    {
      "name": "gpu-box",
      "transport": "builtin",
      "rc_session_name": "gpu-box-main"
    }
  ]
}
```

| Field | Required | Meaning |
|---|---|---|
| `name` | yes | What the user calls the machine. Unique. |
| `transport` | yes | `herdr` or `builtin`. |
| `herdr_label` | for `herdr` | The label of the saved herdr machine profile (`herdr machine list --json`). Always used as `--machine <herdr_label>`. |
| `rc_session_name` | for `builtin` | The fixed name the remote session was given with `claude --remote-control "<name>"` or `/rc <name>`. |
| `ssh_target` | no | herdr only: the SSH target for `scp`, as passed to `herdr machine add`. See `files.md`. |
| `projects` | no | Alias → directory on that machine. An absolute path, `~`, or a path starting with `~/`. Lets the user say "start a session for app on build-server" without repeating the path. |
| `allowlist` | no | Extra `--allowedTools` entries for sessions started there, added to the default list in `transport-herdr.md`. |

**No secrets.** No passwords, keys, tokens or private hostnames beyond what the user chooses to put in `name`. SSH authentication stays in the user's own SSH config and in herdr.

## Reading it

1. The file doesn't exist → no remotes yet. Follow `add-remote.md`.
2. It isn't valid JSON, or a remote is missing a required field → show the user the exact error and the path. **Never overwrite or "repair" it on your own.** Fix it only with the user's go-ahead, by editing that one entry.
3. Writing: read, change only the entry concerned, then write the whole file back. Create `~/.config/session-bridge/` if needed.

## Names go stale

- **herdr**: before using `herdr_label`, check that it is in `herdr machine list --json` and enabled. If it's missing, disabled, or `herdr machine status <label> --json` fails, report that output to the user and stop for that remote. Never retry the command without `--machine`.
- **builtin**: a session's name can change, for example an auto-generated name after a restart. Look up `rc_session_name` in `ListAgents` every time, and never send to a stored name blindly. Not found → ask the user to start or rename the session (`/rename <name>`, `/rc <name>`). Several matches → ask which one.

## Editing by hand

Users may edit the file directly. Point them at this format; the skill picks up changes the next time it reads the file.
