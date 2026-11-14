import { describe, expect, it } from "vitest"
import type { Binding, StoragePort } from "../src/hub.ts"
import { newHub } from "./helpers.ts"

const child: Binding = { childSessionID: "ses_child1", childName: "dg-1-api", dispatcherSessionID: "ses_old", dispatcherName: "main-abcdef", root: "/work/api" }
const grandchild: Binding = { childSessionID: "ses_grand", childName: "dg-1-grand", dispatcherSessionID: "ses_child1", dispatcherName: "dg-1-api", root: "/work/api" }
const storageOf = (values: unknown[]): StoragePort => ({ set: async () => {}, remove: async () => {}, list: async () => values })

describe("restore order", () => {
  it.each([
    ["grandchild first", [grandchild, child]],
    ["child first", [child, grandchild]],
  ])("with %s, the child's name is not stuck as a reserved main name", async (_label, bindings) => {
    const { hub } = newHub({ storage: storageOf(bindings) })
    await hub.restore()
    expect(hub.registry.isNameTaken("dg-1-api")).toBe(true)
    expect(hub.nameOf("ses_old")).toBe("main-abcdef")

    await hub.onSessionDeleted("ses_child1")
    expect(hub.registry.isNameTaken("dg-1-api")).toBe(false)
    expect(hub.registry.isNameTaken("main-abcdef")).toBe(true)
  })
})
