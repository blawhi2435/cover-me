# Spec format

This is the format of the child spec that dev-graph writes at G3 and dev-flow receives in the dispatch brief; dev-flow's gate script (`scripts/devflow-gate.sh plan` and `check`) enforces it. Nothing else reads the spec as data, so keep to the shapes below exactly.

## Headings

Six second-level headings, in this order, each exactly as written:

1. `## Problem` — what is wrong or missing today, and for whom.
2. `## Goal` — what is true when the work is done; list non-goals here.
3. `## Design` — the approach, the decisions made and why, anti-goals, and findings from recon.
4. `## Affected files` — the files or modules expected to change, one bullet each.
5. `## Requirements` — the behavior, as scenarios (below).
6. `## References` — design or product inputs the work must match (mockups, API contracts, schemas, links), or, when there are none, exactly the line `- [ ] (none — purely backend/internal)`. Each reference is one line `- [ ] Mockup: …`, `- [ ] Reference component: …`, `- [ ] Design tokens: …` or `- [ ] API contract / schema: …`.

Other headings may appear inside these sections (use `###` and deeper). Lines inside fenced code blocks are ignored by the script, so a heading, scenario or checkbox shown as an example inside a fence never counts. Fences follow CommonMark: a run of three or more backticks or tildes, indented at most three spaces, opens one (a backtick run whose info string contains a backtick is plain text), and only a run of the same character, at least as long, indented at most three spaces and followed by nothing else, closes it; a marker indented four or more spaces, or with a tab, is ordinary text. A fence indented one to three spaces belongs to a list item: keep its content indented the same way, because a line starting in column 0 ends it and the fence then counts as unclosed (to show a ``` example, wrap it in a longer fence). A fence that is never closed is an error, because it would hide everything after it.

## Requirements

Plain markdown. No delta format, no `ADDED` / `MODIFIED` headings, no wrapping fence.

```
### Requirement: <name>
<statement using SHALL / MUST>

#### Scenario S1: <name>
- **WHEN** <condition>
- **THEN** <outcome>
```

- A scenario id is `S` followed by a number (`S1`, `S12`). Ids are unique within the spec. They are the keys the gate uses to map scenarios to task groups and to red evidence.
- Each scenario states one observable WHEN and one observable THEN. A reviewer later checks that a test exercises the WHEN and asserts the THEN, so write them so a test can.
- A change with no behavior change (pure refactor, tooling, config, docs) writes the single line `No behavior change.` under `## Requirements` and has no scenarios.

## Scenarios that cannot be unit-tested

Some scenarios describe prose or a visual result and cannot have a unit test. Keep them in the spec; the task file maps them with a TDD-skipped group whose reason says how they are verified instead. The gate lists them, and a reviewer judges whether the reason is true.
