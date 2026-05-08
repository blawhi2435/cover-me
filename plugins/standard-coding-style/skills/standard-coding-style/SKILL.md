---
name: standard-coding-style
description: Enforce coding standards and best practices during AI-assisted development. Use when writing new code, reviewing existing code, refactoring code, or implementing features in any supported language (currently Go and TypeScript; principles apply to all). Ensures adherence to TDD, KISS, DRY, YAGNI, error-handling discipline, and detects common code smells like long functions, deep nesting, and magic numbers. Apply to all programming tasks involving code creation or modification.
---

# Standard Coding Style

Enforce coding standards and best practices for AI-assisted development.

## Quick Reference

**Core Principles:**
1. **TDD** - Write tests first, then implementation
2. **KISS** - Keep it simple
3. **DRY** - Don't repeat yourself
4. **YAGNI** - You aren't gonna need it
5. **Readability First** - Code is read more than written
6. **Error Handling** - Never swallow errors; wrap with context; validate at boundaries only

**Code Smells to Avoid:**
- Functions > 50 lines
- Nesting > 3-4 levels
- Magic numbers without constants
- Swallowed/ignored errors, or errors propagated without context

## Workflow

When writing, reviewing, or refactoring code:

### 1. Before Writing Code

**Read the detailed standards:**
```
references/coding-standards.md           # language-agnostic principles (always read)
references/<language>.md                 # language-specific examples and idioms
```

Detect the language from the files you are about to touch and read the matching reference. Available:

- `references/go.md` — Go examples + Go Clean Architecture (handler/service/repository)
- `references/typescript.md` — TS strictness, `any`/`unknown`, async error handling, React notes

If the project mixes languages, read every relevant reference. If a language has no reference yet, apply the language-agnostic principles and follow existing project conventions.

**Key checks:**
- ✅ Tests written first (TDD)
- ✅ External dependencies mocked
- ✅ Following existing architecture
- ✅ Clear, descriptive naming
- ✅ Simplest solution chosen

### 2. During Implementation

**Apply principles actively:**
- Extract repeated code → DRY
- Split long functions (>50 lines) → smaller functions
- Use early returns → avoid deep nesting
- Name constants → no magic numbers
- Check every error, wrap with context → no silent failures
- Question complexity → KISS

### 3. After Writing Code

**Self-review checklist:**
- [ ] Tests pass and cover key paths
- [ ] Functions < 50 lines
- [ ] Nesting < 4 levels
- [ ] No magic numbers
- [ ] No repeated logic
- [ ] Every error checked and wrapped with context; no silent swallows
- [ ] Input validation only at system boundaries
- [ ] Clear variable/function names
- [ ] No premature optimization

## Detailed Standards

For complete guidelines, read in this order:

1. `references/coding-standards.md` — language-agnostic principles (TDD, KISS/DRY/YAGNI, error handling, code smells)
2. `references/<language>.md` — concrete examples and language-specific idioms for the file(s) you are touching

## When in Doubt

1. **Simplicity wins** - Choose the clearer solution
2. **Ask questions** - Clarify requirements before coding
3. **Refactor fearlessly** - Tests give you confidence
4. **Review ruthlessly** - Question every line's necessity
