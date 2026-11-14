import { describe, expect, it } from "vitest"
import { MAIN_SESSION, newHub } from "./helpers.ts"

describe("session names and list_agents", () => {
  it("names the main session with a plugin-derived, stable name", () => {
    const { hub } = newHub()
    expect(hub.nameOf(MAIN_SESSION)).toMatch(/^main-[a-z0-9]+$/)
    expect(hub.nameOf(MAIN_SESSION)).toBe(hub.nameOf(MAIN_SESSION))
    expect(hub.nameOf("ses_0000otherSESSION")).not.toBe(hub.nameOf(MAIN_SESSION))
  })

  it("names a launched child with its title", () => {
    const { hub } = newHub()
    hub.registry.bind({
      childSessionID: "ses_child1",
      childName: "dg-1-api",
      dispatcherSessionID: MAIN_SESSION,
      dispatcherName: hub.nameOf(MAIN_SESSION),
      root: "/work/api",
    })
    expect(hub.nameOf("ses_child1")).toBe("dg-1-api")
  })

  it("prints 'This session is <name>' and lists the caller's children", async () => {
    const { hub } = newHub()
    const main = hub.nameOf(MAIN_SESSION)
    hub.registry.bind({ childSessionID: "ses_child1", childName: "dg-1-api", dispatcherSessionID: MAIN_SESSION, dispatcherName: main, root: "/work/api" })
    const output = await hub.listAgents(MAIN_SESSION)
    expect(output.split("\n")[0]).toBe(`This session is ${main}`)
    expect(output).toContain("dg-1-api")
  })

  it("tells a child its own title and its dispatcher, and does not list other children", async () => {
    const { hub } = newHub()
    const main = hub.nameOf(MAIN_SESSION)
    hub.registry.bind({ childSessionID: "ses_child1", childName: "dg-1-api", dispatcherSessionID: MAIN_SESSION, dispatcherName: main, root: "/work/api" })
    hub.registry.bind({ childSessionID: "ses_child2", childName: "dg-1-web", dispatcherSessionID: MAIN_SESSION, dispatcherName: main, root: "/work/web" })
    const output = await hub.listAgents("ses_child1")
    expect(output.split("\n")[0]).toBe("This session is dg-1-api")
    expect(output).toContain(`dispatcher: ${main}`)
    expect(output).not.toContain("dg-1-web")
  })

  it("omits the dispatcher line for a session nobody launched", async () => {
    const { hub } = newHub()
    expect(await hub.listAgents(MAIN_SESSION)).not.toContain("dispatcher:")
  })
})
