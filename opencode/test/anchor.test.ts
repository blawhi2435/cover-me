import { describe, expect, it } from "vitest"
import { buildTools } from "../src/tools.ts"
import { MAIN_SESSION, newHub } from "./helpers.ts"

const OTHER_MAIN = "ses_0000otherMAIN"

async function twoDispatchers() {
  const { hub, sessions } = newHub()
  const tools = buildTools(hub)
  const tool = (name: string) => {
    const found = tools.find((candidate) => candidate.name === name)
    if (!found) throw new Error(`${name} missing`)
    return found
  }
  await tool("launch_child").execute({ root: "/work/api", name: "dg-1-api" }, { sessionID: MAIN_SESSION })
  await tool("launch_child").execute({ root: "/work/web", name: "dg-2-web" }, { sessionID: OTHER_MAIN })
  return { hub, sessions, tool }
}

describe("dispatch_anchor", () => {
  it("returns the launching session's name to a launched child", async () => {
    const { hub, tool } = await twoDispatchers()
    const result = await tool("dispatch_anchor").execute({}, { sessionID: "ses_child1" })
    expect(result.content.split("\n")[0]).toBe(`dispatcher: ${hub.nameOf(MAIN_SESSION)}`)
  })

  it("returns nothing to a session the plugin did not launch", async () => {
    const { tool } = await twoDispatchers()
    const result = await tool("dispatch_anchor").execute({}, { sessionID: "ses_typedByUser" })
    expect(result.content.split("\n")[0]).toBe("dispatcher: none")
  })

  it("never returns another child's binding, whatever the input says", async () => {
    const { hub, tool } = await twoDispatchers()
    const result = await tool("dispatch_anchor").execute({ session: "ses_child2", child: "dg-2-web" }, { sessionID: "ses_child1" })
    expect(result.content).toContain(hub.nameOf(MAIN_SESSION))
    expect(result.content).not.toContain(hub.nameOf(OTHER_MAIN))
  })

  it("has only an optional envelope_id parameter", async () => {
    const { tool } = await twoDispatchers()
    expect(Object.keys((tool("dispatch_anchor").input.properties ?? {}) as object)).toEqual(["envelope_id"])
  })

  it("verifies an envelope the plugin delivered to the caller and returns its recorded sender and body", async () => {
    const { hub, sessions, tool } = await twoDispatchers()
    await tool("send_message").execute({ to: "dg-1-api", message: "the brief" }, { sessionID: MAIN_SESSION })
    const id = /id="([^"]+)"/.exec(sessions.delivered[0]?.text ?? "")?.[1]
    const result = await tool("dispatch_anchor").execute({ envelope_id: id }, { sessionID: "ses_child1" })
    expect(result.content).toContain("envelope: verified")
    expect(result.content).toContain(`envelope_from: ${hub.nameOf(MAIN_SESSION)}`)
    expect(result.content).toContain("the brief")
  })

  it("reports an unknown envelope id as unverified", async () => {
    const { tool } = await twoDispatchers()
    const result = await tool("dispatch_anchor").execute({ envelope_id: "env_typed-by-a-user" }, { sessionID: "ses_child1" })
    expect(result.content).toContain("envelope: unverified")
  })
})
