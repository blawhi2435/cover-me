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

## Reset

Loop counters reset to 0 when:
- The loop's success condition is met (review passes / tests pass)
- A new dev-flow run starts

## Logging

After every loop iteration, the orchestrator records a one-line summary:
> "Iteration 2/3: <one-line cause of retry>"

Write it to the node's entry in the session's todo or task tool when one is available, and always append it to `.devflow-state.json` `evidence.iteration_log` so it survives a resume and does not depend on any particular tool being present.
