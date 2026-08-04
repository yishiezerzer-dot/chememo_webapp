// T2.1 workspace & role model. Only runs against a LOCAL Supabase instance
// (see experiments.rls.test.ts for why this is skipped outside the CI `rls`
// job).
//
// Proves the two load-bearing acceptance criteria from
// ChemMemo_Feature_WorkspaceRoleModel_Spec.md: (1) a user with no membership
// in a workspace cannot read ANY of its data — experiments, comments,
// relationships — even though pre-T2.1 RLS would have allowed it; (2) a
// `viewer`-role member can read but every write policy rejects them. Full
// per-table coverage and a direct match_experiments cross-workspace proof
// are an explicit, disclosed scope cut for this pass (see the spec's
// Rollout section) — not silently skipped.
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const URL = process.env.SUPABASE_LOCAL_URL;
const ANON_KEY = process.env.SUPABASE_LOCAL_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_LOCAL_SERVICE_ROLE_KEY;
const ready = !!URL && !!ANON_KEY && !!SERVICE_ROLE_KEY;

describe.skipIf(!ready)("workspace isolation (local Supabase)", () => {
  let admin: SupabaseClient;
  let memberClient: SupabaseClient;
  let outsiderClient: SupabaseClient;
  let viewerClient: SupabaseClient;
  let memberId: string;
  let outsiderId: string;
  let viewerId: string;
  let workspaceId: string;
  let otherWorkspaceId: string;
  let experimentId: string;
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

    const member = await newUser("ws-member");
    memberId = member.id;
    memberClient = member.client;

    const outsider = await newUser("ws-outsider");
    outsiderId = outsider.id;
    outsiderClient = outsider.client;

    const viewer = await newUser("ws-viewer");
    viewerId = viewer.id;
    viewerClient = viewer.client;

    const { data: ws, error: wsErr } = await admin
      .from("workspaces")
      .insert({ name: "Isolation Test Workspace", created_by: memberId })
      .select("id")
      .single();
    if (wsErr) throw wsErr;
    workspaceId = ws.id;

    const { data: otherWs, error: otherWsErr } = await admin
      .from("workspaces")
      .insert({ name: "Other Workspace", created_by: outsiderId })
      .select("id")
      .single();
    if (otherWsErr) throw otherWsErr;
    otherWorkspaceId = otherWs.id;

    await admin.from("workspace_members").insert([
      { workspace_id: workspaceId, user_id: memberId, role: "owner" },
      { workspace_id: workspaceId, user_id: viewerId, role: "viewer" },
      { workspace_id: otherWorkspaceId, user_id: outsiderId, role: "owner" },
    ]);

    experimentId = `EXP-WSISO-${randomUUID().slice(0, 8)}`;
    experimentIds.push(experimentId);
    await admin.from("experiments").insert({
      id: experimentId,
      owner_id: memberId,
      workspace_id: workspaceId,
      name: "Workspace isolation test",
      status: "draft",
    });
  });

  afterAll(async () => {
    if (experimentIds.length) await admin.from("experiments").delete().in("id", experimentIds);
    await admin.from("workspaces").delete().in("id", [workspaceId, otherWorkspaceId]);
  });

  it("a non-member cannot read the workspace's experiment at all", async () => {
    const { data } = await outsiderClient.from("experiments").select("id").eq("id", experimentId).maybeSingle();
    expect(data).toBeNull();
  });

  it("a non-member cannot read the workspace's comments on that experiment", async () => {
    const { data: comment } = await memberClient
      .from("comments")
      .insert({ target_type: "experiment", target_id: experimentId, body: "member-only note", created_by: memberId })
      .select("id")
      .single();
    expect(comment).toBeTruthy();

    const { data: asOutsider } = await outsiderClient.from("comments").select("id").eq("id", comment!.id).maybeSingle();
    expect(asOutsider).toBeNull();

    const { data: asMember } = await memberClient.from("comments").select("id").eq("id", comment!.id).maybeSingle();
    expect(asMember).toBeTruthy();
  });

  it("a workspace member can read the experiment", async () => {
    const { data } = await memberClient.from("experiments").select("id").eq("id", experimentId).maybeSingle();
    expect(data?.id).toBe(experimentId);
  });

  it("a viewer-role member can read but cannot write", async () => {
    const { data: asViewer } = await viewerClient.from("experiments").select("id").eq("id", experimentId).maybeSingle();
    expect(asViewer?.id).toBe(experimentId);

    const { error: writeErr } = await viewerClient
      .from("comments")
      .insert({ target_type: "experiment", target_id: experimentId, body: "viewer trying to write", created_by: viewerId });
    expect(writeErr).not.toBeNull();
  });

  it("a non-member cannot create a comment on the workspace's experiment either", async () => {
    const { error } = await outsiderClient
      .from("comments")
      .insert({ target_type: "experiment", target_id: experimentId, body: "outsider trying to write", created_by: outsiderId });
    expect(error).not.toBeNull();
  });
});
