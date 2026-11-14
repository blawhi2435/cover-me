import { describe, expect, it } from "vitest"
import { buildTools } from "../src/tools.ts"
import { MAIN_SESSION, newHub } from "./helpers.ts"

async function withChild() {
  const { hub, sessions } = newHub()
  await buildTools(hub).find((tool) => tool.name === "launch_child")?.execute({ root: "/work/api", name: "dg-1-api" }, { sessionID: MAIN_SESSION })
  sessions.delivered.length = 0
  return { hub, sessions }
}

describe("permission notices from subagent sessions", () => {
  it("reach the dispatcher when the parent chain leads to a bound child", async () => {
    const { hub, sessions } = await withChild()
    sessions.parents.set("ses_sub2", "ses_sub1")
    sessions.parents.set("ses_sub1", "ses_child1")
    await hub.onPermissionAsked({ sessionID: "ses_sub2", action: "edit", resources: ["a.ts"] })
    expect(sessions.delivered).toHaveLength(1)
    expect(sessions.delivered[0]?.sessionID).toBe(MAIN_SESSION)
    expect(sessions.delivered[0]?.text).toContain("dg-1-api")
    expect(sessions.delivered[0]?.text).toContain("opencode -s ses_child1")
  })

  it("reach nobody when the chain ends without a bound session", async () => {
    const { hub, sessions } = await withChild()
    sessions.parents.set("ses_sub1", "ses_unbound")
    await hub.onPermissionAsked({ sessionID: "ses_sub1", action: "edit", resources: ["a.ts"] })
    expect(sessions.delivered).toEqual([])
  })

  it("stops at a session that no longer exists and on a parent cycle", async () => {
    const { hub, sessions } = await withChild()
    sessions.gone.add("ses_orphan")
    sessions.parents.set("ses_loopA", "ses_loopB")
    sessions.parents.set("ses_loopB", "ses_loopA")
    await hub.onPermissionAsked({ sessionID: "ses_orphan", action: "edit", resources: ["a.ts"] })
    await hub.onPermissionAsked({ sessionID: "ses_loopA", action: "edit", resources: ["a.ts"] })
    expect(sessions.delivered).toEqual([])
  })
})
