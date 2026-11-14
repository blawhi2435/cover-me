import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { parseFrontmatter } from "./frontmatter.ts"
import { CROSS_SESSION_TOOLS } from "./tool-names.ts"

export type Effect = "allow" | "ask" | "deny"

export interface AgentPermission {
  readonly action: string
  readonly resource: string
  readonly effect: Effect
}

export interface ModelRef {
  readonly providerID: string
  readonly id: string
  readonly variant?: string
}

/** Plugin options naming a `provider/model#variant` for the Claude `sonnet` and `opus` tiers. */
export interface ModelOptions {
  readonly fast?: string
  readonly strong?: string
}

export interface ConvertedAgent {
  readonly model?: ModelRef
  readonly id: string
  readonly description: string
  readonly mode: "subagent"
  readonly system: string
  readonly permissions: readonly AgentPermission[]
}

const AGENT_ID_PREFIX = "coding-god/"
const ANY_RESOURCE = "*"

/** Claude Code tool name -> opencode permission action. Grep and Glob are file reads in opencode. */
const TOOL_ACTIONS: Readonly<Record<string, string>> = {
  Read: "read",
  Grep: "read",
  Glob: "read",
  Bash: "shell",
  Edit: "edit",
  Write: "write",
  WebFetch: "webfetch",
}

/** Actions that change the workspace; denied unless the Claude agent lists the matching tool. */
const MUTATING_ACTIONS = ["edit", "write"]

export function convertAgent(source: string, options: ModelOptions = {}): ConvertedAgent {
  const { data, body } = parseFrontmatter(source)
  const name = data.name
  if (!name) {
    throw new Error("agent conversion: frontmatter has no name")
  }
  return {
    model: resolveModel(data.model, options),
    id: `${AGENT_ID_PREFIX}${name}`,
    description: data.description ?? "",
    mode: "subagent",
    system: body.trimStart(),
    permissions: [...(data.tools === undefined ? [] : permissionsForTools(data.tools)), ...crossSessionDenies()],
  }
}

const TIER_OPTION: Readonly<Record<string, keyof ModelOptions>> = { sonnet: "fast", opus: "strong" }

function resolveModel(claudeModel: string | undefined, options: ModelOptions): ModelRef | undefined {
  const optionName = claudeModel === undefined ? undefined : TIER_OPTION[claudeModel]
  if (optionName === undefined) return undefined
  const configured = options[optionName]
  return configured === undefined ? undefined : parseModelRef(configured, optionName)
}

export function parseModelRef(value: string, optionName: string): ModelRef {
  const slash = value.indexOf("/")
  if (slash <= 0 || slash === value.length - 1) {
    throw new Error(`coding-god option "${optionName}" must look like provider/model or provider/model#variant, got "${value}"`)
  }
  const [id, variant] = value.slice(slash + 1).split("#")
  return { providerID: value.slice(0, slash), id: id ?? "", ...(variant ? { variant } : {}) }
}

function permissionsForTools(toolsLine: string): AgentPermission[] {
  const allowed = new Set<string>()
  for (const tool of toolsLine.split(",").map((entry) => entry.trim()).filter(Boolean)) {
    const action = TOOL_ACTIONS[tool]
    if (!action) {
      throw new Error(`agent conversion: no opencode permission for Claude tool "${tool}"`)
    }
    allowed.add(action)
  }
  const denied = MUTATING_ACTIONS.filter((action) => !allowed.has(action))
  return [
    ...[...allowed].map((action) => rule(action, "allow")),
    ...denied.map((action) => rule(action, "deny")),
  ]
}

/**
 * opencode evaluates rules last-match-wins (and hides a tool whose last matching rule is a `*` deny), so these
 * go after every allow: a converted subagent must not launch sessions or message other sessions.
 */
const crossSessionDenies = (): AgentPermission[] => CROSS_SESSION_TOOLS.map((tool) => rule(tool, "deny"))

const rule = (action: string, effect: Effect): AgentPermission => ({ action, resource: ANY_RESOURCE, effect })

export function loadAgents(agentsDir: string, options: ModelOptions = {}): ConvertedAgent[] {
  if (!existsSync(agentsDir)) {
    throw new Error(`coding-god: agents directory not found at ${agentsDir}`)
  }
  return readdirSync(agentsDir)
    .filter((file) => file.endsWith(".md"))
    .sort()
    .map((file) => convertAgent(readFileSync(join(agentsDir, file), "utf8"), options))
}
