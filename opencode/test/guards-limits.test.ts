import { describe, expect, it } from "vitest"
import { buildTools } from "../src/tools.ts"
import { MAIN_SESSION, newHub } from "./helpers.ts"

describe("envelope record limit", () => {
  it("evicts the oldest envelope after 1000 records and keeps the newest verifiable", async () => {
    let counter = 0
    const { hub, sessions } = newHub({ newId: () => `n${++counter}` })
    hub.registry.bind({ childSessionID: "ses_child1", childName: "dg-1-api", dispatcherSessionID: MAIN_SESSION, dispatcherName: hub.nameOf(MAIN_SESSION), root: "/work/api" })
    const send = buildTools(hub).find((tool) => tool.name === "send_message")
    for (let i = 0; i < 1001; i++) await send?.execute({ to: "dg-1-api", message: `m${i}` }, { sessionID: MAIN_SESSION })
    expect(sessions.delivered).toHaveLength(1001)
    expect(hub.verifyEnvelope("ses_child1", "env_n1")).toBeUndefined()
    expect(hub.verifyEnvelope("ses_child1", "env_n2")?.body).toBe("m1")
    expect(hub.verifyEnvelope("ses_child1", "env_n1001")?.body).toBe("m1000")
  })
})

describe("launch_child input limits", () => {
  const launch = (input: Record<string, unknown>) => {
    const { hub, sessions } = newHub()
    const tool = buildTools(hub).find((candidate) => candidate.name === "launch_child")
    return { result: tool!.execute(input, { sessionID: MAIN_SESSION }), sessions, hub }
  }

  it.each([
    ["missing root", { name: "dg-1-api" }, /non-empty string/],
    ["empty root", { root: "", name: "dg-1-api" }, /non-empty string/],
    ["missing name", { root: "/work/api" }, /non-empty string/],
    ["empty name", { root: "/work/api", name: "" }, /non-empty string/],
    ["name of 65 characters", { root: "/work/api", name: "a".repeat(65) }, /name must match/],
    ["name starting with a dot", { root: "/work/api", name: ".hidden" }, /name must match/],
    ["name starting with a dash", { root: "/work/api", name: "-flag" }, /name must match/],
    ["malformed model", { root: "/work/api", name: "dg-1-api", model: "no-provider" }, /provider\/model/],
  ])("rejects %s and creates nothing", async (_label, input, message) => {
    const { result, sessions, hub } = launch(input)
    await expect(result).rejects.toThrow(message)
    expect(sessions.created).toEqual([])
    expect(hub.registry.all()).toEqual([])
  })

  it("accepts a name of exactly 64 characters", async () => {
    const { result } = launch({ root: "/work/api", name: "a".repeat(64) })
    await expect(result).resolves.toBeDefined()
  })
})
