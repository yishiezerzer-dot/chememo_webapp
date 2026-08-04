// T1.3 draft table + optimistic-concurrency conflict detection. Only runs
// against a LOCAL Supabase instance (see experiments.rls.test.ts for why).
//
// Proves two things: (1) experiment_drafts is owner-only — the first table
// in this schema that is NOT lab-shared (D1) — and upserts in place rather
// than growing a log; (2) the WHERE id = $1 AND updated_at = $2 pattern
// updateExperiment relies on (D4) actually rejects a stale write with 0 rows
// affected rather than silently overwriting, proven directly against
// experiments here so the mechanism itself is verified independent of the
// TypeScript service layer.
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestWorkspace } from "./helpers";

const URL = process.env.SUPABASE_LOCAL_URL;
const ANON_KEY = process.env.SUPABASE_LOCAL_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_LOCAL_SERVICE_ROLE_KEY;
const ready = !!URL && !!ANON_KEY && !!SERVICE_ROLE_KEY;

describe.skipIf(!ready)("experiment drafts (local Supabase)", () => {
  let admin: SupabaseClient;
  let userAClient: SupabaseClient;
  let userBClient: SupabaseClient;
  let userAId: string;
  let workspaceId: string;
  const experimentIds: string[] = [];

  beforeAll(async () => {
    admin = createClient(URL!, SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
    const password = randomUUID();

    const emailA = `drafts-a-${randomUUID()}@test.local`;
    const { data: userA, error: errA } = await admin.auth.admin.createUser({
      email: emailA,
      password,
      email_confirm: true,
    });
    if (errA) throw errA;
    userAId = userA.user.id;

    const emailB = `drafts-b-${randomUUID()}@test.local`;
    const { data: userB, error: errB } = await admin.auth.admin.createUser({ email: emailB, password, email_confirm: true });
    if (errB) throw errB;

    userAClient = createClient(URL!, ANON_KEY!, { auth: { persistSession: false } });
    const { error: signInA } = await userAClient.auth.signInWithPassword({ email: emailA, password });
    if (signInA) throw signInA;

    userBClient = createClient(URL!, ANON_KEY!, { auth: { persistSession: false } });
    const { error: signInB } = await userBClient.auth.signInWithPassword({ email: emailB, password });
    if (signInB) throw signInB;

    workspaceId = await createTestWorkspace(admin, [{ id: userAId }, { id: userB.user.id }]);
  });

  afterAll(async () => {
    if (experimentIds.length) await admin.from("experiments").delete().in("id", experimentIds);
  });

  it("is owner-only: a second user cannot read or write another's draft", async () => {
    const { data: draft, error: insertErr } = await userAClient
      .from("experiment_drafts")
      .insert({ owner_id: userAId, client_draft_id: `test:${randomUUID()}`, fields: { name: "draft A" }, workspace_id: workspaceId })
      .select()
      .single();
    expect(insertErr).toBeNull();

    const { data: readAsB } = await userBClient
      .from("experiment_drafts")
      .select()
      .eq("id", draft!.id)
      .maybeSingle();
    expect(readAsB).toBeNull();

    const { data: updateAsB } = await userBClient
      .from("experiment_drafts")
      .update({ fields: { name: "hijacked" } })
      .eq("id", draft!.id)
      .select();
    expect(updateAsB).toEqual([]);

    await admin.from("experiment_drafts").delete().eq("id", draft!.id);
  });

  it("upserts in place on (owner_id, client_draft_id) rather than growing a log", async () => {
    const clientDraftId = `test:${randomUUID()}`;
    const { error: firstErr } = await userAClient
      .from("experiment_drafts")
      .upsert(
        { owner_id: userAId, client_draft_id: clientDraftId, fields: { name: "v1" }, workspace_id: workspaceId },
        { onConflict: "owner_id,client_draft_id" }
      );
    expect(firstErr).toBeNull();

    const { error: secondErr } = await userAClient
      .from("experiment_drafts")
      .upsert(
        { owner_id: userAId, client_draft_id: clientDraftId, fields: { name: "v2" }, workspace_id: workspaceId },
        { onConflict: "owner_id,client_draft_id" }
      );
    expect(secondErr).toBeNull();

    const { data: rows } = await admin
      .from("experiment_drafts")
      .select("fields")
      .eq("owner_id", userAId)
      .eq("client_draft_id", clientDraftId);
    expect(rows).toHaveLength(1);
    expect((rows![0].fields as { name: string }).name).toBe("v2");

    await admin.from("experiment_drafts").delete().eq("client_draft_id", clientDraftId);
  });

  it("T1.3 D4 — a stale updated_at is rejected (0 rows), not silently overwritten", async () => {
    const id = `EXP-DRAFT-${randomUUID().slice(0, 8)}`;
    experimentIds.push(id);
    const { data: created, error: createErr } = await admin
      .from("experiments")
      .insert({ id, owner_id: userAId, name: "Conflict test", workspace_id: workspaceId })
      .select("updated_at")
      .single();
    expect(createErr).toBeNull();
    const originalUpdatedAt = created!.updated_at;

    // A real save lands first, bumping updated_at.
    const { error: firstSaveErr } = await userAClient
      .from("experiments")
      .update({ name: "Conflict test — first save" })
      .eq("id", id);
    expect(firstSaveErr).toBeNull();

    // A second save, still carrying the ORIGINAL (now stale) updated_at,
    // must affect 0 rows rather than clobbering the first save.
    const { data: staleResult, error: staleErr } = await userAClient
      .from("experiments")
      .update({ name: "Conflict test — stale save" })
      .eq("id", id)
      .eq("updated_at", originalUpdatedAt)
      .select("name");
    expect(staleErr).toBeNull();
    expect(staleResult).toEqual([]);

    const { data: finalRow } = await admin.from("experiments").select("name").eq("id", id).single();
    expect(finalRow?.name).toBe("Conflict test — first save");
  });
});
