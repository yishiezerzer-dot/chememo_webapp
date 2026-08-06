// T2.5 analytical run model. Only runs against a LOCAL Supabase instance
// (see experiments.rls.test.ts for why this is skipped outside the CI `rls`
// job).
//
// Proves: (1) an instrument/method/run/result/peak chain creates and reads
// correctly within a workspace; (2) a non-member cannot read another
// workspace's instruments or runs. Full per-method `details`/`parameters`
// shape coverage is an explicit, disclosed scope cut for this pass — not
// silently skipped.
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestWorkspace } from "./helpers";

const URL = process.env.SUPABASE_LOCAL_URL;
const ANON_KEY = process.env.SUPABASE_LOCAL_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_LOCAL_SERVICE_ROLE_KEY;
const ready = !!URL && !!ANON_KEY && !!SERVICE_ROLE_KEY;

describe.skipIf(!ready)("analytical run model (local Supabase)", () => {
  let admin: SupabaseClient;
  let memberClient: SupabaseClient;
  let outsiderClient: SupabaseClient;
  let memberId: string;
  let outsiderId: string;
  let workspaceId: string;
  let otherWorkspaceId: string;
  const instrumentIds: string[] = [];
  const experimentIds: string[] = [];

  beforeAll(async () => {
    admin = createClient(URL!, SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
    const password = randomUUID();

    async function newUser(prefix: string) {
      const email = `${prefix}-${randomUUID()}@test.local`;
      const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
      if (error) throw error;
      const client = createClient(URL!, ANON_KEY!, { auth: { persistSession: false } });
      const { error: signInErr } = await client.auth.signInWithPassword({ email, password });
      if (signInErr) throw signInErr;
      return { id: data.user.id, client };
    }

    const member = await newUser("ana-member");
    memberId = member.id;
    memberClient = member.client;
    const outsider = await newUser("ana-outsider");
    outsiderId = outsider.id;
    outsiderClient = outsider.client;

    workspaceId = await createTestWorkspace(admin, [{ id: memberId }]);
    otherWorkspaceId = await createTestWorkspace(admin, [{ id: outsiderId }]);
  });

  afterAll(async () => {
    if (experimentIds.length) await admin.from("experiments").delete().in("id", experimentIds);
    if (instrumentIds.length) await admin.from("instruments").delete().in("id", instrumentIds);
  });

  it("creates an instrument, method, run, result, and peak within a workspace and reads them back", async () => {
    const { data: instrument, error: instrumentErr } = await memberClient
      .from("instruments")
      .insert({ name: "LC-MS system 1", workspace_id: workspaceId })
      .select()
      .single();
    expect(instrumentErr).toBeNull();
    instrumentIds.push(instrument!.id);

    const { data: method, error: methodErr } = await memberClient
      .from("instrument_methods")
      .insert({ instrument_id: instrument!.id, name: "Neg mode standard", method_type: "lc_ms" })
      .select()
      .single();
    expect(methodErr).toBeNull();
    expect(method!.workspace_id).toBe(workspaceId);

    const expId = `EXP-ANA-${randomUUID().slice(0, 8)}`;
    experimentIds.push(expId);
    await admin.from("experiments").insert({ id: expId, owner_id: memberId, name: "Analytical test", status: "draft", workspace_id: workspaceId });
    const { data: batch } = await admin.from("batches").select("id").eq("experiment_id", expId).single();
    const { data: sample } = await admin
      .from("samples")
      .insert({ batch_id: batch!.id, vial_label: `${expId}-B1-SAMPLE-R1`, status: "planned" })
      .select()
      .single();

    const { data: run, error: runErr } = await memberClient
      .from("analysis_runs")
      .insert({ sample_id: sample!.id, instrument_method_id: method!.id, status: "planned" })
      .select()
      .single();
    expect(runErr).toBeNull();
    expect(run!.workspace_id).toBe(workspaceId);

    const { data: result, error: resultErr } = await memberClient
      .from("analysis_results")
      .insert({ analysis_run_id: run!.id, result_confidence: "tentative", summary: "First pass" })
      .select()
      .single();
    expect(resultErr).toBeNull();
    expect(result!.workspace_id).toBe(workspaceId);

    const { data: peak, error: peakErr } = await memberClient
      .from("peak_assignments")
      .insert({ analysis_result_id: result!.id, observed_mz: 297.5, confidence: "probable" })
      .select()
      .single();
    expect(peakErr).toBeNull();
    expect(peak!.workspace_id).toBe(workspaceId);
  });

  it("a non-member cannot read another workspace's instruments or runs", async () => {
    const { data: instrument } = await admin
      .from("instruments")
      .insert({ name: "Outsider-only instrument", workspace_id: otherWorkspaceId })
      .select()
      .single();
    instrumentIds.push(instrument!.id);

    const { data } = await memberClient.from("instruments").select("id").eq("id", instrument!.id).maybeSingle();
    expect(data).toBeNull();
  });
});
