import { describe, expect, it } from "vitest"
import { fakeContext } from "./fake-context.ts"
import { MAIN_SESSION } from "./helpers.ts"

describe("launch_child permission check", () => {
  it("asks opencode's permission service, as the calling tool, before creating a session", async () => {
    const fake = fakeContext()
    await fake.start()
    await fake.callTool("launch_child", { root: process.cwd(), name: "dg-1-api" }, MAIN_SESSION)
    expect(fake.asserted).toEqual([
      { sessionID: MAIN_SESSION, agent: "build", source: { type: "tool", messageID: "msg_1", id: "call_1" }, action: "launch_child", resources: [process.cwd()] },
    ])
    expect(fake.created).toHaveLength(1)
  })

  it("creates nothing when the permission check rejects", async () => {
    const fake = fakeContext()
    fake.state.assertError = new Error("denied by policy")
    await fake.start()
    await expect(fake.callTool("launch_child", { root: process.cwd(), name: "dg-1-api" }, MAIN_SESSION)).rejects.toThrow(/denied by policy/)
    expect(fake.created).toEqual([])
  })

  it("does not ask for the other three tools", async () => {
    const fake = fakeContext()
    await fake.start()
    await fake.callTool("list_agents", {}, MAIN_SESSION)
    expect(fake.asserted).toEqual([])
  })
})
