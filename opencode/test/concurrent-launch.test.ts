import { describe, expect, it } from "vitest"
import type { StoragePort } from "../src/hub.ts"
import { buildTools } from "../src/tools.ts"
import { MAIN_SESSION, newHub } from "./helpers.ts"

const launcher = (hub: ReturnType<typeof newHub>["hub"]) => (name: string, root = "/work/api") => {
  const tool = buildTools(hub).find((candidate) => candidate.name === "launch_child")
  if (!tool) throw new Error("launch_child missing")
  return tool.execute({ root, name }, { sessionID: MAIN_SESSION })
}

describe("concurrent launch_child", () => {
  it("creates exactly one session when two calls use the same name at once", async () => {
    const { hub, sessions } = newHub()
    let release: () => void = () => {}
    sessions.createGate = new Promise<void>((resolve) => (release = resolve))
    const launch = launcher(hub)
    const first = launch("dg-1-api")
    const second = launch("dg-1-api", "/work/other")
    release()
    const outcomes = await Promise.allSettled([first, second])
    expect(outcomes.map((outcome) => outcome.status).sort()).toEqual(["fulfilled", "rejected"])
    expect(sessions.created).toHaveLength(1)
    expect(hub.registry.all()).toHaveLength(1)
  })

  it("releases the name when sessions.create fails, so a retry succeeds", async () => {
    const { hub, sessions } = newHub()
    const launch = launcher(hub)
    sessions.createError = new Error("service unavailable")
    await expect(launch("dg-1-api")).rejects.toThrow(/unavailable/)
    sessions.createError = undefined
    await expect(launch("dg-1-api")).resolves.toBeDefined()
  })

  it("releases the name when storage.set fails, so a retry succeeds", async () => {
    let failing = true
    const storage: StoragePort = {
      set: async () => {
        if (failing) throw new Error("disk full")
      },
      remove: async () => {},
      list: async () => [],
    }
    const { hub } = newHub({ storage })
    const launch = launcher(hub)
    await expect(launch("dg-1-api")).rejects.toThrow(/disk full/)
    expect(hub.registry.all()).toEqual([])
    failing = false
    await expect(launch("dg-1-api")).resolves.toBeDefined()
  })

  it("names the orphan session in the error when the binding cannot be saved, and releases the name", async () => {
    const storage: StoragePort = { set: async () => { throw new Error("disk full") }, remove: async () => {}, list: async () => [] }
    const { hub, sessions } = newHub({ storage })
    const launch = launcher(hub)
    await expect(launch("dg-1-api")).rejects.toThrow(/ses_child1/)
    await expect(launch("dg-1-api")).rejects.toThrow(/ses_child2/)
    expect(sessions.created).toHaveLength(2)
    expect(hub.registry.all()).toEqual([])
  })
})
