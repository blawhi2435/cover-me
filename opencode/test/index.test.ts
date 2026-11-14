import { describe, expect, it } from "vitest"
import plugin from "../src/index.ts"
import { fakeContext } from "./fake-context.ts"
import { MAIN_SESSION } from "./helpers.ts"

describe("coding-god plugin", () => {
  it("has the plugin id coding-god", () => {
    expect(plugin.id).toBe("coding-god")
  })

  it("registers the six skills, five agents and four tools", async () => {
    const fake = fakeContext({ fast: "opencode/big-pickle" })
    await plugin.setup(fake.ctx as never)

    const skills: string[] = []
    for (const transform of fake.skillTransforms) transform({ add: (skill) => void skills.push(skill.id) })
    expect(skills.sort()).toEqual(
      ["code-review", "dev-flow", "dev-graph", "git-commit", "git-push", "standard-coding-style"].map((name) => `coding-god:${name}`),
    )

    const agents = new Map<string, Record<string, unknown>>()
    for (const transform of fake.agentTransforms) {
      transform({
        update: (id, fn) => {
          const agent = agents.get(id) ?? { permissions: [] }
          fn(agent)
          agents.set(id, agent)
        },
      })
    }
    expect(agents.size).toBe(5)
    expect(agents.get("coding-god/style-reviewer")?.model).toEqual({ providerID: "opencode", id: "big-pickle" })

    const tools: string[] = []
    for (const transform of fake.toolTransforms) transform({ add: (tool) => void tools.push(tool.name) })
    expect(tools.sort()).toEqual(["dispatch_anchor", "launch_child", "list_agents", "send_message"])
  })

  it("routes end-of-turn and permission.asked events to the hub and stops on cleanup", async () => {
    const fake = fakeContext()
    const cleanup = await fake.start()

    await fake.callTool("launch_child", { root: process.cwd(), name: "dg-1-api" }, MAIN_SESSION)
    expect(fake.created).toEqual([{ title: "dg-1-api", location: { directory: process.cwd() } }])
    expect([...fake.stored.keys()]).toEqual(["binding:ses_child1"])

    await fake.callTool("send_message", { to: "dg-1-api", message: "go", notify_when_idle: true }, MAIN_SESSION)
    fake.synthetic.length = 0
    fake.emit({ type: "session.execution.succeeded", data: { sessionID: "ses_child1" } })
    fake.emit({ type: "permission.asked", data: { sessionID: "ses_child1", action: "shell", resources: ["rm -rf x"] } })
    await fake.settle()

    expect(fake.synthetic.map((delivery) => delivery.sessionID)).toEqual([MAIN_SESSION, MAIN_SESSION])
    expect(fake.synthetic[0]?.text).toContain("is idle")
    expect(fake.synthetic[1]?.text).toContain("Permission pending")
    await cleanup()
    fake.synthetic.length = 0
    fake.emit({ type: "permission.asked", data: { sessionID: "ses_child1", action: "shell", resources: ["after cleanup"] } })
    await fake.settle()
    expect(fake.synthetic).toEqual([])
  })
})
