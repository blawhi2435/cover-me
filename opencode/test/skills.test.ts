import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { describe, expect, it } from "vitest"
import { loadSkills } from "../src/skills.ts"

const REPO_ROOT = resolve(import.meta.dirname, "..", "..")
const SKILLS_DIR = join(REPO_ROOT, "plugins", "coding-god", "skills")
const skillNames = readdirSync(SKILLS_DIR, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort()

describe("loadSkills", () => {
  const skills = loadSkills(SKILLS_DIR)

  it("registers one skill per skills/<name>/SKILL.md under the coding-god: id scheme", () => {
    expect(skills.map((skill) => skill.id).sort()).toEqual(skillNames.map((name) => `coding-god:${name}`))
  })

  it("points each skill at the original SKILL.md, not a copy", () => {
    expect(skills).toHaveLength(skillNames.length)
    for (const skill of skills) {
      const name = skill.id.replace("coding-god:", "")
      expect(skill.path).toBe(join(SKILLS_DIR, name, "SKILL.md"))
    }
  })

  it("keeps references/ next to the registered path", () => {
    const withRefs = skills.filter((skill) => existsSync(join(skill.path, "..", "references")))
    expect(withRefs.map((skill) => skill.id)).toContain("coding-god:dev-flow")
  })

  it("uses the frontmatter description and the body without frontmatter as content", () => {
    const devFlow = skills.find((skill) => skill.id === "coding-god:dev-flow")
    const raw = readFileSync(join(SKILLS_DIR, "dev-flow", "SKILL.md"), "utf8")
    expect(devFlow?.description).toMatch(/^Use when the user wants to implement a new feature/)
    expect(devFlow?.content.startsWith("# dev-flow")).toBe(true)
    expect(raw.startsWith("---")).toBe(true)
    expect(devFlow?.content.startsWith("---")).toBe(false)
  })

  it("fails loudly when the skills directory is missing", () => {
    expect(() => loadSkills(join(REPO_ROOT, "no-such-dir"))).toThrow(/skills directory/)
  })
})
