import { describe, expect, it } from "vitest"
import { buildTools } from "../src/tools.ts"
import { MAIN_SESSION, newHub } from "./helpers.ts"

const OTHER_MAIN = "ses_0000otherMAIN"

async function world() {
  const { hub, sessions } = newHub()
  const tools = buildTools(hub)
  const run = (name: string, input: Record<string, unknown>, sessionID: string) => {
    const tool = tools.find((candidate) => candidate.name === name)
    if (!tool) throw new Error(`${name} missing`)
    return tool.execute(input, { sessionID })
  }
  await run("launch_child", { root: "/work/api", name: "dg-1-api" }, MAIN_SESSION) // ses_child1
  await run("launch_child", { root: "/work/web", name: "dg-1-web" }, MAIN_SESSION) // ses_child2
  await run("launch_child", { root: "/work/other", name: "dg-2-other" }, OTHER_MAIN) // ses_child3
  sessions.delivered.length = 0
  const envelopeId = () => /id="([^"]+)"/.exec(sessions.delivered.at(-1)?.text ?? "")?.[1] ?? ""
  return { hub, sessions, run, envelopeId }
}

describe("envelope ownership", () => {
  it("is unverified for another session, and that session's anchor output never shows the body", async () => {
    const { run, envelopeId } = await world()
    await run("send_message", { to: "dg-1-api", message: "SECRET-BRIEF" }, MAIN_SESSION)
    const result = await run("dispatch_anchor", { envelope_id: envelopeId() }, "ses_child2")
    expect(result.content).toContain("envelope: unverified")
    expect(result.content).not.toContain("SECRET-BRIEF")
  })
})

describe("who may be messaged", () => {
  it("rejects a sibling child", async () => {
    const { run } = await world()
    await expect(run("send_message", { to: "dg-1-web", message: "x" }, "ses_child1")).rejects.toThrow(/cannot message/)
  })

  it("rejects another dispatcher's child", async () => {
    const { run } = await world()
    await expect(run("send_message", { to: "dg-2-other", message: "x" }, MAIN_SESSION)).rejects.toThrow(/cannot message/)
  })
})

describe("idle subscriptions", () => {
  it("notify two different subscribers of one target, once each", async () => {
    const { hub, sessions, run } = await world()
    hub.registry.bind({ childSessionID: "ses_grand", childName: "dg-1-grand", dispatcherSessionID: "ses_child1", dispatcherName: "dg-1-api", root: "/work/api" })
    await run("send_message", { to: "dg-1-api", message: "go", notify_when_idle: true }, MAIN_SESSION)
    await run("send_message", { to: "dg-1-api", message: "ready", notify_when_idle: true }, "ses_grand")
    sessions.delivered.length = 0
    await hub.onIdle("ses_child1")
    await hub.onIdle("ses_child1")
    expect(sessions.delivered.map((delivery) => delivery.sessionID).sort()).toEqual([MAIN_SESSION, "ses_grand"].sort())
  })

  it("let a child subscribe to its dispatcher and be told when the dispatcher's turn ends", async () => {
    const { hub, sessions, run } = await world()
    await run("send_message", { to: hub.nameOf(MAIN_SESSION), message: "ready", notify_when_idle: true }, "ses_child1")
    sessions.delivered.length = 0
    await hub.onIdle(MAIN_SESSION)
    expect(sessions.delivered.map((delivery) => delivery.sessionID)).toEqual(["ses_child1"])
    expect(sessions.delivered[0]?.text).toContain(`from="${hub.nameOf(MAIN_SESSION)}"`)
  })
})
