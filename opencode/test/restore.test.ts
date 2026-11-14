import { describe, expect, it } from "vitest"
import type { Binding, StoragePort } from "../src/hub.ts"
import { fakeContext } from "./fake-context.ts"
import { newHub } from "./helpers.ts"

const valid: Binding = { childSessionID: "ses_child1", childName: "dg-1-api", dispatcherSessionID: "ses_old", dispatcherName: "main-abcdef", root: "/work/api" }
const storageOf = (values: unknown[]): StoragePort => ({ set: async () => {}, remove: async () => {}, list: async () => values })

describe("restore", () => {
  it("restores valid bindings and skips, with a log line, malformed ones and ones whose names fail the name pattern", async () => {
    const logged: string[] = []
    const { hub } = newHub({
      storage: storageOf([
        { childSessionID: "ses_bad" },
        "not an object",
        null,
        { ...valid, childSessionID: "ses_quote", childName: 'dg"x' },
        { ...valid, childSessionID: "ses_dispatcher", dispatcherName: "has space" },
        valid,
      ]),
      log: (message) => logged.push(message),
    })
    await hub.restore()
    expect(hub.registry.all()).toEqual([valid])
    expect(logged).toHaveLength(5)
  })

  it("handles empty storage", async () => {
    const { hub } = newHub({ storage: storageOf([]) })
    await hub.restore()
    expect(hub.registry.all()).toEqual([])
  })

  it("does not make plugin setup throw when storage holds a bad binding", async () => {
    const fake = fakeContext()
    fake.stored.set("binding:ses_bad", { nonsense: true })
    fake.stored.set("binding:ses_child1", valid)
    await expect(fake.start()).resolves.toBeTypeOf("function")
  })
})
