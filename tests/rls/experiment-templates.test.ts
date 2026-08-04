// T1.2 template tables. Only runs against a LOCAL Supabase instance (see
// experiments.rls.test.ts for why this is skipped outside the CI `rls` job).
//
// Proves two things: (1) experiment_templates/experiment_template_versions
// are lab-shared — any authenticated user reads and writes, no ownership
// check (D5) — and (2) a version freezes the moment an experiment
// references it (experiments_freeze_template_version), after which RLS's
// "frozen_at is null" predicate blocks further edits even for an
// authenticated user who isn't its creator.
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestWorkspace } from "./helpers";

const URL = process.env.SUPABASE_LOCAL_URL;
const ANON_KEY = process.env.SUPABASE_LOCAL_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_LOCAL_SERVICE_ROLE_KEY;
const ready = !!URL && !!ANON_KEY && !!SERVICE_ROLE_KEY;

describe.skipIf(!ready)("experiment templates (local Supabase)", () => {
  let admin: SupabaseClient;
  let userAClient: SupabaseClient;
  let userBClient: SupabaseClient;
  let userAId: string;
  let workspaceId: string;
  const experimentIds: string[] = [];
  const templateIds: string[] = [];

  beforeAll(async () => {
    admin = createClient(URL!, SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
    const password = randomUUID();

    const emailA = `templates-a-${randomUUID()}@test.local`;
    const { data: userA, error: errA } = await admin.auth.admin.createUser({
      email: emailA,
      password,
      email_confirm: true,
    });
    if (errA) throw errA;
    userAId = userA.user.id;

    const emailB = `templates-b-${randomUUID()}@test.local`;
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
    if (templateIds.length) await admin.from("experiment_templates").delete().in("id", templateIds);
  });

  it("is lab-shared: any authenticated user creates, reads, and edits a template (D5)", async () => {
    const { data: template, error: createErr } = await userAClient
      .from("experiment_templates")
      .insert({ name: "Wet-dry cycling", created_by: userAId, workspace_id: workspaceId })
      .select()
      .single();
    expect(createErr).toBeNull();
    templateIds.push(template!.id);

    // userB, not the creator, can still read and edit it.
    const { data: read, error: readErr } = await userBClient
      .from("experiment_templates")
      .select()
      .eq("id", template!.id)
      .maybeSingle();
    expect(readErr).toBeNull();
    expect(read?.name).toBe("Wet-dry cycling");

    const { error: editErr } = await userBClient
      .from("experiment_templates")
      .update({ description: "Standard protocol" })
      .eq("id", template!.id);
    expect(editErr).toBeNull();
  });

  it("freezes a version the moment an experiment instantiates it, then rejects further edits", async () => {
    const { data: template, error: templateErr } = await userAClient
      .from("experiment_templates")
      .insert({ name: "Freeze test", created_by: userAId, workspace_id: workspaceId })
      .select()
      .single();
    expect(templateErr).toBeNull();
    templateIds.push(template!.id);

    const { data: version, error: versionErr } = await userAClient
      .from("experiment_template_versions")
      .insert({
        template_id: template!.id,
        version: 1,
        defaults: { scientific_question: "Does X affect Y?" },
        required_fields: [],
        created_by: userAId,
      })
      .select()
      .single();
    expect(versionErr).toBeNull();
    expect(version!.frozen_at).toBeNull();

    // Still unfrozen: editable by any authenticated user.
    const { error: editBeforeErr } = await userBClient
      .from("experiment_template_versions")
      .update({ required_fields: ["scientific_question"] })
      .eq("id", version!.id);
    expect(editBeforeErr).toBeNull();

    // Instantiate — this is the trigger under test.
    const experimentId = `EXP-TPL-${randomUUID().slice(0, 8)}`;
    experimentIds.push(experimentId);
    const { error: insertErr } = await userAClient.from("experiments").insert({
      id: experimentId,
      owner_id: userAId,
      name: "Instantiated from template",
      status: "draft",
      template_version_id: version!.id,
      workspace_id: workspaceId,
    });
    expect(insertErr).toBeNull();

    const { data: frozen } = await admin
      .from("experiment_template_versions")
      .select("frozen_at")
      .eq("id", version!.id)
      .single();
    expect(frozen?.frozen_at).not.toBeNull();

    // Now frozen: RLS's "frozen_at is null" predicate rejects the edit
    // (0 rows updated, not a thrown error — same no-op-on-predicate-miss
    // shape Supabase's RLS UPDATE always has).
    const { data: editAfter, error: editAfterErr } = await userAClient
      .from("experiment_template_versions")
      .update({ required_fields: ["conclusion"] })
      .eq("id", version!.id)
      .select();
    expect(editAfterErr).toBeNull();
    expect(editAfter).toEqual([]);
  });
});
