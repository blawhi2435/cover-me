import plugin from "../src/index.ts"
import { MAIN_SESSION } from "./helpers.ts"

export interface FakeEvent {
  readonly type: string
  readonly data: Record<string, unknown>
}

type Handler<T> = (editor: T) => void
type ToolExecute = (input: Record<string, unknown>, context: Record<string, unknown>) => Promise<{ content: string }>

const SETTLE_MS = 20

/** A stand-in for the opencode plugin context, covering exactly what the plugin touches. */
export function fakeContext(options: Record<string, unknown> = {}) {
  const skillTransforms: Handler<{ add(skill: { id: string }): void }>[] = []
  const agentTransforms: Handler<{ update(id: string, fn: (agent: Record<string, unknown>) => void): void }>[] = []
  const toolTransforms: Handler<{ add(tool: { name: string; execute: ToolExecute }): void }>[] = []
  const listeners: ((event: FakeEvent) => void)[] = []
  const created: unknown[] = []
  const synthetic: { sessionID: string; text: string; delivery?: string; resume?: boolean }[] = []
  const asserted: Record<string, unknown>[] = []
  const stored = new Map<string, unknown>()
  const sessions = new Map<string, { id: string; parentID?: string }>()
  sessions.set(MAIN_SESSION, { id: MAIN_SESSION }) // the user's own top-level session
  const state = { assertError: undefined as Error | undefined, syntheticError: undefined as Error | undefined, iteratorError: undefined as Error | undefined, getError: undefined as Error | undefined, onAssert: undefined as (() => void) | undefined, scanPageSize: 1000 }

  const emit = (event: FakeEvent) => listeners.forEach((listener) => listener(event))
  const ctx = {
    options,
    location: { directory: "/work" },
    skill: { transform: (fn: Handler<never>) => void skillTransforms.push(fn as never) },
    agent: { transform: (fn: Handler<never>) => void agentTransforms.push(fn as never) },
    tool: { transform: (fn: Handler<never>) => void toolTransforms.push(fn as never) },
    permission: {
      assert: async (input: Record<string, unknown>) => {
        asserted.push(input)
        state.onAssert?.()
        if (state.assertError) throw state.assertError
      },
    },
    event: {
      subscribe: ({ types, signal }: { types: string[]; signal?: AbortSignal }) =>
        (async function* () {
          const queue: FakeEvent[] = []
          let wake: (() => void) | undefined
          listeners.push((event) => {
            if (!types.includes(event.type)) return
            queue.push(event)
            wake?.()
          })
          signal?.addEventListener("abort", () => wake?.())
          while (!signal?.aborted) {
            const next = queue.shift()
            if (next) yield next
            else if (state.iteratorError) throw state.iteratorError
            else await new Promise<void>((resolve) => (wake = resolve))
          }
        })(),
    },
    session: {
      create: async (input: unknown) => {
        created.push(input)
        const id = `ses_child${created.length}`
        sessions.set(id, { id })
        return { id }
      },
      get: async ({ sessionID }: { sessionID: string }) => {
        if (state.getError) throw state.getError
        const found = sessions.get(sessionID)
        if (!found) throw Object.assign(new Error(`session ${sessionID} not found`), { _tag: "SessionNotFoundError" })
        return found
      },
      synthetic: async (input: { sessionID: string; text: string; delivery?: string; resume?: boolean }) => {
        if (state.syntheticError) throw state.syntheticError
        synthetic.push(input)
      },
    },
    storage: {
      set: async (key: string, value: unknown) => void stored.set(key, value),
      remove: async (key: string) => void stored.delete(key),
      scan: async ({ prefix, after }: { prefix: string; after?: string }) => {
        const all = [...stored].filter(([key]) => key.startsWith(prefix)).map(([key, value]) => ({ key, value }))
        const start = after === undefined ? 0 : all.findIndex((entry) => entry.key === after) + 1
        const entries = all.slice(start, start + state.scanPageSize)
        const last = entries.at(-1)
        return { entries, ...(start + state.scanPageSize < all.length && last ? { next: last.key } : {}) }
      },
    },
  }

  const toolsByName = () => {
    const tools = new Map<string, ToolExecute>()
    for (const transform of toolTransforms) transform({ add: (tool) => void tools.set(tool.name, tool.execute) })
    return tools
  }
  const callTool = async (name: string, input: Record<string, unknown>, sessionID: string) => {
    const execute = toolsByName().get(name)
    if (!execute) throw new Error(`tool ${name} not registered`)
    return execute(input, { sessionID, agent: "build", messageID: "msg_1", id: "call_1" })
  }
  const settle = () => new Promise((resolve) => setTimeout(resolve, SETTLE_MS))
  const start = () => plugin.setup(ctx as never) as Promise<() => Promise<void>>

  return { ctx, state, skillTransforms, agentTransforms, toolTransforms, emit, created, synthetic, asserted, stored, sessions, callTool, settle, start }
}

export type FakeContext = ReturnType<typeof fakeContext>
