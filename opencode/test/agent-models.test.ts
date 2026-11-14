import { describe, expect, it } from "vitest"
import { convertAgent } from "../src/agents.ts"

const agentWith = (modelLine: string) => `---\nname: probe\ndescription: d\n${modelLine}---\nbody\n`
const OPTIONS = { fast: "opencode/big-pickle", strong: "anthropic/claude-opus-5-5#high" }

describe("agent model mapping", () => {
  it("maps model: sonnet to the fast option", () => {
    expect(convertAgent(agentWith("model: sonnet\n"), OPTIONS).model).toEqual({ providerID: "opencode", id: "big-pickle" })
  })

  it("maps model: opus to the strong option, keeping the variant", () => {
    expect(convertAgent(agentWith("model: opus\n"), OPTIONS).model).toEqual({
      providerID: "anthropic",
      id: "claude-opus-5-5",
      variant: "high",
    })
  })

  it("inherits the parent session model when the agent has no model line", () => {
    expect(convertAgent(agentWith(""), OPTIONS).model).toBeUndefined()
  })

  it("inherits the parent session model when the option is unset", () => {
    expect(convertAgent(agentWith("model: sonnet\n"), {}).model).toBeUndefined()
    expect(convertAgent(agentWith("model: opus\n"), { fast: "opencode/big-pickle" }).model).toBeUndefined()
  })

  it("keeps a slash inside the model id", () => {
    expect(convertAgent(agentWith("model: sonnet\n"), { fast: "openrouter/anthropic/claude-sonnet" }).model).toEqual({
      providerID: "openrouter",
      id: "anthropic/claude-sonnet",
    })
  })

  it("rejects a malformed option instead of guessing", () => {
    expect(() => convertAgent(agentWith("model: sonnet\n"), { fast: "no-provider" })).toThrow(/fast/)
  })

  it("inherits the parent session model for a Claude tier with no plugin option", () => {
    expect(convertAgent(agentWith("model: haiku\n"), OPTIONS).model).toBeUndefined()
  })
})
