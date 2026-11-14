import { describe, expect, it } from "vitest"
import { fakeContext } from "./fake-context.ts"
import { MAIN_SESSION } from "./helpers.ts"

describe("message delivery", () => {
  it("queues behind the target's current turn and explicitly resumes an idle target", async () => {
    const fake = fakeContext()
    await fake.start()
    await fake.callTool("launch_child", { root: process.cwd(), name: "dg-1-api" }, MAIN_SESSION)
    await fake.callTool("send_message", { to: "dg-1-api", message: "go" }, MAIN_SESSION)
    expect(fake.synthetic).toHaveLength(1)
    expect(fake.synthetic[0]?.delivery).toBe("queue")
    expect(fake.synthetic[0]?.resume).toBe(true)
  })
})
