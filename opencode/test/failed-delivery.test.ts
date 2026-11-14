import { describe, expect, it } from "vitest"
import { buildTools } from "../src/tools.ts"
import { MAIN_SESSION, newHub } from "./helpers.ts"

describe("send_message with notify_when_idle when delivery fails", () => {
  it("leaves no subscription behind, so the caller gets no later idle notice", async () => {
    const { hub, sessions } = newHub()
    const tools = buildTools(hub)
    const run = (name: string, input: Record<string, unknown>) => tools.find((tool) => tool.name === name)!.execute(input, { sessionID: MAIN_SESSION })
    await run("launch_child", { root: "/work/api", name: "dg-1-api" })

    sessions.deliveryError = new Error("target is busy")
    await expect(run("send_message", { to: "dg-1-api", message: "go", notify_when_idle: true })).rejects.toThrow(/busy/)

    sessions.deliveryError = undefined
    await hub.onIdle("ses_child1")
    expect(sessions.delivered).toEqual([])
  })
})
