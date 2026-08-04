// RLS integration tests. Only runs against a LOCAL Supabase instance
// (`supabase start`, which needs Docker — not available on this dev machine,
// so this only actually executes in the CI `rls` job). Locally this suite is
// discovered but skipped, same as the E2E tests skip without credentials.
//
// Proves the current lab-shared model's real isolation boundary: anyone
// authenticated can READ any non-deleted experiment, but only the OWNER can
// write/delete it. (Per-workspace isolation doesn't exist yet — that's T2.1;
// this harness is explicitly meant to be reused for it, per the plan.)
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestWorkspace } from "./helpers";

const URL = process.env.SUPABASE_LOCAL_URL;
const ANON_KEY = process.env.SUPABASE_LOCAL_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_LOCAL_SERVICE_ROLE_KEY;
const ready = !!URL && !!ANON_KEY && !!SERVICE_ROLE_KEY;

describe.skipIf(!ready)("experiments RLS isolation (local Supabase)", () => {
  let admin: SupabaseClient;
  let userAClient: SupabaseClient;
  let userBClient: SupabaseClient;
  let anonClient: SupabaseClient;
  let userAId: string;
  let workspaceId: string;
  const experimentId = `EXP-RLS-${randomUUID().slice(0, 8)}`;
  const emailA = `rls-a-${randomUUID()}@test.local`;
  const emailB = `rls-b-${randomUUID()}@test.local`;
  const password = randomUUID();

  beforeAll(async () => {
    admin = createClient(URL!, SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
    anonClient = createClient(URL!, ANON_KEY!, { auth: { persistSession: false } });

    const { data: userA, error: errA } = await admin.auth.admin.createUser({
      email: emailA,
      password,
      email_confirm: true,
    });
    if (errA) throw errA;
    userAId = userA.user.id;

    const { data: userB, error: errB } = await admin.auth.admin.createUser({
      email: emailB,
      password,
      email_confirm: true,
    });
    if (errB) throw errB;

    userAClient = createClient(URL!, ANON_KEY!, { auth: { persistSession: false } });
    const { error: signInA } = await userAClient.auth.signInWithPassword({ email: emailA, password });
    if (signInA) throw signInA;

    userBClient = createClient(URL!, ANON_KEY!, { auth: { persistSession: false } });
    const { error: signInB } = await userBClient.auth.signInWithPassword({ email: emailB, password });
    if (signInB) throw signInB;

    workspaceId = await createTestWorkspace(admin, [{ id: userAId }, { id: userB.user.id }]);

    const { error: insertErr } = await userAClient
      .from("experiments")
      .insert({ id: experimentId, owner_id: userAId, name: "RLS test experiment", workspace_id: workspaceId });
    if (insertErr) throw insertErr;
  });

  afterAll(async () => {
    await admin.from("experiments").delete().eq("id", experimentId);
  });

  it("blocks anonymous (unauthenticated) reads entirely", async () => {
    const { data, error } = await anonClient.from("experiments").select("id").eq("id", experimentId);
    // RLS with no matching policy for the anon role returns an empty set,
    // not an error — the important assertion is that no row comes back.
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("lets a different authenticated user READ the experiment (lab-shared model)", async () => {
    const { data, error } = await userBClient.from("experiments").select("id").eq("id", experimentId);
    expect(error).toBeNull();
    expect(data).toEqual([{ id: experimentId }]);
  });

  it("blocks a non-owner from UPDATING the experiment", async () => {
    const { data, error } = await userBClient
      .from("experiments")
      .update({ name: "hijacked" })
      .eq("id", experimentId)
      .select();
    // RLS silently filters the row out of the update rather than erroring —
    // zero rows affected is the isolation proof.
    expect(error).toBeNull();
    expect(data).toEqual([]);

    const { data: unchanged } = await admin.from("experiments").select("name").eq("id", experimentId).single();
    expect(unchanged?.name).toBe("RLS test experiment");
  });

  it("blocks a non-owner from DELETING the experiment", async () => {
    const { data, error } = await userBClient.from("experiments").delete().eq("id", experimentId).select();
    expect(error).toBeNull();
    expect(data).toEqual([]);

    const { data: stillThere } = await admin.from("experiments").select("id").eq("id", experimentId).single();
    expect(stillThere?.id).toBe(experimentId);
  });

  it("blocks inserting an experiment owned by someone else", async () => {
    const { error } = await userBClient
      .from("experiments")
      .insert({ id: `EXP-RLS-forged-${randomUUID().slice(0, 8)}`, owner_id: userAId, name: "forged", workspace_id: workspaceId });
    expect(error).not.toBeNull();
  });

  it("lets the owner UPDATE their own experiment", async () => {
    const { data, error } = await userAClient
      .from("experiments")
      .update({ name: "updated by owner" })
      .eq("id", experimentId)
      .select();
    expect(error).toBeNull();
    expect(data).toEqual([expect.objectContaining({ id: experimentId, name: "updated by owner" })]);
  });
});
