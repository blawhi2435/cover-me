# Coding Standards and Best Practices

This document provides language-agnostic coding standards for AI-assisted development. Follow these guidelines when writing, reviewing, or refactoring code.

For language-specific examples and idioms, read the matching reference alongside this file:

- Go: `references/go.md`
- TypeScript: `references/typescript.md`

## Core Development Principles

### 1. Follow Project Architecture
Unless explicitly requested otherwise, all code changes should align with the existing project structure and architectural patterns.

### 2. Test-Driven Development (TDD)
Write tests first, then implementation. This is non-negotiable.

**Testing Requirements:**
- Unit tests must mock external dependencies:
  - Database connections
  - Redis/cache services
  - External API calls
  - Cross-layer dependencies (in clean architecture)
- Tests should be isolated and fast
- Each component should be testable independently

### 3. Error Handling
**Never swallow errors. Propagate with context. Validate only at boundaries.**

Guidelines:
- Every returned/thrown error must be checked or caught deliberately. Silencing failures (`_ = doThing()`, empty `catch {}`, floating promises, ignored return values) is forbidden.
- Wrap errors with context as they cross layers so the chain reads as a story of what failed and why. The exact mechanism is language-specific (see language references).
- Handle errors at the level that can actually decide what to do — usually the handler/entrypoint, not deep in helpers. Lower layers propagate; upper layers translate to user-visible responses, retries, or logs.
- Validate inputs at system boundaries (HTTP handlers, CLI args, message consumers, external API responses, deserialized payloads). Trust internal callers — do not re-validate the same value at every layer.
- Do not add defensive checks for conditions that cannot happen given the type system or upstream guarantees. Dead error paths are noise.
- Fail loudly in unrecoverable states. Do not return zero values, empty collections, `nil`/`null`/`undefined`, or default fallbacks to paper over a real failure.

## Code Quality Principles

### 1. Readability First
**Code is read more than it is written.**

Guidelines:
- Use clear, descriptive variable and function names
- Prefer self-documenting code over comments
- Maintain consistent formatting throughout the codebase
- Follow the language's idiomatic naming conventions (e.g., camelCase, PascalCase, snake_case)

### 2. KISS (Keep It Simple, Stupid)
**Choose the simplest solution that works.**

Guidelines:
- Avoid over-engineering
- No premature optimization
- Prioritize code that is easy to understand over "clever" code
- If you can't explain it simply, it's probably too complex

### 3. DRY (Don't Repeat Yourself)
**Every piece of knowledge should have a single, authoritative representation.**

Guidelines:
- Extract common logic into reusable functions
- Create shared utilities and components
- Avoid copy-paste programming
- If you find yourself writing similar code twice, refactor

### 4. YAGNI (You Aren't Gonna Need It)
**Don't build features before they're actually needed.**

Guidelines:
- Avoid speculative generality
- Add complexity only when requirements demand it
- Start with simple implementations
- Refactor to add flexibility when needed, not before

## Code Smell Detection

Watch for these anti-patterns and refactor when detected. Concrete code examples live in the language-specific references.

### 1. Long Functions
Functions should rarely exceed 50 lines. If they do, break them into smaller, focused functions.

### 2. Deep Nesting
Avoid nesting beyond 3-4 levels. Use early returns and guard clauses instead of pyramid `if`s.

### 3. Magic Numbers
Never use unexplained numeric literals. Always use named constants with names that explain intent (`MaxRetries`, not `THREE`).

### 4. Swallowed Errors
Any error that is caught and discarded, ignored return value, or floating async result is a code smell. Either handle it meaningfully or propagate it.

## Summary

**Remember: Code quality is not negotiable.**

Clear, maintainable code enables:
- Rapid development
- Confident refactoring
- Easier debugging
- Better collaboration
- Reduced technical debt

### When in Doubt

1. **Simplicity wins** - Choose the clearer solution
2. **Ask questions** - Clarify requirements before coding
3. **Refactor fearlessly** - Tests give you confidence
4. **Review ruthlessly** - Question every line's necessity

---

*These principles apply to all programming languages. For language-specific examples and idioms (error wrapping, null handling, async patterns, framework conventions), read the matching reference file.*
