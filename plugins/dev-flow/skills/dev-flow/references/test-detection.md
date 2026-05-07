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

After detection, append the discovered command to the project's CLAUDE.md under a `## Test Commands` heading (create the section if missing). On future dev-flow runs, Node 7 reads CLAUDE.md first and skips re-detection.

If the user has explicitly excluded auto-edits to CLAUDE.md, store the path in conversation memory instead and surface it to the user.

## Environment readiness (pre-flight)

Before running any tests, verify the environment is ready. Skipping this step is the single most common cause of false "tests pass" reports.

Checklist (run what applies to the project):

- **Lockfile install** — if `package.json` + `pnpm-lock.yaml` present, run `pnpm install --frozen-lockfile`. Equivalent: `npm ci`, `yarn install --frozen-lockfile`, `bun install --frozen-lockfile`, `uv sync`, `poetry install`, `go mod download`, `cargo fetch`.
- **Container services up** — if `docker-compose.yml` / `compose.yaml` present, run `docker compose ps` and confirm required services are `running` / `healthy`. If not, `docker compose up -d` and wait for health.
- **Required env vars** — if `.env.example` exists, diff against current env; surface missing vars to the user before running tests rather than letting tests fail opaquely.
- **DB / migrations** — if the project has a migration command (e.g. `pnpm db:push`, `alembic upgrade head`, `rails db:migrate`), run it against the test DB.

If any pre-flight step fails, halt Node 7 and report the failure verbatim — do not proceed to test execution.

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
- Unit tests run before integration tests.
- If unit tests pass, run integration tests.
- If unit fails, do not run integration; report unit failure and loop back to Node 5.
- After each run, apply silent-skip detection. Treat hits as failure.
- Always return the **tail of test output (last ~50 lines)** to the orchestrator alongside pass/fail — never just "all green".
