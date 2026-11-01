# Example: test locally, fix remotely

The setup: a web app runs on a headless server (`build-server`, registry alias `app` → `/srv/app`). Only the local machine has a browser, so Playwright runs here. The code and the deployment live on the server.

**The user:** "Run the login e2e tests against the staging server. If something breaks, have the server session fix it, and tell me when it's green."

1. **Find / get a session.** Read the registry. `build-server` uses herdr, and `HERDR_ENV=1` is set. `agent list` shows no session in `/srv/app`, and the user didn't name one, so ask: "use an existing session or start one in /srv/app?" They say start one. Show the `tab create` + `agent start … --remote-control "app-fix"` command, and get a yes.
2. **Test locally.** Playwright fails: the login button does nothing. Save a screenshot and the console log.
3. **Send.**
   - Create task `20261101-143005-a3f9`.
   - `scp` the screenshot as-is.
   - Run the console log through `redact.py` (exit 0, `redacted 2 value(s)`), then `scp` the redacted copy.
   - The trace zip is refused (exit 3), so summarize the failing request in the brief instead.
   - Brief: what was tested, the steps, expected vs actual, the file paths on the server. Ask it to fix, redeploy to staging, and report what changed. Ask it to put its diff in the task directory.
4. **Wait.** `agent prompt … --wait` settles at `blocked`: the remote wants to run the deploy script, which isn't on the allowlist. **Pause.** Tell the user: "app-fix on build-server is asking to run ./deploy.sh staging; approve it on your phone or in claude.ai". The user approves, and the session goes back to `working`.
5. **Collect.** It settles at `idle`. `agent read` shows the report. `scp` the diff back, run it through `redact.py`, and read it.
6. **Decide.** Re-run the tests. One test still fails, so send a follow-up brief to the same session; it keeps its context. The next round is green.
7. **Report once.**
   - Tell the user what failed, what the remote changed, the diff summary, and that all tests pass.
   - Delete the task directory on both sides.
   - Leave `app-fix` running in case they want more.
