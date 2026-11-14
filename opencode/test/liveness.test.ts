import { describe, expect, it } from "vitest"
import { buildTools } from "../src/tools.ts"
import { fakeContext } from "./fake-context.ts"
import { MAIN_SESSION, newHub } from "./helpers.ts"

async function twoChildren() {
  const { hub, sessions } = newHub()
  const tools = buildTools(hub)
  const run = (name: string, input: Record<string, unknown>) => {
    const tool = tools.find((candidate) => candidate.name === name)
    if (!tool) throw new Error(`${name} missing`)
    return tool.execute(input, { sessionID: MAIN_SESSION })
  }
  await run("launch_child", { root: "/work/api", name: "dg-1-api" })
  await run("launch_child", { root: "/work/web", name: "dg-1-web" })
  return { hub, sessions, run }
}

describe("liveness of children", () => {
  it("list_agents omits a child whose session no longer exists", async () => {
    const { sessions, run } = await twoChildren()
    sessions.gone.add("ses_child1")
    const output = (await run("list_agents", {})).content
    expect(output).not.toContain("dg-1-api")
    expect(output).toContain("dg-1-web")
  })

  it("lets a dead child's name be launched again, but still refuses a live child's name", async () => {
    const { sessions, run } = await twoChildren()
    await expect(run("launch_child", { root: "/work/api", name: "dg-1-web" })).rejects.toThrow(/already in use/)
    sessions.gone.add("ses_child1")
    await expect(run("launch_child", { root: "/work/api", name: "dg-1-api" })).resolves.toBeDefined()
  })

  it("does not message a child whose session is gone", async () => {
    const { sessions, run } = await twoChildren()
    sessions.gone.add("ses_child1")
    await expect(run("send_message", { to: "dg-1-api", message: "hi" })).rejects.toThrow(/cannot message/)
  })
})

describe("session.deleted event", () => {
  it("removes the child's binding, frees its name and deletes the stored binding", async () => {
    const fake = fakeContext()
    await fake.start()
    await fake.callTool("launch_child", { root: process.cwd(), name: "dg-1-api" }, MAIN_SESSION)
    expect([...fake.stored.keys()]).toEqual(["binding:ses_child1"])

    fake.emit({ type: "session.deleted", data: { sessionID: "ses_child1" } })
    await fake.settle()

    expect([...fake.stored.keys()]).toEqual([])
    expect((await fake.callTool("list_agents", {}, MAIN_SESSION)).content).not.toContain("dg-1-api")
    await expect(fake.callTool("launch_child", { root: process.cwd(), name: "dg-1-api" }, MAIN_SESSION)).resolves.toBeDefined()
  })
})
