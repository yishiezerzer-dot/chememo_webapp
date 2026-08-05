// T2.3 samples & lineage. Only runs against a LOCAL Supabase instance (see
// experiments.rls.test.ts for why this is skipped outside the CI `rls` job).
//
// Proves: (1) creating an experiment auto-creates an implicit B1 batch
// (decision C3); (2) a sample created within a workspace is readable by a
// member and not by an outsider; (3) sample_relationships rejects linking
// two samples from different workspaces (same guard shape as T2.1's
// relationship/series-member tests and T2.2's experiment_inputs test).
// Full per-field coverage of every §13/§17 event/measurement shape is an
// explicit, disclosed scope cut for this pass — not silently skipped.
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestWorkspace } from "./helpers";

const URL = process.env.SUPABASE_LOCAL_URL;
const ANON_KEY = process.env.SUPABASE_LOCAL_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_LOCAL_SERVICE_ROLE_KEY;
const ready = !!URL && !!ANON_KEY && !!SERVICE_ROLE_KEY;

describe.skipIf(!ready)("samples & lineage (local Supabase)", () => {
  let admin: SupabaseClient;
  let memberClient: SupabaseClient;
  let outsiderClient: SupabaseClient;
  let memberId: string;
  let outsiderId: string;
  let workspaceId: string;
  let otherWorkspaceId: string;
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

    const member = await newUser("smp-member");
    memberId = member.id;
    memberClient = member.client;
    const outsider = await newUser("smp-outsider");
    outsiderId = outsider.id;
    outsiderClient = outsider.client;

    workspaceId = await createTestWorkspace(admin, [{ id: memberId }]);
    otherWorkspaceId = await createTestWorkspace(admin, [{ id: outsiderId }]);
  });

  afterAll(async () => {
    if (experimentIds.length) await admin.from("experiments").delete().in("id", experimentIds);
  });

  it("auto-creates an implicit B1 batch when an experiment is created", async () => {
    const expId = `EXP-BATCH-${randomUUID().slice(0, 8)}`;
    experimentIds.push(expId);
    await admin.from("experiments").insert({
      id: expId,
      owner_id: memberId,
      name: "Batch auto-create test",
      status: "draft",
      workspace_id: workspaceId,
    });

    const { data: batches, error } = await admin.from("batches").select("*").eq("experiment_id", expId);
    expect(error).toBeNull();
    expect(batches).toHaveLength(1);
    expect(batches![0].label).toBe("B1");
    expect(batches![0].workspace_id).toBe(workspaceId);
  });

  it("a member can create a sample in their workspace; an outsider cannot read it", async () => {
    const expId = `EXP-SAMPLE-${randomUUID().slice(0, 8)}`;
    experimentIds.push(expId);
    await admin.from("experiments").insert({
      id: expId,
      owner_id: memberId,
      name: "Sample test",
      status: "draft",
      workspace_id: workspaceId,
    });
    const { data: batch } = await admin.from("batches").select("id").eq("experiment_id", expId).single();

    const { data: sample, error } = await memberClient
      .from("samples")
      .insert({ batch_id: batch!.id, vial_label: `${expId}-B1-SAMPLE-R1`, status: "planned" })
      .select()
      .single();
    expect(error).toBeNull();
    expect(sample!.workspace_id).toBe(workspaceId);

    const { data: asOutsider } = await outsiderClient.from("samples").select("id").eq("id", sample!.id).maybeSingle();
    expect(asOutsider).toBeNull();
  });

  it("rejects a sample_relationships row linking two samples from different workspaces", async () => {
    const expA = `EXP-SAMPLEREL-A-${randomUUID().slice(0, 8)}`;
    const expB = `EXP-SAMPLEREL-B-${randomUUID().slice(0, 8)}`;
    experimentIds.push(expA, expB);
    await admin.from("experiments").insert({ id: expA, owner_id: memberId, name: "A", status: "draft", workspace_id: workspaceId });
    await admin.from("experiments").insert({ id: expB, owner_id: outsiderId, name: "B", status: "draft", workspace_id: otherWorkspaceId });

    const { data: batchA } = await admin.from("batches").select("id").eq("experiment_id", expA).single();
    const { data: batchB } = await admin.from("batches").select("id").eq("experiment_id", expB).single();

    const { data: sampleA } = await admin
      .from("samples")
      .insert({ batch_id: batchA!.id, vial_label: `${expA}-B1-SAMPLE-R1`, status: "planned" })
      .select()
      .single();
    const { data: sampleB } = await admin
      .from("samples")
      .insert({ batch_id: batchB!.id, vial_label: `${expB}-B1-SAMPLE-R1`, status: "planned" })
      .select()
      .single();

    const { error } = await memberClient
      .from("sample_relationships")
      .insert({ source_sample_id: sampleA!.id, target_sample_id: sampleB!.id, relationship_type: "produced_from" });
    expect(error).not.toBeNull();
    expect(error?.message).toMatch(/different workspace/);
  });

  it("a 'transfer' sample_event updates sample_locations", async () => {
    const expId = `EXP-TRANSFER-${randomUUID().slice(0, 8)}`;
    experimentIds.push(expId);
    await admin.from("experiments").insert({ id: expId, owner_id: memberId, name: "Transfer test", status: "draft", workspace_id: workspaceId });
    const { data: batch } = await admin.from("batches").select("id").eq("experiment_id", expId).single();
    const { data: sample } = await admin
      .from("samples")
      .insert({ batch_id: batch!.id, vial_label: `${expId}-B1-SAMPLE-R1`, status: "planned" })
      .select()
      .single();

    const { error: eventErr } = await memberClient
      .from("sample_events")
      .insert({ sample_id: sample!.id, event_type: "transfer", details: { to_location_path: "HUJI > MFP Lab > -80 Freezer 1" } });
    expect(eventErr).toBeNull();

    const { data: location } = await admin.from("sample_locations").select("*").eq("sample_id", sample!.id).single();
    expect(location?.location_path).toBe("HUJI > MFP Lab > -80 Freezer 1");
  });
});
