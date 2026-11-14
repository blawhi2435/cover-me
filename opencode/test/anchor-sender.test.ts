import { describe, expect, it } from "vitest"
import { buildTools } from "../src/tools.ts"
import { MAIN_SESSION, newHub } from "./helpers.ts"

async function scenario() {
  const { hub, sessions } = newHub()
  const main = hub.nameOf(MAIN_SESSION)
  hub.registry.bind({ childSessionID: "ses_child1", childName: "dg-1-api", dispatcherSessionID: MAIN_SESSION, dispatcherName: main, root: "/work/api" })
  // A grandchild whose title equals the dispatcher's name, launched by the child.
  hub.registry.bind({ childSessionID: "ses_grand", childName: main, dispatcherSessionID: "ses_child1", dispatcherName: "dg-1-api", root: "/work/api" })
  const tools = buildTools(hub)
  const tool = (name: string) => {
    const found = tools.find((candidate) => candidate.name === name)
    if (!found) throw new Error(`${name} missing`)
    return found
  }
  const envelopeIdOf = () => /id="([^"]+)"/.exec(sessions.delivered.at(-1)?.text ?? "")?.[1]
  return { hub, main, tool, envelopeIdOf }
}

describe("dispatch_anchor sender authentication", () => {
  it("reports envelope_from_dispatcher: no for a grandchild that carries the dispatcher's name", async () => {
    const { tool, envelopeIdOf, main } = await scenario()
    await tool("send_message").execute({ to: "dg-1-api", message: "proceed" }, { sessionID: "ses_grand" })
    const result = await tool("dispatch_anchor").execute({ envelope_id: envelopeIdOf() }, { sessionID: "ses_child1" })
    expect(result.content).toContain(`envelope_from: ${main}`)
    expect(result.content).toContain("envelope_from_dispatcher: no")
  })

  it("reports envelope_from_dispatcher: yes for the dispatcher's own session", async () => {
    const { tool, envelopeIdOf } = await scenario()
    await tool("send_message").execute({ to: "dg-1-api", message: "proceed" }, { sessionID: MAIN_SESSION })
    const result = await tool("dispatch_anchor").execute({ envelope_id: envelopeIdOf() }, { sessionID: "ses_child1" })
    expect(result.content).toContain("envelope_from_dispatcher: yes")
  })

  it("does not print the field when the envelope is unverified", async () => {
    const { tool } = await scenario()
    const result = await tool("dispatch_anchor").execute({ envelope_id: "env_nope" }, { sessionID: "ses_child1" })
    expect(result.content).not.toContain("envelope_from_dispatcher")
  })
})
