import { describe, expect, it } from "vitest"
import { buildTools } from "../src/tools.ts"
import { MAIN_SESSION, newHub } from "./helpers.ts"

async function launched() {
  const { hub, sessions } = newHub()
  const tools = buildTools(hub)
  const run = (name: string, input: Record<string, unknown>, sessionID: string) => {
    const tool = tools.find((candidate) => candidate.name === name)
    if (!tool) throw new Error(`${name} missing`)
    return tool.execute(input, { sessionID })
  }
  await run("launch_child", { root: "/work/api", name: "dg-1-api" }, MAIN_SESSION)
  sessions.delivered.length = 0
  return { hub, sessions, run }
}

const notices = (sessions: Awaited<ReturnType<typeof launched>>["sessions"]) =>
  sessions.delivered.filter((delivery) => delivery.sessionID === MAIN_SESSION && delivery.text.includes("idle"))

describe("notify_when_idle", () => {
  it("delivers exactly one stamped idle notice, then none until re-subscribed", async () => {
    const { hub, sessions, run } = await launched()
    await run("send_message", { to: "dg-1-api", message: "go", notify_when_idle: true }, MAIN_SESSION)

    await hub.onIdle("ses_child1")
    expect(notices(sessions)).toHaveLength(1)
    expect(notices(sessions)[0]?.text).toContain('<cross-session-message from="dg-1-api"')

    await hub.onIdle("ses_child1")
    expect(notices(sessions)).toHaveLength(1)

    await run("send_message", { to: "dg-1-api", message: "again", notify_when_idle: true }, MAIN_SESSION)
    await hub.onIdle("ses_child1")
    expect(notices(sessions)).toHaveLength(2)
  })

  it("sends no notice when nobody subscribed", async () => {
    const { hub, sessions, run } = await launched()
    await run("send_message", { to: "dg-1-api", message: "go" }, MAIN_SESSION)
    await hub.onIdle("ses_child1")
    expect(notices(sessions)).toHaveLength(0)
  })

  it("notifies only the subscriber, and only for the subscribed target", async () => {
    const { hub, sessions, run } = await launched()
    await run("send_message", { to: "dg-1-api", message: "go", notify_when_idle: true }, MAIN_SESSION)
    await hub.onIdle("ses_unrelated")
    expect(notices(sessions)).toHaveLength(0)
    await hub.onIdle("ses_child1")
    expect(sessions.delivered.filter((delivery) => delivery.text.includes("idle")).map((delivery) => delivery.sessionID)).toEqual([MAIN_SESSION])
  })

  it("makes the idle notice verifiable like any plugin-delivered envelope", async () => {
    const { hub, sessions, run } = await launched()
    await run("send_message", { to: "dg-1-api", message: "go", notify_when_idle: true }, MAIN_SESSION)
    await hub.onIdle("ses_child1")
    const id = /id="([^"]+)"/.exec(notices(sessions)[0]?.text ?? "")?.[1] ?? ""
    expect(hub.verifyEnvelope(MAIN_SESSION, id)?.from).toBe("dg-1-api")
  })
})
