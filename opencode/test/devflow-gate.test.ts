import { chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, symlinkSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { ONE_SCENARIO_SPEC, RED_TAIL_LINES, SKIPPED_TASKS, VALID_EVIDENCE, VALID_TASKS, fenceWith, gate, makeRoot, restrictedPath, scenarioBlock, specText, tddGroup, tickAll } from "./devflow-gate-helpers.ts"

describe("devflow-gate plan", () => {
  it("S1 accepts a well-formed spec and tasks", () => {
    const root = makeRoot({ "spec.md": specText(), ".devflow/tasks.md": VALID_TASKS })
    const result = gate(root, ["plan", "spec.md"])
    expect(result.output).toContain("plan: ok")
    expect(result.status).toBe(0)
  })

  describe("headings", () => {
    it("S6 names a missing required heading", () => {
      const root = makeRoot({ "spec.md": specText({ omit: "Design" }), ".devflow/tasks.md": VALID_TASKS })
      const result = gate(root, ["plan", "spec.md"])
      expect(result.status).not.toBe(0)
      expect(result.output).toContain("## Design")
    })
  })

  describe("requirements content", () => {
    it("S7 accepts 'No behavior change.' with only TDD-skipped groups, and rejects an empty Requirements", () => {
      const noChange = makeRoot({ "spec.md": specText({ requirements: "No behavior change.\n" }), ".devflow/tasks.md": SKIPPED_TASKS })
      expect(gate(noChange, ["plan", "spec.md"]).status).toBe(0)

      const empty = makeRoot({ "spec.md": specText({ requirements: "nothing here\n" }), ".devflow/tasks.md": SKIPPED_TASKS })
      const result = gate(empty, ["plan", "spec.md"])
      expect(result.status).not.toBe(0)
      expect(result.output).toContain("Requirements")
    })
  })

  describe("scenario mapping", () => {
    it("S2 rejects a scenario no group maps", () => {
      const requirements = ["S1", "S2", "S3"].map(scenarioBlock).join("\n")
      const root = makeRoot({ "spec.md": specText({ requirements }), ".devflow/tasks.md": VALID_TASKS })
      const result = gate(root, ["plan", "spec.md"])
      expect(result.status).not.toBe(0)
      expect(result.output).toContain("S3")
    })
  })

  describe("unknown scenario ids", () => {
    it("S3 names the group and the unknown id", () => {
      const tasks = `# Tasks\n\n${tddGroup(1, "S1")}\n${tddGroup(2, "S2, S9")}`
      const root = makeRoot({ "spec.md": specText(), ".devflow/tasks.md": tasks })
      const result = gate(root, ["plan", "spec.md"])
      expect(result.status).not.toBe(0)
      expect(result.output).toContain("group 2 names unknown scenario S9")
    })
  })

  describe("Scenarios lines", () => {
    const noLine = "## 3. Behavior 3\n\n- [ ] 3.1 Write failing test\n- [ ] 3.2 Implement\n- [ ] 3.3 Refactor\n"

    it("S4 names a TDD group with no Scenarios line", () => {
      const tasks = `# Tasks\n\n${tddGroup(1, "S1")}\n${tddGroup(2, "S2")}\n${noLine}`
      const root = makeRoot({ "spec.md": specText(), ".devflow/tasks.md": tasks })
      const result = gate(root, ["plan", "spec.md"])
      expect(result.status).not.toBe(0)
      expect(result.output).toContain("group 3 has no Scenarios line")
    })

    it("accepts 'Scenarios: none — <reason>' and a TDD-skipped group without a line", () => {
      const fix = tddGroup(3, "none — fix for a review finding the spec has no scenario for")
      const skipped = "## 4. Docs <!-- TDD skipped: docs -->\n\n- [ ] 4.1 Edit docs\n"
      const tasks = `# Tasks\n\n${tddGroup(1, "S1")}\n${tddGroup(2, "S2")}\n${fix}\n${skipped}`
      const root = makeRoot({ "spec.md": specText(), ".devflow/tasks.md": tasks })
      expect(gate(root, ["plan", "spec.md"]).status).toBe(0)
    })
  })

  describe("scenarios without a unit test", () => {
    const skippedGroup = "## 3. Prose skill <!-- TDD skipped: verified hands-on at Node 7.5 -->\nScenarios: S5\n\n- [ ] 3.1 Write the prose\n"
    const requirements = ["S1", "S2", "S5"].map(scenarioBlock).join("\n")
    const tasks = tickAll(`# Tasks\n\n${tddGroup(1, "S1")}\n${tddGroup(2, "S2")}\n${skippedGroup}`)
    const files = { "spec.md": specText({ requirements }), ".devflow/tasks.md": tasks, ".devflow/red/1.txt": VALID_EVIDENCE, ".devflow/red/2.txt": VALID_EVIDENCE }

    it.each(["plan", "check"])("S31 %s lists a scenario named only by a TDD-skipped group, without failing", (command) => {
      const result = gate(makeRoot(files), [command, "spec.md"])
      expect(result.output).toMatch(/without unit test: S5 \(group 3: verified hands-on at Node 7\.5\)/)
      expect(result.status).toBe(0)
    })
  })

  describe("scenario heading forms", () => {
    it("accepts the 'Scenario: S1 name' heading form as well as 'Scenario S1: name'", () => {
      const requirements = "### Requirement: X\nThe system SHALL.\n\n#### Scenario: S1 colon form\n- **WHEN** a\n- **THEN** b\n"
      const tasks = `# Tasks\n\n${tddGroup(1, "S1")}`
      const root = makeRoot({ "spec.md": specText({ requirements }), ".devflow/tasks.md": tasks })
      const result = gate(root, ["plan", "spec.md"])
      expect(result.output).toContain("plan: ok")
      expect(result.status).toBe(0)
    })
  })

  describe("duplicate scenario ids", () => {
    it("plan reports a duplicated scenario id once and fails", () => {
      const requirements = [scenarioBlock("S1"), scenarioBlock("S1")].join("\n")
      const root = makeRoot({ "spec.md": specText({ requirements }), ".devflow/tasks.md": `# Tasks\n\n${tddGroup(1, "S1")}` })
      const result = gate(root, ["plan", "spec.md"])
      expect(result.status).not.toBe(0)
      expect(result.output.split("duplicate scenario id S1").length - 1).toBe(1)
    })
  })

  describe("tasks.md layout", () => {
    const head = "# Tasks\n\n## 1. A\nScenarios: S1\n\n"
    const rest = "- [ ] 1.2 y\n- [ ] 1.3 z\n"
    const cases: Array<[string, string, number]> = [
      ["an indented checkbox", `${head}  - [ ] 1.1 x\n${rest}`, 6],
      ["an uppercase [X] checkbox", `${head}- [X] 1.1 x\n${rest}`, 6],
      ["a checkbox with no id", `${head}- [ ] write the test\n${rest}`, 6],
      ["a checkbox id from another group", `${head}- [ ] 2.1 x\n${rest}`, 6],
      ["a duplicate group heading", `${head}- [ ] 1.1 x\n${rest}\n## 1. B\nScenarios: S1\n\n- [ ] 1.4 q\n`, 10],
      ["groups not numbered from 1", "# Tasks\n\n## 2. A\nScenarios: S1\n\n- [ ] 2.1 x\n", 3],
      ["a Scenarios line before the first group", `# Tasks\nScenarios: S1\n\n## 1. A\nScenarios: S1\n\n- [ ] 1.1 x\n`, 2],
      ["a checkbox before the first group", `# Tasks\n- [ ] 0.1 x\n\n## 1. A\nScenarios: S1\n\n- [ ] 1.1 x\n`, 2],
    ]

    it.each(cases.flatMap(([label, tasks, line]) => ["plan", "check"].map((command) => [command, label, tasks, line] as const)))(
      "%s rejects %s and names the line",
      (command, _label, tasks, line) => {
        const root = makeRoot({ "spec.md": specText({ requirements: scenarioBlock("S1") }), ".devflow/tasks.md": tasks })
        const result = gate(root, [command, "spec.md"])
        expect(result.status).not.toBe(0)
        expect(result.output).toContain(`tasks.md line ${line}`)
      },
    )

    it("does not count a checkbox inside a fence", () => {
      const tasks = `${tickAll(`# Tasks\n\n${tddGroup(1, "S1")}`)}\n\`\`\`\n- [ ] 9.1 shown as an example\n\`\`\`\n`
      const files = { "spec.md": specText({ requirements: scenarioBlock("S1") }), ".devflow/tasks.md": tasks, ".devflow/red/1.txt": "command: x\nexit code: 1\n" }
      const result = gate(makeRoot(files), ["check", "spec.md"])
      expect(result.output).toContain("check: ok")
    })
  })

  describe("required inputs", () => {
    const noChange = specText({ requirements: "No behavior change.\n" })

    it.each(["plan", "check"] as const)("%s fails naming the file when .devflow/tasks.md is missing", (command) => {
      const result = gate(makeRoot({ "spec.md": noChange }), [command, "spec.md"])
      expect(result.status).not.toBe(0)
      expect(result.output).toContain(".devflow/tasks.md")
    })

    it.each(["plan", "check"] as const)("%s without a spec argument prints usage and exits 2", (command) => {
      const result = gate(makeRoot({ ".devflow/tasks.md": SKIPPED_TASKS }), [command])
      expect(result.status).toBe(2)
    })

    it("plan fails when the six headings are in the wrong order", () => {
      const swapped = specText().replace("## Problem", "## TMP").replace("## Goal", "## Problem").replace("## TMP", "## Goal")
      const result = gate(makeRoot({ "spec.md": swapped, ".devflow/tasks.md": VALID_TASKS }), ["plan", "spec.md"])
      expect(result.status).not.toBe(0)
      expect(result.output).toContain("order")
    })

    it("plan fails when tasks.md has no groups", () => {
      const result = gate(makeRoot({ "spec.md": noChange, ".devflow/tasks.md": "# Tasks\n" }), ["plan", "spec.md"])
      expect(result.status).not.toBe(0)
      expect(result.output).toContain("no task groups")
    })
  })

  describe("Scenarios line content", () => {
    const withGroup2 = (line: string) => `# Tasks\n\n${tddGroup(1, "S1")}\n${tddGroup(2, line)}`

    it.each([
      ["an empty Scenarios line", "", "group 2 has an empty Scenarios line"],
      ["'none' with no reason", "none", "group 2 has Scenarios: none without a reason"],
      ["text with no scenario id", "everything", "group 2 names no scenario id"],
    ])("plan rejects %s", (_label, line, message) => {
      const root = makeRoot({ "spec.md": specText(), ".devflow/tasks.md": withGroup2(line) })
      const result = gate(root, ["plan", "spec.md"])
      expect(result.status).not.toBe(0)
      expect(result.output).toContain(message)
    })

    it("plan rejects a scenario heading without an S<n> id", () => {
      const requirements = `${scenarioBlock("S1")}\n#### Scenario: has no id\n- **WHEN** a\n- **THEN** b\n`
      const root = makeRoot({ "spec.md": specText({ requirements }), ".devflow/tasks.md": `# Tasks\n\n${tddGroup(1, "S1")}` })
      const result = gate(root, ["plan", "spec.md"])
      expect(result.status).not.toBe(0)
      expect(result.output).toContain("scenario heading without an S<n> id")
    })
  })

  it("S2 reports the exact unmapped-scenario line", () => {
    const requirements = ["S1", "S2", "S3"].map(scenarioBlock).join("\n")
    const result = gate(makeRoot({ "spec.md": specText({ requirements }), ".devflow/tasks.md": VALID_TASKS }), ["plan", "spec.md"])
    expect(result.output).toMatch(/^ERROR: scenario S3 is not mapped by any group$/m)
  })

  it("S7 reports the exact error text when Requirements has neither scenarios nor the line", () => {
    const result = gate(makeRoot({ "spec.md": specText({ requirements: "nothing\n" }), ".devflow/tasks.md": SKIPPED_TASKS }), ["plan", "spec.md"])
    expect(result.output).toMatch(/^ERROR: ## Requirements has no scenarios and not the line: No behavior change\.$/m)
  })

  describe("S31 listing", () => {
    const skipped = (n: number, scenarios: string, reason: string) => `## ${n}. Prose ${n} <!-- TDD skipped: ${reason} -->\nScenarios: ${scenarios}\n\n- [ ] ${n}.1 Write\n`
    const run = (requirements: string, groups: string[]) => {
      const tasks = `# Tasks\n\n${groups.join("\n")}`
      return gate(makeRoot({ "spec.md": specText({ requirements }), ".devflow/tasks.md": tasks }), ["plan", "spec.md"])
    }

    it("does not list a scenario that a TDD group also names", () => {
      const result = run(scenarioBlock("S5"), [tddGroup(1, "S5"), skipped(2, "S5", "prose")])
      expect(result.output).not.toContain("without unit test")
    })

    it("lists a scenario once, with the first skipping group, when two skipped groups name it", () => {
      const result = run(scenarioBlock("S5"), [skipped(1, "S5", "first reason"), skipped(2, "S5", "second reason")])
      expect(result.output.match(/without unit test: S5/g)).toHaveLength(1)
      expect(result.output).toContain("without unit test: S5 (group 1: first reason)")
    })

    it("lists every scenario named only by skipped groups", () => {
      const requirements = ["S5", "S6"].map(scenarioBlock).join("\n")
      const result = run(requirements, [skipped(1, "S5", "r1"), skipped(2, "S6", "r2")])
      expect(result.output).toContain("without unit test: S5 (group 1: r1)")
      expect(result.output).toContain("without unit test: S6 (group 2: r2)")
    })
  })

  describe("checkbox forms", () => {
    const head = "# Tasks\n\n## 1. A\nScenarios: S1\n\n"
    const forms: Array<[string, string]> = [
      ["an empty bracket", "- [] 1.1 x"],
      ["a * bullet", "* [ ] 1.1 x"],
      ["a + bullet", "+ [ ] 1.1 x"],
      ["two spaces after the dash", "-  [ ] 1.1 x"],
      ["a tab after the dash", "-\t[ ] 1.1 x"],
      ["a numbered list item", "1. [ ] 1.1 x"],
      ["a 1) list item", "1) [ ] 1.1 x"],
      ["no space after the dash", "-[ ] 1.1 x"],
      ["text glued to the bracket", "- [ ]x 1.1 x"],
      ["an indented * [x]", "   * [x] 1.1 x"],
      ["a bracket with no bullet", "[ ] 1.1 x"],
      ["a [x] with no bullet", "[x] 1.1 x"],
      ["a blockquoted checkbox", "> - [ ] 1.1 x"],
      ["a [~] marker", "- [~] 1.1 x"],
      ["a unicode bullet", "• [ ] 1.1 x"],
      ["an en dash bullet", "–  [ ] 1.1 x"],
      ["an id before the bracket", "1.1 [ ] x"],
      ["a commented-out checkbox", "<!-- - [ ] 1.1 x -->"],
    ]

    it.each(forms.flatMap(([label, line]) => ["plan", "check"].map((subcommand) => [subcommand, label, line] as const)))(
      "%s rejects %s and names the line",
      (subcommand, _label, line) => {
        const tasks = `${head}${line}\n- [ ] 1.2 y\n`
        const root = makeRoot({ "spec.md": specText({ requirements: scenarioBlock("S1") }), ".devflow/tasks.md": tasks })
        const result = gate(root, [subcommand, "spec.md"])
        expect(result.status).not.toBe(0)
        expect(result.output).toMatch(/^ERROR: tasks\.md line 6: /m)
      },
    )

    it("ignores every checkbox-like form inside a fenced block", () => {
      const examples = forms.map(([, line]) => line).join("\n")
      const tasks = tickAll(`# Tasks\n\n${tddGroup(1, "S1")}\n${fenceWith("```", examples)}`)
      const files = { "spec.md": specText({ requirements: scenarioBlock("S1") }), ".devflow/tasks.md": tasks, ".devflow/red/1.txt": VALID_EVIDENCE }
      const root = makeRoot(files)
      expect(gate(root, ["plan", "spec.md"]).output).toContain("plan: ok")
      expect(gate(root, ["check", "spec.md"]).output).toContain("check: ok")
    })
  })

  describe("TDD skipped reason", () => {
    it.each(["<!-- TDD skipped: -->", "<!-- TDD skipped:    -->"])("rejects %s in plan and check", (marker) => {
      const tasks = `# Tasks\n\n## 1. Docs ${marker}\n\n- [ ] 1.1 Edit docs\n`
      const root = makeRoot({ "spec.md": specText({ requirements: "No behavior change.\n" }), ".devflow/tasks.md": tasks })
      for (const subcommand of ["plan", "check"]) {
        const result = gate(root, [subcommand, "spec.md"])
        expect(result.status).not.toBe(0)
        expect(result.output).toMatch(/^ERROR: tasks\.md line 3: TDD skipped marker has no reason$/m)
      }
    })
  })

  describe("group checkboxes", () => {
    const spec = specText({ requirements: scenarioBlock("S1") })

    it.each([
      ["a TDD group", "## 1. A\nScenarios: S1\n"],
      ["a TDD-skipped group", "## 1. A <!-- TDD skipped: docs -->\nScenarios: S1\n"],
    ])("rejects %s with no checkboxes", (_label, group) => {
      const root = makeRoot({ "spec.md": spec, ".devflow/tasks.md": `# Tasks\n\n${group}` })
      for (const subcommand of ["plan", "check"]) {
        const result = gate(root, [subcommand, "spec.md"])
        expect(result.status).not.toBe(0)
        expect(result.output).toContain("ERROR: group 1 has no checkboxes")
      }
    })

    it("rejects a duplicate checkbox id and names the line", () => {
      const tasks = "# Tasks\n\n## 1. A\nScenarios: S1\n\n- [x] 1.1 a\n- [x] 1.1 b\n"
      const result = gate(makeRoot({ "spec.md": spec, ".devflow/tasks.md": tasks }), ["plan", "spec.md"])
      expect(result.status).not.toBe(0)
      expect(result.output).toMatch(/^ERROR: tasks\.md line 7: duplicate checkbox id 1\.1$/m)
    })
  })

  describe("Scenarios: none reasons", () => {
    it("does not map ids that appear inside a 'Scenarios: none' reason", () => {
      const tasks = `# Tasks\n\n${tddGroup(1, "none — S1 is covered elsewhere, also S99")}`
      const result = gate(makeRoot({ "spec.md": specText({ requirements: scenarioBlock("S1") }), ".devflow/tasks.md": tasks }), ["plan", "spec.md"])
      expect(result.output).toContain("ERROR: scenario S1 is not mapped by any group")
      expect(result.output).not.toContain("unknown scenario")
    })
  })

  describe("code fences", () => {
    describe("fences", () => {
      const fenced = (body: string) => "```\n" + body + "\n```\n"

      it("S5 ignores headings, scenarios, groups and checkboxes inside code fences", () => {
        const spec = `${specText()}\n${fenced("#### Scenario S9: only in a fence")}`
        const tasks = `${VALID_TASKS}\n${fenced("## 9. Fenced group\n- [ ] 9.1 fenced box")}`
        const root = makeRoot({ "spec.md": spec, ".devflow/tasks.md": tasks })
        const result = gate(root, ["plan", "spec.md"])
        expect(result.output).toContain("plan: ok")
        expect(result.status).toBe(0)
      })

      it("S5 does not count a required heading that appears only inside a fence", () => {
        const spec = specText({ omit: "Design" }) + fenced("## Design")
        const root = makeRoot({ "spec.md": spec, ".devflow/tasks.md": VALID_TASKS })
        const result = gate(root, ["plan", "spec.md"])
        expect(result.status).not.toBe(0)
        expect(result.output).toContain("## Design")
      })

      it("S5 ignores ~~~ fences, a fenced Scenarios line and a fenced ## Requirements", () => {
        const spec = `${specText({ requirements: scenarioBlock("S1") })}\n${fenceWith("~~~", "## Requirements\n#### Scenario S9: only in a fence")}`
        const tasks = `# Tasks\n\n${tddGroup(1, "S1")}\n${fenceWith("```", "Scenarios: S9")}`
        const result = gate(makeRoot({ "spec.md": spec, ".devflow/tasks.md": tasks }), ["plan", "spec.md"])
        expect(result.output).toContain("plan: ok")
      })
    })

    describe("unclosed fences", () => {
      const spec = specText({ requirements: scenarioBlock("S1") })

      it.each(["```", "~~~"])("rejects a stray %s in tasks.md that hides a later group, naming the opening line", (fence) => {
        const tasks = `# Tasks\n\n${tddGroup(1, "S1")}\n${fence}\n\n${tddGroup(5, "none — hidden")}`
        const openedAt = tasks.split("\n").findIndex((l) => l === fence) + 1
        const root = makeRoot({ "spec.md": spec, ".devflow/tasks.md": tasks })
        for (const subcommand of ["plan", "check"]) {
          const result = gate(root, [subcommand, "spec.md"])
          expect(result.status).not.toBe(0)
          expect(result.output).toContain(`ERROR: tasks.md line ${openedAt}: unclosed code fence`)
        }
      })

      it("rejects a fence on the very last line of tasks.md", () => {
        const tasks = `# Tasks\n\n${tddGroup(1, "S1")}\n\`\`\``
        const openedAt = tasks.split("\n").length
        const result = gate(makeRoot({ "spec.md": spec, ".devflow/tasks.md": tasks }), ["plan", "spec.md"])
        expect(result.output).toContain(`ERROR: tasks.md line ${openedAt}: unclosed code fence`)
      })

      it.each([["Requirements", "## Requirements\n\n"], ["Design", "## Design\n\n"]])("rejects a fence left open in the spec's %s", (_name, anchor) => {
        const broken = spec.replace(anchor, `${anchor}\`\`\`\n`)
        const line = broken.split("\n").findIndex((l) => l === "```") + 1
        const result = gate(makeRoot({ "spec.md": broken, ".devflow/tasks.md": VALID_TASKS }), ["plan", "spec.md"])
        expect(result.status).not.toBe(0)
        expect(result.output).toContain(`ERROR: spec.md line ${line}: unclosed code fence`)
      })

      it("still accepts files whose fences are all closed", () => {
        const closedSpec = `${specText()}\n${fenceWith("```", "## Design")}\n${fenceWith("~~~", "text")}`
        const tasks = `${VALID_TASKS}\n${fenceWith("```", "- [ ] 9.1 example")}`
        const result = gate(makeRoot({ "spec.md": closedSpec, ".devflow/tasks.md": tasks }), ["plan", "spec.md"])
        expect(result.output).toContain("plan: ok")
      })

      it("S5 treats everything after an unterminated fence as fenced", () => {
        const spec = `${specText().replace("## References", "```\n## References")}`
        const result = gate(makeRoot({ "spec.md": spec, ".devflow/tasks.md": VALID_TASKS }), ["plan", "spec.md"])
        expect(result.status).not.toBe(0)
        expect(result.output).toContain("spec is missing heading: ## References")
        expect(result.output).toContain("unclosed code fence")
      })
    })

    describe("mixed fences", () => {
      const tick = (n: number) => tickAll(`# Tasks\n\n${tddGroup(n, "S1")}`)
      const files = (tasks: string, spec = ONE_SCENARIO_SPEC) => ({
        "spec.md": spec,
        ".devflow/tasks.md": tasks,
        ".devflow/red/1.txt": VALID_EVIDENCE,
      })
      const rawBoxes = "- [ ] 1.4 real unfinished work\n"

      it("(a) pairs ``` with ``` only, so a ~~~ line inside does not hide later work", () => {
        const tasks = `${tick(1)}\n\`\`\`\nnote\n~~~\n\`\`\`\n${rawBoxes}\`\`\`\n`
        const result = gate(makeRoot(files(tasks)), ["check", "spec.md"])
        expect(result.status).not.toBe(0)
        expect(result.output).toContain("1.4")
      })

      it("(b) treats an info-string line inside a fence as content, not as a closer", () => {
        const tasks = `${tick(1)}\n\`\`\`\nx\n\`\`\`bash\n\`\`\`\n${rawBoxes}\`\`\`\n`
        const result = gate(makeRoot(files(tasks)), ["check", "spec.md"])
        expect(result.status).not.toBe(0)
        expect(result.output).toContain("1.4")
      })

      it("(c) keeps a scenario visible when mixed fences surround it in the spec", () => {
        const requirements = `${scenarioBlock("S1")}\n\`\`\`\n~~~\n\`\`\`\n${scenarioBlock("S3")}\`\`\`\n`
        const result = gate(makeRoot(files(tick(1), specText({ requirements }))), ["plan", "spec.md"])
        expect(result.status).not.toBe(0)
        expect(result.output).toContain("ERROR: scenario S3 is not mapped by any group")
      })

      it("(d) accepts a four-backtick fence around a ``` example and a ~~~ fence holding ``` lines", () => {
        const hidden = "````\n```\n- [ ] 9.1 shown\n```\n````\n~~~\n```\n- [ ] 9.2 shown\n~~~\n"
        const tasks = `${tick(1)}\n${hidden}`
        const root = makeRoot(files(tasks))
        expect(gate(root, ["plan", "spec.md"]).output).toContain("plan: ok")
        expect(gate(root, ["check", "spec.md"]).output).toContain("check: ok")
      })

      it.each([
        ["a longer closing fence", "```\n- [ ] 9.1 x\n`````\n"],
        ["an indented fence", "   ```\n   - [ ] 9.1 x\n   ```\n"],
        ["a fence char inside a fenced line", "```\nuse ``` here\n- [ ] 9.1 x\n```\n"],
        ["an info string on the opener", "```bash\n- [ ] 9.1 x\n```\n"],
        ["a closer with trailing spaces", "```\n- [ ] 9.1 x\n```   \n"],
      ])("accepts %s", (_label, block) => {
        const root = makeRoot(files(`${tick(1)}\n${block}`))
        expect(gate(root, ["check", "spec.md"]).output).toContain("check: ok")
      })

      it("accepts a closing fence on the last line with no trailing newline", () => {
        const root = makeRoot(files(`${tick(1)}\n\`\`\`\n- [ ] 9.1 x\n\`\`\``))
        expect(gate(root, ["check", "spec.md"]).output).toContain("check: ok")
      })

      it("rejects a closer that is shorter than the opener", () => {
        const root = makeRoot(files(`${tick(1)}\n\`\`\`\`\n- [ ] 9.1 x\n\`\`\`\n`))
        expect(gate(root, ["plan", "spec.md"]).output).toMatch(/unclosed code fence/)
      })
    })

    describe("indentation", () => {
      const tick = tickAll(`# Tasks\n\n${tddGroup(1, "S1")}`)
      const files = (tasks: string, spec = ONE_SCENARIO_SPEC) => ({ "spec.md": spec, ".devflow/tasks.md": tasks, ".devflow/red/1.txt": VALID_EVIDENCE })

      it.each([
        ["4 spaces and ```", "    ```"],
        ["a tab and ```", "\t```"],
        ["4 spaces and ~~~", "    ~~~"],
      ])("(a) a marker indented with %s is content, so a box between two of them stays visible", (_label, marker) => {
        const tasks = `${tick}\n${marker}\n- [ ] 1.4 unfinished\n${marker}\n`
      const root = makeRoot(files(tasks))
      const plan = gate(root, ["plan", "spec.md"])
      expect(plan.output).toContain("plan: ok")
      expect(plan.output).not.toContain("unclosed code fence")
      const check = gate(root, ["check", "spec.md"])
      expect(check.status).not.toBe(0)
      expect(check.output).toContain("unticked: 1.4")
    })

      it("(b) keeps a scenario visible between two 4-space-indented fence lines in the spec", () => {
        const requirements = `${scenarioBlock("S1")}\n    \`\`\`\n${scenarioBlock("S2")}    \`\`\`\n`
        const result = gate(makeRoot(files(tick, specText({ requirements }))), ["plan", "spec.md"])
        expect(result.output).toContain("ERROR: scenario S2 is not mapped by any group")
      })

      it.each([" ", "  ", "   "])("(c) a fence indented %j opens and closes normally", (pad) => {
        const root = makeRoot(files(`${tick}\n${pad}\`\`\`\n${pad}- [ ] 9.1 example\n${pad}\`\`\`\n`))
        expect(gate(root, ["check", "spec.md"]).output).toContain("check: ok")
      })

      it("a closer indented 4 spaces does not close the fence", () => {
        const root = makeRoot(files(`${tick}\n\`\`\`\n- [ ] 9.1 example\n    \`\`\`\n`))
        expect(gate(root, ["plan", "spec.md"]).output).toContain("unclosed code fence")
      })
    })

    describe("backtick info strings", () => {
      const tick = tickAll(`# Tasks\n\n${tddGroup(1, "S1")}`)
      const files = (tasks: string) => ({ "spec.md": ONE_SCENARIO_SPEC, ".devflow/tasks.md": tasks, ".devflow/red/1.txt": VALID_EVIDENCE })

      it("treats a ```-led line whose rest contains a backtick as plain text", () => {
        const tasks = `${tick}\n\`\`\`npm test\`\`\` must fail\n- [ ] 1.4 unfinished\n`
        const result = gate(makeRoot(files(tasks)), ["check", "spec.md"])
        expect(result.output).not.toContain("unclosed code fence")
        expect(result.output).toContain("unticked: 1.4")
      })

      it("still lets a ~~~ opener carry backticks in its info string", () => {
        const tasks = `${tick}\n~~~ run \`x\`\n- [ ] 9.1 example\n~~~\n`
        const result = gate(makeRoot(files(tasks)), ["check", "spec.md"])
        expect(result.output).toContain("check: ok")
      })
    })
  })
})

describe("devflow-gate red", () => {
  it("S8 records the command, exit code and output tail when the command fails", () => {
    const root = makeRoot({})
    const result = gate(root, ["red", "2", "--", "sh", "-c", "seq 1 100; echo boom >&2; exit 3"])
    expect(result.status).toBe(0)
    const evidence = readFileSync(join(root, ".devflow", "red", "2.txt"), "utf8")
    expect(evidence).toContain("command: sh -c seq 1 100; echo boom >&2; exit 3")
    expect(evidence).toContain("exit code: 3")
    // The command prints 1..100 and then "boom": the tail keeps "boom" plus the last RED_TAIL_LINES - 1 numbers.
    const firstKept = 100 - (RED_TAIL_LINES - 1) + 1
    expect(evidence).toContain(`\n${firstKept}\n`)
    expect(evidence).not.toContain(`\n${firstKept - 1}\n`)
    expect(evidence).toContain("boom")
  })

  describe("refusal", () => {
    it("S9 refuses a passing command, writes nothing and leaves existing evidence untouched", () => {
      const root = makeRoot({ ".devflow/red/2.txt": "old evidence" })
      const refused = gate(root, ["red", "2", "--", "true"])
      expect(refused.status).not.toBe(0)
      expect(refused.output).toContain("not red")
      expect(readFileSync(join(root, ".devflow", "red", "2.txt"), "utf8")).toBe("old evidence")

      const fresh = makeRoot({})
      expect(gate(fresh, ["red", "3", "--", "true"]).status).not.toBe(0)
      expect(existsSync(join(fresh, ".devflow", "red", "3.txt"))).toBe(false)
    })
  })

  describe("group id", () => {
    it.each([
      ["a parent path", ["../x"]],
      ["a slash", ["1/2"]],
      ["a dotted id", ["2.1"]],
      ["an empty id", [""]],
      ["two words before --", ["1", "2"]],
    ])("rejects %s with usage (exit 2) and writes nothing", (_label, ids) => {
      const root = makeRoot({})
      const result = gate(root, ["red", ...ids, "--", "false"])
      expect(result.status).toBe(2)
      expect(existsSync(join(root, ".devflow", "x.txt"))).toBe(false)
      expect(existsSync(join(root, ".devflow", "red"))).toBe(false)
    })
  })

  describe("path safety", () => {
    it("refuses when .devflow is a symlink and leaves the target alone", () => {
      const root = makeRoot({})
      const target = makeRoot({})
      symlinkSync(target, join(root, ".devflow"))
      const result = gate(root, ["red", "1", "--", "false"])
      expect(result.status).not.toBe(0)
      expect(readdirSync(target)).toEqual([])
    })

    it("refuses when .devflow/red is a symlink and leaves the target alone", () => {
      const root = makeRoot({ ".devflow/keep": "x" })
      const target = makeRoot({})
      symlinkSync(target, join(root, ".devflow", "red"))
      const result = gate(root, ["red", "1", "--", "false"])
      expect(result.status).not.toBe(0)
      expect(readdirSync(target)).toEqual([])
    })

    it("refuses when the evidence file is a symlink and leaves its target untouched", () => {
      const root = makeRoot({ ".devflow/red/keep": "x" })
      const target = join(makeRoot({ "victim.txt": "original" }), "victim.txt")
      symlinkSync(target, join(root, ".devflow", "red", "1.txt"))
      const result = gate(root, ["red", "1", "--", "false"])
      expect(result.status).not.toBe(0)
      expect(readFileSync(target, "utf8")).toBe("original")
    })

    it("exits non-zero and does not print 'recorded' when the evidence cannot be written", () => {
      const root = makeRoot({ ".devflow/red/keep": "x" })
      chmodSync(join(root, ".devflow", "red"), 0o500)
      const result = gate(root, ["red", "1", "--", "false"])
      chmodSync(join(root, ".devflow", "red"), 0o700)
      expect(result.status).not.toBe(0)
      expect(result.output).not.toContain("recorded")
    })

    it("refuses when .devflow/red/<N>.txt is a real directory and does not print 'recorded'", () => {
      const root = makeRoot({ ".devflow/red/1.txt/keep": "x" })
      const result = gate(root, ["red", "1", "--", "false"])
      expect(result.status).not.toBe(0)
      expect(result.output).not.toContain("recorded")
      expect(readdirSync(join(root, ".devflow", "red", "1.txt"))).toEqual(["keep"])
    })
  })

  it("S8 keeps short output whole, records exit 127 for a missing command, and prints the recorded line", () => {
    const short = makeRoot({})
    const result = gate(short, ["red", "2", "--", "sh", "-c", "echo one; echo two; exit 4"])
    expect(result.output).toContain("red: recorded .devflow/red/2.txt (exit code 4)")
    expect(readFileSync(join(short, ".devflow", "red", "2.txt"), "utf8")).toContain("\none\ntwo\n")

    const missing = makeRoot({})
    expect(gate(missing, ["red", "1", "--", "no-such-command-devflow"]).status).toBe(0)
    expect(readFileSync(join(missing, ".devflow", "red", "1.txt"), "utf8")).toContain("exit code: 127")
  })

  it("S8 overwrites the evidence of a group when red runs again", () => {
    const root = makeRoot({})
    gate(root, ["red", "1", "--", "sh", "-c", "echo first; exit 1"])
    gate(root, ["red", "1", "--", "sh", "-c", "echo second; exit 1"])
    const evidence = readFileSync(join(root, ".devflow", "red", "1.txt"), "utf8")
    expect(evidence).toContain("second")
    expect(evidence).not.toContain("first")
  })

  it("red with no arguments after the group prints usage and exits 2", () => {
    expect(gate(makeRoot({}), ["red"]).status).toBe(2)
    expect(gate(makeRoot({}), ["red", "1"]).status).toBe(2)
  })

  describe("padded group ids", () => {
    it("red normalises a zero-padded group id to the plain number", () => {
      const root = makeRoot({})
      expect(gate(root, ["red", "01", "--", "false"]).status).toBe(0)
      expect(existsSync(join(root, ".devflow", "red", "1.txt"))).toBe(true)
      expect(existsSync(join(root, ".devflow", "red", "01.txt"))).toBe(false)
    })
  })

  describe("symlink race", () => {
    it("refuses when the command itself makes .devflow/red a symlink", () => {
      const root = makeRoot({})
      const target = makeRoot({})
      const script = `mkdir -p '${root}/.devflow' && ln -s '${target}' '${root}/.devflow/red'; exit 1`
      const result = gate(root, ["red", "1", "--", "sh", "-c", script])
      expect(result.status).not.toBe(0)
      expect(readdirSync(target)).toEqual([])
    })

    it("creates nothing in the link target when the command swaps .devflow for a symlink", () => {
      const root = makeRoot({})
      const target = makeRoot({})
      const script = `ln -s '${target}' '${root}/.devflow'; exit 1`
      const result = gate(root, ["red", "1", "--", "sh", "-c", script])
      expect(result.status).not.toBe(0)
      expect(readdirSync(target)).toEqual([])
    })
  })
})

describe("devflow-gate near-miss scenario headings", () => {
  const nearMisses = [" #### Scenario S2: x", "   #### Scenario S2: x", "### Scenario S2: x", "##### Scenario S2: x", "#### scenario S2: x", "#### S2: x"]
  const tasks = `# Tasks\n\n${tddGroup(1, "S1")}`

  it.each(nearMisses.flatMap((line) => ["plan", "check"].map((subcommand) => [subcommand, line] as const)))(
    "%s rejects %j and names the line",
    (subcommand, line) => {
      const spec = specText({ requirements: `${scenarioBlock("S1")}\n${line}\n- **WHEN** a\n- **THEN** b\n` })
      const lineNo = spec.split("\n").indexOf(line) + 1
      const files = { "spec.md": spec, ".devflow/tasks.md": tickAll(tasks), ".devflow/red/1.txt": VALID_EVIDENCE }
      const result = gate(makeRoot(files), [subcommand, "spec.md"])
      expect(result.status).not.toBe(0)
      expect(result.output).toContain(`ERROR: spec.md line ${lineNo}: near-miss scenario heading`)
    },
  )

  it.each(["plan", "check"])("%s accepts the exact forms and near-misses inside a fence", (subcommand) => {
    const requirements = `${scenarioBlock("S1")}\n#### Scenario: S2 colon form\n- **WHEN** a\n- **THEN** b\n\n${fenceWith("```", nearMisses.join("\n"))}`
    const files = { "spec.md": specText({ requirements }), ".devflow/tasks.md": tickAll(`# Tasks\n\n${tddGroup(1, "S1, S2")}`), ".devflow/red/1.txt": VALID_EVIDENCE }
    expect(gate(makeRoot(files), [subcommand, "spec.md"]).output).toContain(`${subcommand}: ok`)
  })
})

describe("devflow-gate list-item fences", () => {
  const head = tickAll(`# Tasks\n\n${tddGroup(1, "S1")}`)
  const files = (tasks: string) => ({ "spec.md": ONE_SCENARIO_SPEC, ".devflow/tasks.md": tasks, ".devflow/red/1.txt": VALID_EVIDENCE })

  it.each(["plan", "check"])("%s reports a fence opened at 2 spaces that outlives its list item, and keeps the box visible", (subcommand) => {
    const tasks = `${head}- [x] 1.3 c\n  \`\`\`\n- [ ] 1.4 hidden\n  \`\`\`\n`
    const result = gate(makeRoot(files(tasks)), [subcommand, "spec.md"])
    expect(result.status).not.toBe(0)
    expect(result.output).toContain("unclosed code fence")
    if (subcommand === "check") expect(result.output).toContain("unticked: 1.4")
  })

  it("leaves a fence opened at column 0 unaffected by column-0 content inside it", () => {
    const tasks = `${head}\`\`\`\n- [ ] 9.1 example\ntext at column 0\n\`\`\`\n`
    expect(gate(makeRoot(files(tasks)), ["check", "spec.md"]).output).toContain("check: ok")
  })

  it("lets an indented fence hold indented content and blank lines", () => {
    const tasks = `${head}  \`\`\`\n  - [ ] 9.1 example\n\n  more\n  \`\`\`\n`
    expect(gate(makeRoot(files(tasks)), ["check", "spec.md"]).output).toContain("check: ok")
  })
})

describe("devflow-gate check", () => {
  describe("completion", () => {
    const evidence = { ".devflow/red/1.txt": VALID_EVIDENCE, ".devflow/red/2.txt": VALID_EVIDENCE }

    it("S10 reports unticked checkboxes with their count and ids", () => {
      const tasks = `# Tasks\n\n${tickAll(tddGroup(1, "S1"))}\n${tddGroup(2, "S2")}`
      const root = makeRoot({ "spec.md": specText(), ".devflow/tasks.md": tasks, ...evidence })
      const result = gate(root, ["check", "spec.md"])
      expect(result.status).not.toBe(0)
      expect(result.output).toContain("tasks: 6 total, 3 remaining")
      expect(result.output).toContain("unticked: 2.1 2.2 2.3")
    })
  })

  describe("red evidence", () => {
    it("S11 names a TDD group that has no red evidence", () => {
      const tasks = tickAll(`# Tasks\n\n${tddGroup(1, "S1")}\n${tddGroup(2, "S2")}`)
      const root = makeRoot({ "spec.md": specText(), ".devflow/tasks.md": tasks, ".devflow/red/1.txt": VALID_EVIDENCE })
      const result = gate(root, ["check", "spec.md"])
      expect(result.status).not.toBe(0)
      expect(result.output).toContain("group 2 has no red evidence")
      expect(result.output).not.toContain("group 1 has no red evidence")
    })
  })

  describe("report", () => {
    it("S12 passes a complete run and reports mapping, skipped groups and Scenarios: none groups", () => {
      const skipped = "## 3. Docs <!-- TDD skipped: docs only -->\n\n- [ ] 3.1 Edit docs\n"
      const none = tddGroup(4, "none — review finding without a scenario")
      const tasks = tickAll(`# Tasks\n\n${tddGroup(1, "S1")}\n${tddGroup(2, "S2")}\n${skipped}\n${none}`)
      const files = { "spec.md": specText(), ".devflow/tasks.md": tasks, ".devflow/red/1.txt": VALID_EVIDENCE, ".devflow/red/2.txt": VALID_EVIDENCE, ".devflow/red/4.txt": VALID_EVIDENCE }
      const result = gate(makeRoot(files), ["check", "spec.md"])
      expect(result.status).toBe(0)
      expect(result.output).toContain("scenario S1: group 1")
      expect(result.output).toContain("scenario S2: group 2")
      expect(result.output).toContain("skipped group 3: docs only")
      expect(result.output).toContain("no scenario group 4: review finding without a scenario")
      expect(result.output).toContain("check: ok")
    })
  })

  describe("evidence validation", () => {
    const tasks = tickAll(`# Tasks\n\n${tddGroup(1, "S1")}\n${tddGroup(2, "none — review finding")}`)
    const good = "command: x\nexit code: 1\noutput (last 40 lines):\nfail\n"
    const base = { "spec.md": specText({ requirements: scenarioBlock("S1") }), ".devflow/tasks.md": tasks }

    it.each([
      ["an empty file", ""],
      ["a file without a command line", "exit code: 1\n"],
      ["a file with exit code 0", "command: x\nexit code: 0\n"],
    ])("check rejects %s as evidence", (_label, content) => {
      const root = makeRoot({ ...base, ".devflow/red/1.txt": content, ".devflow/red/2.txt": good })
      const result = gate(root, ["check", "spec.md"])
      expect(result.status).not.toBe(0)
      expect(result.output).toContain("group 1 has invalid red evidence")
    })

    it("accepts evidence written by red, and still needs it for a Scenarios: none group", () => {
      const root = makeRoot(base)
      expect(gate(root, ["red", "1", "--", "sh", "-c", "echo 'a b'; exit 1"]).status).toBe(0)
      const missing = gate(root, ["check", "spec.md"])
      expect(missing.output).toContain("group 2 has no red evidence")
      expect(gate(root, ["red", "2", "--", "false"]).status).toBe(0)
      const ok = gate(root, ["check", "spec.md"])
      expect(ok.output).toContain("check: ok")
    })

    it("records each command argument on its own line", () => {
      const root = makeRoot({})
      gate(root, ["red", "1", "--", "sh", "-c", "exit 1"])
      const evidence = readFileSync(join(root, ".devflow", "red", "1.txt"), "utf8")
      expect(evidence).toContain("argument: sh\nargument: -c\nargument: exit 1\n")
    })
  })

  it("S12 prints the mapping line anchored to its own line", () => {
    const files = { "spec.md": ONE_SCENARIO_SPEC, ".devflow/tasks.md": tickAll(`# Tasks\n\n${tddGroup(1, "S1")}`), ".devflow/red/1.txt": VALID_EVIDENCE }
    expect(gate(makeRoot(files), ["check", "spec.md"]).output).toMatch(/^scenario S1: group 1$/m)
  })

  describe("edge cases", () => {
    it("S11 still names the group when .devflow/red/ exists but is empty", () => {
      const files = { "spec.md": ONE_SCENARIO_SPEC, ".devflow/tasks.md": tickAll(`# Tasks\n\n${tddGroup(1, "S1")}`) }
      const root = makeRoot(files)
      mkdirSync(join(root, ".devflow", "red"))
      expect(gate(root, ["check", "spec.md"]).output).toContain("group 1 has no red evidence")
    })

    it("fails inside check when the plan is invalid", () => {
      const files = { "spec.md": specText({ omit: "Design" }), ".devflow/tasks.md": tickAll(`# Tasks\n\n${tddGroup(1, "S1")}`), ".devflow/red/1.txt": VALID_EVIDENCE }
      const result = gate(makeRoot(files), ["check", "spec.md"])
      expect(result.status).not.toBe(0)
      expect(result.output).toContain("spec is missing heading: ## Design")
      expect(result.output).toContain("check: FAIL")
    })
  })
})

describe("devflow-gate gate-wide", () => {
  describe("untrusted text is printed verbatim", () => {
    it("red records a command and arguments containing backslash escapes verbatim, and check accepts them", () => {
      const root = makeRoot({ "spec.md": ONE_SCENARIO_SPEC, ".devflow/tasks.md": tickAll(`# Tasks\n\n${tddGroup(1, "S1")}`) })
      const result = gate(root, ["red", "1", "--", "sh", "-c", "exit 1", "x\\cy\\nz"])
      expect(result.status).toBe(0)
      const evidence = readFileSync(join(root, ".devflow", "red", "1.txt"), "utf8")
      expect(evidence).toContain("command: sh -c exit 1 x\\cy\\nz\n")
      expect(evidence).toContain("argument: x\\cy\\nz\n")
      expect(evidence).toMatch(/^exit code: 1$/m)
      expect(gate(root, ["check", "spec.md"]).output).toContain("check: ok")
    })

    it("prints a skip reason and a none reason containing backslashes whole", () => {
      const skipped = "## 2. Prose <!-- TDD skipped: see C:\\new\\cdir -->\nScenarios: S2\n\n- [x] 2.1 w\n"
      const none = tddGroup(3, "none — keeps \\n and \\c").replace(/\[ \]/g, "[x]")
      const tasks = tickAll(`# Tasks\n\n${tddGroup(1, "S1")}\n${skipped}\n${none}`)
      const files = { "spec.md": specText(), ".devflow/tasks.md": tasks, ".devflow/red/1.txt": VALID_EVIDENCE, ".devflow/red/3.txt": VALID_EVIDENCE }
      const result = gate(makeRoot(files), ["check", "spec.md"])
      expect(result.output).toContain("without unit test: S2 (group 2: see C:\\new\\cdir)")
      expect(result.output).toContain("skipped group 2: see C:\\new\\cdir")
      expect(result.output).toContain("no scenario group 3: keeps \\n and \\c")
    })
  })

  describe("the none word", () => {
    const run = (line: string) => {
      const tasks = tickAll(`# Tasks\n\n${tddGroup(1, line)}\n${tddGroup(2, "S1")}`)
      const files = { "spec.md": ONE_SCENARIO_SPEC, ".devflow/tasks.md": tasks, ".devflow/red/1.txt": VALID_EVIDENCE, ".devflow/red/2.txt": VALID_EVIDENCE }
      return gate(makeRoot(files), ["check", "spec.md"])
    }

    it("does not treat 'nonexistent S1' as a none line", () => {
      const result = run("nonexistent S1")
      expect(result.output).not.toContain("no scenario group 1")
      expect(result.output).toMatch(/^scenario S1: group 1, group 2$/m)
    })

    it.each(["none - reason", "none — reason", "none: reason"])("still treats %j as a none line", (line) => {
      const result = run(line)
      expect(result.output).toContain("no scenario group 1: reason")
      expect(result.output).toContain("check: ok")
    })

    it.each(["none", "none."])("still reports %j as a none line without a reason", (line) => {
      expect(run(line).output).toContain("group 1 has Scenarios: none without a reason")
    })
  })

  describe("without grep", () => {
    const env = () => ({ PATH: restrictedPath(["grep"]) })
    const valid = tickAll(`# Tasks\n\n${tddGroup(1, "S1")}\n${tddGroup(2, "S2")}`)

    it("check reports an unticked box and fails without printing ok", () => {
      const tasks = valid.replace("- [x] 2.3", "- [ ] 2.3")
      const files = { "spec.md": specText(), ".devflow/tasks.md": tasks, ".devflow/red/1.txt": VALID_EVIDENCE, ".devflow/red/2.txt": VALID_EVIDENCE }
      const result = gate(makeRoot(files), ["check", "spec.md"], env())
      expect(result.status).not.toBe(0)
      expect(result.output).toContain("unticked: 2.3")
      expect(result.output).not.toMatch(/ok$/m)
    })

    it("plan reports an unmapped scenario and fails without printing ok", () => {
      const requirements = ["S1", "S2", "S3"].map(scenarioBlock).join("\n")
      const files = { "spec.md": specText({ requirements }), ".devflow/tasks.md": valid }
      const result = gate(makeRoot(files), ["plan", "spec.md"], env())
      expect(result.status).not.toBe(0)
      expect(result.output).toContain("ERROR: scenario S3 is not mapped by any group")
      expect(result.output).not.toMatch(/ok$/m)
    })
  })

  describe("tooling", () => {
    it("S13 runs plan, red and check with no jq, node or python on PATH", () => {
      const env = { PATH: restrictedPath() }
      const tasks = tickAll(`# Tasks\n\n${tddGroup(1, "S1")}\n${tddGroup(2, "S2")}`)
      const root = makeRoot({ "spec.md": specText(), ".devflow/tasks.md": tasks })

      expect(gate(root, ["plan", "spec.md"], env).status).toBe(0)
      expect(gate(root, ["red", "1", "--", "false"], env).status).toBe(0)
      expect(gate(root, ["red", "2", "--", "false"], env).status).toBe(0)
      expect(existsSync(join(root, ".devflow", "red", "1.txt"))).toBe(true)
      expect(existsSync(join(root, ".devflow", "red", "2.txt"))).toBe(true)
      const check = gate(root, ["check", "spec.md"], env)
      expect(check.output).toContain("check: ok")
      expect(check.status).toBe(0)
    })
  })
})
