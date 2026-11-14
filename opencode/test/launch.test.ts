import { describe, expect, it } from "vitest"
import type { Binding, StoragePort } from "../src/hub.ts"
import { buildTools } from "../src/tools.ts"
import { MAIN_SESSION, newHub } from "./helpers.ts"

function memoryStorage(): StoragePort & { readonly data: Map<string, unknown> } {
  const data = new Map<string, unknown>()
  return {
    data,
    async list(prefix) {
      return [...data.entries()].filter(([key]) => key.startsWith(prefix)).map(([, value]) => value)
    },
    async set(key, value) {
      data.set(key, value)
    },
    async remove(key) {
      data.delete(key)
    },
  }
}

const launchTool = (hub: ReturnType<typeof newHub>["hub"]) => {
  const tool = buildTools(hub).find((candidate) => candidate.name === "launch_child")
  if (!tool) throw new Error("launch_child tool missing")
  return tool
}

describe("launch_child", () => {
  it("creates the session in the root, titled with the name, with no permission override", async () => {
    const { hub, sessions } = newHub()
    await launchTool(hub).execute({ root: "/work/api", name: "dg-1-api" }, { sessionID: MAIN_SESSION })
    expect(sessions.created).toEqual([{ title: "dg-1-api", directory: "/work/api" }])
  })

  it("passes a parsed model through when one is given", async () => {
    const { hub, sessions } = newHub()
    await launchTool(hub).execute({ root: "/work/api", name: "dg-1-api", model: "opencode/big-pickle" }, { sessionID: MAIN_SESSION })
    expect(sessions.created[0]?.model).toEqual({ providerID: "opencode", id: "big-pickle" })
  })

  it("binds the child to the caller's plugin-assigned name, ignoring dispatcher and auto in the input", async () => {
    const { hub } = newHub()
    const result = await launchTool(hub).execute(
      { root: "/work/api", name: "dg-1-api", dispatcher: "attacker", dispatcher_name: "attacker", auto: true, permissions: "allow" },
      { sessionID: MAIN_SESSION },
    )
    const binding = hub.registry.bindingOf("ses_child1")
    expect(binding).toMatchObject({ childName: "dg-1-api", dispatcherSessionID: MAIN_SESSION, dispatcherName: hub.nameOf(MAIN_SESSION), root: "/work/api" })
    expect(result.content).toContain("dg-1-api")
    expect(result.content).toContain("ses_child1")
  })

  it("has no dispatcher, auto-approval or permission parameter in its schema", () => {
    const { hub } = newHub()
    expect(Object.keys((launchTool(hub).input.properties ?? {}) as object).sort()).toEqual(["model", "name", "root"])
  })

  it("rejects a relative root, a missing directory and an unsafe or reused name", async () => {
    const { hub } = newHub({ isDirectory: (path) => path !== "/work/missing" })
    const tool = launchTool(hub)
    await expect(tool.execute({ root: "relative/dir", name: "a" }, { sessionID: MAIN_SESSION })).rejects.toThrow(/absolute/)
    await expect(tool.execute({ root: "/work/missing", name: "a" }, { sessionID: MAIN_SESSION })).rejects.toThrow(/directory/)
    await expect(tool.execute({ root: "/work/api", name: 'bad"name' }, { sessionID: MAIN_SESSION })).rejects.toThrow(/name/)
    await tool.execute({ root: "/work/api", name: "dg-1-api" }, { sessionID: MAIN_SESSION })
    await expect(tool.execute({ root: "/work/web", name: "dg-1-api" }, { sessionID: MAIN_SESSION })).rejects.toThrow(/already/)
  })

  it("stores the binding so a restarted plugin restores it", async () => {
    const storage = memoryStorage()
    const first = newHub({ storage })
    await launchTool(first.hub).execute({ root: "/work/api", name: "dg-1-api" }, { sessionID: MAIN_SESSION })
    expect([...storage.data.keys()]).toEqual(["binding:ses_child1"])

    const second = newHub({ storage })
    await second.hub.restore()
    expect(second.hub.registry.bindingOf("ses_child1")).toEqual(storage.data.get("binding:ses_child1") as Binding)
  })
})
