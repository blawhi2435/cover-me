# Branch Naming

## Default rule

Derive from the opsx change name produced in Node 3:

```
feat/<opsx-change-name>
```

Examples:
- opsx change `dataset-group-assignment-schema-design` → `feat/dataset-group-assignment-schema-design`
- opsx change `space-create-validations` → `feat/space-create-validations`

## Prefix selection

Use the prefix that matches the work type:
- `feat/` — new feature
- `fix/` — bug fix
- `refactor/` — internal restructuring with no behavior change
- `chore/` — tooling, deps, config

If unclear, default to `feat/`.

## Override

After deriving, present the suggested name and ask:
> "Branch name: `<derived>`. Override? (enter to accept, or type a new name)"

Accept any non-empty user input as the override. Do not validate against any pattern.

## Existing branch

If the branch already exists locally, append `-2`, `-3`, … until unique.
