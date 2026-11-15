import { execFileSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { REPO_ROOT } from "./devflow-gate-helpers.ts"

function skillDescription(name: string): string {
  const raw = readFileSync(join(REPO_ROOT, "plugins", "coding-god", "skills", name, "SKILL.md"), "utf8")
  const match = raw.match(/^description:\s*(.+)$/m)
  if (!match?.[1]) throw new Error(`no description in ${name}`)
  return match[1]
}

describe("skill entry points", () => {
  const TRIGGER_PHRASES = ["實作 X", "做一個 Y", "新功能", "修 Z bug", "build a feature", "implement"]

  it("S27 gives the feature and bug trigger phrases to dev-graph and not to dev-flow", () => {
    const graph = skillDescription("dev-graph")
    const flow = skillDescription("dev-flow")
    for (const phrase of TRIGGER_PHRASES) {
      const asToken = new RegExp(`(?<![A-Za-z])${phrase}(?![A-Za-z])`)
      expect(graph).toMatch(asToken)
      expect(flow).not.toMatch(asToken)
    }
    expect(graph).toMatch(/one-off questions/)
  })
})

describe("opencode install", () => {
  it("S30 asks for no OpenSpec CLI and no openspec init", () => {
    const install = readFileSync(join(REPO_ROOT, ".opencode", "INSTALL.md"), "utf8")
    expect(install).not.toMatch(/openspec/i)
    expect(install).not.toMatch(/opsx/i)
  })
})

describe("no OpenSpec text", () => {
  const SCANNED = ["plugins", "opencode/src", ".opencode/INSTALL.md", "README.md", "CLAUDE.md"]

  it("S16 leaves no 'openspec' or 'opsx' in tracked or new files under the shipped paths", () => {
    const listed = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "--", ...SCANNED], { cwd: REPO_ROOT, encoding: "utf8" })
    const files = listed.split("\n").filter((path) => path !== "" && existsSync(join(REPO_ROOT, path)))
    expect(files.length).toBeGreaterThan(10)
    const offenders = files.filter((path) => /openspec|opsx/i.test(readFileSync(join(REPO_ROOT, path), "utf8")))
    expect(offenders).toEqual([])
  })
})
