---
description: Run the full CI gate locally (typecheck, lint, test, build) and report what failed
---

Run the same four checks CI runs, in the same order, from the repo root:

```bash
npm run typecheck && npm run lint && npm test && npm run build
```

Run it as a single background command and wait for it once — do not poll, and do not
run the steps as four separate calls.

Then report:

- **If everything passed:** say so in one line. Nothing else.
- **If something failed:** name the first failing step and quote the actual error output.
  Do not summarise it away — the exact compiler/eslint/vitest message is the useful part.
  Then fix it, and re-run only from the failing step onward.

Notes for interpreting the result:

- `npm test` discovers `tests/rls/` but silently **skips** it without a local Supabase
  (needs Docker, unavailable here). A green run says nothing about RLS policies — if this
  change touched `supabase/migrations/`, say so explicitly rather than reporting "all green".
- E2E (`npm run test:e2e`) is deliberately not in this gate: it builds and starts a production
  server and takes minutes. Run it separately when a change touches a user flow.
