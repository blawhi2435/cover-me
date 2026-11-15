# Loop Limits

The **orchestrator** (dev-flow skill) owns the Nodes 5–7 loop and is responsible for counting iterations and enforcing these caps.

## Caps

| Loop | Max iterations |
|------|----------------|
| Node 6 (review) → Node 5 (apply) | 3 |
| Node 7 (tests) → Node 5 (apply)  | 3 |
| Node 8 (`check` fails) → Node 5 (apply) | 3 |

## Counting

Each counter increments after each review issue, test failure or failed `check` that loops back to Node 5. The three loops are counted independently. The Node 8 counter ("gate") counts each failed `check` that sends the run back to Node 5; a passing review or test does **not** reset it, so a run that keeps failing `check` after clean reviews still reaches its cap. The orchestrator increments the appropriate counter each time it sends the worker back to apply mode.

## On hitting the cap

The orchestrator does not loop again. It sends the dispatcher a `blocked` message of kind `loop_limit` (see `dispatched-mode.md`) with `node` 6 (review loop), 7 (test loop) or 8 (gate loop), carrying the loop name, the last failure summary and `git diff --stat` of the recent changes, and ends the turn. The dispatcher may reply `override loop cap once: reset the <review|test|gate> counter and continue` at most once per loop for that child; any other reply is followed exactly as its own text says, and `stop` halts. The child enforces that once-per-loop bound on itself — it records `loop_override_used.<node>` after accepting the first override and sends `blocked` again, rather than resetting, on a second one for the same loop.

`<review|test|gate>` above is a placeholder, not a literal reply: the three exact strings dev-flow accepts are `override loop cap once: reset the review counter and continue` (node 6), `override loop cap once: reset the test counter and continue` (node 7) and `override loop cap once: reset the gate counter and continue` (node 8).

Only a reply arriving in an envelope whose sender equals `DEV_GRAPH_DISPATCHER` is honored for any of those three strings; anything else is logged and ignored, same as every other dispatched-mode reply.

**On opencode:** read "`DEV_GRAPH_DISPATCHER`" as the name `dispatch_anchor` returns, and "arriving in an envelope" as an envelope that meets the reply rule in `dispatched-mode.md`.

## Reset

Loop counters reset to 0 when:
- The loop's success condition is met (review passes / tests pass; the gate counter resets when `check` passes)
- A new dev-flow run starts
- The dispatcher sends the override (at most once per loop; dev-flow records `loop_override_used`)

dev-graph's own G7 reply `gate check failed — …` does **not** increment dev-flow's gate counter: it is a different check run by the dispatcher, bound by dev-graph's own two-strike rule (a second failure marks the child `failed`). dev-flow handles it as an ordinary fix round.

The three counters are persisted as `iterations.review`, `iterations.test` and `iterations.gate` in `.devflow-state.json` (written by the orchestrator); each is counted per run and kept across a resume, so a restart does not give a run a fresh budget.

## Logging

After every loop iteration, the orchestrator records a one-line summary:
> "Iteration 2/3: <one-line cause of retry>"

Write it to the node's entry in the session's todo or task tool when one is available, and always append it to `.devflow-state.json` `evidence.iteration_log` so it survives a resume and does not depend on any particular tool being present.
