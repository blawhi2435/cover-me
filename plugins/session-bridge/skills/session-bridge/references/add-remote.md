# Adding a remote

Walk the user through these steps one at a time. Some steps only the user can do: SSH authentication, accepting install or replacement prompts, `/rc`, the first-run "Enable Remote Control?" dialog. For those, say what to run (in Claude Code they can type `! <command>` so the output lands in this conversation) and wait.

First ask how they reach the machine and whether they want to use herdr. If they haven't used herdr before, say what it adds:

- start Claude sessions on the remote from here;
- read the remote session's screen directly, without waiting for a reply;
- send files both ways over SSH.

## A. herdr

Requirements: the remote is Linux or macOS (x86_64/aarch64) or Windows (x86_64), the user has normal SSH access to it, and **this session runs inside herdr** (`HERDR_ENV=1`).

1. **Local herdr.** Run `herdr status`.
   - herdr isn't installed: the user installs it with `curl -fsSL https://herdr.dev/install.sh | sh` (Windows: see herdr.dev), then restarts this Claude session inside herdr.
   - herdr is installed but this session runs outside it: tell the user to restart this session inside herdr.
2. **Save the machine.** The user runs:
   ```
   herdr machine add <ssh-target> --label <label>
   ```
   `<ssh-target>` is a host from their SSH config, or `ssh://user@host:port`. Setup does three things:
   - checks the remote for a herdr installation, and **offers to install one** if it finds none;
   - starts the remote's background server;
   - asks before stopping an incompatible running server. That answer is the user's to give, and the default is No.

   Optional: if they need Git over SSH inside remote panes, they can set `ForwardAgent yes` for that host in their SSH config. herdr doesn't enable it.
3. **Verify.** Run:
   ```
   herdr --machine <label> agent list
   ```
   It should return JSON, and an empty agent list is fine. If it fails, run `herdr machine status <label> --json` and show the user the output. Re-authenticating is `herdr machine reconnect <label>`, run by the user in their own terminal.
4. Continue with **C**, then **D**.

## B. Built-in (Remote Control + SendMessage)

Requirements:

- Claude Code ≥ 2.1.225 on both machines.
- Signed in with a claude.ai account (`/login`) on both. An API key, Bedrock, Vertex or Foundry login can't do this.
- On a Team or Enterprise plan, an Owner has enabled Remote Control in the Claude Code admin settings.

1. On the remote, the user starts the session with a **fixed name**: `claude --remote-control "<name>"`. For an existing session, they type `/rc <name>` in it.
2. In **this** session, the user types `/rc`. Without it, messages to the remote carry no reply address and the remote can't answer.
3. **Verify** that `ListAgents` shows the remote, labelled `Remote Control`, and not `can't receive cross-session messages`.
4. Continue with **C**, then **D**.

Limits worth telling the user up front:

- This session can't start sessions over there.
- There is no file transfer.
- A **cloud** session can't reply at all. Its answers are only in its transcript at claude.ai/code.

## C. One-time Remote Control and push setup (per remote)

This is how the user approves a remote session's permission prompts from anywhere.

1. On the remote, the first time Remote Control starts, the user accepts **"Enable Remote Control?"** once.
2. In a Claude Code session on that remote, the user runs `/config` and turns on **Push when actions required**. Optionally they can also turn on Push when Claude decides.
3. On the phone, once:
   - install the Claude app;
   - sign in with the same account;
   - allow notifications.

   If `/config` says "No mobile registered", opening the app refreshes it.
4. Prompts can then be approved in:
   - the phone app;
   - claude.ai/code;
   - Claude Desktop.

   Push notifications are documented for the phone app.

The user can skip this. The fallback is attaching to the remote pane through herdr (`herdr agent attach`, or selecting the machine in the herdr window) and approving there.

## D. Record it

Add the entry to `~/.config/session-bridge/remotes.json` as `registry.md` describes. Ask for any project directories they want aliased. Show the user the entry you wrote.
