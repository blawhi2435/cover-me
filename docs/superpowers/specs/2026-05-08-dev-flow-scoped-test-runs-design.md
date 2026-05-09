# dev-flow scoped test runs — design

## Problem

When dev-flow runs Nodes 5–7 against a frontend project (Vitest + jsdom/happy-dom),
each TDD inner-loop test invocation runs the **entire** test suite via the cached
project-level command (e.g. `npx vitest run`). Combined with TDD's per-sub-task
cycle and the Node 5↔6↔7 retry loop, this produces 16+ full-suite runs for a
modest feature, each taking 30–60s and forking jsdom into multiple workers
(easily 500MB–1GB resident per worker).

Symptoms reported by users:

- "Why does `npx vitest run` keep running for so long?"
- "It eats a lot of memory."
- Inner-loop time dominates total feature delivery time.

## Root cause

The skill conflates two different test executions:

1. **Inner-loop check** during TDD — purpose: confirm red, then green, for the
   single Task currently being worked on.
2. **Final gate** at Node 7 — purpose: prove nothing else regressed.

Both currently use the same cached whole-suite command. (1) does not need the
whole suite — it only needs the test file for the current Task.

## Goals

1. Inner-loop tests run scoped to the current Task's test file, not the whole suite.
2. TDD discipline is **preserved in full**: red is observed before green; refactor
   re-runs to confirm green stays.
3. Node 7 still runs the full suite as the final gate, with silent-skip detection.
4. The skill does not become opinionated about runner flags (workers, pool, etc.) —
   it surfaces optional perf hints but does not enforce them.

## Non-goals

- Replacing Vitest with another runner.
- Auto-tuning vitest worker count or pool mode.
- Changing how `references/test-detection.md` discovers test commands in the
  first place — only how it caches and uses them.
- Backend / Go / Python projects: their per-package or `-run` filters already
  scope tests; this design's scoping rules apply equally but no breakage is
  expected.

## Design

### Two cached test commands, not one

`references/test-detection.md` currently writes a single `## Test Commands`
section into project CLAUDE.md. Replace that with two distinct entries:

```markdown
## Test Commands
- Full suite (Node 7 gate): <full-suite command>
- Scoped (Node 5 inner loop): <runner> run <file> — substitute the test file path per Task
```

For Vitest projects the scoped template is `<pkg-mgr> vitest run <file>`. For
Jest, `<pkg-mgr> jest <file>`. For Go, `go test <package>`. For Pytest,
`pytest <file>`. For Cargo, `cargo test --test <name>`. The detection step that
currently produces one command produces both — the scoped form is mechanically
derived from the runner identified in step 1–4 of the existing search order.

If the project's runner has no obvious scoped form, fall back to the full-suite
command for inner loop too and record this in `evidence.deviations` ("scoped
form unknown for runner X").

### Node 5 inner loop — preserve red, scope the run

`agents/dev-flow-implement.md` Node 5 currently says:

> Run tests **after each sub-task**, not after the whole task.

Replace with the explicit per-Task cycle:

```
Per Task N (one cycle):
1. N.1  Write failing test.
        Run the scoped command for that test file.
        MUST observe red. If green: the test does not actually exercise
        the behavior — fix the test before continuing.
2. N.2  Implement minimum code.
        Re-run the same scoped command.
        MUST observe green.
3. N.3  Refactor if needed.
        Re-run the same scoped command after each refactor step.
        MUST stay green.
```

Rationale for keeping N.1's run (against the temptation to skip it for speed):

- Editor TS check catches syntax/import errors but **cannot** catch
  always-passing tests (e.g. asserting against a mock that returns the expected
  value, or a missing `await` that lets a rejected promise look resolved).
- A scoped run is 2–5s on a typical frontend test file — the savings from
  skipping N.1 across a feature are ~24s, not worth losing TDD's red gate.

### Node 7 — full-suite gate unchanged

Node 7 keeps its current contract: full-suite run, silent-skip detection,
capture last ~50 lines of output for the orchestrator. No changes needed —
it just uses the "Full suite" cached command instead of the only command.

### Optional perf hint (surface, do not enforce)

`references/test-detection.md` adds a short subsection:

> ### Frontend test perf notes
>
> If the project uses Vitest with jsdom/happy-dom and the full-suite run is
> slow or memory-heavy, consider these flags (do not auto-apply — surface
> to the user):
>
> - `--pool=forks --poolOptions.forks.singleFork=true` — single worker, lower memory
> - `--no-isolate` — skip module isolation between tests, faster but tests must be hygienic

The skill itself never injects these flags. Users who want them add them to
their cached command manually.

### What does NOT change

- Node 5 ↔ Node 6 ↔ Node 7 loop semantics.
- TDD red-green-refactor structure in `tasks.md` (Rule B, SKILL.md:64).
- Pre-flight environment readiness checks.
- Silent-skip detection at Node 7.
- Shadow-skill check, state-file resume contract, dispatch brief.

## Expected impact

For a mid-sized frontend feature (8 Tasks, 60s full suite):

|                     | Before                  | After                       |
|---------------------|-------------------------|-----------------------------|
| Inner-loop runs     | 16 × 60s = 16 min       | 16 × ~3s = ~48s             |
| Node 7 final gate   | 60s                     | 60s                         |
| Total test time     | ~17 min                 | ~1.5–2 min                  |
| Peak memory         | N workers × jsdom       | 1 worker × jsdom (per run)  |

Numbers vary with project size (small: 15s full suite; large: 3–5 min). The
ratio (5–10× faster) is the stable claim.

## Files to change

1. `plugins/dev-flow/skills/dev-flow/references/test-detection.md`
   - Replace single `## Test Commands` cache format with two-entry format.
   - Add scoped-command derivation rules per runner.
   - Add optional "Frontend test perf notes" subsection.
2. `plugins/dev-flow/agents/dev-flow-implement.md`
   - Node 5 section: replace "Run tests after each sub-task" with the explicit
     per-Task cycle (N.1 scoped run for red, N.2 scoped run for green, N.3
     scoped re-run for refactor).
   - Add a one-line note that Node 7 uses the "Full suite" cached command.

## Open questions

None — TDD red gate is non-negotiable; scoped form is mechanically derivable;
Node 7 contract is unchanged.

## References

- `plugins/dev-flow/skills/dev-flow/SKILL.md` (Rule B at line 64; Nodes 5–7 dispatch)
- `plugins/dev-flow/skills/dev-flow/references/test-detection.md` (current single-command cache)
- `plugins/dev-flow/agents/dev-flow-implement.md` (Node 5 line 70, Node 7 line 113)
