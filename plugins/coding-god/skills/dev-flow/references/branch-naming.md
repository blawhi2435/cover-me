# Branch Naming

## Default rule

The brief names the branch and dev-flow creates it as given (Node 2). When dev-graph derives that name, it follows this rule, starting from the change name derived from the spec title (kebab-case, at most five words):

```
feat/<change-name>
```

Examples:
- change `dataset-group-assignment-schema-design` → `feat/dataset-group-assignment-schema-design`
- change `space-create-validations` → `feat/space-create-validations`

## Prefix selection

Use the prefix that matches the work type:
- `feat/` — new feature
- `fix/` — bug fix
- `refactor/` — internal restructuring with no behavior change
- `chore/` — tooling, deps, config

If unclear, default to `feat/`.

## Existing branch

If the branch already exists locally, append `-2`, `-3`, … until unique.
