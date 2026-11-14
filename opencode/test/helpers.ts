import { Hub, type CreateSessionInput, type HubDeps, type SessionPort, type SyntheticInput } from "../src/hub.ts"

export interface FakeSessions extends SessionPort {
  readonly created: CreateSessionInput[]
  readonly delivered: SyntheticInput[]
  readonly gone: Set<string>
  deliveryError: Error | undefined
  readonly deliveryFailsFor: Set<string>
  createError: Error | undefined
  createGate: Promise<void> | undefined
  readonly parents: Map<string, string>
}

export function fakeSessions(): FakeSessions {
  const created: CreateSessionInput[] = []
  const delivered: SyntheticInput[] = []
  const gone = new Set<string>()
  const parents = new Map<string, string>()
  return {
    created,
    delivered,
    gone,
    parents,
    deliveryError: undefined as Error | undefined,
    deliveryFailsFor: new Set<string>(),
    createError: undefined as Error | undefined,
    createGate: undefined as Promise<void> | undefined,
    async get(id) {
      if (gone.has(id)) return undefined
      const parentID = parents.get(id)
      return parentID === undefined ? { id } : { id, parentID }
    },
    async create(input) {
      await this.createGate
      if (this.createError) throw this.createError
      created.push(input)
      return { id: `ses_child${created.length}` }
    },
    async synthetic(input) {
      if (this.deliveryError) throw this.deliveryError
      if (this.deliveryFailsFor.has(input.sessionID)) throw new Error(`cannot deliver to ${input.sessionID}`)
      delivered.push(input)
    },
  }
}

export const MAIN_SESSION = "ses_0000mainSESSION"

export function newHub(extra: Partial<HubDeps> = {}) {
  const sessions = fakeSessions()
  return { hub: new Hub({ sessions, isDirectory: () => true, realpath: (path) => path, homeDir: "/home/tester", ...extra }), sessions }
}
