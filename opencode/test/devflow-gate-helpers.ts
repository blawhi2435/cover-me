import { execFileSync, spawnSync } from "node:child_process"
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"

// ---- constants ----

export const REPO_ROOT = resolve(import.meta.dirname, "..", "..")
export const SCRIPT = join(REPO_ROOT, "plugins", "coding-god", "skills", "dev-flow", "scripts", "devflow-gate.sh")

// Must list the same headings, in the same order, as REQUIRED_HEADINGS in devflow-gate.sh.
export const SPEC_HEADINGS = ["Problem", "Goal", "Design", "Affected files", "Requirements", "References"]

// Mirrors RED_TAIL_LINES in devflow-gate.sh: how many lines of output a red evidence file keeps.
export const RED_TAIL_LINES = 40

// What the script itself uses (awk sed grep tail tr mkdir mktemp mv rm) plus what the specs run through it (seq true false).
const ALLOWED_TOOLS = ["sh", "awk", "sed", "grep", "tail", "tr", "mkdir", "mktemp", "mv", "rm", "seq", "true", "false"]

export const VALID_EVIDENCE = `command: test\nexit code: 1\noutput (last ${RED_TAIL_LINES} lines):\nfailed\n`

// ---- fixture builders ----

export function scenarioBlock(id: string): string {
  return `### Requirement: Thing ${id}\nThe system SHALL do ${id}.\n\n#### Scenario ${id}: does ${id}\n- **WHEN** ${id} happens\n- **THEN** ${id} is done\n`
}

export function specText(opts: { omit?: string; requirements?: string } = {}): string {
  const requirements = opts.requirements ?? `${scenarioBlock("S1")}\n${scenarioBlock("S2")}`
  return SPEC_HEADINGS.filter((heading) => heading !== opts.omit)
    .map((heading) => `## ${heading}\n\n${heading === "Requirements" ? requirements : "text"}\n`)
    .join("\n")
}

export function tddGroup(n: number, scenarios: string): string {
  return `## ${n}. Behavior ${n}\nScenarios: ${scenarios}\n\n- [ ] ${n}.1 Write failing test\n- [ ] ${n}.2 Implement\n- [ ] ${n}.3 Refactor\n`
}

export function tickAll(tasks: string): string {
  return tasks.replace(/^- \[ \]/gm, "- [x]")
}

export function fenceWith(marker: string, body: string): string {
  return `${marker}\n${body}\n${marker}\n`
}

// ---- ready-made fixtures ----

export const VALID_TASKS = `# Tasks\n\n${tddGroup(1, "S1")}\n${tddGroup(2, "S2")}`
export const SKIPPED_TASKS = "# Tasks\n\n## 1. Update docs <!-- TDD skipped: docs only -->\n\n- [ ] 1.1 Edit the docs\n"
export const ONE_SCENARIO_SPEC = specText({ requirements: scenarioBlock("S1") })

// ---- runners ----

export function makeRoot(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "devflow-gate-"))
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), content)
  }
  return root
}

export type GateResult = { status: number | null; output: string }

export function gate(root: string, args: [string, ...string[]], env: NodeJS.ProcessEnv = process.env): GateResult {
  const [subcommand, ...rest] = args
  const result = spawnSync("/bin/sh", [SCRIPT, subcommand, "--root", root, ...rest], { encoding: "utf8", env })
  return { status: result.status, output: `${result.stdout}${result.stderr}` }
}

// A PATH directory that links only the tools the script is allowed to use: no jq, node or python.
export function restrictedPath(without: string[] = []): string {
  const bin = mkdtempSync(join(tmpdir(), "devflow-bin-"))
  for (const tool of ALLOWED_TOOLS.filter((name) => !without.includes(name))) {
    const found = execFileSync("/bin/sh", ["-c", `command -v ${tool} || true`], { encoding: "utf8" }).trim()
    if (found.startsWith("/")) symlinkSync(found, join(bin, tool))
  }
  return bin
}
