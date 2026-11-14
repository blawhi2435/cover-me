import { describe, expect, it } from "vitest"
import { buildTools } from "../src/tools.ts"
import { MAIN_SESSION, newHub } from "./helpers.ts"

describe("list_agents tool", () => {
  it("is registered with a schema that has no name parameter", () => {
    const tool = buildTools(newHub().hub).find((candidate) => candidate.name === "list_agents")
    expect(tool).toBeDefined()
    expect(Object.keys((tool?.input.properties ?? {}) as object)).toEqual([])
  })

  it("derives the caller's name from the calling session, never from tool input", async () => {
    const { hub } = newHub()
    const tool = buildTools(hub).find((candidate) => candidate.name === "list_agents")
    const result = await tool?.execute({ name: "dispatcher-of-all", session: "ses_other" }, { sessionID: MAIN_SESSION })
    expect(result?.content.split("\n")[0]).toBe(`This session is ${hub.nameOf(MAIN_SESSION)}`)
    expect(result?.content).not.toContain("dispatcher-of-all")
  })
})
