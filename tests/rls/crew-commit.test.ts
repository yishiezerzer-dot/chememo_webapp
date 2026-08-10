// T3.8 — safety-property tests for the crew's one write path. Only runs
// against a LOCAL Supabase instance (see experiments.rls.test.ts for why this
// suite is skipped outside the CI `rls` job — Docker isn't available on this
// dev machine), same convention as experiment-lifecycle.test.ts.
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const URL = process.env.SUPABASE_LOCAL_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_LOCAL_SERVICE_ROLE_KEY;
const ANON_KEY = process.env.SUPABASE_LOCAL_ANON_KEY;
const ready = !!URL && !!SERVICE_ROLE_KEY && !!ANON_KEY;

describe.skipIf(!ready)("crew-authored draft experiments (local Supabase)", () => {
  let admin: SupabaseClient;
  let ownerClient: SupabaseClient;
  let otherClient: SupabaseClient;
  let ownerId: string;
  let workspaceId: string;
  const ids: string[] = [];

  beforeAll(async () => {
    admin = createClient(URL!, SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
    const password = randomUUID();

    const ownerEmail = `crew-commit-owner-${randomUUID()}@test.local`;
    const { data: owner, error: ownerErr } = await admin.auth.admin.createUser({
      email: ownerEmail,
      password,
      email_confirm: true,
    });
    if (ownerErr) throw ownerErr;
    ownerId = owner.user.id;

    const otherEmail = `crew-commit-other-${randomUUID()}@test.local`;
    const { data: other, error: otherErr } = await admin.auth.admin.createUser({
      email: otherEmail,
      password,
      email_confirm: true,
    });
    if (otherErr) throw otherErr;

    const { data: ws, error: wsErr } = await admin
      .from("workspaces")
      .insert({ name: `Crew commit test ws ${randomUUID()}` })
      .select("id")
      .single();
    if (wsErr) throw wsErr;
    workspaceId = ws!.id;

    const { error: memberErr } = await admin.from("workspace_members").insert([
      { workspace_id: workspaceId, user_id: ownerId, role: "researcher" },
      { workspace_id: workspaceId, user_id: other.user.id, role: "researcher" },
    ]);
    if (memberErr) throw memberErr;

    ownerClient = createClient(URL!, ANON_KEY!, { auth: { persistSession: false } });
    const { error: signInOwner } = await ownerClient.auth.signInWithPassword({ email: ownerEmail, password });
    if (signInOwner) throw signInOwner;

    otherClient = createClient(URL!, ANON_KEY!, { auth: { persistSession: false } });
    const { error: signInOther } = await otherClient.auth.signInWithPassword({ email: otherEmail, password });
    if (signInOther) throw signInOther;
  });

  afterAll(async () => {
    if (ids.length) await admin.from("experiments").delete().in("id", ids);
  });

  async function makeExperiment(overrides: Record<string, unknown> = {}) {
    const id = `EXP-CC-${randomUUID().slice(0, 8)}`;
    ids.push(id);
    const { error } = await admin
      .from("experiments")
      .insert({ id, owner_id: ownerId, name: "Crew commit test", workspace_id: workspaceId, status: "draft", ...overrides });
    if (error) throw error;
    return id;
  }

  async function makeProvenance(experimentId: string, unresolvedCount: number) {
    const unresolved = Array.from({ length: unresolvedCount }, (_, i) => ({
      field: `field_${i}`,
      issue: "test item",
      candidates: [],
    }));
    const { error } = await admin.from("experiment_crew_provenance").insert({
      experiment_id: experimentId,
      raw_source: "raw notes",
      unresolved,
      unresolved_open_count: unresolvedCount,
      normalization: [],
      crew_version: "1.0",
      prompt_versions: { intake: 1, design: 1, controls: 1, critic: 1 },
      model: "test-model",
      created_by: ownerId,
    });
    if (error) throw error;
  }

  it("D2/D3 — a crew-created record has status='draft' and acceptance_criteria is null", async () => {
    const id = await makeExperiment();
    await makeProvenance(id, 1);
    const { data } = await admin.from("experiments").select("status, acceptance_criteria").eq("id", id).single();
    expect(data?.status).toBe("draft");
    expect(data?.acceptance_criteria).toBeNull();
  });

  it("D4 — draft -> planned is rejected while unresolved_open_count > 0, and succeeds at zero", async () => {
    const id = await makeExperiment();
    await makeProvenance(id, 2);

    const blocked = await admin.from("experiments").update({ status: "planned" }).eq("id", id);
    expect(blocked.error).not.toBeNull();

    await admin.from("experiment_crew_provenance").update({ unresolved: [], unresolved_open_count: 0 }).eq("experiment_id", id);
    const allowed = await admin.from("experiments").update({ status: "planned" }).eq("id", id);
    expect(allowed.error).toBeNull();
  });

  it("D4 — a hand-authored experiment (no provenance row) advances normally", async () => {
    const id = await makeExperiment();
    const { error } = await admin.from("experiments").update({ status: "planned" }).eq("id", id);
    expect(error).toBeNull();
  });

  it("D8 — deleting a rejected draft cascades its provenance away", async () => {
    const id = await makeExperiment();
    await makeProvenance(id, 1);

    await admin.from("experiments").delete().eq("id", id);
    const { data } = await admin.from("experiment_crew_provenance").select("experiment_id").eq("experiment_id", id);
    expect(data).toEqual([]);
    ids.splice(ids.indexOf(id), 1); // already deleted, don't re-delete in afterAll
  });

  it("resolve_crew_unresolved_item (owner) removes exactly the targeted item and recomputes the open count", async () => {
    const id = await makeExperiment();
    await makeProvenance(id, 3);

    const { error } = await ownerClient.rpc("resolve_crew_unresolved_item", {
      p_experiment_id: id,
      p_item_index: 1,
    });
    expect(error).toBeNull();

    const { data } = await admin
      .from("experiment_crew_provenance")
      .select("unresolved, unresolved_open_count")
      .eq("experiment_id", id)
      .single();
    expect(data?.unresolved_open_count).toBe(2);
    expect((data?.unresolved as { field: string }[]).map((u) => u.field)).toEqual(["field_0", "field_2"]);
  });

  it("resolve_crew_unresolved_item rejects a caller who is not the experiment's owner", async () => {
    const id = await makeExperiment();
    await makeProvenance(id, 1);

    const { error } = await otherClient.rpc("resolve_crew_unresolved_item", {
      p_experiment_id: id,
      p_item_index: 0,
    });
    expect(error).not.toBeNull();

    const { data } = await admin
      .from("experiment_crew_provenance")
      .select("unresolved_open_count")
      .eq("experiment_id", id)
      .single();
    expect(data?.unresolved_open_count).toBe(1);
  });

  it("no client-facing UPDATE policy exists on experiment_crew_provenance (only the security-definer function can change it)", async () => {
    const id = await makeExperiment();
    await makeProvenance(id, 1);

    // With RLS enabled and no UPDATE policy defined at all, Postgres denies
    // the command by silently matching zero rows (not by raising an error) —
    // so the real invariant to check is that the value is actually
    // unchanged afterward, not that the call itself errors.
    await ownerClient
      .from("experiment_crew_provenance")
      .update({ unresolved_open_count: 0 })
      .eq("experiment_id", id);

    const { data } = await admin
      .from("experiment_crew_provenance")
      .select("unresolved_open_count")
      .eq("experiment_id", id)
      .single();
    expect(data?.unresolved_open_count).toBe(1);
  });
});
