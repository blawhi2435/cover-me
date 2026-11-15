import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { REPO_ROOT } from "./devflow-gate-helpers.ts"

const PLUGIN = join(REPO_ROOT, "plugins", "coding-god")

function plugin(...parts: string[]): string {
  return readFileSync(join(PLUGIN, ...parts), "utf8")
}

const GRAPH_SKILL = () => plugin("skills", "dev-graph", "SKILL.md")
const SESSION_DISCOVERY = () => plugin("skills", "dev-graph", "references", "session-discovery.md")
const DISPATCH_PROTOCOL = () => plugin("skills", "dev-graph", "references", "dispatch-protocol.md")
const DISPATCHED_MODE = () => plugin("skills", "dev-flow", "references", "dispatched-mode.md")

const BG_LAUNCH = `claude --bg --settings '{"worktree":{"bgIsolation":"none"}}'`

describe("background launch keeps the child in the shared checkout", () => {
  it("S1 puts the bgIsolation setting on the --bg launch command in G4 and session-discovery", () => {
    expect(GRAPH_SKILL()).toContain(BG_LAUNCH)
    expect(SESSION_DISCOVERY()).toContain(BG_LAUNCH)
  })

  it("S2 leaves --settings off the herdr pane run command and the herdr launch wording", () => {
    const commands = [...GRAPH_SKILL().matchAll(/herdr pane run <pane_id> "(DEV_GRAPH_DISPATCHER[^"]*)"/g)].map((match) => match[1] ?? "")
    expect(commands.length).toBeGreaterThan(0)
    for (const command of commands) expect(command).not.toContain("--settings")
    expect(SESSION_DISCOVERY()).toMatch(/without --bg and without --settings/)
  })

  it("S3 forbids a dispatched child from entering a worktree and routes isolation errors to blocked env", () => {
    const text = DISPATCHED_MODE()
    expect(text).toMatch(/never calls `EnterWorktree`/)
    expect(text).toMatch(/isolation[\s\S]{0,200}`blocked` of kind `env`/)
  })
})

describe("the graph spec is committable in a single-repository run", () => {
  it("S4 lists graph_spec_path in the dispatch brief, null unless inside the group root", () => {
    const protocol = DISPATCH_PROTOCOL()
    expect(protocol).toMatch(/"graph_spec_path":/)
    expect(protocol).toMatch(/- `graph_spec_path` — [^\n]*`null`/)
    expect(GRAPH_SKILL()).toContain("`graph_spec_path`")
  })

  it("S4 describes the graph_spec_path rules consistently in dispatch-protocol and G5", () => {
    const protocol = DISPATCH_PROTOCOL()
    const trust = protocol.match(/Everything a child sends[^\n]*/)?.[0] ?? ""
    expect(trust).toContain("`graph_spec_path`")
    const entry = protocol.match(/^- `graph_spec_path` — [^\n]*/m)?.[0] ?? ""
    expect(entry).toMatch(/relative/)
    expect(entry).toMatch(/no `\.\.`/)
    expect(entry).toMatch(/regular file/)
    expect(entry).not.toMatch(/single-repository run/)
    expect(GRAPH_SKILL()).toMatch(/JSON body carrying[^\n]*`graph_spec_path`/)
  })

  it("S4 derives graph_spec_path from real paths and keeps the trust paragraph free of stacked parentheticals", () => {
    const g5 = GRAPH_SKILL().match(/`SendMessage` each child one dispatch brief[^\n]*/)?.[0] ?? ""
    expect(g5).toMatch(/`realpath` of both the graph spec and the group root/)
    expect(g5).toMatch(/`null` when the graph spec is a symlink or not a regular file/)
    const trust = DISPATCH_PROTOCOL().match(/No JSON body a child sends[^\n]*/)?.[0] ?? ""
    expect(trust).not.toMatch(/\)\s*\(/)
    expect(trust).toMatch(/preview line[^.]*\./)
    expect(trust).toMatch(/`spec_path`, `contract_path` and `graph_spec_path`/)
  })

  it("S5 names graph_spec_path beside spec_path and contract_path in the allowlist and containment check", () => {
    const text = DISPATCHED_MODE()
    expect(text).toContain("the brief's `spec_path`, `contract_path` and `graph_spec_path`")
    expect(text).toMatch(/Brief paths are contained\.[^\n]*`graph_spec_path`/)
    expect(text).toMatch(/The brief carries[^\n]*`graph_spec_path`/)
  })

  it("S5 skips the containment check only on null, never lets the child edit graph_spec_path, and matches it exactly", () => {
    const text = DISPATCHED_MODE()
    const contained = text.match(/\*\*Brief paths are contained\.\*\*[^\n]*/)?.[0] ?? ""
    expect(contained).toMatch(/skipped only when (?:its|the) value is `null`/)
    expect(contained).toMatch(/non-null[^.]*outside[^.]*always rejected/)
    expect(contained).not.toMatch(/outside this repository/)
    expect(text).toMatch(/never edits `graph_spec_path`/)
    expect(text).toMatch(/`graph_spec_path`[^\n]*relative[^\n]*no `\.\.`[^\n]*regular[^\n]*not a symlink[^\n]*exact/)
    expect(text.indexOf("The brief carries")).toBeLessThan(text.indexOf("never enters a worktree"))
  })

  it("S5 states the graph_spec_path base, check timing and failure outcome as separate sentences", () => {
    const rules = DISPATCHED_MODE().match(/`graph_spec_path` is relative[^\n]*/)?.[0] ?? ""
    expect(rules).toMatch(/relative to the group root \(the repository top level\)/)
    expect(rules).toMatch(/checked together with the containment check, when the brief is authenticated\./)
    expect(rules).toMatch(/Any violation: `blocked` of kind `env` naming the path, nothing committed\./)
    expect(rules).not.toMatch(/otherwise \(/)
  })

  it("S5 blocks a malformed graph_spec_path as env and names the fields the null skip covers", () => {
    const text = DISPATCHED_MODE()
    const rules = text.match(/`graph_spec_path` is relative[^\n]*/)?.[0] ?? ""
    expect(rules).toMatch(/`blocked` of kind `env` naming the path, nothing committed/)
    const contained = text.match(/\*\*Brief paths are contained\.\*\*[^\n]*/)?.[0] ?? ""
    expect(contained).toMatch(/skipped only when (?:its|their) value is `null`[^.]*`contract_path`[^.]*`graph_spec_path`/)
  })
})

describe("plugin version", () => {
  it("S6 is valid semver and at least 2.0.1", () => {
    const manifest = JSON.parse(plugin(".claude-plugin", "plugin.json")) as { version: string }
    const match = manifest.version.match(/^(\d+)\.(\d+)\.(\d+)$/)
    expect(match).not.toBeNull()
    const [major = 0, minor = 0, patch = 0] = (match ?? []).slice(1).map(Number)
    const floor = [2, 0, 1]
    const actual = [major, minor, patch]
    const diff = actual.findIndex((part, index) => part !== floor[index])
    expect(diff === -1 || (actual[diff] ?? 0) > (floor[diff] ?? 0)).toBe(true)
  })
})
