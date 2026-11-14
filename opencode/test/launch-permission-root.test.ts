import { mkdirSync, mkdtempSync, realpathSync, symlinkSync, unlinkSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { fakeContext } from "./fake-context.ts"
import { MAIN_SESSION } from "./helpers.ts"

function projectWithLinks() {
  const base = realpathSync(mkdtempSync(join(tmpdir(), "coding-god-root-")))
  mkdirSync(join(base, "real", "sub"), { recursive: true })
  symlinkSync(join(base, "real"), join(base, "link"))
  return { base, real: join(base, "real") }
}

describe("the launch_child permission request", () => {
  it("carries the realpath of a symlinked root", async () => {
    const { base, real } = projectWithLinks()
    const fake = fakeContext()
    await fake.start()
    await fake.callTool("launch_child", { root: join(base, "link"), name: "dg-1-api" }, MAIN_SESSION)
    expect(fake.asserted.map((request) => request.resources)).toEqual([[real]])
    expect(fake.created).toEqual([{ title: "dg-1-api", location: { directory: real } }])
  })

  it("carries the resolved path of a .. traversal", async () => {
    const { base, real } = projectWithLinks()
    const fake = fakeContext()
    await fake.start()
    await fake.callTool("launch_child", { root: join(base, "real", "sub", "..", "..", "real"), name: "dg-1-api" }, MAIN_SESSION)
    expect(fake.asserted.map((request) => request.resources)).toEqual([[real]])
  })

  it.each([
    ["a relative root", { root: "relative/dir", name: "dg-1-api" }],
    ["a missing directory", { root: "/definitely/not/here", name: "dg-1-api" }],
    ["the filesystem root", { root: "/", name: "dg-1-api" }],
    ["a reserved name", { root: process.cwd(), name: "main-forged" }],
  ])("is not made for %s, which is rejected first", async (_label, input) => {
    const fake = fakeContext()
    await fake.start()
    await expect(fake.callTool("launch_child", input, MAIN_SESSION)).rejects.toThrow()
    expect(fake.asserted).toEqual([])
    expect(fake.created).toEqual([])
  })
})

describe("the root the user approved", () => {
  it("is the root the child is created in, even if a symlink is repointed during the prompt", async () => {
    const { base, real } = projectWithLinks()
    const other = join(base, "other")
    mkdirSync(other)
    const link = join(base, "link")
    const fake = fakeContext()
    fake.state.onAssert = () => {
      unlinkSync(link)
      symlinkSync(other, link)
    }
    await fake.start()
    await expect(fake.callTool("launch_child", { root: link, name: "dg-1-api" }, MAIN_SESSION)).rejects.toThrow(/changed/)
    expect(fake.asserted.map((request) => request.resources)).toEqual([[real]])
    expect(fake.created).toEqual([])
    expect([...fake.stored.keys()]).toEqual([])
  })
})
