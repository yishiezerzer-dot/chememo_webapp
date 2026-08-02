// T1.5 protocol/step tables. Only runs against a LOCAL Supabase instance
// (see experiments.rls.test.ts for why this is skipped outside the CI `rls`
// job).
//
// Proves: (1) protocols/protocol_versions are lab-shared like
// experiment_templates (D2); (2) a version (and its protocol_steps) freezes
// the moment an experiment links to it, then rejects further edits — same
// mechanism T1.2 established, verified here for the protocol tables; (3)
// experiment_steps follows the experiment_files ownership split (D9); (4)
// step_observations/step_deviations are genuinely append-only — no
// update/delete path exists at all (D6).
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const URL = process.env.SUPABASE_LOCAL_URL;
const ANON_KEY = process.env.SUPABASE_LOCAL_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_LOCAL_SERVICE_ROLE_KEY;
const ready = !!URL && !!ANON_KEY && !!SERVICE_ROLE_KEY;

describe.skipIf(!ready)("versioned protocols & experiment steps (local Supabase)", () => {
  let admin: SupabaseClient;
  let userAClient: SupabaseClient;
  let userBClient: SupabaseClient;
  let userAId: string;
  const experimentIds: string[] = [];
  const protocolIds: string[] = [];

  beforeAll(async () => {
    admin = createClient(URL!, SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
    const password = randomUUID();

    const emailA = `protocols-a-${randomUUID()}@test.local`;
    const { data: userA, error: errA } = await admin.auth.admin.createUser({
      email: emailA,
      password,
      email_confirm: true,
    });
    if (errA) throw errA;
    userAId = userA.user.id;

    const emailB = `protocols-b-${randomUUID()}@test.local`;
    const { error: errB } = await admin.auth.admin.createUser({ email: emailB, password, email_confirm: true });
    if (errB) throw errB;

    userAClient = createClient(URL!, ANON_KEY!, { auth: { persistSession: false } });
    const { error: signInA } = await userAClient.auth.signInWithPassword({ email: emailA, password });
    if (signInA) throw signInA;

    userBClient = createClient(URL!, ANON_KEY!, { auth: { persistSession: false } });
    const { error: signInB } = await userBClient.auth.signInWithPassword({ email: emailB, password });
    if (signInB) throw signInB;
  });

  afterAll(async () => {
    if (experimentIds.length) await admin.from("experiments").delete().in("id", experimentIds);
    if (protocolIds.length) await admin.from("protocols").delete().in("id", protocolIds);
  });

  it("is lab-shared: any authenticated user creates, reads, and edits a protocol (D2)", async () => {
    const { data: protocol, error: createErr } = await userAClient
      .from("protocols")
      .insert({ name: "Dry-down, standard", created_by: userAId })
      .select()
      .single();
    expect(createErr).toBeNull();
    protocolIds.push(protocol!.id);

    const { data: read, error: readErr } = await userBClient
      .from("protocols")
      .select()
      .eq("id", protocol!.id)
      .maybeSingle();
    expect(readErr).toBeNull();
    expect(read?.name).toBe("Dry-down, standard");

    const { error: editErr } = await userBClient
      .from("protocols")
      .update({ name: "Dry-down, standard (v2 name)" })
      .eq("id", protocol!.id);
    expect(editErr).toBeNull();
  });

  it("freezes a version (and its steps) the moment an experiment links to it, then rejects further edits", async () => {
    const { data: protocol, error: protocolErr } = await userAClient
      .from("protocols")
      .insert({ name: "Freeze test protocol", created_by: userAId })
      .select()
      .single();
    expect(protocolErr).toBeNull();
    protocolIds.push(protocol!.id);

    const { data: version, error: versionErr } = await userAClient
      .from("protocol_versions")
      .insert({ protocol_id: protocol!.id, version: 1, purpose: "Test", created_by: userAId })
      .select()
      .single();
    expect(versionErr).toBeNull();
    expect(version!.frozen_at).toBeNull();

    const { data: step, error: stepErr } = await userAClient
      .from("protocol_steps")
      .insert({ protocol_version_id: version!.id, step_number: 1, instruction: "Add 250 µL ACN." })
      .select()
      .single();
    expect(stepErr).toBeNull();

    // Still unfrozen: editable by any authenticated user.
    const { error: editBeforeErr } = await userBClient
      .from("protocol_versions")
      .update({ scope: "Any authenticated user can still edit this." })
      .eq("id", version!.id);
    expect(editBeforeErr).toBeNull();

    // Link an experiment to this version — the trigger under test.
    const experimentId = `EXP-PROT-${randomUUID().slice(0, 8)}`;
    experimentIds.push(experimentId);
    const { error: insertErr } = await userAClient.from("experiments").insert({
      id: experimentId,
      owner_id: userAId,
      name: "Linked to a protocol",
      status: "draft",
      protocol_version_id: version!.id,
    });
    expect(insertErr).toBeNull();

    const { data: frozen } = await admin
      .from("protocol_versions")
      .select("frozen_at")
      .eq("id", version!.id)
      .single();
    expect(frozen?.frozen_at).not.toBeNull();

    // Now frozen: RLS rejects further edits to the version (0 rows, not an error).
    const { data: editAfter, error: editAfterErr } = await userAClient
      .from("protocol_versions")
      .update({ scope: "Should not apply." })
      .eq("id", version!.id)
      .select();
    expect(editAfterErr).toBeNull();
    expect(editAfter).toEqual([]);

    // ...and to its steps (protocol_steps_write checks the parent's frozen_at).
    const { data: stepEditAfter, error: stepEditErr } = await userAClient
      .from("protocol_steps")
      .update({ instruction: "Should not apply." })
      .eq("id", step!.id)
      .select();
    expect(stepEditErr).toBeNull();
    expect(stepEditAfter).toEqual([]);
  });

  it("experiment_steps follows the experiment_files ownership split (D9)", async () => {
    const { data: protocol } = await userAClient
      .from("protocols")
      .insert({ name: "Ownership test protocol", created_by: userAId })
      .select()
      .single();
    protocolIds.push(protocol!.id);
    const { data: version } = await userAClient
      .from("protocol_versions")
      .insert({ protocol_id: protocol!.id, version: 1, created_by: userAId })
      .select()
      .single();
    const { data: step } = await userAClient
      .from("protocol_steps")
      .insert({ protocol_version_id: version!.id, step_number: 1, instruction: "Step 1." })
      .select()
      .single();

    const experimentId = `EXP-STEP-${randomUUID().slice(0, 8)}`;
    experimentIds.push(experimentId);
    await userAClient.from("experiments").insert({
      id: experimentId,
      owner_id: userAId,
      name: "Ownership test experiment",
      status: "draft",
      protocol_version_id: version!.id,
    });

    const { data: expStep, error: instantiateErr } = await userAClient
      .from("experiment_steps")
      .insert({ experiment_id: experimentId, protocol_step_id: step!.id })
      .select()
      .single();
    expect(instantiateErr).toBeNull();

    // Lab-shared read: userB (not the owner) can still read it.
    const { data: readByB, error: readByBErr } = await userBClient
      .from("experiment_steps")
      .select()
      .eq("id", expStep!.id)
      .maybeSingle();
    expect(readByBErr).toBeNull();
    expect(readByB?.id).toBe(expStep!.id);

    // Owner-only write: userB cannot update the step's status.
    const { data: writeByB, error: writeByBErr } = await userBClient
      .from("experiment_steps")
      .update({ status: "in_progress" })
      .eq("id", expStep!.id)
      .select();
    expect(writeByBErr).toBeNull();
    expect(writeByB).toEqual([]);

    // The owner can.
    const { error: writeByAErr } = await userAClient
      .from("experiment_steps")
      .update({ status: "in_progress" })
      .eq("id", expStep!.id);
    expect(writeByAErr).toBeNull();
  });

  it("step_observations/step_deviations are append-only — no update or delete path exists (D6)", async () => {
    const { data: protocol } = await userAClient
      .from("protocols")
      .insert({ name: "Append-only test protocol", created_by: userAId })
      .select()
      .single();
    protocolIds.push(protocol!.id);
    const { data: version } = await userAClient
      .from("protocol_versions")
      .insert({ protocol_id: protocol!.id, version: 1, created_by: userAId })
      .select()
      .single();
    const { data: step } = await userAClient
      .from("protocol_steps")
      .insert({ protocol_version_id: version!.id, step_number: 1, instruction: "Step 1." })
      .select()
      .single();

    const experimentId = `EXP-LOG-${randomUUID().slice(0, 8)}`;
    experimentIds.push(experimentId);
    await userAClient.from("experiments").insert({
      id: experimentId,
      owner_id: userAId,
      name: "Append-only test experiment",
      status: "draft",
      protocol_version_id: version!.id,
    });
    const { data: expStep } = await userAClient
      .from("experiment_steps")
      .insert({ experiment_id: experimentId, protocol_step_id: step!.id })
      .select()
      .single();

    const { data: observation, error: obsInsertErr } = await userAClient
      .from("step_observations")
      .insert({ experiment_step_id: expStep!.id, observed_by: userAId, note: "Clear solution after 1 min." })
      .select()
      .single();
    expect(obsInsertErr).toBeNull();

    // No update policy exists at all — RLS treats this as "no rows visible
    // for update", so it 0-rows rather than throwing.
    const { data: obsUpdate, error: obsUpdateErr } = await userAClient
      .from("step_observations")
      .update({ note: "Edited." })
      .eq("id", observation!.id)
      .select();
    expect(obsUpdateErr).toBeNull();
    expect(obsUpdate).toEqual([]);

    const { data: obsDelete, error: obsDeleteErr } = await userAClient
      .from("step_observations")
      .delete()
      .eq("id", observation!.id)
      .select();
    expect(obsDeleteErr).toBeNull();
    expect(obsDelete).toEqual([]);

    const { data: deviation, error: devInsertErr } = await userAClient
      .from("step_deviations")
      .insert({
        experiment_step_id: expStep!.id,
        category: "wrong_solvent",
        reported_by: userAId,
        what_happened: "Used ACN instead of water.",
      })
      .select()
      .single();
    expect(devInsertErr).toBeNull();

    const { data: devUpdate, error: devUpdateErr } = await userAClient
      .from("step_deviations")
      .update({ what_happened: "Edited." })
      .eq("id", deviation!.id)
      .select();
    expect(devUpdateErr).toBeNull();
    expect(devUpdate).toEqual([]);
  });
});
