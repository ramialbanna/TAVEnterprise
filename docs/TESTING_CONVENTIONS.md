# Testing Conventions

**Status:** Active. Decided 2026-05-07 during Phase F of the architecture pivot.

## Two test layouts coexist

| Layout | When to use | Discovery glob |
|---|---|---|
| **Co-located:** `src/**/__tests__/**/*.test.ts` | All NEW tests for source under `src/` (and the new intelligence Worker under `workers/`). | Added in Phase E. |
| **Centralized:** `test/**/*.test.ts` | Existing tests authored before 2026-05-07. New integration tests (`*.int.test.ts`). | Original convention. |

Both run under one `vitest run`. Vitest config in `vitest.config.ts`
includes both globs:

```typescript
include: [
  "test/**/*.test.ts",
  "src/**/__tests__/**/*.test.ts",
  "workers/**/__tests__/**/*.test.ts",  // added in Phase F.1
],
exclude: ["test/**/*.int.test.ts"],
```

Integration tests stay in `test/` with the `.int.test.ts` suffix and
run via `vitest.int.config.ts` (`npm run test:int`).

Live Supabase integration tests are opt-in. Set
`RUN_SUPABASE_INTEGRATION_TESTS=true` together with real
`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` values when you intend to
mutate the configured database. A local `.dev.vars` file alone is not enough
to run live integration tests.

## Why co-located for new code

- Faster to find — tests live next to the file they exercise.
- Refactoring a module moves its tests automatically (e.g. `git mv`).
- Imports are short relative paths (`../mmrMileage`), not deep
  cross-tree paths (`../../src/scoring/mmrMileage`).
- Consistent with the structure other recent TS projects use
  (Jest/Vitest convention).

## Why we are NOT migrating existing tests

The 16 existing tests in `/test/` work correctly. Migrating them would:

- Produce noisy diffs that obscure real changes in code review.
- Risk subtle behavior changes if mock paths or imports break.
- Add zero value — the centralized layout works fine for code that
  already lives there.

Migration would be busywork. We accept the dual layout indefinitely.

## Naming

- Filename: `<subject>.test.ts` co-located, OR
- `<subject>.test.ts` in `/test/` (the existing convention; some
  files use dot-separated subjects like `outcome.import.test.ts`).
- Integration: `<subject>.int.test.ts` — only in `/test/`.

## Imports inside test files

Co-located:
```typescript
import { thing } from "../mmrMileage";
```

Centralized:
```typescript
import { thing } from "../src/scoring/mmrMileage";
```

## Vitest globals

We use **explicit imports** of `describe`, `it`, `expect` from
`"vitest"` in every test file. We do NOT enable `globals: true`.
Reason: `verbatimModuleSyntax` is on in `tsconfig.json`, and explicit
imports document dependencies clearly.

## When in doubt

- **New file under `src/` or `workers/`?** → Co-located test in
  `__tests__/` next to it.
- **Touching an existing centralized test?** → Stay in `/test/`.
- **Integration test (real DB, real Manheim)?** → `/test/<subject>.int.test.ts`.
