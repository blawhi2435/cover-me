import { describe, expect, it } from "vitest"
import { fakeContext } from "./fake-context.ts"
import { MAIN_SESSION, newHub } from "./helpers.ts"
import { buildTools } from "../src/tools.ts"

describe("permission notices", () => {
  const setup = async () => {
    const { hub, sessions } = newHub()
    await buildTools(hub).find((tool) => tool.name === "launch_child")?.execute({ root: "/work/api", name: "dg-1-api" }, { sessionID: MAIN_SESSION })
    sessions.delivered.length = 0
    return { hub, sessions }
  }

  it("lists every resource and tells the dispatcher not to approve from the main session", async () => {
    const { hub, sessions } = await setup()
    await hub.onPermissionAsked({ sessionID: "ses_child1", action: "shell", resources: ["git push", "rm -rf build"] })
    const text = sessions.delivered[0]?.text ?? ""
    expect(text).toContain("git push, rm -rf build")
    expect(text).toContain("do not approve it from here")
    expect(text).toContain("opencode -s ses_child1")
  })

  it("still names the action when the resource list is empty", async () => {
    const { hub, sessions } = await setup()
    await hub.onPermissionAsked({ sessionID: "ses_child1", action: "webfetch", resources: [] })
    const text = sessions.delivered[0]?.text ?? ""
    expect(text).toContain("webfetch")
    expect(text).toContain("do not approve it from here")
    expect(text).toContain("opencode -s ses_child1")
  })
})

describe("plugin setup", () => {
  it("registers exactly the five coding-god agent ids", async () => {
    const fake = fakeContext()
    await fake.start()
    const ids: string[] = []
    for (const transform of fake.agentTransforms) transform({ update: (id: string) => void ids.push(id) } as never)
    expect(ids.sort()).toEqual([
      "coding-god/dev-flow-implement",
      "coding-god/logic-reviewer",
      "coding-god/security-reviewer",
      "coding-god/style-reviewer",
      "coding-god/test-reviewer",
    ])
  })

  it("forwards the launch model to session creation", async () => {
    const fake = fakeContext()
    await fake.start()
    await fake.callTool("launch_child", { root: process.cwd(), name: "dg-1-api", model: "opencode/big-pickle#fast" }, MAIN_SESSION)
    expect(fake.created).toEqual([
      { title: "dg-1-api", location: { directory: process.cwd() }, model: { providerID: "opencode", id: "big-pickle", variant: "fast" } },
    ])
  })

  it("restores bindings across several storage pages", async () => {
    const fake = fakeContext()
    fake.state.scanPageSize = 1
    for (const n of [1, 2, 3]) {
      fake.sessions.set(`ses_c${n}`, { id: `ses_c${n}` })
      fake.stored.set(`binding:ses_c${n}`, { childSessionID: `ses_c${n}`, childName: `dg-${n}-api`, dispatcherSessionID: MAIN_SESSION, dispatcherName: "main-abcdef", root: "/work/api" })
    }
    await fake.start()
    const listing = (await fake.callTool("list_agents", {}, MAIN_SESSION)).content
    expect(listing.split("\n")[0]).toBe("This session is main-abcdef")
    for (const n of [1, 2, 3]) expect(listing).toContain(`dg-${n}-api`)
  })

  it("rejects a non-string model option at setup", async () => {
    await expect(fakeContext({ fast: 42 }).start()).rejects.toThrow(/fast/)
    await expect(fakeContext({ strong: { id: "x" } }).start()).rejects.toThrow(/strong/)
  })
})
