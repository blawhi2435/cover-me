import { afterEach, describe, expect, it, vi } from "vitest"
import { fakeContext } from "./fake-context.ts"
import { MAIN_SESSION } from "./helpers.ts"

afterEach(() => vi.restoreAllMocks())

describe("event stream failures", () => {
  it("catches and logs an error thrown by the event iterator, and cleanup does not rethrow", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {})
    const fake = fakeContext()
    const cleanup = await fake.start()
    fake.state.iteratorError = new Error("stream broke")
    fake.emit({ type: "session.deleted", data: { sessionID: "ses_unknown" } })
    await fake.settle()
    expect(errors).toHaveBeenCalledWith(expect.stringContaining("event stream"), expect.objectContaining({ message: "stream broke" }))
    await expect(cleanup()).resolves.toBeUndefined()
  })

  it("rejects a malformed permission.asked payload and keeps handling later events", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {})
    const fake = fakeContext()
    await fake.start()
    await fake.callTool("launch_child", { root: process.cwd(), name: "dg-1-api" }, MAIN_SESSION)
    fake.synthetic.length = 0

    fake.emit({ type: "permission.asked", data: { sessionID: "ses_child1", action: "shell" } })
    fake.emit({ type: "permission.asked", data: { sessionID: 42, action: "shell", resources: ["x"] } })
    fake.emit({ type: "permission.asked", data: { sessionID: "ses_child1", action: "shell", resources: ["ls"] } })
    await fake.settle()

    expect(fake.synthetic).toHaveLength(1)
    expect(fake.synthetic[0]?.text).toContain("Permission pending")
    expect(errors).toHaveBeenCalledTimes(2)
  })

  it("rejects an end-of-turn event without a string sessionID", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {})
    const fake = fakeContext()
    await fake.start()
    fake.emit({ type: "session.execution.succeeded", data: {} })
    await fake.settle()
    expect(errors).toHaveBeenCalledTimes(1)
  })
})
