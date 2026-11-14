import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import type { Plugin } from "@opencode/plugin"
import type { ModelOptions } from "./agents.ts"
import { Hub, type PermissionAsked, type SessionPort, type StoragePort } from "./hub.ts"
import { registerAgentsFromDir, registerSkillsFromDir } from "./register.ts"
import { type PermissionRequest, type ToolDefinition, buildTools } from "./tools.ts"

const PLUGIN_ID = "coding-god"
/** opencode/src/index.ts -> repository root. */
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..")
const SKILLS_DIR = join(REPO_ROOT, "plugins", "coding-god", "skills")
const AGENTS_DIR = join(REPO_ROOT, "plugins", "coding-god", "agents")
const STORAGE_SCAN_PAGE = 100
const SESSION_NOT_FOUND_TAG = "SessionNotFoundError"
/** opencode 2.2.7 emits no `session.idle`; a turn ends with one of these, each carrying `data.sessionID`. */
const END_OF_TURN_EVENTS = ["session.execution.succeeded", "session.execution.failed", "session.execution.interrupted"] as const

type Context = Parameters<Plugin.Plugin["setup"]>[0]

interface EventPayload {
  readonly type: string
  readonly data: Record<string, unknown>
}

interface ToolHostContext {
  readonly sessionID: unknown
  readonly agent: unknown
  readonly messageID: unknown
  readonly id: unknown
}

// ---------------------------------------------------------------------------------------------
// Host adapter. opencode's types brand plain strings (Skill.ID, Session.ID, ...) and describe
// schemas with Effect types. Everything in the plugin core uses plain strings and JSON, so this is
// the one section where values cross that boundary, through `toHost`. A wrong value still fails at
// runtime in opencode's own schema validation; it just is not expressible in the type system here.
// ---------------------------------------------------------------------------------------------

/** The single unchecked crossing into opencode's branded types. */
const toHost = (value: unknown): never => value as never

function sessionPort(ctx: Context): SessionPort {
  return {
    async create({ title, directory, model }) {
      const session = await ctx.session.create(toHost({ title, location: { directory }, ...(model ? { model } : {}) }))
      return { id: String((session as { id: string }).id) }
    },
    async get(sessionID) {
      try {
        const session = (await ctx.session.get(toHost({ sessionID }))) as { id: string; parentID?: string }
        return { id: String(session.id), ...(session.parentID ? { parentID: String(session.parentID) } : {}) }
      } catch (error) {
        if ((error as { _tag?: string } | null)?._tag === SESSION_NOT_FOUND_TAG) return undefined
        throw error
      }
    },
    async synthetic({ sessionID, text, description, metadata }) {
      await ctx.session.synthetic(toHost({ sessionID, text, description, metadata, delivery: "queue", resume: true }))
    },
  }
}

function storagePort(ctx: Context): StoragePort {
  return {
    async set(key, value) {
      await ctx.storage.set(key, toHost(value))
    },
    async remove(key) {
      await ctx.storage.remove(key)
    },
    async list(prefix) {
      const values: unknown[] = []
      let after: string | undefined
      do {
        const page = await ctx.storage.scan({ prefix, limit: STORAGE_SCAN_PAGE, ...(after ? { after } : {}) })
        values.push(...page.entries.map((entry) => entry.value))
        after = page.next
      } while (after)
      return values
    },
  }
}

/** Asks opencode to approve the tool call, if the tool needs it, and returns what was approved. */
async function assertToolPermission(ctx: Context, tool: ToolDefinition, input: Record<string, unknown>, host: ToolHostContext): Promise<PermissionRequest | undefined> {
  const request = await tool.permission?.(input, { sessionID: String(host.sessionID) })
  if (!request) return undefined
  await ctx.permission.assert(
    toHost({
      sessionID: host.sessionID,
      agent: host.agent,
      source: { type: "tool", messageID: host.messageID, id: host.id },
      action: request.action,
      resources: [...request.resources],
    }),
  )
  return request
}

function registerTools(ctx: Context, hub: Hub): void {
  ctx.tool.transform((editor) => {
    for (const tool of buildTools(hub)) {
      editor.add({
        ...tool,
        input: toHost(tool.input),
        execute: async (input, host) => {
          const approved = await assertToolPermission(ctx, tool, toRecord(input), host)
          return tool.execute(toRecord(input), { sessionID: String(host.sessionID), ...(approved ? { approved } : {}) })
        },
      })
    }
  })
}

const toRecord = (input: unknown): Record<string, unknown> => input as Record<string, unknown>

// ---------------------------------------------------------------------------------------------
// Options and events.
// ---------------------------------------------------------------------------------------------

function modelOptions(options: Context["options"]): ModelOptions {
  const read = (key: "fast" | "strong") => {
    const value = options[key]
    if (value !== undefined && typeof value !== "string") {
      throw new Error(`coding-god option "${key}" must be a string like provider/model#variant`)
    }
    return value
  }
  return { fast: read("fast"), strong: read("strong") }
}

const isString = (value: unknown): value is string => typeof value === "string"
const isEndOfTurn = (type: string): boolean => (END_OF_TURN_EVENTS as readonly string[]).includes(type)

function sessionIdOf(data: Record<string, unknown>): string {
  if (!isString(data.sessionID)) throw new Error("payload has no string sessionID")
  return data.sessionID
}

function permissionAskedOf(data: Record<string, unknown>): PermissionAsked {
  const { action, resources } = data
  if (!isString(action) || !Array.isArray(resources) || !resources.every(isString)) {
    throw new Error("payload has no string action and string[] resources")
  }
  return { sessionID: sessionIdOf(data), action, resources }
}

async function handleEvent(hub: Hub, event: EventPayload): Promise<void> {
  if (isEndOfTurn(event.type)) return hub.onIdle(sessionIdOf(event.data))
  if (event.type === "session.deleted") return hub.onSessionDeleted(sessionIdOf(event.data))
  return hub.onPermissionAsked(permissionAskedOf(event.data))
}

/** Never rejects: a broken stream is logged, and one bad event does not stop the ones after it. */
async function routeEvents(ctx: Context, hub: Hub, signal: AbortSignal): Promise<void> {
  const events = ctx.event.subscribe({ types: [...END_OF_TURN_EVENTS, "permission.asked", "session.deleted"], signal }) as AsyncIterable<EventPayload>
  try {
    for await (const event of events) {
      try {
        await handleEvent(hub, event)
      } catch (error) {
        console.error(`coding-god: failed to handle ${event.type}`, error)
      }
    }
  } catch (error) {
    if (!signal.aborted) console.error("coding-god: event stream stopped; idle and permission notices are off until opencode reloads the plugin", error)
  }
}

// ---------------------------------------------------------------------------------------------
// The plugin.
// ---------------------------------------------------------------------------------------------

const plugin: Plugin.Plugin = {
  id: PLUGIN_ID,
  async setup(ctx) {
    const models = modelOptions(ctx.options)
    const hub = new Hub({ sessions: sessionPort(ctx), storage: storagePort(ctx) })
    await hub.restore()

    ctx.skill.transform((editor) => registerSkillsFromDir(toHost(editor), SKILLS_DIR))
    ctx.agent.transform((editor) => registerAgentsFromDir(editor, AGENTS_DIR, models))
    registerTools(ctx, hub)

    const stop = new AbortController()
    const running = routeEvents(ctx, hub, stop.signal)
    return async () => {
      stop.abort()
      await running
    }
  },
}

export default plugin
