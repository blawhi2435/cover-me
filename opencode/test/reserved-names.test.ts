import { describe, expect, it } from "vitest"
import type { Binding, StoragePort } from "../src/hub.ts"
import { buildTools } from "../src/tools.ts"
import { MAIN_SESSION, newHub } from "./helpers.ts"

const COLLIDING_NAME = newHub().hub.nameOf(MAIN_SESSION) // what MAIN_SESSION derives to

describe("derived dispatcher names", () => {
  it("cannot be taken by launch_child, even before anyone derived them", async () => {
    const { hub } = newHub()
    const launch = buildTools(hub).find((tool) => tool.name === "launch_child")
    await expect(launch?.execute({ root: "/work/api", name: "main-forged" }, { sessionID: MAIN_SESSION })).rejects.toThrow(/reserved/)
  })

  it("stay reserved after a restart restores a binding whose dispatcher had that name", async () => {
    const binding: Binding = { childSessionID: "ses_child1", childName: "dg-1-api", dispatcherSessionID: "ses_old", dispatcherName: COLLIDING_NAME, root: "/work/api" }
    const storage: StoragePort = { set: async () => {}, remove: async () => {}, list: async () => [binding] }
    const { hub } = newHub({ storage })
    await hub.restore()
    expect(hub.nameOf("ses_old")).toBe(COLLIDING_NAME)
    expect(hub.nameOf(MAIN_SESSION)).not.toBe(COLLIDING_NAME)
  })

  it("never equal an existing child's name", () => {
    const { hub } = newHub()
    hub.registry.bind({ childSessionID: "ses_child1", childName: COLLIDING_NAME, dispatcherSessionID: "ses_other", dispatcherName: "main-other1", root: "/work/api" })
    expect(hub.nameOf(MAIN_SESSION)).not.toBe(COLLIDING_NAME)
    expect(hub.nameOf("ses_child1")).toBe(COLLIDING_NAME)
  })
})
