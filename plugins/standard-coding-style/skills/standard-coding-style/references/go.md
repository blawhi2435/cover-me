# Go-specific Coding Standards

Read this alongside `coding-standards.md` when working on Go code.

## Examples

### Long Functions

```go
// ❌ BAD: Function > 50 lines
func ProcessMarketData(data []byte) error {
    // 100+ lines of validation, transformation, and storage
    return nil
}

// ✅ GOOD: Split into smaller, focused functions
func ProcessMarketData(data []byte) error {
    validated, err := validateData(data)
    if err != nil {
        return err
    }
    transformed := transformData(validated)
    return saveData(transformed)
}
```

### Deep Nesting → Early Returns

```go
// ❌ BAD: 5+ levels of nesting
func ProcessRequest(user *User, market *Market) error {
    if user != nil {
        if user.IsAdmin {
            if market != nil {
                if market.IsActive {
                    if hasPermission(user, market) {
                        return nil
                    }
                }
            }
        }
    }
    return errors.New("invalid request")
}

// ✅ GOOD: Guard clauses
func ProcessRequest(user *User, market *Market) error {
    if user == nil {
        return errors.New("user is nil")
    }
    if !user.IsAdmin {
        return errors.New("user is not admin")
    }
    if market == nil {
        return errors.New("market is nil")
    }
    if !market.IsActive {
        return errors.New("market is not active")
    }
    if !hasPermission(user, market) {
        return errors.New("permission denied")
    }
    return nil
}
```

### Magic Numbers

```go
// ❌ BAD
func RetryOperation() {
    if retryCount > 3 {
        return
    }
    time.Sleep(500 * time.Millisecond)
}

// ✅ GOOD
const (
    MaxRetries   = 3
    RetryDelayMs = 500
)

func RetryOperation() {
    if retryCount > MaxRetries {
        return
    }
    time.Sleep(RetryDelayMs * time.Millisecond)
}
```

### Error Handling

- Always check returned `error`. Never `_ = doThing()` to silence it.
- Wrap with context using `fmt.Errorf("...: %w", err)` so callers can `errors.Is` / `errors.As` up the chain.
- Sentinel errors (`var ErrNotFound = errors.New(...)`) for cases callers must distinguish; otherwise plain wrapped errors.
- Don't return zero values to mask failures — `return nil, fmt.Errorf(...)` instead of `return User{}, nil`.

```go
// ❌ BAD: swallowed
data, _ := loadUser(id)
return data

// ❌ BAD: re-validating an internal invariant
func (s *Service) Charge(user *User, amount int) error {
    if user == nil { // upstream already guaranteed non-nil
        return errors.New("user is nil")
    }
    ...
}

// ✅ GOOD: checked, wrapped, propagated
data, err := loadUser(id)
if err != nil {
    return nil, fmt.Errorf("charge: load user %s: %w", id, err)
}
```

## Go Clean Architecture (Layered API Servers)

When implementing handler → service → repository layers:

### Data passing between layers

- **Use `domain` structs** for any structured data crossing layer boundaries. Never create custom input/output structs (e.g. `CreateXxxInput`, `ListXxxInput`) in the service or handler layer. If a struct is needed, use or extend a type in `common/domain/`.
- **Simple scalars are fine** — IDs, names, status strings can be passed as individual function arguments.
- **No custom filter structs** — filter fields (e.g. `nodeID`, `name`, `status`) are passed as separate primitives alongside pagination params. Never bundle them into a one-off `XxxListFilter` struct in the interfaces or service layer.

### Pagination

- Always use the project's shared pagination type (e.g. `params.ListQueryParams`) — never pass `limit`/`offset` as loose `int` arguments across layers.
- Viewmodel request structs must implement a `ToListQueryParams()` converter method.
- Handler calls `request.ToListQueryParams()` and passes the result down to service → repository unchanged.

### Reference pattern (list API)

```
Handler:    h.Service.ListXxx(ctx, filterField string, request.ToListQueryParams())
Service:    s.XxxRepository.ListXxx(ctx, filterField string, queryParams)
Repository: func ListXxx(ctx, filterField string, queryParams params.ListQueryParams)
```

Before coding a new list endpoint, read an existing one (e.g. `QueryUsers`, `QueryGroups`) to confirm the exact pattern used in the project.
