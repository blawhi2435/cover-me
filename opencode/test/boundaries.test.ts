import { afterEach, describe, expect, it, vi } from "vitest"
import { buildTools } from "../src/tools.ts"
import { fakeContext } from "./fake-context.ts"
import { MAIN_SESSION, newHub } from "./helpers.ts"

afterEach(() => vi.restoreAllMocks())

describe("session.deleted", () => {
  it("removes the deleted target's idle subscriptions, so a re-launched name gets no stale notice", async () => {
    const fake = fakeContext()
    await fake.start()
    await fake.callTool("launch_child", { root: process.cwd(), name: "dg-1-api" }, MAIN_SESSION)
    await fake.callTool("send_message", { to: "dg-1-api", message: "go", notify_when_idle: true }, MAIN_SESSION)
    fake.emit({ type: "session.deleted", data: { sessionID: "ses_child1" } })
    await fake.settle()
    await fake.callTool("launch_child", { root: process.cwd(), name: "dg-1-api" }, MAIN_SESSION)
    fake.synthetic.length = 0
    fake.emit({ type: "session.execution.succeeded", data: { sessionID: "ses_child1" } })
    fake.emit({ type: "session.execution.succeeded", data: { sessionID: "ses_child2" } })
    await fake.settle()
    expect(fake.synthetic).toEqual([])
  })

  it("is rejected, with a log line, when the payload has no string sessionID", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {})
    const fake = fakeContext()
    await fake.start()
    fake.emit({ type: "session.deleted", data: { sessionID: 7 } })
    await fake.settle()
    expect(errors).toHaveBeenCalledTimes(1)
  })
})

describe("the parentID walk", () => {
  const chain = (hops: number) => {
    const { hub, sessions } = newHub()
    hub.registry.bind({ childSessionID: "ses_child1", childName: "dg-1-api", dispatcherSessionID: MAIN_SESSION, dispatcherName: hub.nameOf(MAIN_SESSION), root: "/work/api" })
    for (let i = 0; i < hops; i++) sessions.parents.set(`ses_h${i}`, i === hops - 1 ? "ses_child1" : `ses_h${i + 1}`)
    return { hub, sessions }
  }

  it("finds a bound ancestor 7 hops away, the last one inside the bound", async () => {
    const { hub, sessions } = chain(7)
    await hub.onPermissionAsked({ sessionID: "ses_h0", action: "edit", resources: ["a"] })
    expect(sessions.delivered).toHaveLength(1)
  })

  it("does not find a bound ancestor 8 hops away, the first one beyond the bound", async () => {
    const { hub, sessions } = chain(8)
    await hub.onPermissionAsked({ sessionID: "ses_h0", action: "edit", resources: ["a"] })
    expect(sessions.delivered).toEqual([])
  })
})

describe("session.get failures", () => {
  it("rethrows an error that is not SessionNotFoundError instead of treating the child as gone", async () => {
    const fake = fakeContext()
    await fake.start()
    await fake.callTool("launch_child", { root: process.cwd(), name: "dg-1-api" }, MAIN_SESSION)
    fake.state.getError = new Error("transport down")
    await expect(fake.callTool("list_agents", {}, MAIN_SESSION)).rejects.toThrow(/transport down/)
    fake.state.getError = undefined
    expect((await fake.callTool("list_agents", {}, MAIN_SESSION)).content).toContain("dg-1-api")
  })
})

describe("launch_child model validation", () => {
  const launch = (model: string) => {
    const { hub, sessions } = newHub()
    const tool = buildTools(hub).find((candidate) => candidate.name === "launch_child")
    return { result: tool!.execute({ root: "/work/api", name: "dg-1-api", model }, { sessionID: MAIN_SESSION }), sessions }
  }

  it.each(["provider/", "/model"])("rejects %s and creates nothing", async (model) => {
    const { result, sessions } = launch(model)
    await expect(result).rejects.toThrow(/provider\/model/)
    expect(sessions.created).toEqual([])
  })

  it("treats an empty variant as no variant", async () => {
    const { result, sessions } = launch("a/b#")
    await result
    expect(sessions.created[0]?.model).toEqual({ providerID: "a", id: "b" })
  })
})
