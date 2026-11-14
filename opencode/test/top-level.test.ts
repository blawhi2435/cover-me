import { describe, expect, it } from "vitest"
import { buildTools } from "../src/tools.ts"
import { MAIN_SESSION, newHub } from "./helpers.ts"

async function world() {
  const { hub, sessions } = newHub()
  const tools = buildTools(hub)
  const run = (name: string, input: Record<string, unknown>, sessionID: string) => {
    const tool = tools.find((candidate) => candidate.name === name)
    if (!tool) throw new Error(`${name} missing`)
    return tool.execute(input, { sessionID })
  }
  await run("launch_child", { root: "/work/api", name: "dg-1-api" }, MAIN_SESSION) // ses_child1, no parent
  sessions.parents.set("ses_sub_of_main", MAIN_SESSION)
  sessions.parents.set("ses_sub_of_child", "ses_child1")
  sessions.delivered.length = 0
  return { sessions, run, hub }
}

describe("subagent sessions", () => {
  it.each(["ses_sub_of_main", "ses_sub_of_child"])("%s cannot launch a child; nothing is created", async (caller) => {
    const { sessions, run } = await world()
    await expect(run("launch_child", { root: "/work/web", name: "dg-1-web" }, caller)).rejects.toThrow(/subagent/)
    expect(sessions.created).toHaveLength(1) // only the setup launch
  })

  it.each(["ses_sub_of_main", "ses_sub_of_child"])("%s cannot send a message; nothing is delivered", async (caller) => {
    const { sessions, run, hub } = await world()
    hub.registry.bind({ childSessionID: "ses_x", childName: "dg-1-x", dispatcherSessionID: caller, dispatcherName: hub.nameOf(caller), root: "/work/x" })
    await expect(run("send_message", { to: "dg-1-x", message: "hi" }, caller)).rejects.toThrow(/subagent/)
    expect(sessions.delivered).toEqual([])
  })

  it("a top-level session and a launch_child-created child still work", async () => {
    const { sessions, run, hub } = await world()
    await expect(run("launch_child", { root: "/work/web", name: "dg-1-web" }, MAIN_SESSION)).resolves.toBeDefined()
    await expect(run("send_message", { to: "dg-1-api", message: "go" }, MAIN_SESSION)).resolves.toBeDefined()
    await expect(run("send_message", { to: hub.nameOf(MAIN_SESSION), message: "ready" }, "ses_child1")).resolves.toBeDefined()
    expect(sessions.delivered).toHaveLength(2)
  })

  it("refuses a caller whose session cannot be found", async () => {
    const { sessions, run } = await world()
    sessions.gone.add("ses_ghost")
    await expect(run("launch_child", { root: "/work/web", name: "dg-1-web" }, "ses_ghost")).rejects.toThrow(/not found/)
  })
})
