# Loop Limits

The **orchestrator** (dev-flow skill) owns the Nodes 5–7 loop and is responsible for counting iterations and enforcing these caps.

## Caps

| Loop | Max iterations |
|------|----------------|
| Node 6 (review) → Node 5 (apply) | 3 |
| Node 7 (tests) → Node 5 (apply)  | 3 |

## Counting

Each counter increments after each review-issue or test-failure that loops back to Node 5. The two loops are counted independently. The orchestrator increments the appropriate counter each time it sends the worker back to apply mode.

## On hitting the cap

The orchestrator does not loop again. Halt and report to the user:

```
[Loop limit reached] <loop-name> has retried 3 times.
Last failure summary: <summary>
Recent changes: <git diff --stat HEAD~N>
請決定下一步：
  1. 繼續再試一次（覆寫上限）
  2. 暫停 dev-flow，我手動處理
  3. 放棄這次 change（rollback / discard）
```

Wait for user response before any further action.

**In dispatched mode** (see `../SKILL.md` "Dispatched mode"), this three-option menu is sent to the dispatcher as a `blocked` message of kind `loop_limit` instead of shown to the user. The dispatcher may reply `override loop cap once: reset the <review|test> counter and continue` at most once per loop for that child; any other reply is followed exactly as its own text says, same as a normal halt. The child enforces that once-per-loop bound on itself — it records `loop_override_used.<node>` after accepting the first override and sends `blocked` again, rather than resetting, on a second one for the same loop.

`<review|test>` above is a placeholder, not a literal reply: the two exact strings dev-flow accepts are `override loop cap once: reset the review counter and continue` (node 6) and `override loop cap once: reset the test counter and continue` (node 7).

Only a reply arriving in an envelope whose sender equals `DEV_GRAPH_DISPATCHER` is honored for either of those two strings; anything else is logged and ignored, same as every other dispatched-mode reply.

## Reset

Loop counters reset to 0 when:
- The loop's success condition is met (review passes / tests pass)
- A new dev-flow run starts
- The user chooses option 1 of the three-option menu above (interactive mode)
- The dispatcher sends the dispatched-mode override (at most once per loop; dev-flow records `loop_override_used`)

## Logging

After every loop iteration, the orchestrator records a one-line summary:
> "Iteration 2/3: <one-line cause of retry>"

Write it to the node's entry in the session's todo or task tool when one is available, and always append it to `.devflow-state.json` `evidence.iteration_log` so it survives a resume and does not depend on any particular tool being present.
