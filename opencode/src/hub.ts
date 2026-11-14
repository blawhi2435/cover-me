import { randomUUID } from "node:crypto"
import { realpathSync, statSync } from "node:fs"
import { homedir } from "node:os"
import { isAbsolute, parse } from "node:path"
import { parseModelRef } from "./agents.ts"
import { buildEnvelope } from "./envelope.ts"

const BINDING_KEY_PREFIX = "binding:"
const ENVELOPE_ID_PREFIX = "env_"
const MAIN_NAME_PREFIX = "main-"
const MAX_PARENT_DEPTH = 8
const MAX_RECORDED_ENVELOPES = 1000
const MIN_MAIN_SUFFIX = 6
const SESSION_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/
export const PLUGIN_METADATA_KEY = "coding-god"

// Ports: what the hub needs from opencode, kept narrow so tests can fake it.

export interface SyntheticInput {
  readonly sessionID: string
  readonly text: string
  readonly description: string
  readonly metadata: Record<string, unknown>
}

export interface CreateSessionInput {
  readonly title: string
  readonly directory: string
  readonly model?: { readonly providerID: string; readonly id: string; readonly variant?: string }
}

export interface SessionPort {
  create(input: CreateSessionInput): Promise<{ readonly id: string }>
  synthetic(input: SyntheticInput): Promise<void>
  /** The session, or `undefined` when it no longer exists. */
  get(sessionID: string): Promise<{ readonly id: string; readonly parentID?: string } | undefined>
}

export interface StoragePort {
  set(key: string, value: Binding): Promise<void>
  list(prefix: string): Promise<unknown[]>
  remove(key: string): Promise<void>
}

export interface HubDeps {
  readonly sessions: SessionPort
  readonly storage?: StoragePort
  readonly newId?: () => string
  readonly isDirectory?: (path: string) => boolean
  readonly realpath?: (path: string) => string
  readonly homeDir?: string
  readonly log?: (message: string) => void
}

// Data shapes.

export interface Binding {
  readonly childSessionID: string
  readonly childName: string
  readonly dispatcherSessionID: string
  readonly dispatcherName: string
  readonly root: string
}

export interface LaunchInput {
  readonly root: string
  readonly name: string
  readonly model?: string
  /** The resolved root the user approved; the launch is refused if the root now resolves anywhere else. */
  readonly approvedRoot?: string
}

export interface SendInput {
  readonly to: string
  readonly message: string
  readonly notifyWhenIdle?: boolean
}

export interface AnchorInput {
  readonly envelopeId?: string
}

export interface PermissionAsked {
  readonly sessionID: string
  readonly action: string
  readonly resources: readonly string[]
}

export interface VerifiedEnvelope {
  readonly from: string
  readonly fromSessionID: string
  readonly body: string
}

interface RecordedEnvelope extends VerifiedEnvelope {
  readonly to: string
}

// Helpers.

const defaultIsDirectory = (path: string): boolean => {
  try {
    return statSync(path).isDirectory()
  } catch {
    return false
  }
}

const BINDING_FIELDS = ["childSessionID", "childName", "dispatcherSessionID", "dispatcherName", "root"] as const

/** A stored value is only trusted as a binding when every field is a string and both names are safe to print into an envelope. */
function isBinding(value: unknown): value is Binding {
  if (typeof value !== "object" || value === null) return false
  const record = value as Record<string, unknown>
  if (BINDING_FIELDS.some((field) => typeof record[field] !== "string")) return false
  return SESSION_NAME.test(record.childName as string) && SESSION_NAME.test(record.dispatcherName as string)
}

export class Registry {
  private readonly byChild = new Map<string, Binding>()
  private readonly mainNames = new Map<string, string>()

  bind(binding: Binding): void {
    this.byChild.set(binding.childSessionID, binding)
  }

  /**
   * After a restart, a dispatcher that is not itself a child keeps the name its children were bound to. Run once all
   * bindings are bound, so the answer does not depend on the order they were restored in.
   */
  reserveDispatcherNames(): void {
    for (const binding of this.byChild.values()) {
      const dispatcher = binding.dispatcherSessionID
      if (!this.byChild.has(dispatcher) && !this.mainNames.has(dispatcher)) {
        this.mainNames.set(dispatcher, binding.dispatcherName)
      }
    }
  }

  unbind(childSessionID: string): void {
    this.byChild.delete(childSessionID)
  }

  bindingOf(childSessionID: string): Binding | undefined {
    return this.byChild.get(childSessionID)
  }

  all(): Binding[] {
    return [...this.byChild.values()]
  }

  childrenOf(dispatcherSessionID: string): Binding[] {
    return [...this.byChild.values()].filter((binding) => binding.dispatcherSessionID === dispatcherSessionID)
  }

  isNameTaken(name: string): boolean {
    return [...this.byChild.values()].some((binding) => binding.childName === name) || [...this.mainNames.values()].includes(name)
  }

  /** Name of a session: its title when this plugin launched it, a derived `main-<suffix>` otherwise. */
  nameOf(sessionID: string): string {
    return this.byChild.get(sessionID)?.childName ?? this.mainNameOf(sessionID)
  }

  private mainNameOf(sessionID: string): string {
    const known = this.mainNames.get(sessionID)
    if (known) return known
    const taken = new Set([...this.mainNames.values(), ...[...this.byChild.values()].map((binding) => binding.childName)])
    const compact = sessionID.replace(/[^A-Za-z0-9]/g, "").toLowerCase()
    for (let length = MIN_MAIN_SUFFIX; length <= compact.length; length++) {
      const candidate = `${MAIN_NAME_PREFIX}${compact.slice(-length)}`
      if (!taken.has(candidate)) {
        this.mainNames.set(sessionID, candidate)
        return candidate
      }
    }
    throw new Error(`cannot derive a unique name for session ${sessionID}`)
  }
}

export class Hub {
  readonly registry = new Registry()
  private readonly envelopes = new Map<string, RecordedEnvelope>()
  private readonly idleSubscribers = new Map<string, Set<string>>()
  private readonly pendingNames = new Set<string>()

  constructor(readonly deps: HubDeps) {}

  nameOf(sessionID: string): string {
    return this.registry.nameOf(sessionID)
  }

  async listAgents(sessionID: string): Promise<string> {
    await this.pruneDeadChildren(sessionID)
    const lines = [`This session is ${this.nameOf(sessionID)}`]
    const dispatcher = this.registry.bindingOf(sessionID)?.dispatcherName
    if (dispatcher) lines.push(`dispatcher: ${dispatcher}`)
    for (const child of this.registry.childrenOf(sessionID)) {
      lines.push(`child: ${child.childName} (session ${child.childSessionID}, root ${child.root})`)
    }
    return lines.join("\n")
  }

  async sendMessage(caller: string, input: SendInput): Promise<string> {
    await this.assertTopLevel(caller, "send_message")
    await this.pruneDeadChildren(caller)
    const targetSessionID = this.resolveTarget(caller, input.to)
    await this.deliver(targetSessionID, caller, input.message)
    if (input.notifyWhenIdle) this.subscribeToIdle(caller, targetSessionID)
    return `Delivered to ${input.to}.`
  }

  async launchChild(caller: string, input: LaunchInput): Promise<string> {
    const { name } = input
    await this.assertTopLevel(caller, "launch_child")
    await this.pruneDeadChildNamed(name)
    // No await between the name check inside resolveLaunchRoot and the reservation, so two launches cannot both pass.
    const root = this.resolveLaunchRoot(input.root, name)
    if (input.approvedRoot !== undefined && input.approvedRoot !== root) {
      throw new Error(`launch_child: root changed since it was approved (approved ${input.approvedRoot}, now ${root}); nothing was created`)
    }
    this.pendingNames.add(name)
    try {
      return await this.createChild(caller, name, root, input.model)
    } finally {
      this.pendingNames.delete(name)
    }
  }

  private async createChild(caller: string, name: string, root: string, requestedModel: string | undefined): Promise<string> {
    const model = requestedModel === undefined ? undefined : parseModelRef(requestedModel, "model")
    const child = await this.deps.sessions.create({ title: name, directory: root, ...(model ? { model } : {}) })
    const binding: Binding = {
      childSessionID: child.id,
      childName: name,
      dispatcherSessionID: caller,
      dispatcherName: this.nameOf(caller),
      root,
    }
    try {
      await this.deps.storage?.set(`${BINDING_KEY_PREFIX}${child.id}`, binding)
    } catch (error) {
      throw new Error(`launch_child: session ${child.id} was created but its binding could not be saved, so it is not tracked (${String(error)}); delete it from the opencode session list`, { cause: error })
    }
    this.registry.bind(binding)
    return `Launched ${name} (session ${child.id}) in ${root}. Dispatcher: ${binding.dispatcherName}.`
  }

  /**
   * Checks the caller, name and root before the permission request, so the user is asked about the root's real path.
   * Nothing is reserved here. `launchChild` repeats the checks, and given the approved root it refuses to create the
   * child if the root now resolves anywhere else.
   */
  async prepareLaunch(caller: string, input: LaunchInput): Promise<string> {
    await this.assertTopLevel(caller, "launch_child")
    await this.pruneDeadChildNamed(input.name)
    return this.resolveLaunchRoot(input.root, input.name)
  }

  /**
   * Subagent sessions have a `parentID`; sessions the user opens and sessions `launch_child` creates do not.
   * Only the latter two may use the cross-session tools, so a subagent cannot act under its parent's identity.
   */
  private async assertTopLevel(caller: string, tool: string): Promise<void> {
    const session = await this.deps.sessions.get(caller)
    if (!session) throw new Error(`${tool}: the calling session ${caller} was not found`)
    if (session.parentID) throw new Error(`${tool}: a subagent session cannot use the cross-session tools`)
  }

  /** Validates the launch request and returns the root's real path, which is what gets stored and used. */
  private resolveLaunchRoot(root: string, name: string): string {
    if (!isAbsolute(root)) throw new Error(`launch_child: root must be an absolute path, got "${root}"`)
    const isDirectory = this.deps.isDirectory ?? defaultIsDirectory
    if (!isDirectory(root)) throw new Error(`launch_child: root is not an existing directory: ${root}`)
    if (!SESSION_NAME.test(name)) throw new Error(`launch_child: name must match ${SESSION_NAME}, got "${name}"`)
    if (name.startsWith(MAIN_NAME_PREFIX)) throw new Error(`launch_child: names starting with "${MAIN_NAME_PREFIX}" are reserved for plugin-derived session names`)
    if (this.pendingNames.has(name) || this.registry.isNameTaken(name)) throw new Error(`launch_child: name "${name}" is already in use`)
    const resolve = this.deps.realpath ?? realpathSync
    const real = resolve(root)
    if (real === parse(real).root || real === resolve(this.deps.homeDir ?? homedir())) {
      throw new Error(`launch_child: root is too broad (${real}); pick the repository directory`)
    }
    return real
  }

  /** Only the caller's own binding is ever reported, and an envelope is checked against the caller's own deliveries. */
  dispatchAnchor(caller: string, input: AnchorInput = {}): string {
    const lines = [`dispatcher: ${this.registry.bindingOf(caller)?.dispatcherName ?? "none"}`]
    if (input.envelopeId !== undefined) {
      const verified = this.verifyEnvelope(caller, input.envelopeId)
      lines.push(...(verified ? this.verifiedLines(caller, verified) : ["envelope: unverified"]))
    }
    return lines.join("\n")
  }

  private verifiedLines(caller: string, envelope: VerifiedEnvelope): string[] {
    const fromDispatcher = envelope.fromSessionID === this.registry.bindingOf(caller)?.dispatcherSessionID
    return [
      "envelope: verified",
      `envelope_from: ${envelope.from}`,
      `envelope_from_dispatcher: ${fromDispatcher ? "yes" : "no"}`,
      "envelope_body:",
      envelope.body,
    ]
  }

  /** Tells a launched child's dispatcher (and nobody else) that the child waits on a permission prompt. */
  async onPermissionAsked(request: PermissionAsked): Promise<void> {
    const binding = await this.boundAncestor(request.sessionID)
    if (!binding) return
    const body =
      `Permission pending in ${binding.childName}: ${request.action} on ${request.resources.join(", ")}. ` +
      `Ask the user to approve it in that session (opencode -s ${binding.childSessionID}); do not approve it from here.`
    await this.deliver(binding.dispatcherSessionID, binding.childSessionID, body)
  }

  /** Forgets a child that was deleted: its binding, its stored copy, and any idle subscription to it. */
  async onSessionDeleted(sessionID: string): Promise<void> {
    this.forgetSubscriptions(sessionID)
    if (!this.registry.bindingOf(sessionID)) return
    this.registry.unbind(sessionID)
    await this.deps.storage?.remove(`${BINDING_KEY_PREFIX}${sessionID}`)
  }

  /** The bound child that `sessionID` is, or is a (sub)agent session of, found by walking `parentID`. */
  private async boundAncestor(sessionID: string): Promise<Binding | undefined> {
    const visited = new Set<string>()
    let current: string | undefined = sessionID
    while (current !== undefined && visited.size < MAX_PARENT_DEPTH && !visited.has(current)) {
      const bound = this.registry.bindingOf(current)
      if (bound) return bound
      visited.add(current)
      current = (await this.deps.sessions.get(current))?.parentID
    }
    return undefined
  }

  /** Drops idle subscriptions to a deleted session and by it, so no notice is ever sent to or for it again. */
  private forgetSubscriptions(sessionID: string): void {
    this.idleSubscribers.delete(sessionID)
    for (const [target, subscribers] of this.idleSubscribers) {
      subscribers.delete(sessionID)
      if (subscribers.size === 0) this.idleSubscribers.delete(target)
    }
  }

  private async pruneDeadChildren(dispatcher: string): Promise<void> {
    for (const child of this.registry.childrenOf(dispatcher)) {
      if (!(await this.deps.sessions.get(child.childSessionID))) await this.onSessionDeleted(child.childSessionID)
    }
  }

  private async pruneDeadChildNamed(name: string): Promise<void> {
    const child = [...this.registry.all()].find((binding) => binding.childName === name)
    if (child && !(await this.deps.sessions.get(child.childSessionID))) await this.onSessionDeleted(child.childSessionID)
  }

  /** One-shot: every subscriber of `sessionID` gets one notice and is then unsubscribed. */
  async onIdle(sessionID: string): Promise<void> {
    const subscribers = this.idleSubscribers.get(sessionID)
    if (!subscribers) return
    this.idleSubscribers.delete(sessionID)
    const name = this.nameOf(sessionID)
    for (const subscriber of subscribers) {
      try {
        await this.deliver(subscriber, sessionID, `Session ${name} is idle.`)
      } catch (error) {
        (this.deps.log ?? console.error)(`coding-god: idle notice for ${name} could not be delivered to ${subscriber}: ${String(error)}`)
      }
    }
  }

  /** Reloads the child -> dispatcher bindings stored by an earlier plugin process. */
  async restore(): Promise<void> {
    for (const value of (await this.deps.storage?.list(BINDING_KEY_PREFIX)) ?? []) {
      if (isBinding(value)) this.registry.bind(value)
      else (this.deps.log ?? console.error)(`coding-god: skipping a stored binding that is malformed: ${JSON.stringify(value)}`)
    }
    this.registry.reserveDispatcherNames()
  }

  /**
   * The answer to "was this envelope really delivered to me by the plugin?". Only envelopes the plugin
   * itself delivered to `sessionID` are recorded; text typed by a user or found in a file never is.
   */
  verifyEnvelope(sessionID: string, envelopeId: string): VerifiedEnvelope | undefined {
    const recorded = this.envelopes.get(envelopeId)
    if (!recorded || recorded.to !== sessionID) return undefined
    return { from: recorded.from, fromSessionID: recorded.fromSessionID, body: recorded.body }
  }

  private subscribeToIdle(subscriber: string, target: string): void {
    const subscribers = this.idleSubscribers.get(target) ?? new Set<string>()
    subscribers.add(subscriber)
    this.idleSubscribers.set(target, subscribers)
  }

  /** A session may address only the children it launched and the dispatcher that launched it. */
  private resolveTarget(caller: string, targetName: string): string {
    const child = this.registry.childrenOf(caller).find((binding) => binding.childName === targetName)
    if (child) return child.childSessionID
    const own = this.registry.bindingOf(caller)
    if (own?.dispatcherName === targetName) return own.dispatcherSessionID
    throw new Error(`cannot message "${targetName}": it is neither a child you launched nor your dispatcher`)
  }

  private async deliver(targetSessionID: string, fromSessionID: string, body: string): Promise<void> {
    const fromName = this.nameOf(fromSessionID)
    const id = `${ENVELOPE_ID_PREFIX}${(this.deps.newId ?? randomUUID)()}`
    this.record(id, { to: targetSessionID, from: fromName, fromSessionID, body })
    await this.deps.sessions.synthetic({
      sessionID: targetSessionID,
      text: buildEnvelope(fromName, id, body),
      description: `message from ${fromName}`,
      metadata: { [PLUGIN_METADATA_KEY]: { envelope: id, from: fromName } },
    })
  }

  private record(id: string, envelope: RecordedEnvelope): void {
    this.envelopes.set(id, envelope)
    if (this.envelopes.size > MAX_RECORDED_ENVELOPES) {
      const oldest = this.envelopes.keys().next().value
      if (oldest !== undefined) this.envelopes.delete(oldest)
    }
  }
}
