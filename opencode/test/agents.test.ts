import { readFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { describe, expect, it } from "vitest"
import { convertAgent, loadAgents } from "../src/agents.ts"

const CROSS_SESSION_TOOLS = ["launch_child", "send_message", "list_agents", "dispatch_anchor"]
const AGENTS_DIR = resolve(import.meta.dirname, "..", "..", "plugins", "coding-god", "agents")
const readAgent = (name: string) => readFileSync(join(AGENTS_DIR, `${name}.md`), "utf8")

describe("convertAgent", () => {
  const converted = convertAgent(readAgent("logic-reviewer"))

  it("yields a subagent with a namespaced id, the same description and the same body", () => {
    expect(converted.id).toBe("coding-god/logic-reviewer")
    expect(converted.mode).toBe("subagent")
    expect(converted.description).toMatch(/^Reviews code changes for logic correctness/)
    expect(converted.system.startsWith("# Logic Reviewer")).toBe(true)
    expect(readAgent("logic-reviewer").endsWith(converted.system)).toBe(true)
  })

  it("allows read, search and bash and denies edits for tools: Read, Grep, Glob, Bash", () => {
    const effectOf = (action: string) => converted.permissions.find((rule) => rule.action === action)?.effect
    expect(effectOf("read")).toBe("allow")
    expect(effectOf("shell")).toBe("allow")
    expect(effectOf("edit")).toBe("deny")
    expect(effectOf("write")).toBe("deny")
  })

  it("adds only the cross-session tool denies when the Claude agent declares no tools", () => {
    expect(convertAgent(readAgent("dev-flow-implement")).permissions.map((rule) => rule.action)).toEqual(CROSS_SESSION_TOOLS)
  })

  it("rejects a tool it cannot map instead of silently widening access", () => {
    const source = "---\nname: x\ndescription: d\ntools: Read, Teleport\n---\nbody\n"
    expect(() => convertAgent(source)).toThrow(/Teleport/)
  })
})

describe("loadAgents", () => {
  it("converts all five coding-god agents", () => {
    expect(loadAgents(AGENTS_DIR).map((agent) => agent.id).sort()).toEqual([
      "coding-god/dev-flow-implement",
      "coding-god/logic-reviewer",
      "coding-god/security-reviewer",
      "coding-god/style-reviewer",
      "coding-god/test-reviewer",
    ])
  })

  it("fails loudly when the agents directory is missing", () => {
    expect(() => loadAgents(join(AGENTS_DIR, "missing"))).toThrow(/agents directory/)
  })
})

describe("cross-session tool access", () => {
  it("is denied for every converted agent, after its allow rules so the last matching rule denies", () => {
    const agents = loadAgents(AGENTS_DIR)
    expect(agents).toHaveLength(5)
    for (const agent of agents) {
      const rules = agent.permissions
      const lastAllow = rules.map((rule) => rule.effect).lastIndexOf("allow")
      for (const tool of CROSS_SESSION_TOOLS) {
        const index = rules.findIndex((rule) => rule.action === tool && rule.resource === "*" && rule.effect === "deny")
        expect(index, `${agent.id} must deny ${tool}`).toBeGreaterThan(lastAllow)
      }
    }
  })

  it("keeps the approved allows for read and shell on reviewers", () => {
    const rules = convertAgent(readAgent("logic-reviewer")).permissions
    expect(rules).toContainEqual({ action: "read", resource: "*", effect: "allow" })
    expect(rules).toContainEqual({ action: "shell", resource: "*", effect: "allow" })
  })
})
