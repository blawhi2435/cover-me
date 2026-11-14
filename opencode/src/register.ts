import { type AgentPermission, type ModelOptions, type ModelRef, loadAgents } from "./agents.ts"
import { type SkillEntry, loadSkills } from "./skills.ts"

export interface MutableAgent {
  name: string
  description?: string
  mode: string
  system?: string
  model?: ModelRef
  permissions: AgentPermission[]
}

export interface AgentEditorLike {
  update(id: string, update: (agent: MutableAgent) => void): void
}

export interface RegisteredSkill extends SkillEntry {
  readonly autoinvoke?: boolean
}

export interface SkillEditorLike {
  add(skill: RegisteredSkill): void
}

/** Converts the Claude agent files at call time, so a changed file shows up in the next registration. */
export function registerAgentsFromDir(editor: AgentEditorLike, agentsDir: string, options: ModelOptions): void {
  for (const agent of loadAgents(agentsDir, options)) {
    editor.update(agent.id, (target) => {
      target.name = agent.id
      target.description = agent.description
      target.mode = agent.mode
      target.system = agent.system
      if (agent.model) target.model = { ...agent.model }
      target.permissions.push(...agent.permissions)
    })
  }
}

export function registerSkillsFromDir(editor: SkillEditorLike, skillsDir: string): void {
  for (const skill of loadSkills(skillsDir)) {
    editor.add(skill)
  }
}
