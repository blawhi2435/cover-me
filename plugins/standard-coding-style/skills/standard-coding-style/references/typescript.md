# TypeScript-specific Coding Standards

Read this alongside `coding-standards.md` when working on TypeScript code.

## Compiler & tooling baseline

- `strict: true` in `tsconfig.json` — non-negotiable. This implies `strictNullChecks`, `noImplicitAny`, `strictFunctionTypes`, etc.
- Enable `noUncheckedIndexedAccess` so `arr[i]` is `T | undefined` and forces explicit handling.
- Enable `noFallthroughCasesInSwitch` and `noImplicitReturns`.
- Run the project's linter (ESLint/Biome) and formatter (Prettier/Biome) before committing. The skill does not replace these — they catch a different class of issue.

## Type discipline

### Avoid `any`; prefer `unknown` at boundaries

```ts
// ❌ BAD: any disables type checking everywhere it spreads
function parseConfig(raw: any) {
  return raw.server.port; // could throw at runtime, no error here
}

// ✅ GOOD: unknown forces narrowing before use
function parseConfig(raw: unknown): number {
  if (
    typeof raw === "object" && raw !== null &&
    "server" in raw && typeof raw.server === "object" && raw.server !== null &&
    "port" in raw.server && typeof raw.server.port === "number"
  ) {
    return raw.server.port;
  }
  throw new Error("invalid config shape");
}
```

For non-trivial shapes, use a schema validator (Zod, Valibot, ArkType) at the boundary instead of hand-rolled guards.

### Don't use `as` to lie

`as` is an assertion, not a check. Reserve it for cases the compiler genuinely can't see (e.g. branded IDs after validation). Never `as SomeType` to silence an error you don't understand — narrow with a type guard or fix the type.

### Discriminated unions + exhaustive `switch`

```ts
type Event =
  | { kind: "click"; x: number; y: number }
  | { kind: "key"; code: string };

function handle(e: Event): string {
  switch (e.kind) {
    case "click": return `click ${e.x},${e.y}`;
    case "key":   return `key ${e.code}`;
    default: {
      const _exhaustive: never = e; // compile error if a variant is added
      throw new Error(`unhandled: ${JSON.stringify(_exhaustive)}`);
    }
  }
}
```

## Null & undefined

- `strictNullChecks` is mandatory. Treat `T | undefined` as a real case to handle, not noise.
- Use optional chaining `?.` and nullish coalescing `??` for *reading* uncertain values, not for swallowing errors. `await load()?.thing` hides whether `load()` failed.
- Prefer `T | undefined` over `T | null` unless interop with an API forces `null`. Pick one and stay consistent within a module.

## Async error handling

- Every `Promise` must be `await`-ed or have `.catch()`. Floating promises are silent failures — enable ESLint's `no-floating-promises`.
- `async` functions reject with whatever you `throw`. Always `throw new Error(...)` (or a subclass), never strings or plain objects — only `Error` instances carry stack traces.
- Wrap and re-throw to preserve context using the `cause` option:

```ts
try {
  return await loadUser(id);
} catch (err) {
  throw new Error(`charge: load user ${id}`, { cause: err });
}
```

- `Promise.all` rejects on the first failure; if you need partial success, use `Promise.allSettled` and inspect each result. Don't just `.catch(() => undefined)` to make types compile.

### `Result<T, E>` pattern — use sparingly

For domain errors that callers *must* branch on (e.g. validation outcomes), a `Result` type can be clearer than `throw`. Don't apply it everywhere — exceptions are still right for unexpected failures and infrastructure errors. Pick one style per module and document why.

## Immutability & data shape

- Default to `const` and `readonly`. Use `as const` for literal tuples/objects you don't mutate.
- Don't mutate function parameters. Return a new value.
- Prefer `ReadonlyArray<T>` / `readonly T[]` in public APIs to prevent caller mutation surprises.

## React / frontend specifics

If the project uses React:

- Components are `function` declarations, not arrow-assigned consts, unless the project clearly does the opposite.
- Hook dependency arrays must be exhaustive — let the linter enforce this; don't suppress it without a comment explaining why.
- Effects with cleanup must return a function. Async work inside `useEffect` goes in an inner async function — never `useEffect(async () => ...)`.
- Don't store derived state. Compute it during render or with `useMemo` only when measured to matter.

## Universal code smells in TypeScript

These mirror the language-agnostic smells in `coding-standards.md` with TS examples.

### Long Functions

```ts
// ❌ BAD: one function doing fetch + validate + transform + persist
async function importOrders(raw: unknown): Promise<void> {
  // 80+ lines: parse, validate every field, map shapes, retry, write to DB
}

// ✅ GOOD: split into focused steps
async function importOrders(raw: unknown): Promise<void> {
  const parsed = parseOrders(raw);
  const valid = validateOrders(parsed);
  await persistOrders(valid);
}
```

### Deep Nesting → Early Returns

```ts
// ❌ BAD
function priceFor(user: User | null, item: Item | null): number {
  if (user) {
    if (user.active) {
      if (item) {
        if (item.inStock) {
          return item.price * (user.isVip ? 0.8 : 1);
        }
      }
    }
  }
  throw new Error("invalid");
}

// ✅ GOOD: guard clauses
function priceFor(user: User | null, item: Item | null): number {
  if (!user) throw new Error("user missing");
  if (!user.active) throw new Error("user inactive");
  if (!item) throw new Error("item missing");
  if (!item.inStock) throw new Error("out of stock");
  return item.price * (user.isVip ? 0.8 : 1);
}
```

### Magic Numbers

```ts
// ❌ BAD
async function retry(fn: () => Promise<void>) {
  for (let i = 0; i < 3; i++) {
    try { return await fn(); } catch { await sleep(500); }
  }
}

// ✅ GOOD
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 500;

async function retry(fn: () => Promise<void>) {
  for (let i = 0; i < MAX_RETRIES; i++) {
    try { return await fn(); } catch { await sleep(RETRY_DELAY_MS); }
  }
}
```

## What still applies from the main standards

All language-agnostic principles in `coding-standards.md` apply: TDD, KISS, DRY, YAGNI, Readability First, Error Handling (never swallow, wrap with context, validate at boundaries), function length, nesting depth, magic numbers. The TS-specific items above sit *on top of* those, not instead of them.
