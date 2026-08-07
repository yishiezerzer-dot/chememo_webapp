// T2.2 materials/lots/stock solutions. Only runs against a LOCAL Supabase
// instance (see experiments.rls.test.ts for why this is skipped outside the
// CI `rls` job).
//
// Proves: (1) a non-member cannot read another workspace's materials; (2)
// materials -> lots -> stocks create/read correctly within a workspace; (3)
// experiment_inputs rejects a lot from a different workspace than the
// experiment consuming it (set_workspace_from_experiment_input's guard,
// same shape as T2.1's relationship/series-member cross-workspace tests).
// Full per-field coverage of every §7 column is an explicit, disclosed scope
// cut for this pass — not silently skipped.
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestWorkspace } from "./helpers";

const URL = process.env.SUPABASE_LOCAL_URL;
const ANON_KEY = process.env.SUPABASE_LOCAL_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_LOCAL_SERVICE_ROLE_KEY;
const ready = !!URL && !!ANON_KEY && !!SERVICE_ROLE_KEY;

describe.skipIf(!ready)("materials, lots & stock solutions (local Supabase)", () => {
  let admin: SupabaseClient;
  let memberClient: SupabaseClient;
  let outsiderClient: SupabaseClient;
  let memberId: string;
  let outsiderId: string;
  let workspaceId: string;
  let otherWorkspaceId: string;
  const materialIds: string[] = [];
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

    const member = await newUser("mat-member");
    memberId = member.id;
    memberClient = member.client;
    const outsider = await newUser("mat-outsider");
    outsiderId = outsider.id;
    outsiderClient = outsider.client;

    workspaceId = await createTestWorkspace(admin, [{ id: memberId }]);
    otherWorkspaceId = await createTestWorkspace(admin, [{ id: outsiderId }]);
  });

  afterAll(async () => {
    if (experimentIds.length) await admin.from("experiments").delete().in("id", experimentIds);
    if (materialIds.length) await admin.from("materials").delete().in("id", materialIds);
  });

  it("creates a material, lot, and stock within a workspace and reads them back", async () => {
    const { data: material, error: materialErr } = await memberClient
      .from("materials")
      .insert({ preferred_name: "Glycolaldehyde", formula: "C2H4O2", workspace_id: workspaceId })
      .select()
      .single();
    expect(materialErr).toBeNull();
    materialIds.push(material!.id);

    const { data: lot, error: lotErr } = await memberClient
      .from("material_lots")
      .insert({ material_id: material!.id, supplier: "Sigma", lot_number: "L123" })
      .select()
      .single();
    expect(lotErr).toBeNull();
    expect(lot!.workspace_id).toBe(workspaceId);

    const { data: stock, error: stockErr } = await memberClient
      .from("stock_solutions")
      .insert({
        material_lot_id: lot!.id,
        target_quantities: { stock_concentration: { value: 0.1, unit_code: "M" } },
        solvent: "water",
      })
      .select()
      .single();
    expect(stockErr).toBeNull();
    expect(stock!.workspace_id).toBe(workspaceId);
  });

  it("a non-member cannot read another workspace's materials", async () => {
    const { data: material } = await admin
      .from("materials")
      .insert({ preferred_name: "Outsider-only material", workspace_id: otherWorkspaceId })
      .select()
      .single();
    materialIds.push(material!.id);

    const { data } = await memberClient.from("materials").select("id").eq("id", material!.id).maybeSingle();
    expect(data).toBeNull();
  });

  it("rejects an experiment_inputs row linking a lot from a different workspace than the experiment", async () => {
    const { data: material } = await admin
      .from("materials")
      .insert({ preferred_name: "Cross-workspace test material", workspace_id: workspaceId })
      .select()
      .single();
    materialIds.push(material!.id);
    const { data: lot } = await admin
      .from("material_lots")
      .insert({ material_id: material!.id, workspace_id: workspaceId })
      .select()
      .single();

    const otherExperimentId = `EXP-MATISO-${randomUUID().slice(0, 8)}`;
    experimentIds.push(otherExperimentId);
    await admin.from("experiments").insert({
      id: otherExperimentId,
      owner_id: outsiderId,
      name: "Other workspace experiment",
      status: "draft",
      workspace_id: otherWorkspaceId,
    });

    const { error } = await outsiderClient.from("experiment_inputs").insert({
      experiment_id: otherExperimentId,
      source_type: "lot",
      source_id: lot!.id,
      role: "reactant",
    });
    expect(error).not.toBeNull();
    expect(error?.message).toMatch(/different workspace/);
  });

  it("accepts an experiment_inputs row when the lot and experiment share a workspace", async () => {
    const { data: material } = await admin
      .from("materials")
      .insert({ preferred_name: "Same-workspace test material", workspace_id: workspaceId })
      .select()
      .single();
    materialIds.push(material!.id);
    const { data: lot } = await admin
      .from("material_lots")
      .insert({ material_id: material!.id, workspace_id: workspaceId })
      .select()
      .single();

    const expId = `EXP-MATOK-${randomUUID().slice(0, 8)}`;
    experimentIds.push(expId);
    await admin.from("experiments").insert({
      id: expId,
      owner_id: memberId,
      name: "Same workspace experiment",
      status: "draft",
      workspace_id: workspaceId,
    });

    const { data: input, error } = await memberClient
      .from("experiment_inputs")
      .insert({ experiment_id: expId, source_type: "lot", source_id: lot!.id, role: "reactant" })
      .select()
      .single();
    expect(error).toBeNull();
    expect(input!.workspace_id).toBe(workspaceId);
  });

  // T2.8 D1 — 'inchi' was added to the identifier_type allow-list alongside
  // the pre-existing 'smiles'/'inchikey' (T2.2); prove both the new value and
  // an already-shipped value are still accepted, matching the plan's own
  // "existing identifier_type values keep working unchanged" regression ask.
  it("accepts 'inchi' and 'smiles' material identifiers", async () => {
    const { data: material } = await admin
      .from("materials")
      .insert({ preferred_name: "Structure identifiers test material", workspace_id: workspaceId })
      .select()
      .single();
    materialIds.push(material!.id);

    const { data: inchi, error: inchiErr } = await memberClient
      .from("material_identifiers")
      .insert({ material_id: material!.id, identifier_type: "inchi", value: "InChI=1S/C2H4O2/c1-2(3)4/h1H3,(H,3,4)" })
      .select()
      .single();
    expect(inchiErr).toBeNull();
    expect(inchi!.identifier_type).toBe("inchi");

    const { data: smiles, error: smilesErr } = await memberClient
      .from("material_identifiers")
      .insert({ material_id: material!.id, identifier_type: "smiles", value: "CC(=O)O" })
      .select()
      .single();
    expect(smilesErr).toBeNull();
    expect(smiles!.identifier_type).toBe("smiles");
  });
});
