import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { type AgentEditorLike, type MutableAgent, registerAgentsFromDir } from "../src/register.ts"

const REAL_AGENTS_DIR = resolve(import.meta.dirname, "..", "..", "plugins", "coding-god", "agents")

function recordingEditor() {
  const agents = new Map<string, MutableAgent>()
  const editor: AgentEditorLike = {
    update(id, update) {
      const agent = agents.get(id) ?? { name: id, mode: "primary", permissions: [] }
      update(agent)
      agents.set(id, agent)
    },
  }
  return { editor, agents }
}

describe("registerAgentsFromDir", () => {
  it("lists the five coding-god subagents", () => {
    const { editor, agents } = recordingEditor()
    registerAgentsFromDir(editor, REAL_AGENTS_DIR, {})
    expect([...agents.keys()].sort()).toEqual([
      "coding-god/dev-flow-implement",
      "coding-god/logic-reviewer",
      "coding-god/security-reviewer",
      "coding-god/style-reviewer",
      "coding-god/test-reviewer",
    ])
    expect([...agents.values()].every((agent) => agent.mode === "subagent")).toBe(true)
  })

  it("copies the cross-session tool denies onto every registered agent, after its last allow", () => {
    const { editor, agents } = recordingEditor()
    registerAgentsFromDir(editor, REAL_AGENTS_DIR, {})
    expect(agents.size).toBe(5)
    for (const [id, agent] of agents) {
      const lastAllow = agent.permissions.map((rule) => rule.effect).lastIndexOf("allow")
      for (const tool of ["launch_child", "send_message", "list_agents", "dispatch_anchor"]) {
        const index = agent.permissions.findIndex((rule) => rule.action === tool && rule.resource === "*" && rule.effect === "deny")
        expect(index, `${id} must deny ${tool}`).toBeGreaterThan(lastAllow)
      }
    }
  })

  it("applies the model options to the registered agents", () => {
    const { editor, agents } = recordingEditor()
    registerAgentsFromDir(editor, REAL_AGENTS_DIR, { fast: "opencode/big-pickle" })
    expect(agents.get("coding-god/style-reviewer")?.model).toEqual({ providerID: "opencode", id: "big-pickle" })
    expect(agents.get("coding-god/logic-reviewer")?.model).toBeUndefined()
  })
})

describe("agent conversion drift", () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "coding-god-agents-"))
    writeFileSync(join(dir, "probe.md"), readFileSync(join(REAL_AGENTS_DIR, "logic-reviewer.md"), "utf8"))
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it("registers a different agent in the same run after the Claude agent file changes", () => {
    const before = recordingEditor()
    registerAgentsFromDir(before.editor, dir, {})

    const original = readFileSync(join(dir, "probe.md"), "utf8")
    writeFileSync(join(dir, "probe.md"), original.replace("name: logic-reviewer", "name: probe").replace("# Logic Reviewer", "# Changed Heading"))

    const after = recordingEditor()
    registerAgentsFromDir(after.editor, dir, {})

    expect(before.agents.get("coding-god/logic-reviewer")?.system).toContain("# Logic Reviewer")
    expect(after.agents.get("coding-god/probe")?.system).toContain("# Changed Heading")
  })
})
