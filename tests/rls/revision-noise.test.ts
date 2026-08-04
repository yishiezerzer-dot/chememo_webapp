// T1.8 D1 — record_experiment_revision()'s no-op guard. Only runs against a
// LOCAL Supabase instance (see experiments.rls.test.ts for why this is
// skipped outside the CI `rls` job).
//
// Proves: a save that changes nothing outside the excluded columns (the
// classic "opened the edit page, clicked Save without editing anything"
// case) produces zero new experiment_revisions rows; a save that changes a
// real field still produces exactly one.
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestWorkspace } from "./helpers";

const URL = process.env.SUPABASE_LOCAL_URL;
const ANON_KEY = process.env.SUPABASE_LOCAL_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_LOCAL_SERVICE_ROLE_KEY;
const ready = !!URL && !!ANON_KEY && !!SERVICE_ROLE_KEY;

describe.skipIf(!ready)("revision no-op guard (local Supabase)", () => {
  let admin: SupabaseClient;
  let userClient: SupabaseClient;
  let userId: string;
  let workspaceId: string;
  const experimentIds: string[] = [];

  beforeAll(async () => {
    admin = createClient(URL!, SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
    const password = randomUUID();
    const email = `revnoise-${randomUUID()}@test.local`;
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

  async function revisionCount(experimentId: string): Promise<number> {
    const { count } = await admin
      .from("experiment_revisions")
      .select("id", { count: "exact", head: true })
      .eq("experiment_id", experimentId);
    return count ?? 0;
  }

  it("a save that changes nothing scientific produces zero new revisions", async () => {
    const id = `EXP-REVNOISE-${randomUUID().slice(0, 8)}`;
    experimentIds.push(id);
    await userClient.from("experiments").insert({ id, owner_id: userId, name: "No-op save test", status: "draft", ph: 7, workspace_id: workspaceId });
    expect(await revisionCount(id)).toBe(0);

    // Re-save with the identical name/ph — only updated_at (excluded) actually changes.
    const { error } = await userClient.from("experiments").update({ name: "No-op save test", ph: 7 }).eq("id", id);
    expect(error).toBeNull();
    expect(await revisionCount(id)).toBe(0);
  });

  it("a save that changes a real field still produces exactly one revision", async () => {
    const id = `EXP-REVREAL-${randomUUID().slice(0, 8)}`;
    experimentIds.push(id);
    await userClient.from("experiments").insert({ id, owner_id: userId, name: "Real change test", status: "draft", ph: 7, workspace_id: workspaceId });
    expect(await revisionCount(id)).toBe(0);

    const { error } = await userClient.from("experiments").update({ ph: 8 }).eq("id", id);
    expect(error).toBeNull();
    expect(await revisionCount(id)).toBe(1);

    const { data: revision } = await admin
      .from("experiment_revisions")
      .select("snapshot")
      .eq("experiment_id", id)
      .single();
    expect((revision!.snapshot as { ph: number }).ph).toBe(7);
  });
});
