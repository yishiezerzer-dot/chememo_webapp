---
name: new-migration
description: Create a Supabase migration and carry it through the full sequence — timestamped SQL, RLS review, db push, types:gen, verify. Use when adding or altering a table, column, policy, index, trigger or function.
disable-model-invocation: true
---

# New migration

The migration flow has forgettable tail steps. Skipping `types:gen` does not fail
anything immediately — it makes the generated types silently disagree with the schema
until something breaks at runtime. Run the whole sequence.

## 1. Write the SQL

File: `supabase/migrations/<YYYYMMDDHHMMSS>_<snake_case_description>.sql`

Timestamp must sort after the current last migration:

```bash
ls -1 supabase/migrations/ | tail -3
date -u +%Y%m%d%H%M%S
```

Match the conventions already in the directory:

- `to authenticated` on every policy
- `is_workspace_member/writer/admin(workspace_id, auth.uid())` for scoping
- names: `<table>_read`, `<table>_insert_own`, `<table>_update_own`, `<table>_delete_own`
- `alter table <t> enable row level security;` on every new table — without it the
  table is readable by any authenticated user no matter what policies follow
- comment any deliberate omission, especially a table with no authenticated write
  policy because writes are machine-generated

→ **verify**: the file exists, sorts last, and every new table has RLS enabled.

## 2. Review the policies

`tests/rls/` does not run on this machine — it is `skipIf`-gated on `SUPABASE_LOCAL_URL`,
which needs Docker. CI's `rls` job is the only place it executes, so a local `npm test`
proves nothing about RLS.

Use the `rls-policy-reviewer` agent on the new file before pushing.

→ **verify**: reviewer reports no high-severity finding, or findings are addressed.

## 3. Apply it

```bash
supabase db push
```

→ **verify**: command succeeds and reports the migration applied.

## 4. Regenerate types — do not skip

```bash
npm run types:gen
```

This rewrites `lib/database.types.ts`, which `lib/types.ts` derives every table type
from. It is what turns a renamed column into a compile error instead of silent drift.

A `PreToolUse` hook blocks hand-editing that file; this command is the only correct way
to change it.

→ **verify**: `git diff --stat lib/database.types.ts` shows the expected change (or no
change, if the migration altered nothing the types cover).

## 5. Typecheck

```bash
npm run typecheck
```

New type errors here are the point of step 4 — they are the drift being caught. Fix the
call sites; do not edit the generated file.

→ **verify**: `tsc --noEmit` clean.

## 6. Full gate

```bash
/check
```

Runs typecheck, lint, test and build — the same four CI runs, in order.

→ **verify**: all four pass.

## 7. Vault sync

Per AGENTS.md, log the schema change to the ChemMemo vault and update any affected spec
in `C:\Claude_code_projects\ChemMemo\Specs\`. The `obsidian-vault-sync` skill covers it.

→ **verify**: session logged, `ChemMemo.md` frontmatter dates updated.

## Note

CI's `rls` job runs `supabase start` against a fresh Postgres and replays every
migration, so a SQL error anywhere in the directory fails CI. That step doubles as
migration validation — but the feedback takes a full push cycle, which is why steps 2
and 5 exist locally.
