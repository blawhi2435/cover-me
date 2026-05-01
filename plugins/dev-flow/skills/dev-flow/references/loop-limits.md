# Loop Limits

## Caps

| Loop | Max iterations |
|------|----------------|
| Node 6 (review) → Node 5 (apply) | 3 |
| Node 7 (tests) → Node 5 (apply)  | 3 |

## Counting

Each return-to-Node-5 increments the counter for that loop. The two loops are counted independently.

## On hitting the cap

Do not loop again. Halt and report to the user:

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

After every loop iteration, write a one-line summary to the TodoWrite todo for that node:
> "Iteration 2/3: <one-line cause of retry>"
