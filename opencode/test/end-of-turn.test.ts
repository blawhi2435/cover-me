import { describe, expect, it } from "vitest"
import { fakeContext } from "./fake-context.ts"
import { MAIN_SESSION } from "./helpers.ts"

async function subscribed() {
  const fake = fakeContext()
  await fake.start()
  await fake.callTool("launch_child", { root: process.cwd(), name: "dg-1-api" }, MAIN_SESSION)
  const subscribe = () => fake.callTool("send_message", { to: "dg-1-api", message: "go", notify_when_idle: true }, MAIN_SESSION)
  await subscribe()
  fake.synthetic.length = 0
  const idleNotices = () => fake.synthetic.filter((delivery) => delivery.text.includes("is idle"))
  return { fake, subscribe, idleNotices }
}

describe("idle notices on opencode 2.2.7, which has no session.idle event", () => {
  it.each(["session.execution.succeeded", "session.execution.failed", "session.execution.interrupted"])(
    "a %s event delivers exactly one notice, and a second event delivers none until re-subscribed",
    async (type) => {
      const { fake, subscribe, idleNotices } = await subscribed()
      fake.emit({ type, data: { sessionID: "ses_child1" } })
      await fake.settle()
      expect(idleNotices()).toHaveLength(1)

      fake.emit({ type, data: { sessionID: "ses_child1" } })
      await fake.settle()
      expect(idleNotices()).toHaveLength(1)

      await subscribe()
      fake.emit({ type, data: { sessionID: "ses_child1" } })
      await fake.settle()
      expect(idleNotices()).toHaveLength(2)
    },
  )

  it("does not depend on a session.idle event", async () => {
    const { fake, idleNotices } = await subscribed()
    fake.emit({ type: "session.idle", data: { sessionID: "ses_child1" } })
    await fake.settle()
    expect(idleNotices()).toHaveLength(0)
  })
})
