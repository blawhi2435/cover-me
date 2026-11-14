import { describe, expect, it } from "vitest"
import { MAIN_SESSION } from "./helpers.ts"
import { fakeContext } from "./fake-context.ts"

describe("subagent sessions through the real session adapter", () => {
  it("are refused launch_child and send_message, with no permission request and nothing created", async () => {
    const fake = fakeContext()
    await fake.start()
    fake.sessions.set("ses_sub", { id: "ses_sub", parentID: MAIN_SESSION })
    await expect(fake.callTool("launch_child", { root: process.cwd(), name: "dg-1-api" }, "ses_sub")).rejects.toThrow(/subagent/)
    await expect(fake.callTool("send_message", { to: "main-x", message: "hi" }, "ses_sub")).rejects.toThrow(/subagent/)
    expect(fake.asserted).toEqual([])
    expect(fake.created).toEqual([])
    expect(fake.synthetic).toEqual([])
  })

  it("raising permission.asked inside a launched child's subagent notify the dispatcher", async () => {
    const fake = fakeContext()
    await fake.start()
    await fake.callTool("launch_child", { root: process.cwd(), name: "dg-1-api" }, MAIN_SESSION)
    fake.sessions.set("ses_sub", { id: "ses_sub", parentID: "ses_child1" })
    fake.synthetic.length = 0
    fake.emit({ type: "permission.asked", data: { sessionID: "ses_sub", action: "shell", resources: ["rm -rf x"] } })
    await fake.settle()
    expect(fake.synthetic).toHaveLength(1)
    expect(fake.synthetic[0]?.sessionID).toBe(MAIN_SESSION)
    expect(fake.synthetic[0]?.text).toContain("dg-1-api")
  })
})
