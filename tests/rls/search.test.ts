// T1.6 full-text search. Only runs against a LOCAL Supabase instance (see
// experiments.rls.test.ts for why this is skipped outside the CI `rls` job).
//
// Proves D1's core claim directly at the Postgres level: jsonb_to_tsvector
// over sample_matrix indexes a per-sample legacy_code/vial_label/sample_id
// string, so §4.1-§4.3's "legacy codes are search keys" is real — not just
// that search_vector exists, but that a query naming only the legacy code
// (never mentioned anywhere else on the row) actually finds the experiment,
// and an unrelated code does not.
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestWorkspace } from "./helpers";

const URL = process.env.SUPABASE_LOCAL_URL;
const ANON_KEY = process.env.SUPABASE_LOCAL_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_LOCAL_SERVICE_ROLE_KEY;
const ready = !!URL && !!ANON_KEY && !!SERVICE_ROLE_KEY;

describe.skipIf(!ready)("full-text search over experiments (local Supabase)", () => {
  let admin: SupabaseClient;
  let userClient: SupabaseClient;
  let userId: string;
  let workspaceId: string;
  const experimentIds: string[] = [];

  beforeAll(async () => {
    admin = createClient(URL!, SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
    const password = randomUUID();
    const email = `search-${randomUUID()}@test.local`;
    const { data: user, error: errA } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (errA) throw errA;
    userId = user.user.id;

    userClient = createClient(URL!, ANON_KEY!, { auth: { persistSession: false } });
    const { error: signInErr } = await userClient.auth.signInWithPassword({ email, password });
    if (signInErr) throw signInErr;

    workspaceId = await createTestWorkspace(admin, [{ id: userId }]);
  });

  afterAll(async () => {
    if (experimentIds.length) await admin.from("experiments").delete().in("id", experimentIds);
  });

  it("finds an experiment by a legacy_code buried in sample_matrix, and not by an unrelated code", async () => {
    const legacyCode = `NMA${randomUUID().slice(0, 6)}`;
    const id = `EXP-SEARCH-${randomUUID().slice(0, 8)}`;
    experimentIds.push(id);

    const { error: insertErr } = await userClient.from("experiments").insert({
      id,
      owner_id: userId,
      name: "Full-text search legacy-code test",
      status: "draft",
      workspace_id: workspaceId,
      sample_matrix: [
        {
          sample_id: "", vial_label: "", legacy_code: legacyCode, batch: "B01", replicate: "R1",
          sample_type: "", component_1: "", amount_1: "", component_2: "", amount_2: "",
          ratio: "", initial_volume: "", reaction_mode: "", temperature: "", duration: "",
          atmosphere: "", treatment: "", planned_analysis: "", status: "",
        },
      ],
    });
    expect(insertErr).toBeNull();

    const { data: found, error: findErr } = await userClient
      .from("experiments")
      .select("id")
      .textSearch("search_vector", legacyCode, { type: "websearch", config: "english" });
    expect(findErr).toBeNull();
    expect((found ?? []).map((r) => r.id)).toContain(id);

    const { data: notFound } = await userClient
      .from("experiments")
      .select("id")
      .textSearch("search_vector", "totally-unrelated-code-xyz", { type: "websearch", config: "english" });
    expect((notFound ?? []).map((r) => r.id)).not.toContain(id);
  });
});
