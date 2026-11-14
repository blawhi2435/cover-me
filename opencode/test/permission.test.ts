import { describe, expect, it } from "vitest"
import { buildTools } from "../src/tools.ts"
import { MAIN_SESSION, newHub } from "./helpers.ts"

const OTHER_MAIN = "ses_0000otherMAIN"

async function twoChildren() {
  const { hub, sessions } = newHub()
  const launch = buildTools(hub).find((tool) => tool.name === "launch_child")
  await launch?.execute({ root: "/work/api", name: "dg-1-api" }, { sessionID: MAIN_SESSION })
  await launch?.execute({ root: "/work/web", name: "dg-2-web" }, { sessionID: OTHER_MAIN })
  sessions.delivered.length = 0
  return { hub, sessions }
}

describe("permission-pending notices", () => {
  it("tell the bound dispatcher which child waits and for which action", async () => {
    const { hub, sessions } = await twoChildren()
    await hub.onPermissionAsked({ sessionID: "ses_child1", action: "shell", resources: ["git push origin main"] })
    expect(sessions.delivered).toHaveLength(1)
    const [notice] = sessions.delivered
    expect(notice?.sessionID).toBe(MAIN_SESSION)
    expect(notice?.text).toContain('<cross-session-message from="dg-1-api"')
    expect(notice?.text).toContain("Permission pending")
    expect(notice?.text).toContain("shell")
    expect(notice?.text).toContain("git push origin main")
    expect(notice?.text).toContain("ses_child1")
  })

  it("reach no other session, even another dispatcher's", async () => {
    const { hub, sessions } = await twoChildren()
    await hub.onPermissionAsked({ sessionID: "ses_child2", action: "edit", resources: ["a.ts"] })
    expect(sessions.delivered.map((delivery) => delivery.sessionID)).toEqual([OTHER_MAIN])
  })

  it("are ignored for sessions this plugin did not launch", async () => {
    const { hub, sessions } = await twoChildren()
    await hub.onPermissionAsked({ sessionID: MAIN_SESSION, action: "shell", resources: ["ls"] })
    expect(sessions.delivered).toHaveLength(0)
  })
})
