import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { REPO_ROOT } from "./devflow-gate-helpers.ts"

const PLUGIN = join(REPO_ROOT, "plugins", "coding-god")

function plugin(...parts: string[]): string {
  return readFileSync(join(PLUGIN, ...parts), "utf8")
}

const GRAPH_SKILL = () => plugin("skills", "dev-graph", "SKILL.md")
const DISPATCH_PROTOCOL = () => plugin("skills", "dev-graph", "references", "dispatch-protocol.md")
const DISPATCHED_MODE = () => plugin("skills", "dev-flow", "references", "dispatched-mode.md")
const GIT_COMMIT = () => plugin("skills", "git-commit", "SKILL.md")
const PLUGIN_MANIFEST = () => plugin(".claude-plugin", "plugin.json")

describe("the contract original is skipped silently", () => {
  it("S1 lists graph_contract_path in the dispatch brief, null unless inside the group root", () => {
    const protocol = DISPATCH_PROTOCOL()
    expect(protocol).toMatch(/"graph_contract_path":/)
    const entry = protocol.match(/^- `graph_contract_path` — [^\n]*/m)?.[0] ?? ""
    expect(entry).toMatch(/group root/)
    expect(entry).toMatch(/`null`/)
    expect(entry).toMatch(/regular file/)
    expect(GRAPH_SKILL()).toMatch(/JSON body carrying[^\n]*`graph_contract_path`/)
  })

  it("S1 keeps the G5 brief-composition sentence intact and says null also when there is no contract", () => {
    const g5 = GRAPH_SKILL().match(/`SendMessage` each child one dispatch brief[^\n]*/)?.[0] ?? ""
    const sentence = g5.split(/\. (?=[A-Z`])/)[0] ?? ""
    expect(sentence).toMatch(/a human preview line, a JSON body carrying[^\n]*and a final line, `Run \/dev-flow with this dispatch brief\.`/)
    expect(g5).toMatch(/`graph_contract_path`[^\n]*no contract/)
  })

  it("S2 says the brief's graph_contract_path is never committed and exempt from the blocked rule", () => {
    const text = DISPATCHED_MODE()
    expect(text).toMatch(/never commits it/)
    expect(text).toMatch(/leaves it uncommitted and says nothing about it/)
    expect(text).toMatch(/`graph_contract_path`[^\n]*never committed/)
    expect(text).toMatch(/exempt from the `blocked` rule below/)
    expect(text).toMatch(/without `graph_spec_path` or `graph_contract_path` behaves as `null`/)
  })
})

describe("a leftover contract original does not fail the clean-tree check", () => {
  it("S3a ignores -graph-contract.md and -graph-design.md spec files whichever run wrote them in G2", () => {
    const item = GRAPH_SKILL().match(/^- Per group: the working tree is clean[^\n]*/m)?.[0] ?? ""
    expect(item).toContain("docs/superpowers/specs/*-graph-contract.md")
    expect(item).toContain("docs/superpowers/specs/*-graph-design.md")
    expect(item).toMatch(/whichever run wrote them/)
  })

  it("S3b says the main session never force-adds specs", () => {
    expect(GRAPH_SKILL()).toMatch(/main session never force-adds a spec/)
  })
})

describe("committing specs follows .gitignore", () => {
  it("S4 never force-adds a git-ignored allowlist path", () => {
    const text = DISPATCHED_MODE()
    expect(text).toMatch(/untracked path that git ignores[^\n]*nothing is committed/)
    expect(text).toMatch(/never uses `git add -f` and reports nothing/)
  })
})

describe("plugin version", () => {
  it("S5 keeps the coding-god plugin at 2.0.2 or newer", () => {
    const [major = 0, minor = 0, patch = 0] = JSON.parse(PLUGIN_MANIFEST()).version.split(".").map(Number)
    const floor = [2, 0, 2]
    const version = [major, minor, patch]
    const index = version.findIndex((part, i) => part !== floor[i])
    expect(index === -1 || (version[index] ?? 0) > (floor[index] ?? 0)).toBe(true)
  })
})

describe("the allowlist definition and containment rule cover graph_contract_path", () => {
  const nodes10to11 = () => DISPATCHED_MODE().match(/^- \*\*Nodes 10–11\*\*[^\n]*/m)?.[0] ?? ""

  it("S2 lists graph_contract_path in the containment paragraph and the brief-carries line, null allowed", () => {
    const text = DISPATCHED_MODE()
    const contained = text.match(/\*\*Brief paths are contained\.\*\*[^\n]*/)?.[0] ?? ""
    expect(contained).toContain("`graph_contract_path`")
    expect(contained).toMatch(/`graph_contract_path` \(/)
    expect(text.match(/^The brief carries[^\n]*/m)?.[0] ?? "").toContain("`graph_contract_path`")
  })

  it("S2 excludes graph_contract_path from the one allowlist definition and calls it exempt from the blocked rule", () => {
    expect(nodes10to11()).toMatch(/`graph_contract_path`[^.]*(excluded|never)/)
    expect(DISPATCHED_MODE()).toMatch(/exempt from the `blocked` rule below/)
    expect(DISPATCHED_MODE()).not.toMatch(/not a file outside the allowlist/)
  })

  it("S2 rejects a malformed graph_contract_path like graph_spec_path", () => {
    expect(DISPATCHED_MODE()).toMatch(/`graph_contract_path`[^\n]*`blocked` of kind `env`[^\n]*nothing committed/)
  })

  it("S2 exempts what the allowlist definition exempts from git-commit's blocked rule, without restating the allowlist", () => {
    const rule = GIT_COMMIT().match(/^- Report any other untracked or modified file[^\n]*/m)?.[0] ?? ""
    expect(rule).toContain("`blocked` of kind `other`")
    expect(rule).toMatch(/exempt[^\n]*`coding-god:dev-flow`'s `references\/dispatched-mode\.md`/)
    const [blockedClause = "", exemption = ""] = rule.split(/(?<=\.) (?=[A-Z])/)
    expect(blockedClause).toMatch(/commit nothing until the dispatcher replies\.$/)
    expect(blockedClause).not.toMatch(/exempt/)
    expect(exemption).toMatch(/^A file that is exempt/)
    expect(rule).not.toContain("`graph_spec_path`")
  })

  it("S2 names graph_contract_path in the dispatcher trust paragraph", () => {
    const trust = DISPATCH_PROTOCOL().match(/No JSON body a child sends[^\n]*/)?.[0] ?? ""
    expect(trust).toContain("`graph_contract_path`")
  })

  it("S4 carries the git-ignored rule inside the one allowlist definition", () => {
    const line = nodes10to11()
    expect(line).toMatch(/an untracked path that git ignores/)
    expect(line).toContain("`git add -f`")
    expect(line).toMatch(/reports nothing/)
  })
})
