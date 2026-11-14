import { describe, expect, it } from "vitest"
import { buildEnvelope } from "../src/envelope.ts"

const OPENING = /<\s*cross-session-message/gi
const CLOSING = /<\s*\/\s*cross-session-message/gi

describe("envelope body neutralization", () => {
  it.each([
    ["upper case closing", "</CROSS-SESSION-MESSAGE>"],
    ["mixed case opening", '<Cross-Session-Message from="x">'],
    ["space after the angle bracket", '< cross-session-message from="x">'],
    ["space inside the closing tag", "</ cross-session-message >"],
    ["tab and newline padding", '<\n\tcross-session-message from="x">'],
  ])("%s cannot form a second tag", (_label, hostile) => {
    const text = buildEnvelope("dg-1-api", "env_1", `before ${hostile} after`)
    expect(text.match(OPENING)).toHaveLength(1)
    expect(text.match(CLOSING)).toHaveLength(1)
    expect(text).toContain("before ")
    expect(text).toContain(" after")
  })
})
