// T1.7 experiment_relationships. Only runs against a LOCAL Supabase instance
// (see experiments.rls.test.ts for why this is skipped outside the CI `rls`
// job).
//
// Proves: (1) relationships are lab-shared — any authenticated user creates
// and reads a relationship connecting two DIFFERENT owners' experiments
// (D3); (2) the self-relationship and invalid-type check constraints reject
// bad rows; (3) the unique constraint rejects an exact duplicate edge.
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const URL = process.env.SUPABASE_LOCAL_URL;
const ANON_KEY = process.env.SUPABASE_LOCAL_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_LOCAL_SERVICE_ROLE_KEY;
const ready = !!URL && !!ANON_KEY && !!SERVICE_ROLE_KEY;

describe.skipIf(!ready)("experiment relationships (local Supabase)", () => {
  let admin: SupabaseClient;
  let userAClient: SupabaseClient;
  let userBClient: SupabaseClient;
  let userAId: string;
  let userBId: string;
  const experimentIds: string[] = [];
  const relationshipIds: string[] = [];

  beforeAll(async () => {
    admin = createClient(URL!, SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
    const password = randomUUID();

    const emailA = `rel-a-${randomUUID()}@test.local`;
    const { data: userA, error: errA } = await admin.auth.admin.createUser({ email: emailA, password, email_confirm: true });
    if (errA) throw errA;
    userAId = userA.user.id;

    const emailB = `rel-b-${randomUUID()}@test.local`;
    const { data: userB, error: errB } = await admin.auth.admin.createUser({ email: emailB, password, email_confirm: true });
    if (errB) throw errB;
    userBId = userB.user.id;

    userAClient = createClient(URL!, ANON_KEY!, { auth: { persistSession: false } });
    const { error: signInA } = await userAClient.auth.signInWithPassword({ email: emailA, password });
    if (signInA) throw signInA;

    userBClient = createClient(URL!, ANON_KEY!, { auth: { persistSession: false } });
    const { error: signInB } = await userBClient.auth.signInWithPassword({ email: emailB, password });
    if (signInB) throw signInB;
  });

  afterAll(async () => {
    if (relationshipIds.length) await admin.from("experiment_relationships").delete().in("id", relationshipIds);
    if (experimentIds.length) await admin.from("experiments").delete().in("id", experimentIds);
  });

  it("is lab-shared: any authenticated user links two different owners' experiments and both can read it", async () => {
    const expA = `EXP-RELA-${randomUUID().slice(0, 8)}`;
    const expB = `EXP-RELB-${randomUUID().slice(0, 8)}`;
    experimentIds.push(expA, expB);
    await admin.from("experiments").insert({ id: expA, owner_id: userAId, name: "Owned by A", status: "draft" });
    await admin.from("experiments").insert({ id: expB, owner_id: userBId, name: "Owned by B", status: "draft" });

    // userA links their own experiment to userB's, as replicate_of.
    const { data: relationship, error: insertErr } = await userAClient
      .from("experiment_relationships")
      .insert({ source_experiment_id: expA, target_experiment_id: expB, relationship_type: "replicate_of", created_by: userAId })
      .select()
      .single();
    expect(insertErr).toBeNull();
    relationshipIds.push(relationship!.id);

    // userB (owns neither the relationship nor experiment A) can still read it.
    const { data: readAsB, error: readErr } = await userBClient
      .from("experiment_relationships")
      .select()
      .eq("id", relationship!.id)
      .maybeSingle();
    expect(readErr).toBeNull();
    expect(readAsB?.relationship_type).toBe("replicate_of");

    // userB can also write a relationship connecting the two, despite owning only expB.
    const { error: writeAsBErr } = await userBClient
      .from("experiment_relationships")
      .insert({ source_experiment_id: expB, target_experiment_id: expA, relationship_type: "confirms", created_by: userBId });
    expect(writeAsBErr).toBeNull();
  });

  it("rejects a self-relationship and an unrecognized relationship_type", async () => {
    const exp = `EXP-RELSELF-${randomUUID().slice(0, 8)}`;
    experimentIds.push(exp);
    await admin.from("experiments").insert({ id: exp, owner_id: userAId, name: "Self-relationship test", status: "draft" });

    const { error: selfErr } = await userAClient
      .from("experiment_relationships")
      .insert({ source_experiment_id: exp, target_experiment_id: exp, relationship_type: "replicate_of", created_by: userAId });
    expect(selfErr).not.toBeNull();
    expect(selfErr?.message).toMatch(/experiment_relationships_no_self/);

    const expOther = `EXP-RELOTHER-${randomUUID().slice(0, 8)}`;
    experimentIds.push(expOther);
    await admin.from("experiments").insert({ id: expOther, owner_id: userAId, name: "Other", status: "draft" });

    const { error: badTypeErr } = await userAClient
      .from("experiment_relationships")
      .insert({ source_experiment_id: exp, target_experiment_id: expOther, relationship_type: "made_up_type", created_by: userAId });
    expect(badTypeErr).not.toBeNull();
    expect(badTypeErr?.message).toMatch(/experiment_relationships_valid_type/);
  });

  it("rejects an exact duplicate edge (same source, target, and type)", async () => {
    const expA = `EXP-DUPA-${randomUUID().slice(0, 8)}`;
    const expB = `EXP-DUPB-${randomUUID().slice(0, 8)}`;
    experimentIds.push(expA, expB);
    await admin.from("experiments").insert({ id: expA, owner_id: userAId, name: "Dup A", status: "draft" });
    await admin.from("experiments").insert({ id: expB, owner_id: userAId, name: "Dup B", status: "draft" });

    const { data: first, error: firstErr } = await userAClient
      .from("experiment_relationships")
      .insert({ source_experiment_id: expA, target_experiment_id: expB, relationship_type: "control_for", created_by: userAId })
      .select()
      .single();
    expect(firstErr).toBeNull();
    relationshipIds.push(first!.id);

    const { error: dupErr } = await userAClient
      .from("experiment_relationships")
      .insert({ source_experiment_id: expA, target_experiment_id: expB, relationship_type: "control_for", created_by: userAId });
    expect(dupErr).not.toBeNull();
    expect(dupErr?.code).toBe("23505");
  });
});
