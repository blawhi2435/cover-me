# Built-in transport (Remote Control + SendMessage)

Use it when herdr isn't available or not wanted. Its limits:

- It can't start a session on the remote.
- It can't read the remote's screen. You only get what the remote sends back.
- It can't transfer files. Everything is text.

## Preconditions

- Claude Code ≥ 2.1.225 on both machines.
- claude.ai login on both.
- Remote Control is on in **both** sessions.
- If this session isn't connected to Remote Control, messages go out **without a reply address** and the remote can't answer. Tell the user to type `/rc` here first.

## Find

`ListAgents` lists remote sessions while this session is connected to Remote Control:

- `Remote Control`: a session on another machine.
- `offline`: its connection dropped. A message is delivered when it reconnects, so don't count on a prompt answer.
- `can't receive cross-session messages`: it has messaging off. A send is refused before it leaves (`Not sent`). Tell the user.
- Cloud sessions appear here as well. **A cloud session can't reply.** Its answer is only in its transcript at claude.ai/code. Say so before sending.

Look up the registry's `rc_session_name` in this list every time (see `registry.md`).

## Get a session

You can't start one. Ask the user to open it on the remote with a fixed name, then look it up again:

```
claude --remote-control "<name>"
```

## Send

`SendMessage` to the name exactly as `ListAgents` printed it.

- The brief must be self-contained, because the remote has none of this conversation.
- End the brief by asking for a reply via `SendMessage` to this session, giving this session's name from the `This session is <name>` line of `ListAgents`. The reply must say what was done and the result.

The receiving session's own rules apply:

- Its permission prompts still fire. The user approves them through Remote Control.
- A message from a session in a different permission class (bypass vs prompting) is **held** until the user approves it on that side.
- An existing session in auto mode may refuse peer-requested work.

When nothing comes back, suspect these before resending.

## Collect

- Wait for the reply message.
- `notify_when_idle` works only for sessions on this machine. Don't use it for remotes.
- If no reply arrives in a reasonable time:
  - check `ListAgents` (is it `offline`?);
  - tell the user;
  - suggest they look at the session on claude.ai or in the phone app, where they can also see a pending permission prompt.
