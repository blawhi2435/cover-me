import { describe, expect, it } from "vitest"
import { buildTools } from "../src/tools.ts"
import { MAIN_SESSION, newHub } from "./helpers.ts"

async function twoSubscribers() {
  const logged: string[] = []
  const { hub, sessions } = newHub({ log: (message) => logged.push(message) })
  hub.registry.bind({ childSessionID: "ses_child1", childName: "dg-1-api", dispatcherSessionID: MAIN_SESSION, dispatcherName: hub.nameOf(MAIN_SESSION), root: "/work/api" })
  hub.registry.bind({ childSessionID: "ses_grand", childName: "dg-1-grand", dispatcherSessionID: "ses_child1", dispatcherName: "dg-1-api", root: "/work/api" })
  const send = buildTools(hub).find((tool) => tool.name === "send_message")
  const subscribe = (from: string) => send?.execute({ to: "dg-1-api", message: "go", notify_when_idle: true }, { sessionID: from })
  await subscribe(MAIN_SESSION)
  await subscribe("ses_grand")
  sessions.delivered.length = 0
  return { hub, sessions, logged, subscribe }
}

describe("idle notices with several subscribers", () => {
  it("still deliver the second subscriber's notice when the first delivery fails, and log the failure", async () => {
    const { hub, sessions, logged } = await twoSubscribers()
    sessions.deliveryFailsFor.add(MAIN_SESSION)
    await expect(hub.onIdle("ses_child1")).resolves.toBeUndefined()
    expect(sessions.delivered.map((delivery) => delivery.sessionID)).toEqual(["ses_grand"])
    expect(logged).toHaveLength(1)
    expect(logged[0]).toContain(MAIN_SESSION)
  })

  it("drop a deleted session from every subscriber set", async () => {
    const { hub, sessions } = await twoSubscribers()
    await hub.onSessionDeleted("ses_grand")
    await hub.onIdle("ses_child1")
    expect(sessions.delivered.map((delivery) => delivery.sessionID)).toEqual([MAIN_SESSION])
  })
})
