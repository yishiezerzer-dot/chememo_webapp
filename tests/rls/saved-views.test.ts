// T1.6 saved_views table. Only runs against a LOCAL Supabase instance (see
// experiments.rls.test.ts for why this is skipped outside the CI `rls` job).
//
// Proves saved_views is owner-only (D4) — same RLS shape as experiment_drafts
// (T1.3): a second authenticated user can neither read nor write another's
// saved view.
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestWorkspace } from "./helpers";

const URL = process.env.SUPABASE_LOCAL_URL;
const ANON_KEY = process.env.SUPABASE_LOCAL_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_LOCAL_SERVICE_ROLE_KEY;
const ready = !!URL && !!ANON_KEY && !!SERVICE_ROLE_KEY;

describe.skipIf(!ready)("saved views (local Supabase)", () => {
  let admin: SupabaseClient;
  let userAClient: SupabaseClient;
  let userBClient: SupabaseClient;
  let userAId: string;
  let workspaceId: string;
  const viewIds: string[] = [];

  beforeAll(async () => {
    admin = createClient(URL!, SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
    const password = randomUUID();

    const emailA = `views-a-${randomUUID()}@test.local`;
    const { data: userA, error: errA } = await admin.auth.admin.createUser({
      email: emailA,
      password,
      email_confirm: true,
    });
    if (errA) throw errA;
    userAId = userA.user.id;

    const emailB = `views-b-${randomUUID()}@test.local`;
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
    if (viewIds.length) await admin.from("saved_views").delete().in("id", viewIds);
  });

  it("is owner-only: a second user cannot read, update, or delete another's saved view", async () => {
    const { data: view, error: insertErr } = await userAClient
      .from("saved_views")
      .insert({ owner_id: userAId, name: "Wet-dry, this month", query: { reactionType: "Wet-dry cycling" }, workspace_id: workspaceId })
      .select()
      .single();
    expect(insertErr).toBeNull();
    viewIds.push(view!.id);

    const { data: readAsB } = await userBClient.from("saved_views").select().eq("id", view!.id).maybeSingle();
    expect(readAsB).toBeNull();

    const { data: updateAsB } = await userBClient
      .from("saved_views")
      .update({ name: "hijacked" })
      .eq("id", view!.id)
      .select();
    expect(updateAsB).toEqual([]);

    const { data: deleteAsB } = await userBClient.from("saved_views").delete().eq("id", view!.id).select();
    expect(deleteAsB).toEqual([]);

    // The owner can still read, update, and delete their own view.
    const { data: readAsA } = await userAClient.from("saved_views").select().eq("id", view!.id).maybeSingle();
    expect(readAsA?.name).toBe("Wet-dry, this month");

    const { error: deleteAsAErr } = await userAClient.from("saved_views").delete().eq("id", view!.id);
    expect(deleteAsAErr).toBeNull();
  });

  it("cannot insert a saved view owned by someone else", async () => {
    const { data, error } = await userBClient
      .from("saved_views")
      .insert({ owner_id: userAId, name: "Spoofed ownership", query: {}, workspace_id: workspaceId })
      .select();
    // WITH CHECK (owner_id = auth.uid()) rejects this outright.
    expect(data).toBeNull();
    expect(error).not.toBeNull();
  });
});
