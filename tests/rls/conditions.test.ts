// T2.6 prebiotic condition programs & controls. Only runs against a LOCAL
// Supabase instance (see experiments.rls.test.ts for why this is skipped
// outside the CI `rls` job).
//
// Proves: (1) a template/batch-program/cycle/environmental-conditions/
// control chain creates and reads correctly within a workspace; (2) a
// non-member cannot read another workspace's templates or controls.
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestWorkspace } from "./helpers";

const URL = process.env.SUPABASE_LOCAL_URL;
const ANON_KEY = process.env.SUPABASE_LOCAL_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_LOCAL_SERVICE_ROLE_KEY;
const ready = !!URL && !!ANON_KEY && !!SERVICE_ROLE_KEY;

describe.skipIf(!ready)("condition programs & controls (local Supabase)", () => {
  let admin: SupabaseClient;
  let memberClient: SupabaseClient;
  let outsiderClient: SupabaseClient;
  let memberId: string;
  let outsiderId: string;
  let workspaceId: string;
  let otherWorkspaceId: string;
  const templateIds: string[] = [];
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

    const member = await newUser("cond-member");
    memberId = member.id;
    memberClient = member.client;
    const outsider = await newUser("cond-outsider");
    outsiderId = outsider.id;
    outsiderClient = outsider.client;

    workspaceId = await createTestWorkspace(admin, [{ id: memberId }]);
    otherWorkspaceId = await createTestWorkspace(admin, [{ id: outsiderId }]);
  });

  afterAll(async () => {
    if (experimentIds.length) await admin.from("experiments").delete().in("id", experimentIds);
    if (templateIds.length) await admin.from("condition_program_templates").delete().in("id", templateIds);
  });

  it("creates a template, applies it to a batch, adds a cycle, saves environmental conditions, and adds a control", async () => {
    const { data: template, error: templateErr } = await memberClient
      .from("condition_program_templates")
      .insert({ name: "Standard wet-dry", cycle_count: 3, workspace_id: workspaceId })
      .select()
      .single();
    expect(templateErr).toBeNull();
    templateIds.push(template!.id);

    const expId = `EXP-COND-${randomUUID().slice(0, 8)}`;
    experimentIds.push(expId);
    await admin.from("experiments").insert({ id: expId, owner_id: memberId, name: "Conditions test", status: "draft", workspace_id: workspaceId });
    const { data: batch } = await admin.from("batches").select("id").eq("experiment_id", expId).single();

    const { data: program, error: programErr } = await memberClient
      .from("batch_condition_programs")
      .insert({ batch_id: batch!.id, template_id: template!.id, name: template!.name, cycle_count: template!.cycle_count })
      .select()
      .single();
    expect(programErr).toBeNull();
    expect(program!.workspace_id).toBe(workspaceId);

    const { data: cycle, error: cycleErr } = await memberClient
      .from("condition_program_cycles")
      .insert({ batch_condition_program_id: program!.id, cycle_index: 1, observation: "First cycle nominal" })
      .select()
      .single();
    expect(cycleErr).toBeNull();
    expect(cycle!.workspace_id).toBe(workspaceId);

    const { data: env, error: envErr } = await memberClient
      .from("environmental_conditions")
      .insert({ batch_id: batch!.id, atmosphere_gas: "N2", initial_ph: 7.0, final_ph: 6.5 })
      .select()
      .single();
    expect(envErr).toBeNull();
    expect(env!.workspace_id).toBe(workspaceId);

    const { data: control, error: controlErr } = await memberClient
      .from("controls")
      .insert({ experiment_id: expId, control_type: "blank" })
      .select()
      .single();
    expect(controlErr).toBeNull();
    expect(control!.workspace_id).toBe(workspaceId);
  });

  it("a non-member cannot read another workspace's templates or controls", async () => {
    const { data: template } = await admin
      .from("condition_program_templates")
      .insert({ name: "Outsider-only template", workspace_id: otherWorkspaceId })
      .select()
      .single();
    templateIds.push(template!.id);

    const { data } = await memberClient.from("condition_program_templates").select("id").eq("id", template!.id).maybeSingle();
    expect(data).toBeNull();

    const outsiderExpId = `EXP-COND-OUT-${randomUUID().slice(0, 8)}`;
    experimentIds.push(outsiderExpId);
    await admin.from("experiments").insert({ id: outsiderExpId, owner_id: outsiderId, name: "Outsider exp", status: "draft", workspace_id: otherWorkspaceId });
    const { data: control } = await admin.from("controls").insert({ experiment_id: outsiderExpId, control_type: "blank" }).select().single();

    const { data: readControl } = await memberClient.from("controls").select("id").eq("id", control!.id).maybeSingle();
    expect(readControl).toBeNull();
  });
});
