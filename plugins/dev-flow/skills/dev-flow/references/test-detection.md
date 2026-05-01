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

## Running

- Unit tests run first.
- If unit tests pass, run integration tests.
- If unit fails, do not run integration; report unit failure and loop back to Node 5.
