import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { parseFrontmatter } from "./frontmatter.ts"

export interface SkillEntry {
  readonly id: string
  readonly name: string
  readonly description: string
  readonly path: string
  readonly content: string
}

export const SKILL_ID_PREFIX = "coding-god:"

export function loadSkills(skillsDir: string): SkillEntry[] {
  if (!existsSync(skillsDir)) {
    throw new Error(`coding-god: skills directory not found at ${skillsDir}; the plugin must be loaded from a full clone of the repository`)
  }
  return readdirSync(skillsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => readSkill(join(skillsDir, entry.name, "SKILL.md"), entry.name))
}

function readSkill(path: string, dirName: string): SkillEntry {
  let source: string
  try {
    source = readFileSync(path, "utf8")
  } catch (error) {
    throw new Error(`coding-god: cannot read skill ${dirName}`, { cause: error })
  }
  const { data, body } = parseFrontmatter(source)
  const id = `${SKILL_ID_PREFIX}${dirName}`
  return {
    id,
    name: id,
    description: data.description ?? "",
    path,
    content: body.trimStart(),
  }
}
