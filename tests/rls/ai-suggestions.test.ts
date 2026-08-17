// AI Field Suggestions — safety-property tests for experiment_ai_suggestions
// and apply_ai_suggestion(). Only runs against a LOCAL Supabase instance (see
// experiments.rls.test.ts for why this suite is skipped outside the CI `rls`
// job), same convention as crew-commit.test.ts.
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const URL = process.env.SUPABASE_LOCAL_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_LOCAL_SERVICE_ROLE_KEY;
const ANON_KEY = process.env.SUPABASE_LOCAL_ANON_KEY;
const ready = !!URL && !!SERVICE_ROLE_KEY && !!ANON_KEY;

describe.skipIf(!ready)("AI field suggestions (local Supabase)", () => {
  let admin: SupabaseClient;
  let ownerClient: SupabaseClient;
  let otherClient: SupabaseClient;
  let ownerId: string;
  let workspaceId: string;
  const ids: string[] = [];

  beforeAll(async () => {
    admin = createClient(URL!, SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
    const password = randomUUID();

    const ownerEmail = `ai-suggestions-owner-${randomUUID()}@test.local`;
    const { data: owner, error: ownerErr } = await admin.auth.admin.createUser({
      email: ownerEmail,
      password,
      email_confirm: true,
    });
    if (ownerErr) throw ownerErr;
    ownerId = owner.user.id;

    const otherEmail = `ai-suggestions-other-${randomUUID()}@test.local`;
    const { data: other, error: otherErr } = await admin.auth.admin.createUser({
      email: otherEmail,
      password,
      email_confirm: true,
    });
    if (otherErr) throw otherErr;

    const { data: ws, error: wsErr } = await admin
      .from("workspaces")
      .insert({ name: `AI suggestions test ws ${randomUUID()}` })
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
    const id = `EXP-AIS-${randomUUID().slice(0, 8)}`;
    ids.push(id);
    const { error } = await admin
      .from("experiments")
      .insert({ id, owner_id: ownerId, name: "AI suggestions test", workspace_id: workspaceId, status: "draft", ...overrides });
    if (error) throw error;
    return id;
  }

  async function makeSuggestion(experimentId: string, overrides: Record<string, unknown> = {}) {
    const { data, error } = await admin
      .from("experiment_ai_suggestions")
      .insert({
        experiment_id: experimentId,
        field: "hypothesis",
        suggested_value: "Zn2+ templates the depsipeptide.",
        rationale: "Stated in the observations.",
        source: "gap_scan",
        model: "test-model",
        created_by: ownerId,
        ...overrides,
      })
      .select("id")
      .single();
    if (error) throw error;
    return data!.id as string;
  }

  it("D7 — the field CHECK constraint rejects a value outside the D8 allowlist", async () => {
    const id = await makeExperiment();
    const { error } = await admin.from("experiment_ai_suggestions").insert({
      experiment_id: id,
      field: "not_a_real_field",
      suggested_value: "x",
      rationale: "y",
      source: "gap_scan",
      model: "test-model",
      created_by: ownerId,
    });
    expect(error).not.toBeNull();
  });

  it("D4 — only the experiment's owner can insert a suggestion for it", async () => {
    const id = await makeExperiment();
    const { error: ownerInsert } = await ownerClient.from("experiment_ai_suggestions").insert({
      experiment_id: id,
      field: "hypothesis",
      suggested_value: "x",
      rationale: "y",
      source: "gap_scan",
      model: "test-model",
      created_by: ownerId,
    });
    expect(ownerInsert).toBeNull();

    const {
      data: { user: otherUser },
    } = await otherClient.auth.getUser();
    const { error: otherInsert } = await otherClient.from("experiment_ai_suggestions").insert({
      experiment_id: id,
      field: "hypothesis",
      suggested_value: "x",
      rationale: "y",
      source: "gap_scan",
      model: "test-model",
      created_by: otherUser!.id,
    });
    expect(otherInsert).not.toBeNull();
  });

  it("a workspace member who is not the owner can read but not act on a suggestion", async () => {
    const id = await makeExperiment();
    const suggestionId = await makeSuggestion(id);

    const { data: readByOther } = await otherClient.from("experiment_ai_suggestions").select("id").eq("id", suggestionId);
    expect(readByOther).toHaveLength(1);

    const { error: applyByOther } = await otherClient.rpc("apply_ai_suggestion", {
      p_suggestion_id: suggestionId,
      p_accept: true,
    });
    expect(applyByOther).not.toBeNull();
  });

  it("accepting writes the value to the named experiment field and marks the suggestion accepted", async () => {
    const id = await makeExperiment();
    const suggestionId = await makeSuggestion(id, { field: "conclusion", suggested_value: "Confirmed by m/z 297." });

    const { error } = await ownerClient.rpc("apply_ai_suggestion", { p_suggestion_id: suggestionId, p_accept: true });
    expect(error).toBeNull();

    const { data: exp } = await admin.from("experiments").select("conclusion").eq("id", id).single();
    expect(exp?.conclusion).toBe("Confirmed by m/z 297.");

    const { data: suggestion } = await admin
      .from("experiment_ai_suggestions")
      .select("status, resolved_by")
      .eq("id", suggestionId)
      .single();
    expect(suggestion?.status).toBe("accepted");
    expect(suggestion?.resolved_by).toBe(ownerId);
  });

  it("dismissing marks the suggestion dismissed without touching the experiment", async () => {
    const id = await makeExperiment();
    const suggestionId = await makeSuggestion(id, { field: "next_steps", suggested_value: "Repeat at pH 8." });

    const { error } = await ownerClient.rpc("apply_ai_suggestion", { p_suggestion_id: suggestionId, p_accept: false });
    expect(error).toBeNull();

    const { data: exp } = await admin.from("experiments").select("next_steps").eq("id", id).single();
    expect(exp?.next_steps).toBeNull();

    const { data: suggestion } = await admin.from("experiment_ai_suggestions").select("status").eq("id", suggestionId).single();
    expect(suggestion?.status).toBe("dismissed");
  });

  it("D3 — accepting a crew_resolve suggestion also decrements the linked unresolved_open_count", async () => {
    const id = await makeExperiment();
    const unresolved = [
      { field: "hypothesis", issue: "not stated", candidates: [] },
      { field: "conclusion", issue: "not stated", candidates: [] },
    ];
    const { error: provErr } = await admin.from("experiment_crew_provenance").insert({
      experiment_id: id,
      raw_source: "raw notes",
      unresolved,
      unresolved_open_count: 2,
      normalization: [],
      crew_version: "1.0",
      prompt_versions: { intake: 1, design: 1, controls: 1, critic: 1 },
      model: "test-model",
      created_by: ownerId,
    });
    if (provErr) throw provErr;

    const suggestionId = await makeSuggestion(id, {
      field: "hypothesis",
      source: "crew_resolve",
      unresolved_index: 0,
    });

    const { error } = await ownerClient.rpc("apply_ai_suggestion", { p_suggestion_id: suggestionId, p_accept: true });
    expect(error).toBeNull();

    const { data: prov } = await admin
      .from("experiment_crew_provenance")
      .select("unresolved, unresolved_open_count")
      .eq("experiment_id", id)
      .single();
    expect(prov?.unresolved_open_count).toBe(1);
    expect((prov?.unresolved as { field: string }[]).map((u) => u.field)).toEqual(["conclusion"]);
  });

  it("field-based lookup — resolves a crew_resolve suggestion correctly even when its stored position has gone stale (2026-08-17 fix)", async () => {
    const id = await makeExperiment();
    const unresolved = [
      { field: "hypothesis", issue: "not stated", candidates: [] },
      { field: "conclusion", issue: "not stated", candidates: [] },
    ];
    await admin.from("experiment_crew_provenance").insert({
      experiment_id: id,
      raw_source: "raw notes",
      unresolved,
      unresolved_open_count: 2,
      normalization: [],
      crew_version: "1.0",
      prompt_versions: { intake: 1, design: 1, controls: 1, critic: 1 },
      model: "test-model",
      created_by: ownerId,
    });

    // Suggestion generated for index 1 ("conclusion") ...
    const suggestionId = await makeSuggestion(id, {
      field: "conclusion",
      suggested_value: "Confirmed by m/z 297.",
      source: "crew_resolve",
      unresolved_index: 1,
    });
    // ... but item 0 gets resolved first, shifting "conclusion" to index 0.
    // The suggestion's STORED index (1) is now stale.
    await ownerClient.rpc("resolve_crew_unresolved_item", { p_experiment_id: id, p_item_index: 0 });

    // apply_ai_suggestion searches the CURRENT array for the field by name
    // rather than trusting unresolved_index, so this succeeds and resolves
    // the right item despite the shift.
    const { error } = await ownerClient.rpc("apply_ai_suggestion", { p_suggestion_id: suggestionId, p_accept: true });
    expect(error).toBeNull();

    const { data: exp } = await admin.from("experiments").select("conclusion").eq("id", id).single();
    expect(exp?.conclusion).toBe("Confirmed by m/z 297.");

    const { data: suggestion } = await admin.from("experiment_ai_suggestions").select("status").eq("id", suggestionId).single();
    expect(suggestion?.status).toBe("accepted");

    const { data: prov } = await admin
      .from("experiment_crew_provenance")
      .select("unresolved, unresolved_open_count")
      .eq("experiment_id", id)
      .single();
    expect(prov?.unresolved_open_count).toBe(0);
    expect(prov?.unresolved).toEqual([]);
  });

  it("refuses when the suggested field is no longer unresolved by any means", async () => {
    const id = await makeExperiment();
    const unresolved = [{ field: "conclusion", issue: "not stated", candidates: [] }];
    await admin.from("experiment_crew_provenance").insert({
      experiment_id: id,
      raw_source: "raw notes",
      unresolved,
      unresolved_open_count: 1,
      normalization: [],
      crew_version: "1.0",
      prompt_versions: { intake: 1, design: 1, controls: 1, critic: 1 },
      model: "test-model",
      created_by: ownerId,
    });

    const suggestionId = await makeSuggestion(id, {
      field: "conclusion",
      source: "crew_resolve",
      unresolved_index: 0,
    });
    // The item gets resolved by other means (a plain manual Resolve) before
    // the suggestion is ever applied -- no item with this field remains.
    await ownerClient.rpc("resolve_crew_unresolved_item", { p_experiment_id: id, p_item_index: 0 });

    const { error } = await ownerClient.rpc("apply_ai_suggestion", { p_suggestion_id: suggestionId, p_accept: true });
    expect(error).not.toBeNull();

    const { data: suggestion } = await admin.from("experiment_ai_suggestions").select("status").eq("id", suggestionId).single();
    expect(suggestion?.status).toBe("pending"); // unchanged — the refused call didn't silently mark it resolved
  });

  it("D9 — accepting on a locked experiment fails", async () => {
    const id = await makeExperiment({
      status: "completed",
      locked_at: new Date().toISOString(),
      conclusion: "Already done.",
    });
    const suggestionId = await makeSuggestion(id, { field: "conclusion", suggested_value: "A different conclusion." });

    const { error } = await ownerClient.rpc("apply_ai_suggestion", { p_suggestion_id: suggestionId, p_accept: true });
    expect(error).not.toBeNull();

    const { data: exp } = await admin.from("experiments").select("conclusion").eq("id", id).single();
    expect(exp?.conclusion).toBe("Already done.");
  });

  it("no client-facing UPDATE policy exists (only apply_ai_suggestion can change status)", async () => {
    const id = await makeExperiment();
    const suggestionId = await makeSuggestion(id);

    await ownerClient.from("experiment_ai_suggestions").update({ status: "accepted" }).eq("id", suggestionId);

    const { data } = await admin.from("experiment_ai_suggestions").select("status").eq("id", suggestionId).single();
    expect(data?.status).toBe("pending");
  });
});
