// T2.7 file versions & processing jobs. Only runs against a LOCAL Supabase
// instance (see experiments.rls.test.ts for why this is skipped outside the
// CI `rls` job).
//
// Proves: (1) a file_versions row created within a workspace inherits that
// workspace via the trigger and reads back correctly, alongside the new
// experiment_files columns (file_role, analysis_run_id); (2) a non-member
// cannot read another workspace's file_versions rows.
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestWorkspace } from "./helpers";

const URL = process.env.SUPABASE_LOCAL_URL;
const ANON_KEY = process.env.SUPABASE_LOCAL_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_LOCAL_SERVICE_ROLE_KEY;
const ready = !!URL && !!ANON_KEY && !!SERVICE_ROLE_KEY;

describe.skipIf(!ready)("file versions & jobs (local Supabase)", () => {
  let admin: SupabaseClient;
  let memberClient: SupabaseClient;
  let outsiderClient: SupabaseClient;
  let memberId: string;
  let outsiderId: string;
  let workspaceId: string;
  let otherWorkspaceId: string;
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

    const member = await newUser("filever-member");
    memberId = member.id;
    memberClient = member.client;
    const outsider = await newUser("filever-outsider");
    outsiderId = outsider.id;
    outsiderClient = outsider.client;

    workspaceId = await createTestWorkspace(admin, [{ id: memberId }]);
    otherWorkspaceId = await createTestWorkspace(admin, [{ id: outsiderId }]);
  });

  afterAll(async () => {
    if (experimentIds.length) await admin.from("experiments").delete().in("id", experimentIds);
  });

  it("creates a file, its version 1, and reads back the new classification columns within a workspace", async () => {
    const expId = `EXP-FVER-${randomUUID().slice(0, 8)}`;
    experimentIds.push(expId);
    await admin.from("experiments").insert({ id: expId, owner_id: memberId, name: "File versions test", status: "draft", workspace_id: workspaceId });

    const { data: file, error: fileErr } = await memberClient
      .from("experiment_files")
      .insert({ experiment_id: expId, kind: "upload", label: "results.csv", storage_path: `${expId}/results.csv`, mime_type: "text/csv", file_role: "processed" })
      .select()
      .single();
    expect(fileErr).toBeNull();
    expect(file!.workspace_id).toBe(workspaceId);
    expect(file!.file_role).toBe("processed");

    const { data: version, error: versionErr } = await memberClient
      .from("file_versions")
      .insert({ experiment_file_id: file!.id, version_number: 1, storage_path: file!.storage_path, mime_type: "text/csv" })
      .select()
      .single();
    expect(versionErr).toBeNull();
    expect(version!.workspace_id).toBe(workspaceId);
    expect(version!.processing_state).toBe("pending");

    // The enqueue trigger should have created a text_extract file_jobs row
    // (service-role only, no authenticated policy — read via admin).
    const { data: jobs } = await admin.from("file_jobs").select("job_type, status").eq("file_version_id", version!.id);
    expect((jobs ?? []).some((j) => j.job_type === "text_extract")).toBe(true);
  });

  it("a non-member cannot read another workspace's file_versions rows", async () => {
    const outsiderExpId = `EXP-FVER-OUT-${randomUUID().slice(0, 8)}`;
    experimentIds.push(outsiderExpId);
    await admin.from("experiments").insert({ id: outsiderExpId, owner_id: outsiderId, name: "Outsider file exp", status: "draft", workspace_id: otherWorkspaceId });
    const { data: file } = await admin
      .from("experiment_files")
      .insert({ experiment_id: outsiderExpId, kind: "upload", label: "secret.csv", storage_path: `${outsiderExpId}/secret.csv`, workspace_id: otherWorkspaceId })
      .select()
      .single();
    const { data: version } = await admin
      .from("file_versions")
      .insert({ experiment_file_id: file!.id, version_number: 1, storage_path: file!.storage_path, workspace_id: otherWorkspaceId })
      .select()
      .single();

    const { data: readVersion } = await memberClient.from("file_versions").select("id").eq("id", version!.id).maybeSingle();
    expect(readVersion).toBeNull();
  });
});
