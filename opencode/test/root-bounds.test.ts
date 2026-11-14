import { describe, expect, it } from "vitest"
import { buildTools } from "../src/tools.ts"
import { MAIN_SESSION, newHub } from "./helpers.ts"

const links: Record<string, string> = { "/work/link": "/work/real", "/work/to-home": "/home/tester", "/work/to-root": "/" }
const realpath = (path: string) => links[path] ?? path

const launch = (hub: ReturnType<typeof newHub>["hub"], root: string) => {
  const tool = buildTools(hub).find((candidate) => candidate.name === "launch_child")
  if (!tool) throw new Error("launch_child missing")
  return tool.execute({ root, name: "dg-1-api" }, { sessionID: MAIN_SESSION })
}

describe("launch_child root", () => {
  it("is stored as its resolved real path", async () => {
    const { hub, sessions } = newHub({ realpath })
    await launch(hub, "/work/link")
    expect(sessions.created[0]?.directory).toBe("/work/real")
    expect(hub.registry.bindingOf("ses_child1")?.root).toBe("/work/real")
  })

  it.each([["/"], ["/home/tester"], ["/work/to-home"], ["/work/to-root"]])("rejects %s, creating and binding nothing", async (root) => {
    const { hub, sessions } = newHub({ realpath })
    await expect(launch(hub, root)).rejects.toThrow(/too broad/)
    expect(sessions.created).toEqual([])
    expect(hub.registry.childrenOf(MAIN_SESSION)).toEqual([])
  })

  it("still accepts a project directory under the home directory", async () => {
    const { hub } = newHub({ realpath })
    await expect(launch(hub, "/home/tester/proj")).resolves.toBeDefined()
  })

  it("compares against the home directory's real path when the home path is itself a symlink", async () => {
    const { hub, sessions } = newHub({
      homeDir: "/home/tester-link",
      realpath: (path) => (path === "/home/tester-link" ? "/home/tester-real" : realpath(path)),
    })
    await expect(launch(hub, "/home/tester-real")).rejects.toThrow(/too broad/)
    expect(sessions.created).toEqual([])
  })
})
