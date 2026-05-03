---
description: Run the TAV-AIP verification loop and report results.
---

Execute, in this order, stopping at the first failure:

1. **Lint** — `npm run lint`
2. **Typecheck** — `npm run typecheck`
3. **Unit tests** — `npm test` (Vitest)
4. **Integration tests** — `npm run test:int`, but only if `git diff --name-only` shows any path under `src/persistence/`, `src/valuation/`, `src/sources/`, or `supabase/migrations/`.

For each step, report:
- The exact command run
- Exit code
- Last 20 lines of output **on failure only**

End with one of:

```
VERIFY: PASS — lint ✓ typecheck ✓ unit ✓ integ ✓|skipped
```

```
VERIFY: FAIL at <step>
ROOT CAUSE: <one sentence>
PROPOSED FIX: <minimal change, no edits yet>
```

Do not edit code in this command. If the user wants the fix applied, they'll say so.
