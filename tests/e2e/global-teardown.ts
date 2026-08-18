import { createClient } from "@supabase/supabase-js";

// QA sweep 2026-08-18 — the e2e suite runs against the shared dev Supabase
// project and had never cleaned up after itself. By this date dev held 1443
// experiment rows, 1414 of them created by these tests, and the dashboard's
// "Recent experiments" panel was six-for-six test fixtures. That is not just
// untidy: it buries the real records, and every abandoned fixture drags
// evidence chunks, comments and jobs along behind it.
//
// Scoped by OWNER, not by name. Every spec signs in as the one dedicated
// account (tests/e2e/helpers.ts -> E2E_TEST_EMAIL, created by
// scripts/create-e2e-user.ts), so "everything that account owns" is exactly
// the set this suite created. Audited on dev before writing this: of 1443
// experiments, zero owned by the e2e account looked like real data, and zero
// real-account rows were named like fixtures. A name prefix such as "E2E %"
// would be strictly worse -- it depends on every future spec remembering the
// convention, and it would happily match a real record someone titled badly.
//
// Deliberately inert unless E2E_CLEANUP_ENABLED is set, so running the suite
// by hand against an environment you care about never quietly deletes
// anything. CI opts in explicitly (.github/workflows/ci.yml).
const PROD_PROJECT_REF = "iazuubcyxneavrahjgww";

export default async function globalTeardown(): Promise<void> {
  if (process.env.E2E_CLEANUP_ENABLED !== "true") return;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const email = process.env.E2E_TEST_EMAIL;
  if (!url || !serviceKey || !email) {
    console.warn("[e2e-teardown] cleanup enabled but credentials missing — skipping.");
    return;
  }

  // Belt and braces: this deletes rows, so refuse outright to point it at
  // production, whatever the rest of the environment claims.
  if (url.includes(PROD_PROJECT_REF)) {
    throw new Error("[e2e-teardown] refusing to run against the production project.");
  }

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  // Resolve the account by email rather than trusting an id from anywhere
  // else — the whole safety argument rests on deleting only this user's rows.
  const { data: userList, error: listError } = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (listError) {
    console.warn("[e2e-teardown] could not list users — skipping.", listError.message);
    return;
  }
  const e2eUser = userList.users.find((u) => u.email === email);
  if (!e2eUser) {
    console.warn(`[e2e-teardown] no account for ${email} — skipping.`);
    return;
  }

  const { data: owned, error: selectError } = await admin
    .from("experiments")
    .select("id")
    .eq("owner_id", e2eUser.id);
  if (selectError) {
    console.warn("[e2e-teardown] could not list e2e experiments — skipping.", selectError.message);
    return;
  }
  const ids = (owned ?? []).map((e) => e.id);
  if (ids.length === 0) return;

  // evidence_chunks references its source polymorphically (source_type/
  // source_id) with no foreign key, so deleting an experiment does NOT take
  // its chunks with it — that is how dev accumulated failed chunks belonging
  // to experiments that no longer exist. Clear them first, while the
  // experiment ids are still known.
  for (let i = 0; i < ids.length; i += 100) {
    const batch = ids.slice(i, i + 100);
    const { error } = await admin
      .from("evidence_chunks")
      .delete()
      .in("metadata->>experiment_id", batch);
    if (error) console.warn("[e2e-teardown] chunk cleanup failed", error.message);
  }

  // Everything else (files, provenance, samples, comments, jobs) hangs off
  // experiments with ON DELETE CASCADE and goes with them.
  for (let i = 0; i < ids.length; i += 100) {
    const batch = ids.slice(i, i + 100);
    const { error } = await admin.from("experiments").delete().in("id", batch);
    if (error) console.warn("[e2e-teardown] experiment cleanup failed", error.message);
  }

  console.log(`[e2e-teardown] removed ${ids.length} experiments created by ${email}.`);
}
