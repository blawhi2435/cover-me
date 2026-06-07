# Test Script Detection

## Goal

Find the script(s) that exercise unit and integration tests for the current project. On first detection, record the result so subsequent runs skip the search.

## Search order

1. **Project CLAUDE.md** — look for explicit test commands (e.g., `go test ./...`, `npm test`, `./scripts/run.sh`). If found, use them and stop.
2. **`scripts/` directory** — check for `run.sh`, `test.sh`, `integration-test.sh`, `e2e.sh`. Read each candidate's first 30 lines to confirm purpose.
3. **`Makefile`** — grep for targets named `test`, `integration`, `e2e`, `check`.
4. **Language defaults** — fall back to:
   - Go: `go test ./...`
   - Node: `npm test` (after checking `package.json` `scripts.test`)
   - Python: `pytest` (after checking for `pytest.ini` / `pyproject.toml`)
   - Rust: `cargo test`
5. **Ask the user** — if nothing matches, ask: "找不到測試腳本，你都用什麼指令跑測試？"

## Caching the result

After detection, append BOTH a full-suite command and a scoped template to the
project's CLAUDE.md under a `## Test Commands` heading (create the section if
missing). The format is:

```
## Test Commands
- Full suite (Node 7 gate): <full-suite command>
- Scoped (Node 5 inner loop): <scoped template> — substitute the test file path per Task
```

The full-suite command is what the search order in the previous section
produces. The scoped template is mechanically derived from the runner:

| Runner | Scoped template |
|---|---|
| Vitest | `<pkg-mgr> vitest run <file>` |
| Jest | `<pkg-mgr> jest <file>` |
| Mocha | `<pkg-mgr> mocha <file>` |
| Go | `go test <package>` (use the package path of the file under test) |
| Pytest | `pytest <file>` |
| Cargo | `cargo test --test <name>` |
| Bun test | `bun test <file>` |

If the project's runner has no obvious scoped form, fall back to the full-suite
command for inner loop too and add `"scoped form unknown for runner X"` to
`evidence.deviations` so the orchestrator surfaces it.

On future dev-flow runs, Node 7 reads the "Full suite" line; Node 5 reads the
"Scoped" line and substitutes the current Task's test file path.

If the user has explicitly excluded auto-edits to CLAUDE.md, store both
commands in conversation memory instead and surface them to the user.

## Environment readiness (pre-flight)

Before running any tests, verify the environment is ready. Skipping this step is the single most common cause of false "tests pass" reports.

Checklist (run what applies to the project):

- **Lockfile install** — if `package.json` + `pnpm-lock.yaml` present, run `pnpm install --frozen-lockfile`. Equivalent: `npm ci`, `yarn install --frozen-lockfile`, `bun install --frozen-lockfile`, `uv sync`, `poetry install`, `go mod download`, `cargo fetch`.
- **Container services up** — if `docker-compose.yml` / `compose.yaml` present, run `docker compose ps` and confirm required services are `running` / `healthy`. If not, `docker compose up -d` and wait for health.
- **Required env vars** — if `.env.example` exists, diff against current env; surface missing vars to the user before running tests rather than letting tests fail opaquely.
- **DB / migrations** — if the project has a migration command (e.g. `pnpm db:push`, `alembic upgrade head`, `rails db:migrate`), run it against the test DB.

If any pre-flight step fails, halt Node 7 and report the failure verbatim — do not proceed to test execution.

## Static checks (lint / typecheck) — CI parity gate

A local test suite that passes while `lint` or `typecheck` is never run diverges from CI: a change can be green on `test` (and even `typecheck`) yet fail CI on a lint rule the test runner never evaluates (e.g. an ESLint error like "Cannot call impure function during render"). Node 7 MUST run the same static gates CI runs — not just the test command.

Discover the gates in this order:

1. **CI workflow files (source of truth)** — read `.github/workflows/*.yml` (or `.gitlab-ci.yml`, `azure-pipelines.yml`, etc.) and mirror the exact commands each relevant job runs for this project, in the same order. CI is what "must be green to merge", so match it. A very common shape is `lint → typecheck → test`; if CI runs lint before tests, so must Node 7.
2. **package.json scripts** — if no CI file is found, run whichever of these exist: `lint`, `typecheck` (or `type-check`), `format:check` / `fmt:check`. Use the project's package manager (`pnpm` / `npm` / `yarn` / `bun`).
3. **Language defaults** — Go: `go vet ./...` (and `gofmt -l .` for formatting); Python: `ruff check` / `flake8` plus `mypy` if configured; Rust: `cargo clippy -- -D warnings` and `cargo fmt --check`.

Rules:

- Run the static gates as part of Node 7, **after pre-flight and before the test suite** (they are cheaper and fail fast).
- A static-check failure is a **Node 7 failure**: report the failing command's output verbatim and loop back to Node 5, exactly like a test failure. Do NOT treat lint/typecheck as advisory — if CI enforces it, the workflow must too.
- Distinguish errors from warnings: a runner that exits non-zero (e.g. ESLint with any error, `tsc` with any error) is a failure; warning-only output that exits zero is not. Use the command's exit code, mirroring CI.

Cache the discovered static-check command(s) alongside the test commands under `## Test Commands` so future runs skip rediscovery:

```
## Test Commands
- Static checks (Node 7 gate): <lint command> && <typecheck command>
- Full suite (Node 7 gate): <full-suite command>
- Scoped (Node 5 inner loop): <scoped template> — substitute the test file path per Task
```

## Silent-skip detection

A test run that "passes" while silently skipping cases is a failure, not a success. After running tests, scan the captured output for skip markers and treat any hit as a failure unless the skip is annotated `<!-- TDD skipped: ... -->` in the corresponding task.

Patterns to grep (case-sensitive unless noted):

| Runner | Pattern |
|---|---|
| Go | `^--- SKIP:` |
| Jest / Vitest | `\bit\.skip\(`, `\btest\.skip\(`, `\bdescribe\.skip\(`, `\bxit\(`, `\bxdescribe\(` |
| Mocha | `\bit\.skip\(`, `\bdescribe\.skip\(`, `this\.skip\(\)` |
| Pytest | `^SKIPPED `, `\bpytest\.skip\(`, `@pytest\.mark\.skip` |
| RSpec | `^Pending:`, `\bpending\b`, `\bskip\b` |
| Rust | `^test .* \.\.\. ignored` |

Implementation: capture stdout+stderr of the test command, run the grep, and include both the count of skip hits and the tail of the test output (last ~50 lines) in the report back to the orchestrator.

## Running

- Run pre-flight checklist first. Halt on any failure.
- Run the static checks (lint / typecheck) gate next, mirroring CI. A failure loops back to Node 5, same as a test failure.
- Unit tests run before integration tests.
- If unit tests pass, run integration tests.
- If unit fails, do not run integration; report unit failure and loop back to Node 5.
- After each run, apply silent-skip detection. Treat hits as failure.
- Always return the **tail of test output (last ~50 lines)** to the orchestrator alongside pass/fail — never just "all green".

## Frontend test perf notes

If the project uses Vitest with jsdom/happy-dom and the full-suite run is slow
or memory-heavy, consider these flags. **Do not auto-apply** — surface to the
user and let them decide whether to add them to the cached command:

- `--pool=forks --poolOptions.forks.singleFork=true` — single worker, lower memory
- `--no-isolate` — skip module isolation between tests; faster but tests must be hygienic (no cross-test global state)

These are advisory. The skill does not modify the user's cached command without their explicit approval.
